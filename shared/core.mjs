// Original deterministic cartography and procedural scene renderer.
// Geographic map paths are straight WGS84 great-circle-distance annotations, not road routes.
const C = {
  paper: "#f2ecdf",
  ink: "#183d39",
  rust: "#bf613d",
  moss: "#76856c",
  muted: "#7a8378",
  line: "#d1d0bd",
  cream: "#faf7ee",
  sea: "#79a7a1",
};
const FONT = "'Noto Sans CJK KR','Apple SD Gothic Neo',sans-serif";
const MODES = ["train", "walk", "car", "boat", "bike"];
const SCENES = ["city", "coast", "mountain", "night"];
export const modeLabels = {
  train: "기차",
  walk: "도보",
  car: "자동차",
  boat: "배",
  bike: "자전거",
};
export const sceneLabels = {
  city: "도시",
  coast: "물가",
  mountain: "산",
  night: "야경",
};
const clamp = (n, min = 0, max = 1) => Math.max(min, Math.min(max, n));
const ease = (x) => {
  x = clamp(x);
  return x * x * (3 - 2 * x);
};
const lerp = (a, b, t) => a + (b - a) * t;
export const escapeXml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
const safe = escapeXml;
const clean = (v) =>
  typeof v === "string"
    ? v
        .trim()
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
    : "";
function dateValue(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
  )
    return NaN;
  const n = Date.parse(value + ":00Z");
  return Number.isFinite(n) && new Date(n).toISOString().slice(0, 16) === value
    ? n
    : NaN;
}
export function validateTrip(trip) {
  const errors = [];
  if (!trip || typeof trip !== "object" || Array.isArray(trip))
    return ["여행 데이터를 확인해 주세요."];
  if (!clean(trip.title) || clean(trip.title).length > 80)
    errors.push("여행 제목은 1–80자로 입력해 주세요.");
  if (
    trip.subtitle != null &&
    (typeof trip.subtitle !== "string" || trip.subtitle.length > 120)
  )
    errors.push("부제는 120자 이내로 입력해 주세요.");
  if (
    trip.seed !== undefined &&
    (typeof trip.seed !== "number" ||
      !Number.isInteger(trip.seed) ||
      trip.seed < 0 ||
      trip.seed > 2147483647)
  )
    errors.push("시드는 0–2147483647 사이의 정수여야 합니다.");
  if (
    !Array.isArray(trip.stops) ||
    trip.stops.length < 2 ||
    trip.stops.length > 12
  )
    return [...errors, "장소를 2–12개 입력해 주세요."];
  const ids = new Set();
  let previous = -Infinity;
  trip.stops.forEach((s, i) => {
    const prefix = `${i + 1}번째 장소: `;
    if (!s || typeof s !== "object") {
      errors.push(prefix + "장소 정보가 없습니다.");
      return;
    }
    if (
      typeof s.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(s.id) ||
      ids.has(s.id)
    )
      errors.push(
        prefix + "장소 ID는 중복 없는 영문·숫자·밑줄·하이픈이어야 합니다.",
      );
    ids.add(s.id);
    if (!clean(s.name) || clean(s.name).length > 100)
      errors.push(prefix + "이름은 1–100자로 입력해 주세요.");
    if (
      typeof s.lat !== "number" ||
      !Number.isFinite(s.lat) ||
      s.lat < -90 ||
      s.lat > 90
    )
      errors.push(prefix + "위도는 −90–90 사이의 숫자여야 합니다.");
    if (
      typeof s.lon !== "number" ||
      !Number.isFinite(s.lon) ||
      s.lon < -180 ||
      s.lon > 180
    )
      errors.push(prefix + "경도는 −180–180 사이의 숫자여야 합니다.");
    const time = dateValue(s.datetime);
    if (!Number.isFinite(time))
      errors.push(prefix + "올바른 날짜와 시각을 입력해 주세요.");
    else if (time < previous)
      errors.push(prefix + "방문 시각은 앞 장소보다 이르지 않아야 합니다.");
    if (Number.isFinite(time)) previous = time;
    if (!MODES.includes(s.mode))
      errors.push(prefix + "교통수단을 선택해 주세요.");
    if (!SCENES.includes(s.scene))
      errors.push(prefix + "장면을 선택해 주세요.");
    if (s.note != null && (typeof s.note !== "string" || s.note.length > 500))
      errors.push(prefix + "메모는 500자 이내로 입력해 주세요.");
  });
  return errors;
}
export function normalizeTrip(input) {
  const errors = validateTrip(input);
  if (errors.length) throw new Error(errors.join("\n"));
  return {
    id: /^[a-zA-Z0-9_-]{1,64}$/.test(input.id ?? "") ? input.id : "my-journey",
    title: clean(input.title),
    subtitle: clean(input.subtitle),
    seed: Number(input.seed ?? 2718),
    stops: input.stops.map((s) => ({
      id: s.id,
      name: clean(s.name),
      lat: s.lat,
      lon: s.lon,
      datetime: s.datetime,
      mode: s.mode,
      scene: s.scene,
      note: clean(s.note),
    })),
  };
}
export function distanceKm(a, b) {
  const rad = Math.PI / 180,
    p = (b.lat - a.lat) * rad,
    q = (b.lon - a.lon) * rad;
  const h =
    Math.sin(p / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(q / 2) ** 2;
  return (
    6371.0088 * 2 * Math.atan2(Math.sqrt(clamp(h)), Math.sqrt(1 - clamp(h)))
  );
}
export function totalDistanceKm(trip) {
  return trip.stops
    .slice(1)
    .reduce((sum, s, i) => sum + distanceKm(trip.stops[i], s), 0);
}
export const formatDistance = (n) =>
  Number(n).toLocaleString("en-US", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  });
export function timeline(trip, duration = 60) {
  duration = Number.isFinite(duration) && duration >= 2 ? duration : 60;
  // A three-act structure: anticipation, arrival/release, then a reflective return.
  // Real dwell times do not dictate screen duration. Distance gives transit rhythm;
  // notes and a water/landscape reveal receive deliberate breathing room.
  const n = trip.stops.length;
  const placeWeights = trip.stops.map(
    (s, i) =>
      (i === 0
        ? 1.05
        : i === n - 1
          ? 1.12
          : s.scene === "coast"
            ? 1.38
            : 0.92) + Math.min(s.note.length / 450, 0.22),
  );
  const placeSum = placeWeights.reduce((a, b) => a + b, 0);
  const travelWeights = trip.stops
    .slice(1)
    .map((s, i) =>
      Math.max(0.55, Math.log1p(distanceKm(trip.stops[i], s)) * 0.38),
    );
  const travelSum = travelWeights.reduce((a, b) => a + b, 0);
  const segments = [
    {
      id: "overview",
      label: "프롤로그 · 바깥으로 향하는 마음",
      type: "overview",
      weight: 0.08,
    },
  ];
  trip.stops.forEach((s, i) => {
    if (i)
      segments.push({
        id: `travel-${s.id}`,
        stopId: s.id,
        index: i,
        label: `${modeLabels[s.mode]} · ${s.name}`,
        type: "travel",
        weight: (0.165 * travelWeights[i - 1]) / travelSum,
      });
    segments.push({
      id: s.id,
      stopId: s.id,
      index: i,
      label: s.name,
      type: "place",
      weight: (0.68 * placeWeights[i]) / placeSum,
    });
  });
  segments.push({
    id: "recap",
    label: "에필로그 · 하루를 접으며",
    type: "recap",
    weight: 0.075,
  });
  const total = segments.reduce((n, s) => n + s.weight, 0);
  let cursor = 0;
  return segments.map((s, i) => {
    const start = cursor;
    cursor += (duration * s.weight) / total;
    return { ...s, start, end: i === segments.length - 1 ? duration : cursor };
  });
}
export function sceneAt(trip, time, duration = 60) {
  const list = timeline(trip, duration);
  return list.find((s) => time < s.end) || list.at(-1);
}
function rng(seed) {
  let n = (Number(seed) || 1) >>> 0;
  return () => {
    n += 0x6d2b79f5;
    let t = n;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(s) {
  let n = 2166136261;
  for (const c of s) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}
function wrap(value, limit = 24, max = 3) {
  const chars = [...String(value)],
    lines = [];
  let line = "",
    units = 0;
  for (const char of chars) {
    const w = /[\x00-\x7F]/.test(char) ? 0.56 : 1;
    if (units + w > limit && line && !/[.,!?;:。！？、，)]/.test(char)) {
      lines.push(line.trim());
      line = "";
      units = 0;
    }
    if (!line && char === " ") continue;
    line += char;
    units += w;
  }
  if (line || !lines.length) lines.push(line);
  if (lines.length > max) {
    lines.length = max;
    lines[max - 1] = lines[max - 1].slice(0, -1) + "…";
  }
  return lines;
}
function text(value, x, y, size = 24, fill = C.ink, attrs = "") {
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" ${attrs}>${safe(value)}</text>`;
}
function wrapped(value, x, y, size, limit, max, fill = C.ink, attrs = "") {
  return wrap(value, limit, max)
    .map((l, i) => text(l, x, y + i * size * 1.48, size, fill, attrs))
    .join("");
}
function svg(body, width, height, label = "루트 필름") {
  // Inline previews share a document; each distinct artwork needs local paint IDs.
  // Hashing the immutable body preserves deterministic exports and identical content.
  const prefix = `rf-${hash(body).toString(36)}-${width}-${height}-`;
  const local = body
    .replace(/\sid="([^"]+)"/g, (_, id) => ` id="${prefix}${id}"`)
    .replace(
      /(\s[\w:.-]+=")([^"]*)(")/g,
      (_, start, value, end) =>
        start +
        value.replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${prefix}${id})`) +
        end,
    );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${safe(label)}"><style>text{font-family:${FONT}}</style>${local}</svg>`;
}
function mapPoints(trip, box) {
  const [left, top, width, height] = box;
  const centerLat =
    trip.stops.reduce((n, s) => n + s.lat, 0) / trip.stops.length;
  const startLon = trip.stops[0].lon;
  const projected = trip.stops.map((s) => {
    let lon = s.lon;
    while (lon - startLon > 180) lon -= 360;
    while (lon - startLon < -180) lon += 360;
    return { x: lon * Math.cos((centerLat * Math.PI) / 180), y: -s.lat };
  });
  const xs = projected.map((s) => s.x),
    ys = projected.map((s) => s.y);
  let minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 0.01),
    spanY = Math.max(maxY - minY, 0.01),
    scale = Math.min(width / spanX, height / spanY);
  const cx = (minX + maxX) / 2,
    cy = (minY + maxY) / 2;
  return projected.map((p) => ({
    x: left + width / 2 + (p.x - cx) * scale,
    y: top + height / 2 + (p.y - cy) * scale,
  }));
}
function grid(w, h, spacing = 80, opacity = 0.45) {
  let r = "";
  for (let x = 0; x < w; x += spacing) r += `<path d="M${x} 0V${h}"/>`;
  for (let y = 0; y < h; y += spacing) r += `<path d="M0 ${y}H${w}"/>`;
  return `<g fill="none" stroke="${C.line}" stroke-width="1" opacity="${opacity}">${r}</g>`;
}
function placeLabels(points, trip, w, h) {
  const placed = [];
  return points.map((p, i) => {
    const lines = wrap(
        `${String(i + 1).padStart(2, "0")} ${trip.stops[i].name}`,
        10.5,
        2,
      ),
      bw = 196,
      bh = lines.length > 1 ? 72 : 51;
    const candidates = [];
    const positions = [];
    for (const dy of [-bh - 20, 22, -bh - 96, 100, -bh - 170, 174])
      for (const dx of [25, -bw - 25, 110, -bw - 110])
        positions.push([p.x + dx, p.y + dy]);
    for (let y = 18; y + bh < h - 75; y += bh + 16)
      for (let x = 20; x + bw < w - 20; x += bw + 18) positions.push([x, y]);
    for (const [px, py] of positions) {
      const x = clamp(px, 20, w - bw - 20),
        y = clamp(py, 18, h - bh - 75);
      const box = { x, y, w: bw, h: bh };
      const overlap = placed.reduce(
        (sum, b) =>
          sum +
          Math.max(
            0,
            Math.min(x + bw, b.x + b.w + 12) - Math.max(x, b.x - 12),
          ) *
            Math.max(
              0,
              Math.min(y + bh, b.y + b.h + 10) - Math.max(y, b.y - 10),
            ),
        0,
      );
      const markerCost = points.reduce(
        (sum, q) =>
          sum +
          (q.x > x - 12 &&
          q.x < x + bw + 12 &&
          q.y > y - 12 &&
          q.y < y + bh + 12
            ? 1800
            : 0),
        0,
      );
      const dist = Math.hypot(x + bw / 2 - p.x, y + bh / 2 - p.y);
      candidates.push({
        ...box,
        lines,
        score: overlap * 25 + markerCost + dist,
      });
    }
    candidates.sort((a, b) => a.score - b.score);
    const best = candidates[0];
    placed.push(best);
    return best;
  });
}
function mapBody(trip, progress, w, h, selectedId, compact = false) {
  progress = clamp(progress);
  const padX = w * 0.15,
    padY = h * 0.22,
    points = mapPoints(trip, [padX, padY, w - 2 * padX, h - 2 * padY]);
  const path = points
    .map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
  const steps = progress * (points.length - 1),
    leg = Math.min(points.length - 2, Math.floor(steps));
  const lengths = points
    .slice(1)
    .map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  const totalLength = lengths.reduce((a, b) => a + b, 0);
  const revealedLength =
    lengths.slice(0, leg).reduce((a, b) => a + b, 0) +
    (lengths[leg] || 0) * clamp(steps - leg);
  const pathProgress =
    totalLength > 0 ? revealedLength / totalLength : progress;
  let out = `<rect width="${w}" height="${h}" fill="${C.paper}"/>${grid(w, h, Math.max(45, w / 13))}`;
  out += `<g opacity=".65" fill="none" stroke="${C.line}"><circle cx="${w * 0.5}" cy="${h * 0.5}" r="${Math.min(w, h) * 0.32}"/><circle cx="${w * 0.5}" cy="${h * 0.5}" r="${Math.min(w, h) * 0.43}"/></g>`;
  out += `<path d="${path}" fill="none" stroke="${C.moss}" opacity=".4" stroke-width="${compact ? 2 : 3}" stroke-dasharray="4 9"/><path d="${path}" pathLength="1000" fill="none" stroke="${C.rust}" stroke-width="${compact ? 3 : 4}" stroke-linecap="round" stroke-dasharray="${Math.max(0.001, pathProgress * 1000)} 1001"/>`;
  const reached = progress * (trip.stops.length - 1);
  const labels = compact ? [] : placeLabels(points, trip, w, h);
  points.forEach((p, i) => {
    const s = trip.stops[i],
      active = i <= reached + 0.001,
      selected = s.id === selectedId;
    out += `<g data-stop-id="${safe(s.id)}" tabindex="0" role="button" aria-label="${safe(s.name)}">`;
    if (selected)
      out += `<circle cx="${p.x}" cy="${p.y}" r="${compact ? 20 : 26}" fill="${C.rust}" opacity=".13"/>`;
    out += `<circle cx="${p.x}" cy="${p.y}" r="${compact ? 8 : 12}" fill="${active ? C.ink : C.paper}" stroke="${active ? C.paper : C.moss}" stroke-width="3"/>`;
    if (!compact) {
      const l = labels[i],
        cx = clamp(p.x, l.x, l.x + l.w),
        cy = clamp(p.y, l.y, l.y + l.h);
      out += `<path d="M${p.x} ${p.y}L${cx} ${cy}" stroke="${C.moss}" stroke-width="1" opacity=".65"/><rect x="${l.x - 5}" y="${l.y - 2}" width="${l.w + 10}" height="${l.h + 4}" fill="${C.paper}" opacity=".92"/>`;
      out += l.lines
        .map((line, k) =>
          text(
            line,
            l.x,
            l.y + 18 + k * 24,
            17,
            active ? C.ink : C.muted,
            'font-weight="600"',
          ),
        )
        .join("");
      out += text(s.datetime.slice(11), l.x, l.y + l.h - 3, 12, C.muted);
    }
    out += "</g>";
  });
  if (!compact) {
    out += text("N", w - 43, 40, 13, C.ink, 'text-anchor="middle"');
    out += `<path d="M${w - 43} 48l-5 19 5-4 5 4Z" fill="${C.ink}"/>`;
    out += text(
      "SCHEMATIC ATLAS / WGS84",
      30,
      h - 35,
      11,
      C.muted,
      'letter-spacing="2"',
    );
    out += text(
      "좌표 기반 직선 연결 · 실제 교통 경로 아님",
      30,
      h - 17,
      11,
      C.muted,
    );
    out += text(
      `${formatDistance(totalDistanceKm(trip))} km`,
      w - 30,
      h - 30,
      20,
      C.ink,
      'text-anchor="end"',
    );
    out += text(
      "구간별 대권 직선거리 합계",
      w - 30,
      h - 13,
      10,
      C.muted,
      'text-anchor="end"',
    );
  }
  return out;
}
export function renderMap(
  trip,
  progress = 1,
  { width = 1100, height = 700, selectedId } = {},
) {
  return svg(
    mapBody(trip, progress, width, height, selectedId),
    width,
    height,
    trip.title + " · 여행 지도",
  );
}

function house(x, y, w, h, roof, night = false) {
  const wall = night ? "#334b49" : "#e4d8bf",
    dark = night ? "#203d3c" : "#526863";
  let out = `<path d="M${x} ${y}h${w}v${h}h-${w}Z" fill="${wall}"/><path d="M${x + w} ${y}l${w * 0.22} ${-w * 0.16}v${h}l-${w * 0.22} ${w * 0.16}Z" fill="${night ? "#243b3a" : "#c4bda8"}"/><path d="M${x - 9} ${y + 2}l${w * 0.5} -${w * 0.3} ${w * 0.5 + 9} ${w * 0.3}Z" fill="${roof}"/><path d="M${x + w * 0.5 - 9} ${y - w * 0.3}l${w * 0.22} -${w * 0.13} ${w * 0.5 + 9} ${w * 0.3}-${w * 0.22} ${w * 0.13}Z" fill="${dark}"/>`;
  for (let k = 0; k < 3; k++)
    out += `<rect x="${x + 10 + k * w * 0.27}" y="${y + h * 0.25}" width="${w * 0.16}" height="${h * 0.24}" fill="${night ? "#edc277" : "#77918a"}"/><path d="M${x + 10 + k * w * 0.27 + w * 0.08} ${y + h * 0.25}v${h * 0.24}" stroke="${dark}"/>`;
  out += `<rect x="${x + w * 0.4}" y="${y + h * 0.63}" width="${w * 0.18}" height="${h * 0.37}" fill="${dark}"/>`;
  return out;
}
function tree(x, y, s, night = false) {
  return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0V-75" stroke="${night ? "#1e3636" : "#6d6653"}" stroke-width="5"/><ellipse cy="-85" rx="30" ry="44" fill="${night ? "#284a45" : "#718875"}"/><ellipse cx="-15" cy="-60" rx="24" ry="31" fill="${night ? "#294d46" : "#8b9d7e"}"/></g>`;
}
function transport(mode, x, y, p = 0, night = false) {
  let body = "";
  const white = night ? "#d1c9ae" : "#eee7d6";
  if (mode === "train") {
    for (let i = 0; i < 3; i++) {
      const dx = i * 128;
      body += `<rect x="${dx}" y="-61" width="122" height="56" rx="8" fill="${white}"/><path d="M${dx} -24h122" stroke="${C.rust}" stroke-width="9"/>`;
      for (let j = 0; j < 4; j++)
        body += `<rect x="${dx + 12 + j * 25}" y="-51" width="18" height="20" rx="2" fill="${night ? "#edc277" : "#62847f"}"/>`;
      body += `<circle cx="${dx + 22}" cy="-3" r="8" fill="${C.ink}"/><circle cx="${dx + 99}" cy="-3" r="8" fill="${C.ink}"/>`;
    }
  } else if (mode === "boat") {
    body = `<path d="M-75 -17H90L65 14H-50Z" fill="${C.ink}"/><path d="M-22 -17V-100L45 -27H-22" fill="${white}"/><path d="M-80 23q40 12 90 0t80 0" stroke="${white}" fill="none"/>`;
  } else if (mode === "car") {
    body = `<path d="M-60 -12v-25l25-8 14-27h51l22 29 23 8v23Z" fill="${C.rust}"/><path d="M-8 -62h31l14 20H-19Z" fill="${white}"/><circle cx="-35" cy="-10" r="12" fill="${C.ink}"/><circle cx="48" cy="-10" r="12" fill="${C.ink}"/>`;
  } else if (mode === "bike") {
    body = `<g fill="none" stroke="${C.ink}" stroke-width="4"><circle cx="-32" cy="0" r="23"/><circle cx="35" cy="0" r="23"/><path d="M-32 0l20-35 24 35H-32L0-25 20-25 15-43 12 0 35 0 20-25"/></g><circle cy="-77" r="10" fill="${C.rust}"/><path d="M0 -65l-13 23 29 9M-13 -42l16 18-9 25M-13 -42l-11 17 10 27" fill="none" stroke="${C.rust}" stroke-width="7"/>`;
  } else {
    const step = Math.sin(p * Math.PI * 10) * 12;
    body = `<circle cy="-83" r="12" fill="${C.rust}"/><path d="M0 -67v36M0 -55l${22 + step} 16M0 -55l${-20 - step} 19M0 -31l${18 + step} 31M0 -31l${-17 - step} 31" fill="none" stroke="${C.ink}" stroke-width="8" stroke-linecap="round"/><rect x="-22" y="-66" width="15" height="30" rx="5" fill="${C.moss}"/>`;
  }
  return `<g transform="translate(${x} ${y})">${body}</g>`;
}
function diorama(
  scene,
  seed,
  p,
  mode = "walk",
  travel = false,
  datetime = "2026-04-12T12:00",
) {
  const hour = Number(datetime.slice(11, 13)),
    sunset = hour >= 17 && hour < 20,
    dawn = hour >= 5 && hour < 9;
  const random = rng(seed),
    night = scene === "night" || hour >= 20 || hour < 5,
    w = 1600,
    h = 720;
  const sky = night
    ? "#142f35"
    : sunset
      ? "#c8aaa0"
      : dawn
        ? "#c9d0bf"
        : scene === "coast"
          ? "#b2ccc5"
          : "#d4dbca";
  const horizon = night
    ? "#34505a"
    : sunset
      ? "#e6be8f"
      : dawn
        ? "#efe0bb"
        : "#eee7cc";
  let b = `<defs><linearGradient id="sky-light" x2="0" y2="1"><stop stop-color="${sky}"/><stop offset="1" stop-color="${horizon}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#sky-light)"/>`;
  // Generated scenery expresses a mood; it does not claim to reproduce a real location.
  const sunX = lerp(1190, 1115, ease(p)),
    sunY = night ? 120 : sunset ? 300 : dawn ? 245 : 135;
  b += `<circle cx="${sunX}" cy="${sunY}" r="${night ? 36 : 55}" fill="${night ? "#e8d9ad" : "#ddb579"}" opacity=".8"/>`;
  if (night)
    for (let i = 0; i < 45; i++)
      b += `<circle cx="${random() * 1600}" cy="${random() * 330}" r="${random() * 1.6 + 0.5}" fill="#e9ddbc" opacity="${0.2 + random() * 0.7}"/>`;
  else
    for (let i = 0; i < 5; i++) {
      const x = (i * 370 + 200 + p * 25) % 1800;
      b += `<path d="M${x} ${110 + (i % 3) * 44}h${80 + i * 11}" stroke="#f7f2df" stroke-width="${6 + i}" stroke-linecap="round" opacity=".5"/>`;
    }
  b += `<g transform="translate(${(p - 0.5) * -8} 0)"><path d="M0 365L190 184 310 288 460 139 690 350 850 205 1090 360 1320 178 1600 340V720H0Z" fill="${night ? "#213e42" : sunset ? "#b7a798" : "#b3bfa7"}"/><path d="M0 424L240 313 410 399 590 272 820 416 1050 319 1280 425 1470 310 1600 393V720H0Z" fill="${night ? "#294947" : sunset ? "#948f7c" : "#8fA18c"}"/></g>`;
  if (scene === "coast") {
    b += `<path d="M0 400Q480 360 790 420T1600 390V720H0Z" fill="#719f9a"/>`;
    for (let i = 0; i < 18; i++) {
      const x = random() * 1600,
        y = 430 + random() * 290;
      b += `<path d="M${x + p * 24} ${y}h${30 + random() * 120}" stroke="#d1ded0" stroke-width="2" opacity=".4"/>`;
    }
    b += `<path d="M0 550Q300 500 530 610L750 720H0Z" fill="#d7ccb1"/><path d="M0 605Q210 548 430 639L550 720H0Z" fill="#91a17e"/>`;
    for (let i = 0; i < 9; i++)
      b += tree(35 + i * 48, 580 + i * 11, 0.55 + random() * 0.3);
    const coastalMode = travel ? mode : "walk";
    if (coastalMode !== "boat") {
      // A physical trestle / boardwalk anchors land transport above the water.
      const deckY = coastalMode === "train" ? 673 : 665;
      b += `<path d="M545 ${deckY}H1660v18H545Z" fill="#b5a889"/><path d="M545 ${deckY + 18}H1660" stroke="#6d7b68" stroke-width="7"/>`;
      for (let x = 585; x < 1650; x += 115)
        b += `<path d="M${x} ${deckY + 18}v65M${x + 30} ${deckY + 18}v65" stroke="#6c8475" stroke-width="10"/>`;
      if (coastalMode === "train")
        b += `<path d="M545 ${deckY - 3}H1660M545 ${deckY + 7}H1660" stroke="#485e57" stroke-width="3"/>`;
      else
        b += `<path d="M545 ${deckY - 35}H1660" stroke="#b9ae90" stroke-width="4"/>`;
    }
    b += transport(
      coastalMode,
      travel ? lerp(650, 1100, ease(p)) : 920,
      coastalMode === "boat" ? 560 : 665,
      p,
    );
    b += `<path d="M1200 430v120M1315 430v120M1180 445h155M1190 430h135" stroke="#c7ba98" stroke-width="8"/>`;
    for (let i = 0; i < 4; i++) {
      const x = 500 + i * 150 + p * 80,
        y = 180 + (i % 2) * 30;
      b += `<path d="M${x - 12} ${y + 3}q7-9 12 0q5-9 12 0" stroke="#526f6a" fill="none" stroke-width="2"/>`;
    }
  } else if (scene === "mountain") {
    b += `<path d="M0 515Q450 430 900 560T1600 490V720H0Z" fill="#7f9277"/><path d="M0 630Q550 565 1000 640T1600 590V720H0Z" fill="#adad8e"/>`;
    for (let i = 0; i < 18; i++)
      b += tree(i * 100 - 20, 500 + random() * 110, 0.5 + random() * 0.45);
    const mountainMode = travel ? mode : mode === "train" ? "train" : "walk";
    if (mountainMode === "train") {
      b += `<path d="M0 630H1600M0 651H1600" stroke="#495a4f" stroke-width="5"/>`;
      for (let x = 0; x < 1600; x += 32)
        b += `<path d="M${x} 628l-5 26" stroke="#6e6956" stroke-width="6"/>`;
    } else {
      b += `<path d="M0 645H1600" stroke="#c6bea5" stroke-width="42"/>`;
      if (mountainMode === "car" || mountainMode === "bike")
        b += `<path d="M0 645H1600" stroke="#f2ecdf" stroke-width="3" stroke-dasharray="25 25"/>`;
    }
    b += transport(
      mountainMode,
      travel ? lerp(-300, 1300, ease(p)) : lerp(450, 650, ease(p)),
      628,
      p,
    );
    for (let i = 0; i < 7; i++)
      b += tree(i * 300 - 40, 750, 1.25 + random() * 0.3);
  } else {
    b += `<path d="M0 422H1600V720H0Z" fill="${night ? "#344b43" : "#b7bba0"}"/><path d="M650 390L1120 720H155L570 390Z" fill="${night ? "#4c5b51" : "#d6ccaf"}"/>`;
    for (let i = 0; i < 6; i++) {
      const x = 60 + i * 270 + (i % 2) * 25,
        y = 430 + (i % 2) * 35;
      b += house(
        x,
        y,
        145 + random() * 50,
        105 + random() * 40,
        i % 2 ? C.ink : C.rust,
        night,
      );
    }
    for (let i = 0; i < 5; i++)
      b += house(
        i * 360 - 150,
        575,
        210,
        155,
        i % 2 ? C.rust : "#526b5b",
        night,
      );
    b += `<path d="M0 644H1600M0 657H1600" stroke="${night ? "#172f31" : "#6d7162"}" stroke-width="4"/>`;
    for (let i = 0; i < 7; i++) {
      const x = i * 270 + 80;
      b += `<path d="M${x} 650V410h60v15" fill="none" stroke="${night ? "#172f31" : "#67796a"}" stroke-width="5"/>`;
      if (night)
        b += `<ellipse cx="${x + 60}" cy="448" rx="37" ry="52" fill="#e8bd6e" opacity=".08"/><circle cx="${x + 60}" cy="425" r="6" fill="#f1cc80"/>`;
    }
    b += `<path d="M0 409Q350 465 710 405T1600 410M0 422Q350 478 710 418T1600 423" stroke="${night ? "#142e31" : "#596f62"}" stroke-width="2" fill="none" opacity=".6"/>`;
    b += transport(
      travel ? mode : "walk",
      travel ? lerp(-250, 1400, ease(p)) : lerp(790, 840, ease(p)),
      645,
      p,
      night,
    );
    b += tree(1460, 715, 1.5, night) + tree(120, 710, 1.3, night);
  }
  // Mild view movement is deterministic and depends only on normalized scene time.
  const zoom = 1.015 + ease(p) * 0.05,
    dx = (1 - zoom) * 800 + (p - 0.5) * 14,
    dy = (1 - zoom) * 400;
  return `<g transform="translate(${dx.toFixed(3)} ${dy.toFixed(3)}) scale(${zoom.toFixed(5)})">${b}</g>`;
}
function portraitFrame(trip, time, { width, height, duration }) {
  const t = clamp(Number(time) || 0, 0, duration),
    list = timeline(trip, duration),
    s = list.find((s) => t < s.end) || list.at(-1),
    p = clamp((t - s.start) / (s.end - s.start));
  const W = 1080,
    H = 1920,
    ax = 64,
    ay = 248,
    aw = 952,
    ah = 1080;
  let b = `<defs><clipPath id="portrait-art"><rect x="${ax}" y="${ay}" width="${aw}" height="${ah}" rx="3"/></clipPath></defs><rect width="${W}" height="${H}" fill="${C.paper}"/>`;
  b +=
    text(
      "ROUTE / FILM",
      64,
      90,
      31,
      C.ink,
      'letter-spacing="7" font-weight="700"',
    ) +
    text("A JOURNEY DRAWN IN TIME", 64, 130, 15, C.muted, 'letter-spacing="4"');
  b +=
    `<path d="M64 165H1016" stroke="${C.line}"/>` +
    wrapped(
      trip.subtitle || "AN ORIGINAL TRAVEL ATLAS",
      64,
      209,
      16,
      47,
      1,
      C.muted,
      'letter-spacing="2"',
    );
  let title, caption, kicker;
  if (s.type === "overview" || s.type === "recap") {
    b += `<g clip-path="url(#portrait-art)"><g transform="translate(${ax} ${ay})">${mapBody(trip, s.type === "recap" ? 1 : ease(p), aw, ah, null, false)}</g></g>`;
    title =
      s.type === "overview" ? trip.title : "여행은 끝나고,\n하루는 남는다.";
    caption =
      s.type === "overview"
        ? `${trip.stops.length}개의 장소, 하나의 기억. ${trip.stops[0].datetime.slice(0, 10)}에서 시작되는 여행.`
        : `${trip.stops.length}개의 장소를 지나, ${formatDistance(totalDistanceKm(trip))} km의 기억. 구간별 직선거리 합계.`;
    kicker =
      s.type === "overview"
        ? "PROLOGUE / INTO THE DAY"
        : "EPILOGUE / TAKE IT WITH YOU";
  } else {
    const stop = trip.stops[s.index],
      scale = ah / 720;
    b += `<g clip-path="url(#portrait-art)"><g transform="translate(${ax + (aw - 1600 * scale) / 2} ${ay}) scale(${scale})">${diorama(stop.scene, (trip.seed + hash(stop.id)) >>> 0, p, stop.mode, s.type === "travel", stop.datetime)}</g></g>`;
    const progress =
      (s.index - (s.type === "travel" ? 1 - ease(p) : 0)) /
      Math.max(1, trip.stops.length - 1);
    b += `<g transform="translate(722 279)">${mapBody(trip, progress, 260, 190, stop.id, true)}${text("TRAVEL ATLAS", 14, 22, 10, C.ink, 'letter-spacing="2"')}</g>`;
    b += text(
      "여행 분위기를 표현한 창작 디오라마",
      88,
      1299,
      17,
      stop.scene === "night" ? "#e4dcc7" : C.ink,
    );
    title =
      s.type === "travel"
        ? `${modeLabels[stop.mode]}로 이어지는 길`
        : stop.name;
    caption =
      s.type === "travel"
        ? `${trip.stops[s.index - 1].name}에서 ${stop.name}까지. ${formatDistance(distanceKm(trip.stops[s.index - 1], stop))} km 직선거리.`
        : stop.note || "잠시 멈추어, 이 순간을 기억한다.";
    kicker = `${s.type === "travel" ? "ON THE WAY" : "CHAPTER " + String(s.index + 1).padStart(2, "0")} / ${stop.datetime.slice(5, 10).replace("-", ".")} ${stop.datetime.slice(11)}`;
  }
  b += text(
    kicker,
    64,
    1400,
    19,
    C.rust,
    'letter-spacing="2" font-weight="600"',
  );
  b += wrapped(
    title.replace("\n", " "),
    64,
    1484,
    52,
    17,
    2,
    C.ink,
    'font-weight="600"',
  );
  b += wrapped(caption, 64, 1678, 28, 30, 3, C.muted);
  b += text(
    `${String(list.indexOf(s) + 1).padStart(2, "0")} / ${String(list.length).padStart(2, "0")}`,
    64,
    1834,
    19,
    C.muted,
  );
  b += text(
    `${Math.floor(t / 60)
      .toString()
      .padStart(2, "0")}:${Math.floor(t % 60)
      .toString()
      .padStart(2, "0")}`,
    1016,
    1834,
    19,
    C.muted,
    'text-anchor="end"',
  );
  b += `<path d="M64 1862H1016" stroke="${C.line}" stroke-width="4"/><path d="M64 1862H${64 + (952 * t) / duration}" stroke="${C.rust}" stroke-width="4"/>`;
  const fade = Math.max(0, 1 - Math.min(t - s.start, s.end - t) / 0.18);
  if (fade > 0 && t > 0 && t < duration)
    b += `<rect x="${ax}" y="${ay}" width="${aw}" height="${ah}" fill="${C.paper}" opacity="${(fade * 0.72).toFixed(4)}"/>`;
  return svg(
    `<g transform="scale(${width / W} ${height / H})">${b}</g>`,
    width,
    height,
    `${trip.title} · ${title}`,
  );
}
export function renderFrame(
  trip,
  time,
  { width = 1920, height = 1080, duration = 60 } = {},
) {
  if (height > width)
    return portraitFrame(trip, time, { width, height, duration });
  const t = clamp(Number(time) || 0, 0, duration),
    list = timeline(trip, duration),
    s = list.find((s) => t < s.end) || list.at(-1),
    p = clamp((t - s.start) / (s.end - s.start));
  const w = 1920,
    h = 1080;
  let b = `<defs><clipPath id="scene"><rect x="0" y="0" width="1600" height="720"/></clipPath><clipPath id="frame-art"><rect x="64" y="150" width="1792" height="716" rx="3"/></clipPath></defs><rect width="1920" height="1080" fill="${C.paper}"/>`;
  b +=
    text(
      "ROUTE / FILM",
      64,
      66,
      22,
      C.ink,
      'letter-spacing="6" font-weight="700"',
    ) +
    text(
      "A JOURNEY DRAWN IN TIME",
      1856,
      66,
      16,
      C.muted,
      'text-anchor="end" letter-spacing="4"',
    );
  b += `<path d="M64 91H1856" stroke="${C.line}"/>`;
  b += text(
    trip.subtitle || "AN ORIGINAL TRAVEL ATLAS",
    64,
    125,
    14,
    C.muted,
    'letter-spacing="3"',
  );
  b += text(
    `${String(list.indexOf(s) + 1).padStart(2, "0")} / ${String(list.length).padStart(2, "0")}`,
    1856,
    125,
    16,
    C.muted,
    'text-anchor="end"',
  );
  let caption, title, kicker;
  if (s.type === "overview" || s.type === "recap") {
    const progress = s.type === "recap" ? 1 : ease(p);
    const map = mapBody(trip, progress, 1792, 716, null, false),
      zoom =
        1 + (s.type === "overview" ? 0.035 * ease(p) : 0.035 * (1 - ease(p)));
    b += `<g clip-path="url(#frame-art)"><g transform="translate(${64 + (1 - zoom) * 896} ${150 + (1 - zoom) * 358}) scale(${zoom})">${map}</g></g>`;
    title =
      s.type === "overview" ? trip.title : "여행은 끝나고, 하루는 남는다.";
    caption =
      s.type === "overview"
        ? `${trip.stops.length}개의 장소를 잇는 여행 · ${trip.stops[0].datetime.slice(0, 10)}${trip.stops[0].datetime.slice(0, 10) !== trip.stops.at(-1).datetime.slice(0, 10) ? " — " + trip.stops.at(-1).datetime.slice(0, 10) : ""}`
        : `${trip.stops.length} STOPS / ${formatDistance(totalDistanceKm(trip))} km · 구간별 직선거리 합계`;
    kicker =
      s.type === "overview"
        ? "PROLOGUE — THE WHOLE JOURNEY"
        : "EPILOGUE — KEEP THIS MOMENT";
  } else {
    const stop = trip.stops[s.index],
      scene = stop.scene;
    b += `<g clip-path="url(#frame-art)"><g transform="translate(64 150) scale(1.12 .99445)"><g clip-path="url(#scene)">${diorama(scene, (trip.seed + hash(stop.id)) >>> 0, p, stop.mode, s.type === "travel", stop.datetime)}</g></g></g>`;
    // Cartographic inset remains tied to the same stop and source coordinates.
    const progress =
      (s.index - (s.type === "travel" ? 1 - ease(p) : 0)) /
      Math.max(1, trip.stops.length - 1);
    b += `<g transform="translate(1536 181)"><rect width="280" height="190" fill="${C.paper}" opacity=".96"/>${mapBody(trip, progress, 280, 190, stop.id, true)}${text("TRAVEL ATLAS", 14, 22, 10, C.ink, 'letter-spacing="2"')}</g>`;
    title =
      s.type === "travel"
        ? `${modeLabels[stop.mode]}로 이어지는 길`
        : stop.name;
    caption =
      s.type === "travel"
        ? `${trip.stops[s.index - 1].name} → ${stop.name} · ${formatDistance(distanceKm(trip.stops[s.index - 1], stop))} km 직선거리`
        : stop.note || "잠시 멈추어, 이 순간을 기억한다.";
    kicker = `${s.type === "travel" ? "ON THE WAY" : "CHAPTER " + String(s.index + 1).padStart(2, "0")} — ${stop.datetime.slice(5, 10).replace("-", ".")} / ${stop.datetime.slice(11)}`;
    b += text(
      "여행 분위기를 표현한 창작 디오라마",
      88,
      839,
      14,
      scene === "night" ? "#e4dcc7" : C.ink,
      'opacity=".85"',
    );
  }
  b += text(
    kicker,
    64,
    912,
    14,
    C.rust,
    'letter-spacing="2" font-weight="600"',
  );
  b += wrapped(title, 64, 958, 36, 34, 1, C.ink, 'font-weight="600"');
  b += wrapped(caption, 64, 1005, 20, 69, 2, C.muted);
  b += text(
    `${Math.floor(t / 60)
      .toString()
      .padStart(2, "0")}:${Math.floor(t % 60)
      .toString()
      .padStart(2, "0")} / ${Math.floor(duration / 60)
      .toString()
      .padStart(2, "0")}:${Math.round(duration % 60)
      .toString()
      .padStart(2, "0")}`,
    1856,
    1008,
    16,
    C.muted,
    'text-anchor="end"',
  );
  b += `<path d="M64 1052H1856" stroke="${C.line}" stroke-width="3"/><path d="M64 1052H${64 + (1792 * t) / duration}" stroke="${C.rust}" stroke-width="3"/>`;
  // Brief paper-colored fades across scene cuts prevent jarring camera discontinuities.
  const fade = Math.max(0, 1 - Math.min(t - s.start, s.end - t) / 0.18);
  if (fade > 0 && t > 0 && t < duration)
    b += `<rect x="64" y="150" width="1792" height="716" fill="${C.paper}" opacity="${(fade * 0.72).toFixed(4)}"/>`;
  return svg(
    `<g transform="scale(${width / w} ${height / h})">${b}</g>`,
    width,
    height,
    `${trip.title} · ${title}`,
  );
}
export function renderPoster(trip, { width = 1123, height = 1587 } = {}) {
  const w = 1123,
    h = 1587,
    n = trip.stops.length;
  let b = `<rect width="${w}" height="${h}" fill="${C.paper}"/>`;
  b +=
    text(
      "ROUTE / FILM",
      64,
      78,
      21,
      C.ink,
      'letter-spacing="5" font-weight="700"',
    ) +
    text(
      "THE JOURNEY COLLECTION",
      1059,
      78,
      11,
      C.muted,
      'text-anchor="end" letter-spacing="2"',
    );
  b += `<path d="M64 100H1059" stroke="${C.ink}"/>`;
  b += wrapped(trip.title, 64, 165, 39, 25, 2, C.ink, 'font-weight="600"');
  b += text(
    trip.subtitle || "A PERSONAL ATLAS",
    64,
    254,
    12,
    C.muted,
    'letter-spacing="2"',
  );
  const start = trip.stops[0].datetime.slice(0, 10),
    end = trip.stops.at(-1).datetime.slice(0, 10);
  b += text(
    start + (start !== end ? " — " + end : ""),
    1059,
    254,
    15,
    C.ink,
    'text-anchor="end"',
  );
  const mapHeight = n > 8 ? 500 : 620;
  b += `<g transform="translate(64 284)">${mapBody(trip, 1, 995, mapHeight, null, false)}</g>`;
  const top = 284 + mapHeight + 44;
  b +=
    text("여정의 기록", 64, top, 21, C.ink, 'font-weight="600"') +
    text(
      `${String(n).padStart(2, "0")} STOPS · ${formatDistance(totalDistanceKm(trip))} km`,
      1059,
      top,
      14,
      C.rust,
      'text-anchor="end"',
    );
  const available = 1452 - top - 25,
    row = Math.min(90, available / n);
  trip.stops.forEach((s, i) => {
    const y = top + 28 + i * row;
    b += `<path d="M64 ${y}H1059" stroke="${C.line}"/>`;
    b += text(String(i + 1).padStart(2, "0"), 64, y + 30, 21, C.rust);
    b += wrapped(
      s.name,
      116,
      y + 27,
      n > 8 ? 15 : 17,
      18,
      row < 74 ? 1 : 2,
      C.ink,
      'font-weight="600"',
    );
    b += text(
      `${s.datetime.slice(5, 10).replace("-", ".")} · ${s.datetime.slice(11)} / ${modeLabels[s.mode]}`,
      116,
      y + row - 10,
      11,
      C.muted,
    );
    b += wrapped(
      s.note || "—",
      455,
      y + 27,
      n > 8 ? 12 : 14,
      n > 8 ? 41 : 35,
      row < 74 ? 1 : 2,
      C.ink,
    );
    b += text(
      `${Math.abs(s.lat).toFixed(4)}° ${s.lat < 0 ? "S" : "N"} / ${Math.abs(s.lon).toFixed(4)}° ${s.lon < 0 ? "W" : "E"}`,
      455,
      y + row - 10,
      10,
      C.muted,
    );
  });
  b += `<path d="M64 1480H1059" stroke="${C.ink}"/>`;
  b += text(
    "좌표 기반 직선 연결 · 거리는 구간별 Haversine 대권거리 합계 · 실제 교통 경로·이동거리와 다릅니다.",
    64,
    1507,
    10,
    C.muted,
  );
  b += text(
    "긴 이름·메모는 지면에 맞춰 일부 생략됩니다. 전체 내용은 여행 데이터 JSON에 보존됩니다.",
    64,
    1525,
    10,
    C.muted,
  );
  b +=
    text(
      "WGS84 / LOCAL ITINERARY TIMES",
      64,
      1552,
      10,
      C.muted,
      'letter-spacing="1"',
    ) +
    text(
      `A3 · 297 × 420 mm / SEED ${trip.seed}`,
      1059,
      1552,
      10,
      C.muted,
      'text-anchor="end"',
    );
  return svg(
    `<g transform="scale(${width / w} ${height / h})">${b}</g>`,
    width,
    height,
    trip.title + " · A3 여행 포스터",
  );
}

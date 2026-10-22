import {
  normalizeTrip,
  validateTrip,
  totalDistanceKm,
  timeline,
  renderMap,
  renderFrame,
  renderPoster,
} from "/shared/core.mjs";
import { sampleTrips } from "/shared/samples.mjs";

const STORE = "route-film.trip.v1",
  LAST_VALID = "route-film.valid.v1",
  SETTINGS = "route-film.settings.v1",
  JOB = "route-film.job.v1";
const $ = (s, r = document) => r.querySelector(s),
  $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clone = (v) => structuredClone(v),
  esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const paths = {
  arrow: "M4 12h16m-6-6 6 6-6 6",
  down: "M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5",
  up: "m6 14 6-6 6 6",
  chevdown: "m6 10 6 6 6-6",
  close: "m6 6 12 12M6 18 18 6",
  plus: "M12 4v16M4 12h16",
  map: "m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16",
  film: "M3 5h18v14H3zM7 5v14M17 5v14M3 9h4m-4 6h4m10-6h4m-4 6h4",
  poster: "M5 3h14v18H5zM9 7h6M9 11h6m-6 4h3",
  edit: "m14 5 5 5M4 20l5-1L21 7l-5-5L4 14v6Z",
  upload: "M12 17V4m-5 5 5-5 5 5M4 16v5h16v-5",
  save: "M4 3h13l4 4v14H3V3h1ZM7 3v6h9V3M7 21v-8h10v8",
  play: "m8 5 11 7-11 7V5Z",
  pause: "M8 5v14M16 5v14",
  train: "M6 3h12v14H6zM6 10h12M9 3v7m6 7 4 4M9 17l-4 4M9 14h.1m5 0h.1",
  walk: "M13 4h.1M11 8l4 4h5M11 8l-4 5H3m8-5-1 8-5 5m5-5 6 5",
  car: "m5 9 2-5h10l2 5M3 9h18v9H3zM6 18v3m12-3v3M6 13h2m8 0h2",
  boat: "M12 2v13M12 3l7 9h-7M4 16h16l-4 5H8z",
  bike: "M5 14a4 4 0 1 0 0 .1M19 14a4 4 0 1 0 0 .1M5 14l5-8 9 8M8 6h5m2-3h3l1 11",
  camera: "M3 7h5l2-3h4l2 3h5v13H3zM15 13a3 3 0 1 0 0 .1",
  trash: "M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7",
  check: "m5 12 4 4L19 6",
  reset: "M4 10a8 8 0 1 1 0 5M4 3v7h7",
  globe:
    "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c-5 5-5 13 0 18 5-5 5-13 0-18",
  fullscreen: "M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6",
};
const icon = (name) =>
  `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.map}"/></svg>`;
const words = {
  ko: {
    tag: "A JOURNEY, BEAUTIFULLY REMEMBERED",
    save: "이 기기에 저장됨",
    import: "불러오기",
    export: "여행 내보내기",
    eyebrow: "THE JOURNEY IS THE STORY",
    headline: "지나온 길을, <em>간직할 장면으로.</em>",
    description:
      "하나의 여행에서 펼쳐지는 지도, 한 편의 필름, 그리고 오래 두고 볼 포스터.",
    edition: "TRAVEL ATLAS / VOL. 01",
    sample: "샘플 여행",
    details: "여행 설정",
    json: "JSON 저장",
    journey: "YOUR ITINERARY",
    places: "개의 장소",
    distance: "직선거리 합계",
    stops: "기억할 장소",
    add: "장소 추가",
    atlas: "아틀라스",
    film: "여행 필름",
    poster: "포스터",
    preview: "LIVE PREVIEW",
    timeline: "여행의 시간",
    foot: "실제 좌표를 바탕으로 그린 여행",
    schematic: "경로는 장소 간 직선 연결입니다",
    note: "장소 노트",
    name: "장소 이름",
    datetime: "방문 날짜 · 시간",
    lat: "위도",
    lon: "경도",
    mode: "이동 수단",
    scene: "장면 분위기",
    memo: "짧은 메모",
    moveUp: "앞으로 이동",
    moveDown: "뒤로 이동",
    remove: "장소 삭제",
    camera: "SCENE DIRECTION",
    cameraDescription: "멀리서 바라보고,<br>기억 가까이 다가갑니다.",
    cameraHint: "디오라마는 여행의 분위기를 표현한 창작 장면입니다.",
    copyright: "Every journey deserves a second life.",
    bottom: "MADE OF COORDINATES & MEMORIES",
    close: "닫기",
    title: "여행 제목",
    subtitle: "여행의 한 문장",
    seed: "장면 시드",
    saveTrip: "설정 저장",
    tripSettings: "나의 여행, 나의 기록",
    settingsIntro: "같은 장소와 시드로 지도·필름·포스터가 함께 만들어집니다.",
    exportTitle: "여행을 간직하는 세 가지 방법",
    exportIntro:
      "60초의 필름, 한 장의 지도. 지금 편집한 여행을 그대로 담습니다.",
    landscape: "시네마틱 가로",
    portrait: "모바일 세로",
    duration: "길이",
    quality: "영상 품질",
    startRender: "필름 + 포스터 만들기",
    posterOnly: "포스터만 만들기",
    exportNote:
      "영상 생성 중에도 여행을 편집할 수 있습니다. 결과에는 생성 시작 시점의 여행이 담깁니다.",
    making: "여행을 장면으로 만드는 중",
    complete: "여행이 완성되었습니다",
    failed: "생성을 마치지 못했습니다",
    cancelled: "생성이 취소되었습니다",
    cancel: "생성 취소",
    retry: "같은 여행으로 다시 만들기",
    posterWorking: "인쇄용 포스터를 만들고 있습니다…",
    stale: "이 결과는 이전 편집본입니다. 현재 여행을 담으려면 새로 생성하세요.",
    saved: "여행을 이 기기에 저장했습니다.",
    loaded: "여행을 불러왔습니다.",
    badFile: "여행 JSON 파일을 확인해 주세요.",
    recovered: "저장된 데이터에 문제가 있어 샘플 여행을 열었습니다.",
    validation:
      "입력 내용을 확인해 주세요. 미리보기에는 마지막 유효한 여행이 표시됩니다.",
    all: "전체 여정",
    travel: "길 위의 순간",
    recap: "다시, 우리의 여행",
    reset: "전체 여정 보기",
    sampleDisclaimer:
      "샘플 좌표는 실제 위치를 참고했습니다. 방문 시각과 메모는 창작입니다.",
    start: "출발",
    end: "도착",
    print: "A3 · 인쇄용",
    share: "다운로드한 필름과 포스터를 자유롭게 공유하세요.",
    unavailable: "서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    reorderHint: "순서를 바꾸면 방문 시각도 함께 확인하세요.",
    draft: "자동 저장은 현재 브라우저에 보관됩니다.",
    jobRestored: "이전 생성 작업을 복원했습니다.",
    noLocations: "최소 두 장소가 필요합니다.",
    sampleChange: "샘플 여행을 불러왔습니다.",
    language: "언어 변경",
    source: "데이터와 출처",
    portraitNote: "1080 × 1920 · 30fps",
    wideNote: "1920 × 1080 · 30fps",
    newPlace: "새로운 장소",
    newNote: "이곳에서의 기억을 적어보세요.",
  },
  en: {
    tag: "A JOURNEY, BEAUTIFULLY REMEMBERED",
    save: "Saved on this device",
    import: "Import",
    export: "Export journey",
    eyebrow: "THE JOURNEY IS THE STORY",
    headline: "The places you went.<br><em>The moments you keep.</em>",
    description:
      "One journey. A living atlas, a cinematic film, and a print to keep forever.",
    edition: "TRAVEL ATLAS / VOL. 01",
    sample: "Sample journey",
    details: "Journey settings",
    json: "Save JSON",
    journey: "YOUR ITINERARY",
    places: "places",
    distance: "STRAIGHT-LINE DISTANCE",
    stops: "PLACES TO REMEMBER",
    add: "Add a place",
    atlas: "Atlas",
    film: "Film",
    poster: "Poster",
    preview: "LIVE PREVIEW",
    timeline: "THE JOURNEY, IN TIME",
    foot: "Drawn from real-world coordinates",
    schematic: "Routes connect places with straight lines",
    note: "Place notes",
    name: "Place name",
    datetime: "Visit date & time",
    lat: "Latitude",
    lon: "Longitude",
    mode: "Travel mode",
    scene: "Scene mood",
    memo: "A small memory",
    moveUp: "Move earlier",
    moveDown: "Move later",
    remove: "Remove place",
    camera: "SCENE DIRECTION",
    cameraDescription: "See it from a distance.<br>Feel it up close.",
    cameraHint:
      "Procedural dioramas are creative impressions, not exact reconstructions.",
    copyright: "Every journey deserves a second life.",
    bottom: "MADE OF COORDINATES & MEMORIES",
    close: "Close",
    title: "Journey title",
    subtitle: "A line to remember",
    seed: "Scene seed",
    saveTrip: "Save settings",
    tripSettings: "Your journey, your story",
    settingsIntro:
      "One set of places and one seed, reflected in every map, frame, and print.",
    exportTitle: "Three ways to keep a journey",
    exportIntro:
      "A sixty-second film. A print to hold. Your journey, just as you edited it.",
    landscape: "Cinematic landscape",
    portrait: "Mobile portrait",
    duration: "DURATION",
    quality: "VIDEO QUALITY",
    startRender: "Create film + posters",
    posterOnly: "Create posters only",
    exportNote:
      "Keep editing while your film renders. Each export captures your journey at the moment you start.",
    making: "Turning your journey into scenes",
    complete: "Your journey is ready",
    failed: "The export could not finish",
    cancelled: "Export cancelled",
    cancel: "Cancel export",
    retry: "Retry the same journey",
    posterWorking: "Preparing your print files…",
    stale:
      "These files reflect an earlier edit. Create a new export to include your latest changes.",
    saved: "Journey saved on this device.",
    loaded: "Journey imported.",
    badFile: "Please check your journey JSON file.",
    recovered:
      "Saved data could not be restored. A sample journey is open instead.",
    validation:
      "Please check your inputs. The preview shows the last valid version of your journey.",
    all: "THE WHOLE JOURNEY",
    travel: "ALONG THE WAY",
    recap: "A JOURNEY TO REMEMBER",
    reset: "View entire journey",
    sampleDisclaimer:
      "Sample places use real coordinates. Their visit times and memories are fictional.",
    start: "DEPARTURE",
    end: "ARRIVAL",
    print: "A3 · PRINT READY",
    share: "Download your film and prints, then share your journey anywhere.",
    unavailable: "The server could not be reached. Please try again shortly.",
    reorderHint: "After moving a place, check the order of visit times.",
    draft: "Autosave is stored in this browser.",
    jobRestored: "Your previous export has been restored.",
    noLocations: "A journey needs at least two places.",
    sampleChange: "Sample journey loaded.",
    language: "Change language",
    source: "Sources & credits",
    portraitNote: "1080 × 1920 · 30fps",
    wideNote: "1920 × 1080 · 30fps",
    newPlace: "A new place",
    newNote: "Write a memory from this place.",
  },
};
let lang = "ko",
  trip = clone(sampleTrips[0]),
  lastValid = normalizeTrip(trip),
  restored = false,
  storageAvailable = true;
try {
  lang =
    JSON.parse(localStorage.getItem(SETTINGS) || "{}").lang === "en"
      ? "en"
      : "ko";
  const raw = localStorage.getItem(STORE);
  if (raw) {
    const saved = JSON.parse(raw);
    if (
      !saved ||
      !Array.isArray(saved.stops) ||
      saved.stops.length < 2 ||
      saved.stops.length > 12 ||
      !saved.stops.every(
        (s) =>
          s &&
          typeof s.id === "string" &&
          typeof s.name === "string" &&
          typeof s.datetime === "string",
      )
    )
      throw new Error("Invalid saved draft");
    trip = saved;
    try {
      lastValid = normalizeTrip(saved);
    } catch {
      lastValid = normalizeTrip(
        JSON.parse(
          localStorage.getItem(LAST_VALID) || JSON.stringify(sampleTrips[0]),
        ),
      );
    }
  }
} catch {
  restored = true;
}
const state = {
  trip,
  valid: lastValid,
  selected: trip.stops[0].id,
  view: "atlas",
  time: 60,
  playing: false,
  format: "landscape",
  job: null,
  jobSnapshot: null,
  posterOutputs: null,
  posterSnapshot: null,
  posterBusy: false,
  jobFormat: "landscape",
  errors: [],
  renderBusy: false,
};
const t = (k) => words[lang][k] || k;
const modes = {
  ko: {
    train: "기차",
    walk: "도보",
    car: "자동차",
    boat: "배",
    bike: "자전거",
  },
  en: {
    train: "Train",
    walk: "Walk",
    car: "Car",
    boat: "Boat",
    bike: "Bicycle",
  },
};
const scenes = {
  ko: {
    city: "도시의 리듬",
    coast: "바다의 빛",
    mountain: "산의 고요",
    night: "밤의 귀환",
  },
  en: {
    city: "City rhythm",
    coast: "Coastal light",
    mountain: "Mountain stillness",
    night: "Night return",
  },
};
let toastTimer,
  playId,
  lastPlay = 0,
  frameTime = 0,
  polling = null;
function notify(message) {
  const el = $("#notice");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 5000);
}
function persist() {
  try {
    localStorage.setItem(STORE, JSON.stringify(state.trip));
    localStorage.setItem(LAST_VALID, JSON.stringify(state.valid));
    localStorage.setItem(SETTINGS, JSON.stringify({ lang }));
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }
  const save = $("#save-state");
  if (save)
    save.textContent = storageAvailable
      ? t("save")
      : lang === "ko"
        ? "자동 저장 불가 · JSON으로 저장하세요"
        : "Autosave unavailable · save JSON";
}
function shell() {
  document.documentElement.lang = lang;
  $("#app").innerHTML = `
<header class="topbar"><a class="brand" href="/" aria-label="Route Film home" style="text-decoration:none"><span class="brand-mark">r</span><span class="wordmark">ROUTE <i>/</i> FILM</span><span class="brand-tag">A JOURNEY,<br>BEAUTIFULLY REMEMBERED.</span></a><div class="top-actions"><span class="save-state" id="save-state">${t("save")}</span><button class="lang-toggle" id="language" aria-label="${t("language")}">${lang === "ko" ? "<b>KR</b> / EN" : "KR / <b>EN</b>"}</button><button class="plain-btn" data-action="import">${icon("upload")}${t("import")}</button><button class="button" data-action="export">${t("export")}${icon("arrow")}</button></div></header>
<section class="intro"><div><p class="eyebrow">${t("eyebrow")}</p><h1>${t("headline")}</h1><p class="intro-description">${t("description")}</p></div><div class="intro-right"><div class="edition">TRAVEL ATLAS / VOL. 01<br><b id="route-latitudes">35° → 35°</b><br>MEMORIES, IN MOTION.</div><div class="stamp">SLOW<br>TRAVEL<br>CLUB</div></div></section>
<main class="workspace" id="workspace"><div class="workspace-top"><div class="project-name">${icon("map")}<span id="project-name"></span><small id="project-badge">${t("sample")}</small></div><div class="project-tools"><button class="plain-btn" data-action="details" aria-label="${t("details")}">${icon("edit")}${t("details")}</button><button class="plain-btn" data-action="json" aria-label="${t("json")}">${icon("save")}${t("json")}</button><button class="plain-btn mobile-import" data-action="import" aria-label="${t("import")}">${icon("upload")}</button></div></div><div class="error-banner" id="errors" role="alert" hidden></div>
<div class="workspace-grid"><aside class="journey-panel"><div class="panel-kicker">${t("journey")}<b id="stop-count"></b></div><label class="visually-hidden" for="sample-select">${t("sample")}</label><select class="sample-select" id="sample-select"><option value="" disabled>${lang === "ko" ? "나의 여행" : "My journey"}</option>${sampleTrips.map((s, i) => `<option value="${i}">${esc(s.title)}</option>`).join("")}</select><div class="journey-stats"><div><div class="stat-num" id="distance"></div><div class="stat-label">${t("distance")}</div></div><div><div class="stat-num" id="places"></div><div class="stat-label">${t("stops")}</div></div></div><nav class="stop-list" id="stop-list" aria-label="${t("journey")}"></nav><button class="add-stop" id="add-stop">${icon("plus")}${t("add")}</button><div class="journey-foot"><div class="mini-compass">✣</div><p id="sample-disclaimer">${t("sampleDisclaimer")}</p><div class="sample-note"><i class="status-dot"></i> WGS84 / STRAIGHT-LINE ROUTES</div></div></aside>
<section class="stage-panel" aria-label="${t("preview")}"><div class="stage-toolbar"><div class="tabs" role="tablist">${[
    ["atlas", "map"],
    ["film", "film"],
    ["poster", "poster"],
  ]
    .map(
      ([v, i]) =>
        `<button class="tab" role="tab" aria-selected="${state.view === v}" data-view="${v}" id="tab-${v}">${icon(i)}${t(v)}</button>`,
    )
    .join(
      "",
    )}</div><span class="preview-label">${t("preview")} <span class="status-dot"></span></span></div><div class="stage-shell"><div class="stage-corner"><button id="reset-view" aria-label="${t("reset")}" title="${t("reset")}">${icon("reset")}</button><button id="fullscreen" aria-label="${lang === "ko" ? "미리보기 전체 화면" : "Fullscreen preview"}">${icon("fullscreen")}</button></div><div class="stage-art" id="stage" role="tabpanel" aria-labelledby="tab-atlas"></div><div class="stage-caption"><span id="stage-label">ATLAS / 001</span><span>${t("schematic")}</span></div></div><div class="timebar"><div class="timebar-head"><div class="timebar-title"><button class="play-button" id="play" aria-label="${lang === "ko" ? "재생" : "Play"}">${icon("play")}</button><span>${t("timeline")}</span></div><span class="time-display"><b id="time-current">01:00</b> / 01:00</span></div><label class="visually-hidden" for="timeline">${t("timeline")}</label><input class="timeline-range" type="range" id="timeline" min="0" max="60" step="0.1" value="${state.time}"><div class="timeline-ticks"><span>00:00</span><span>00:15</span><span>00:30</span><span>00:45</span><span>01:00</span></div></div><div class="film-strip" id="film-strip"></div></section>
<aside class="inspector" id="inspector" aria-label="${t("note")}"></aside></div><footer class="workspace-foot"><span>${icon("globe")}${t("foot")} · WGS84</span><span><i class="status-dot"></i>${t("draft")}</span></footer></main>
<footer class="page-footer"><strong>${t("copyright")}</strong><span>${t("bottom")}<br>ROUTE / FILM — EST. 2026</span></footer>
<input id="import-file" type="file" accept="application/json,.json" hidden><div class="notice" id="notice" role="status" aria-live="polite" hidden></div>
<dialog id="settings-dialog" aria-labelledby="settings-title"><div class="dialog-head"><div><p class="eyebrow">JOURNEY DETAILS</p><h2 id="settings-title">${t("tripSettings")}</h2></div><button class="icon-btn" data-close="settings-dialog" aria-label="${t("close")}">${icon("close")}</button></div><div class="dialog-body"><p class="dialog-subtitle">${t("settingsIntro")}</p><form id="trip-form" class="trip-form"><label>${t("title")}<input name="title" maxlength="80" required></label><label>${t("subtitle")}<textarea name="subtitle" maxlength="120" rows="2"></textarea></label><label>${t("seed")}<input name="seed" type="number" min="0" max="2147483647" step="1" required></label><div class="dialog-actions"><button class="button" type="submit">${t("saveTrip")}${icon("check")}</button></div></form></div></dialog>
<dialog id="export-dialog" aria-labelledby="export-title"><div class="dialog-head"><div><p class="eyebrow">TAKE YOUR JOURNEY WITH YOU</p><h2 id="export-title">${t("exportTitle")}</h2></div><button class="icon-btn" data-close="export-dialog" aria-label="${t("close")}">${icon("close")}</button></div><div class="dialog-body"><p class="dialog-subtitle">${t("exportIntro")}</p><div class="export-choice">${["landscape", "portrait"].map((f) => `<button class="format-choice ${state.format === f ? "active" : ""}" data-format="${f}" aria-pressed="${state.format === f}"><span class="format-icon ${f === "portrait" ? "portrait" : ""}"></span><span><strong>${t(f)}</strong><small>${t(f === "portrait" ? "portraitNote" : "wideNote")}</small></span></button>`).join("")}</div><div class="export-summary"><span>${t("duration")} <b>60 SEC</b></span><span>${t("quality")} <b>H.264 + AAC</b></span><span><b>A3 · PDF / SVG / PNG</b></span></div><div class="export-actions"><button class="button orange wide" id="render-start">${icon("film")}${t("startRender")}</button><button class="button outline wide" id="poster-start">${icon("poster")}${t("posterOnly")}</button></div><p class="export-note">${t("exportNote")}</p><div id="poster-status" aria-live="polite"></div><section id="job-status" aria-live="polite"></section><p class="export-note">${t("share")}</p></div></dialog>`;
  bindShell();
  refresh();
  renderInspector();
  renderJob();
  renderPosterStatus();
}
function safeValidation() {
  try {
    state.errors = validateTrip(state.trip) || [];
    if (!state.errors.length) state.valid = normalizeTrip(state.trip);
  } catch (e) {
    state.errors = [e.message];
  }
  const errors = $("#errors");
  errors.hidden = !state.errors.length;
  errors.innerHTML = `${esc(t("validation"))}<ul>${state.errors.map((e) => `<li>${esc(typeof e === "string" ? e : e.message || JSON.stringify(e))}</li>`).join("")}</ul>`;
  $("#render-start").disabled =
    state.errors.length > 0 || state.renderBusy || activeJob();
  $("#poster-start").disabled = state.errors.length > 0 || state.posterBusy;
}
function refresh({ thumbnails = true } = {}) {
  safeValidation();
  $("#project-name").textContent = state.trip.title;
  $("#project-badge").textContent = sampleTrips.some(
    (s) => JSON.stringify(normalizeTrip(s)) === JSON.stringify(state.trip),
  )
    ? t("sample")
    : lang === "ko"
      ? "나의 여행"
      : "My journey";
  $("#stop-count").textContent = String(state.trip.stops.length).padStart(
    2,
    "0",
  );
  $("#places").textContent = String(state.trip.stops.length).padStart(2, "0");
  $("#route-latitudes").textContent =
    state.valid.stops[0].lat.toFixed(2) +
    "° → " +
    state.valid.stops.at(-1).lat.toFixed(2) +
    "°";
  $("#sample-disclaimer").textContent = sampleTrips.some(
    (s) => JSON.stringify(normalizeTrip(s)) === JSON.stringify(state.trip),
  )
    ? t("sampleDisclaimer")
    : lang === "ko"
      ? "입력한 좌표를 기준으로 표시합니다. 실제 위치와 방문 시각을 확인해 주세요."
      : "Shown from your coordinates. Check each place’s location and visit time.";
  $("#distance").innerHTML =
    `${totalDistanceKm(state.valid).toFixed(1)}<small>km</small>`;
  const index = sampleTrips.findIndex((s) => s.id === state.trip.id);
  $("#sample-select").value = index < 0 ? "" : String(index);
  renderStops();
  renderStage();
  if (thumbnails) renderThumbnails();
  persist();
  renderJob();
}
function renderStops() {
  $("#stop-list").innerHTML = state.trip.stops
    .map(
      (s, i) =>
        `<button class="stop-item ${s.id === state.selected ? "active" : ""}" data-stop="${esc(s.id)}" aria-label="${esc(`${i + 1}. ${s.name}`)}" aria-current="${s.id === state.selected ? "location" : "false"}"><span class="stop-num">${String(i + 1).padStart(2, "0")}</span><span><span class="stop-name">${esc(s.name || t("newPlace"))}</span><span class="stop-meta">${icon(s.mode)}<span>${esc(String(s.datetime || "").slice(11, 16))}</span><span>·</span><span>${esc(modes[lang][s.mode] || s.mode)}</span></span></span></button>`,
    )
    .join("");
  $("#add-stop").disabled = state.trip.stops.length >= 12;
}
function renderInspector() {
  const s =
    state.trip.stops.find((s) => s.id === state.selected) ||
    state.trip.stops[0];
  state.selected = s.id;
  const i = state.trip.stops.indexOf(s);
  $("#inspector").innerHTML =
    `<div class="panel-kicker">${t("note")}<span class="stop-index">PLACE ${String(i + 1).padStart(2, "0")}</span></div><div class="inspector-head"><h2>${esc(s.name)}</h2>${icon(s.mode)}</div><p class="inspector-date">${esc(String(s.datetime).replace("T", " · "))}</p><div class="inspector-fields"><label class="field-wide">${t("name")}<input data-field="name" aria-label="${t("name")}" maxlength="100" value="${esc(s.name)}"></label><label class="field-wide">${t("datetime")}<input data-field="datetime" aria-label="${t("datetime")}" type="datetime-local" value="${esc(s.datetime)}"></label><label>${t("lat")}<input data-field="lat" aria-label="${t("lat")}" type="number" min="-85" max="85" step="0.000001" value="${esc(s.lat)}"></label><label>${t("lon")}<input data-field="lon" aria-label="${t("lon")}" type="number" min="-180" max="180" step="0.000001" value="${esc(s.lon)}"></label><label>${t("mode")}<select data-field="mode" aria-label="${t("mode")}">${Object.entries(
      modes[lang],
    )
      .map(
        ([v, l]) =>
          `<option value="${v}" ${s.mode === v ? "selected" : ""}>${l}</option>`,
      )
      .join(
        "",
      )}</select></label><label>${t("scene")}<select data-field="scene" aria-label="${t("scene")}">${Object.entries(
      scenes[lang],
    )
      .map(
        ([v, l]) =>
          `<option value="${v}" ${s.scene === v ? "selected" : ""}>${l}</option>`,
      )
      .join(
        "",
      )}</select></label><label class="field-wide">${t("memo")}<textarea data-field="note" aria-label="${t("memo")}" maxlength="500" rows="3">${esc(s.note)}</textarea></label><p class="field-hint">${t("reorderHint")}</p></div><div class="stop-actions"><div><button class="icon-btn" id="move-up" aria-label="${t("moveUp")}" title="${t("moveUp")}" ${i === 0 ? "disabled" : ""}>${icon("up")}</button><button class="icon-btn" id="move-down" aria-label="${t("moveDown")}" title="${t("moveDown")}" ${i === state.trip.stops.length - 1 ? "disabled" : ""}>${icon("chevdown")}</button></div><button class="remove-stop" id="remove-stop" ${state.trip.stops.length <= 2 ? "disabled" : ""}>${icon("trash")}${t("remove")}</button></div><div class="camera-note"><h3>${icon("camera")}${t("camera")}</h3><p>${t("cameraDescription")}</p><small>${t("cameraHint")}</small></div>`;
  $$("[data-field]", $("#inspector")).forEach((input) =>
    input.addEventListener("input", () => {
      pause();
      const field = input.dataset.field;
      s[field] =
        field === "lat" || field === "lon"
          ? input.value === ""
            ? ""
            : Number(input.value)
          : input.value;
      $("#inspector h2").textContent = s.name;
      $(".inspector-date").textContent = String(s.datetime).replace("T", " · ");
      refresh({ thumbnails: false });
    }),
  );
  $$("[data-field]", $("#inspector")).forEach((input) =>
    input.addEventListener("change", () => renderThumbnails()),
  );
  $("#move-up").onclick = () => move(-1);
  $("#move-down").onclick = () => move(1);
  $("#remove-stop").onclick = () => {
    if (state.trip.stops.length <= 2) return;
    state.trip.stops.splice(i, 1);
    state.selected =
      state.trip.stops[Math.min(i, state.trip.stops.length - 1)].id;
    refresh();
    renderInspector();
  };
}
function move(delta) {
  const index = state.trip.stops.findIndex((s) => s.id === state.selected),
    next = index + delta;
  if (next < 0 || next >= state.trip.stops.length) return;
  [state.trip.stops[index], state.trip.stops[next]] = [
    state.trip.stops[next],
    state.trip.stops[index],
  ];
  refresh();
  renderInspector();
}
function selectStop(id) {
  if (!state.trip.stops.some((s) => s.id === id)) return;
  state.selected = id;
  pause();
  try {
    const segment =
      timeline(state.valid, 60).find(
        (s) => s.id === id && s.type === "place",
      ) || timeline(state.valid, 60).find((s) => s.id === id);
    if (segment) state.time = Math.min(60, segment.start + 1);
  } catch {}
  renderStops();
  renderInspector();
  renderStage();
}
function currentScene() {
  const scenes = timeline(state.valid, 60);
  return scenes.find((s) => state.time < s.end) || scenes.at(-1);
}
function atlasProgress() {
  const scene = currentScene(),
    segments = state.valid.stops.length - 1;
  if (scene.type === "overview") return 0;
  if (scene.type === "recap") return 1;
  const index = Number.isInteger(scene.index)
    ? scene.index
    : state.valid.stops.findIndex((s) => s.id === (scene.stopId || scene.id));
  if (scene.type === "place") return Math.max(0, index) / segments;
  if (scene.type === "travel") {
    const fraction = Math.max(
      0,
      Math.min(1, (state.time - scene.start) / (scene.end - scene.start)),
    );
    return Math.max(0, Math.min(1, (index - 1 + fraction) / segments));
  }
  return 1;
}
function syncSceneSelection() {
  if ($("#inspector")?.contains(document.activeElement)) return;
  const scene = currentScene();
  const id =
    scene.stopId ||
    (scene.type === "overview"
      ? state.valid.stops[0].id
      : scene.type === "recap"
        ? state.valid.stops.at(-1).id
        : scene.id);
  if (id !== state.selected && state.trip.stops.some((s) => s.id === id)) {
    state.selected = id;
    renderStops();
    renderInspector();
  }
}
function renderStage() {
  const stage = $("#stage");
  if (!stage) return;
  stage.className = `stage-art ${state.view === "film" ? "movie" : state.view === "poster" ? "poster" : ""}`;
  stage.setAttribute("aria-labelledby", `tab-${state.view}`);
  try {
    stage.innerHTML =
      state.view === "atlas"
        ? renderMap(state.valid, atlasProgress(), {
            width: 1100,
            height: 700,
            selectedId: state.selected,
          })
        : state.view === "film"
          ? renderFrame(state.valid, state.time, {
              width: state.format === "portrait" ? 1080 : 1920,
              height: state.format === "portrait" ? 1920 : 1080,
              duration: 60,
            })
          : renderPoster(state.valid, { width: 1123, height: 1587 });
  } catch (e) {
    stage.innerHTML = `<p class="error-banner">${esc(e.message)}</p>`;
  }
  $("#stage-label").textContent =
    state.view === "atlas"
      ? "ATLAS / " +
        String(
          state.trip.stops.findIndex((s) => s.id === state.selected) + 1,
        ).padStart(3, "0")
      : state.view === "film"
        ? "FILM / " + t("preview")
        : t("print");
  $("#time-current").textContent = formatTime(state.time);
  $("#timeline").value = state.time;
  $$("[data-view]").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === state.view);
    b.setAttribute("aria-selected", String(b.dataset.view === state.view));
  });
}
const formatTime = (n) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(Math.floor(n % 60)).padStart(2, "0")}`;
function renderThumbnails() {
  const times = [3, 25, 56],
    labels = ["all", "travel", "recap"];
  $("#film-strip").innerHTML = times
    .map((time, i) => {
      let svg = "";
      try {
        svg = renderFrame(state.valid, time, {
          width: 480,
          height: 270,
          duration: 60,
        });
      } catch {}
      return `<button class="scene-card" data-time="${time}" aria-label="${esc(t(labels[i]))}"><div class="scene-card-art" aria-hidden="true">${svg}</div><div class="scene-card-label"><b>${String(i + 1).padStart(2, "0")} / ${t(labels[i])}</b><span>${formatTime(time)}</span></div></button>`;
    })
    .join("");
}
function pause() {
  state.playing = false;
  cancelAnimationFrame(playId);
  const b = $("#play");
  if (b) {
    b.innerHTML = icon("play");
    b.setAttribute("aria-label", lang === "ko" ? "재생" : "Play");
  }
}
function play() {
  if (state.playing) {
    pause();
    return;
  }
  if (state.view === "poster") state.view = "film";
  if (state.time >= 60) state.time = 0;
  state.playing = true;
  lastPlay = performance.now();
  frameTime = 0;
  $("#play").innerHTML = icon("pause");
  $("#play").setAttribute("aria-label", lang === "ko" ? "일시정지" : "Pause");
  const tick = (now) => {
    if (!state.playing) return;
    state.time = Math.min(
      60,
      state.time + Math.min((now - lastPlay) / 1000, 0.25),
    );
    lastPlay = now;
    if (now - frameTime > 83 || state.time >= 60) {
      frameTime = now;
      syncSceneSelection();
      renderStage();
    }
    if (state.time >= 60) pause();
    else playId = requestAnimationFrame(tick);
  };
  playId = requestAnimationFrame(tick);
}
function downloadJson() {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(state.trip, null, 2)], {
      type: "application/json",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `${state.trip.title.replace(/[^\p{L}\p{N}_-]+/gu, "-") || "route-film"}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify(t("saved"));
}
async function api(url, options = {}) {
  let r;
  try {
    r = await fetch(url, options);
  } catch {
    throw new Error(t("unavailable"));
  }
  let data;
  try {
    data = await r.json();
  } catch {
    throw new Error(t("unavailable"));
  }
  if (!r.ok)
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : data.message || `HTTP ${r.status}`,
    );
  return data;
}
const activeJob = () =>
  Boolean(state.job && ["queued", "rendering"].includes(state.job.status));
function outputLinks(outputs) {
  return `<div class="download-list">${[
    "mp4",
    "html",
    "pdf",
    "svg",
    "png",
    "json",
  ]
    .filter((k) => outputs?.[k])
    .map(
      (k) =>
        `<a href="${esc(outputs[k])}" download>${{ mp4: "FILM / MP4", html: "INTERACTIVE / ATLAS", json: "TRIP / JSON", pdf: "A3 PRINT / PDF", svg: "VECTOR / SVG", png: "HIGH RES / PNG" }[k]}${icon("down")}</a>`,
    )
    .join("")}</div>`;
}
function rememberJob() {
  try {
    localStorage.setItem(
      JOB,
      JSON.stringify({
        id: state.job?.id,
        snapshot: state.jobSnapshot,
        format: state.jobFormat,
      }),
    );
  } catch {}
}
function renderJob() {
  const el = $("#job-status");
  if (!el) return;
  const job = state.job;
  if (!job) {
    el.innerHTML = "";
    return;
  }
  const status = job.status;
  let progress = Number(job.progress) || 0;
  progress = Math.max(0, Math.min(100, progress));
  const label =
    status === "completed"
      ? "complete"
      : status === "failed"
        ? "failed"
        : status === "cancelled"
          ? "cancelled"
          : "making";
  const stale =
    state.jobSnapshot &&
    JSON.stringify(state.trip) !== JSON.stringify(state.jobSnapshot);
  el.innerHTML = `<div class="job-card"><div class="job-heading"><strong>${t(label)}</strong><span>${status === "completed" ? icon("check") : Math.round(progress) + "%"}</span></div><p class="job-stage">${esc(job.tripTitle || state.jobSnapshot?.title || "")} ${job.stage ? "· " + esc(job.stage) : ""}</p>${job.error ? `<p class="job-stage" role="alert">${esc(job.error)}</p>` : ""}<div class="job-progress"><i style="width:${status === "completed" ? 100 : progress}%"></i></div>${stale ? `<p class="stale-note">${t("stale")}</p>` : ""}${status === "completed" ? outputLinks(job.outputs) : ""}<div class="job-controls">${activeJob() ? `<button class="plain-btn" id="cancel-job">${t("cancel")}</button>` : ""}${["failed", "cancelled"].includes(status) ? `<button class="button outline" id="retry-job">${icon("reset")}${t("retry")}</button>` : ""}</div></div>`;
  if ($("#cancel-job")) $("#cancel-job").onclick = cancelJob;
  if ($("#retry-job")) $("#retry-job").onclick = () => startRender(true);
  $("#render-start").disabled =
    state.errors.length > 0 || state.renderBusy || activeJob();
}
function renderPosterStatus() {
  const el = $("#poster-status");
  if (!el) return;
  el.innerHTML = state.posterBusy
    ? `<p class="poster-busy">${t("posterWorking")}</p>`
    : state.posterOutputs
      ? `${state.posterSnapshot && JSON.stringify(state.trip) !== JSON.stringify(state.posterSnapshot) ? `<p class="stale-note">${t("stale")}</p>` : ""}${outputLinks(state.posterOutputs)}`
      : "";
  $("#poster-start").disabled = state.posterBusy || state.errors.length > 0;
}
async function pollJob() {
  if (!state.job?.id) return;
  clearTimeout(polling);
  try {
    const result = await api(
      `/api/renders/${encodeURIComponent(state.job.id)}`,
    );
    state.job = result.job || result;
    rememberJob();
    renderJob();
    if (activeJob()) polling = setTimeout(pollJob, 1200);
  } catch (e) {
    notify(e.message);
    polling = setTimeout(pollJob, 5000);
  }
}
async function startRender(retry = false) {
  safeValidation();
  if ((state.errors.length && !retry) || state.renderBusy || activeJob())
    return;
  state.renderBusy = true;
  renderJob();
  $("#render-start").disabled = true;
  try {
    const snapshot = clone(
      retry && state.jobSnapshot ? state.jobSnapshot : state.valid,
    );
    const format = retry ? state.jobFormat : state.format;
    const size =
      format === "portrait"
        ? { width: 1080, height: 1920 }
        : { width: 1920, height: 1080 };
    const job = await api("/api/renders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trip: snapshot, duration: 60, fps: 30, ...size }),
    });
    state.job = job.job || job;
    state.jobSnapshot = snapshot;
    state.jobFormat = format;
    rememberJob();
    renderJob();
    pollJob();
  } catch (e) {
    notify(e.message);
  } finally {
    state.renderBusy = false;
    renderJob();
    $("#render-start").disabled = state.errors.length > 0 || activeJob();
  }
}
async function cancelJob() {
  if (!activeJob()) return;
  try {
    const job = await api(
      `/api/renders/${encodeURIComponent(state.job.id)}/cancel`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
    );
    state.job = job.job || job;
    rememberJob();
    renderJob();
    pollJob();
  } catch (e) {
    notify(e.message);
  }
}
async function startPoster() {
  safeValidation();
  if (state.errors.length || state.posterBusy) return;
  state.posterBusy = true;
  state.posterSnapshot = clone(state.valid);
  renderPosterStatus();
  try {
    const data = await api("/api/poster", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trip: state.posterSnapshot }),
    });
    state.posterOutputs = data.outputs || data;
    renderPosterStatus();
  } catch (e) {
    notify(e.message);
  } finally {
    state.posterBusy = false;
    renderPosterStatus();
  }
}
async function restoreJob() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(JOB) || "null");
  } catch {}
  if (saved?.id) {
    try {
      const job = await api(`/api/renders/${encodeURIComponent(saved.id)}`);
      state.job = job.job || job;
      state.jobSnapshot = saved.snapshot;
      state.jobFormat = saved.format || "landscape";
      renderJob();
      if (activeJob()) pollJob();
      return;
    } catch {}
  }
  try {
    const data = await api("/api/renders");
    const jobs = Array.isArray(data) ? data : data.jobs || [];
    const current = jobs.find((j) =>
      ["queued", "rendering"].includes(j.status),
    );
    if (current) {
      state.job = current;
      state.jobSnapshot = current.trip;
      state.jobFormat =
        current.width < current.height ? "portrait" : "landscape";
      rememberJob();
      renderJob();
      pollJob();
    }
  } catch {}
}
function bindShell() {
  $("#language").onclick = () => {
    pause();
    lang = lang === "ko" ? "en" : "ko";
    persist();
    shell();
  };
  $$("[data-action]").forEach(
    (b) =>
      (b.onclick = () => {
        const action = b.dataset.action;
        if (action === "import") $("#import-file").click();
        if (action === "json") downloadJson();
        if (action === "export") {
          $("#export-dialog").showModal();
          renderJob();
          renderPosterStatus();
        }
        if (action === "details") {
          const form = $("#trip-form");
          for (const key of ["title", "subtitle", "seed"])
            form.elements[key].value = state.trip[key] ?? "";
          $("#settings-dialog").showModal();
        }
      }),
  );
  $$("[data-close]").forEach(
    (b) => (b.onclick = () => $("#" + b.dataset.close).close()),
  );
  $$("dialog").forEach((dialog) =>
    dialog.addEventListener("click", (e) => {
      const r = dialog.getBoundingClientRect();
      if (
        e.target === dialog &&
        (e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom)
      )
        dialog.close();
    }),
  );
  $("#trip-form").onsubmit = (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    state.trip.title = f.elements.title.value;
    state.trip.subtitle = f.elements.subtitle.value;
    state.trip.seed = Number(f.elements.seed.value);
    refresh();
    $("#settings-dialog").close();
    notify(t("saved"));
  };
  $("#sample-select").onchange = (e) => {
    const sample = sampleTrips[Number(e.target.value)];
    if (!sample) return;
    pause();
    state.trip = clone(sample);
    state.selected = state.trip.stops[0].id;
    state.time = 60;
    refresh();
    renderInspector();
    notify(t("sampleChange"));
  };
  $("#stop-list").onclick = (e) => {
    const b = e.target.closest("[data-stop]");
    if (b) selectStop(b.dataset.stop);
  };
  $("#stage").onclick = (e) => {
    const marker = e.target.closest("[data-stop-id]");
    if (marker) selectStop(marker.dataset.stopId);
  };
  $("#stage").onkeydown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      const marker = e.target.closest("[data-stop-id]");
      if (marker) {
        e.preventDefault();
        selectStop(marker.dataset.stopId);
      }
    }
  };
  $("#add-stop").onclick = () => {
    if (state.trip.stops.length >= 12) return;
    const prev = state.trip.stops.at(-1);
    const date = new Date(prev.datetime);
    date.setHours(date.getHours() + 1);
    const pad = (n) => String(n).padStart(2, "0");
    const datetime = Number.isNaN(date.getTime())
      ? prev.datetime
      : `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    const stop = {
      id: "place-" + crypto.randomUUID().slice(0, 8),
      name: t("newPlace"),
      lat: prev.lat,
      lon: prev.lon,
      datetime,
      mode: "walk",
      scene: "city",
      note: t("newNote"),
    };
    state.trip.stops.push(stop);
    state.selected = stop.id;
    refresh();
    renderInspector();
    $("#inspector").scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
  $$("[data-view]").forEach(
    (b) =>
      (b.onclick = () => {
        pause();
        state.view = b.dataset.view;
        if (state.view === "film" && state.time === 60) {
          state.time = 0;
          syncSceneSelection();
        }
        renderStage();
      }),
  );
  $("#timeline").oninput = (e) => {
    pause();
    state.time = Number(e.target.value);
    syncSceneSelection();
    renderStage();
  };
  $("#play").onclick = play;
  $("#film-strip").onclick = (e) => {
    const card = e.target.closest("[data-time]");
    if (!card) return;
    pause();
    state.view = "film";
    state.time = Number(card.dataset.time);
    syncSceneSelection();
    renderStage();
  };
  $("#reset-view").onclick = () => {
    pause();
    state.time = state.view === "film" ? 0 : 60;
    syncSceneSelection();
    renderStage();
  };
  $("#fullscreen").onclick = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await $(".stage-shell").requestFullscreen();
    } catch (e) {
      notify(e.message);
    }
  };
  $("#import-file").onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 1024 * 1024)
        throw new Error(
          lang === "ko"
            ? "JSON 파일은 1MB 이하로 선택해 주세요."
            : "Choose a JSON file smaller than 1MB.",
        );
      const imported = normalizeTrip(JSON.parse(await file.text()));
      pause();
      state.trip = imported;
      state.selected = imported.stops[0].id;
      state.time = 60;
      refresh();
      renderInspector();
      notify(t("loaded"));
    } catch (error) {
      notify(`${t("badFile")} ${error.message}`);
    }
    e.target.value = "";
  };
  $$("[data-format]").forEach(
    (b) =>
      (b.onclick = () => {
        state.format = b.dataset.format;
        $$("[data-format]").forEach((x) => {
          x.classList.toggle("active", x.dataset.format === state.format);
          x.setAttribute(
            "aria-pressed",
            String(x.dataset.format === state.format),
          );
        });
        if (state.view === "film") renderStage();
      }),
  );
  $("#render-start").onclick = () => startRender();
  $("#poster-start").onclick = startPoster;
}
shell();
restoreJob();
if (restored) notify(t("recovered"));
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
});
window.addEventListener("beforeunload", () => {
  persist();
});

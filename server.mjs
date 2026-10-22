import { createServer } from "node:http";
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  rename,
  stat,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import sharp from "sharp";
import { chromium } from "playwright-core";
import {
  normalizeTrip,
  renderFrame,
  renderPoster,
  timeline,
} from "./shared/core.mjs";
import { createAtlas } from "./lib/atlas.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const data = resolve(process.env.DATA_DIR || join(root, "data"));
const renders = join(data, "renders");
process.env.XDG_CACHE_HOME ||= join(data, "cache");
await mkdir(process.env.XDG_CACHE_HOME, { recursive: true });
const jobs = new Map();
const controls = new Map();
let active = false;
sharp.concurrency(2);
const threads = Math.max(
  1,
  Math.min(4, Number(process.env.RENDER_THREADS) || 2),
);
await mkdir(renders, { recursive: true });
for (const name of await readdir(renders)) {
  if (!/^[a-f\d-]{36}$/.test(name)) continue;
  try {
    const job = JSON.parse(
      await readFile(join(renders, name, "job.json"), "utf8"),
    );
    if (["rendering", "queued"].includes(job.status)) {
      job.status = "failed";
      job.error =
        "서버가 재시작되어 렌더링이 중단되었습니다. 같은 여행으로 다시 시도해 주세요.";
      await writeFile(
        join(renders, name, "job.json"),
        JSON.stringify(job, null, 2),
      );
    }
    jobs.set(name, job);
  } catch {}
}
async function persist(job) {
  const dir = join(renders, job.id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "job.json.tmp"), JSON.stringify(job, null, 2));
  await rename(join(dir, "job.json.tmp"), join(dir, "job.json"));
}
function publicJob(job) {
  const { trip, ...rest } = job;
  return {
    ...rest,
    trip,
    ...(rest.outputs
      ? { outputs: { ...rest.outputs, html: `/exports/${job.id}/atlas.html` } }
      : {}),
  };
}
function outputs(id, film = false) {
  const base = `/exports/${id}/`;
  return {
    ...(film ? { mp4: base + "film.mp4" } : {}),
    html: base + "atlas.html",
    pdf: base + "poster.pdf",
    svg: base + "poster.svg",
    png: base + "poster.png",
    json: base + "trip.json",
  };
}
async function poster(trip, dir, signal) {
  if (signal?.aborted) throw new Error("cancelled");
  const svg = renderPoster(trip, { width: 1123, height: 1587 });
  await writeFile(join(dir, "poster.svg"), svg);
  await sharp(Buffer.from(svg), { limitInputPixels: 30000000 })
    .resize(3508, 4961, { fit: "fill" })
    .png()
    .withMetadata({ density: 300 })
    .toFile(join(dir, "poster.png"));
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      headless: true,
      env: {
        ...process.env,
        XDG_CACHE_HOME: process.env.XDG_CACHE_HOME || "/workspace/.cache",
      },
    });
    const page = await browser.newPage();
    await page.setContent(
      `<html><head><meta charset="utf-8"><style>@page{size:A3;margin:0}html,body{margin:0;width:297mm;height:420mm}body>svg{display:block;width:297mm;height:420mm}</style></head><body>${svg}</body></html>`,
    );
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({
      path: join(dir, "poster.pdf"),
      format: "A3",
      printBackground: true,
      preferCSSPageSize: true,
    });
  } finally {
    if (browser) await browser.close();
  }
  await writeFile(join(dir, "trip.json"), JSON.stringify(trip, null, 2));
  await writeFile(join(dir, "atlas.html"), await createAtlas(trip));
}

// Original deterministic ambient score: evolving triads, sea-like filtered noise,
// delicate bell attacks and a long fade. No recorded audio or external assets.
async function synthesize(trip, duration, path) {
  const rate = 48000,
    n = Math.ceil(duration * rate),
    buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  let seed = Number(trip.seed) || 1,
    noise = 0;
  const chords = [
    [220, 261.626, 329.628],
    [174.614, 220, 261.626],
    [261.626, 329.628, 391.995],
    [195.998, 246.942, 293.665],
  ];
  for (let i = 0; i < n; i++) {
    const t = i / rate,
      section = (t / duration) * 8,
      ci = Math.floor(section),
      mix = section - ci;
    const current = chords[ci % 4],
      next = chords[(ci + 1) % 4];
    const blend = Math.max(0, (mix - 0.78) / 0.22);
    const chord = (frequencies) =>
      frequencies.reduce(
        (v, f, k) =>
          v +
          Math.sin(t * f * Math.PI * 2) * (0.04 / (k + 1)) +
          Math.sin(t * f * 0.5 * Math.PI * 2) * 0.014,
        0,
      );
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    noise = noise * 0.985 + (seed / 2147483648) * 0.015;
    const wave = noise * 0.11 * (0.5 + 0.5 * Math.sin(t * 0.55));
    const pulse = t % 3.75,
      bell =
        Math.sin(2 * Math.PI * (current[2] * 2) * t) *
        Math.exp(-pulse * 3) *
        0.016;
    const fade = Math.min(1, t / 2.5, (duration - t) / 4);
    const sample =
      (chord(current) * (1 - blend) + chord(next) * blend + wave + bell) *
      Math.max(0, fade);
    buf.writeInt16LE(
      Math.max(-32767, Math.min(32767, Math.round(sample * 32767))),
      44 + i * 2,
    );
  }
  await writeFile(path, buf);
}
async function run(job) {
  const control = new AbortController();
  controls.set(job.id, control);
  const dir = join(renders, job.id);
  let encoder;
  try {
    job.status = "rendering";
    job.stage = "영화의 장면을 구성하고 있습니다";
    job.progress = 0;
    await persist(job);
    await synthesize(job.trip, job.duration, join(dir, "score.wav"));
    const total = job.duration * job.fps;
    encoder = spawn(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "rawvideo",
        "-pixel_format",
        "rgb24",
        "-video_size",
        `${job.width}x${job.height}`,
        "-framerate",
        String(job.fps),
        "-i",
        "pipe:0",
        "-i",
        join(dir, "score.wav"),
        "-c:v",
        "libx264",
        "-threads",
        String(threads),
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-t",
        String(job.duration),
        "-movflags",
        "+faststart",
        join(dir, "film.mp4"),
      ],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    let encoderError = "";
    encoder.stderr.on("data", (chunk) => {
      encoderError = (encoderError + chunk).slice(-4000);
    });
    let inputError;
    encoder.stdin.on("error", (e) => {
      inputError = e;
    });
    const completion = new Promise((res, rej) => {
      encoder.once("error", rej);
      encoder.once("close", (code) =>
        code === 0
          ? res()
          : rej(new Error(encoderError || `FFmpeg exited ${code}`)),
      );
    });
    completion.catch(() => {});
    let saved = Date.now();
    for (let i = 0; i < total; i++) {
      if (control.signal.aborted) throw new Error("cancelled");
      if (inputError) throw inputError;
      const svg = renderFrame(job.trip, i / job.fps, {
        width: job.width,
        height: job.height,
        duration: job.duration,
      });
      const pixels = await sharp(Buffer.from(svg))
        .flatten({ background: "#eee9df" })
        .removeAlpha()
        .raw()
        .toBuffer();
      if (pixels.length !== job.width * job.height * 3)
        throw new Error("렌더링 프레임 크기가 올바르지 않습니다.");
      if (!encoder.stdin.write(pixels))
        await Promise.race([
          once(encoder.stdin, "drain"),
          completion.then(() => {
            throw new Error("인코더가 조기 종료되었습니다.");
          }),
        ]);
      job.progress = Math.round(((i + 1) / total) * 92);
      job.stage = `장면을 그리고 있습니다 · ${i + 1} / ${total}`;
      if (Date.now() - saved > 2500) {
        await persist(job);
        saved = Date.now();
      }
    }
    encoder.stdin.end();
    await completion;
    if (control.signal.aborted) throw new Error("cancelled");
    job.progress = 94;
    job.stage = "인쇄용 포스터를 만들고 있습니다";
    await persist(job);
    await poster(job.trip, dir, control.signal);
    if (control.signal.aborted) throw new Error("cancelled");
    job.status = "completed";
    job.progress = 100;
    job.stage = "여행이 한 편의 영화가 되었습니다";
    job.outputs = outputs(job.id, true);
    job.completedAt = new Date().toISOString();
  } catch (e) {
    if (encoder && !encoder.killed) encoder.kill("SIGTERM");
    job.status = control.signal.aborted ? "cancelled" : "failed";
    job.error = control.signal.aborted
      ? "렌더링을 취소했습니다. 여행은 저장되어 있습니다."
      : String(e.message).slice(0, 500);
    job.stage = job.error;
  } finally {
    controls.delete(job.id);
    await persist(job);
  }
}
async function pump() {
  if (active) return;
  active = true;
  try {
    let job;
    while ((job = [...jobs.values()].find((j) => j.status === "queued")))
      await run(job);
  } finally {
    active = false;
  }
}
function json(res, status, value) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
}
async function body(req) {
  if (
    req.headers.origin &&
    req.headers.origin !== `http://${req.headers.host}` &&
    req.headers.origin !== `https://${req.headers.host}`
  )
    throw Object.assign(new Error("허용되지 않은 요청 출처입니다."), {
      status: 403,
    });
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 128000)
      throw Object.assign(new Error("여행 데이터는 128KB 이하여야 합니다."), {
        status: 413,
      });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("올바른 JSON 여행 파일이 필요합니다."), {
      status: 400,
    });
  }
}
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
};
async function serveFile(req, res, path, attachment = false) {
  let st;
  try {
    st = await stat(path);
  } catch {
    return json(res, 404, { error: "파일을 찾을 수 없습니다." });
  }
  if (!st.isFile())
    return json(res, 404, { error: "파일을 찾을 수 없습니다." });
  const { createReadStream } = await import("node:fs");
  const headers = {
    "Content-Type": mime[extname(path)] || "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-cache",
    "Accept-Ranges": "bytes",
  };
  if (attachment)
    headers["Content-Disposition"] =
      `attachment; filename="route-film-${path.split("/").pop()}"`;
  const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
  if (range) {
    const start = Number(range[1]),
      end = range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
    if (start > end || start >= st.size) {
      res.writeHead(416, { "Content-Range": `bytes */${st.size}` });
      return res.end();
    }
    res.writeHead(206, {
      ...headers,
      "Content-Range": `bytes ${start}-${end}/${st.size}`,
      "Content-Length": end - start + 1,
    });
    if (req.method === "HEAD") return res.end();
    createReadStream(path, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { ...headers, "Content-Length": st.size });
  if (req.method === "HEAD") return res.end();
  createReadStream(path).pipe(res);
}
export const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost"),
      path = url.pathname;
    if (path === "/api/health" && req.method === "GET")
      return json(res, 200, {
        ok: true,
        renderer: "procedural-svg-ffmpeg",
        version: "1.0.0",
      });
    if (path === "/api/renders" && req.method === "GET")
      return json(
        res,
        200,
        [...jobs.values()]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 50)
          .map(publicJob),
      );
    if (path === "/api/renders" && req.method === "POST") {
      const input = await body(req);
      const trip = normalizeTrip(input.trip);
      const duration = input.duration ?? 60,
        width = input.width ?? 1920,
        height = input.height ?? 1080,
        fps = input.fps ?? 30;
      if (
        !Number.isInteger(duration) ||
        duration < 10 ||
        duration > 60 ||
        fps !== 30 ||
        ![
          [1920, 1080],
          [1080, 1920],
          [1280, 720],
          [720, 1280],
          [640, 360],
        ].some(([w, h]) => width === w && height === h)
      )
        return json(res, 400, {
          error: "10–60초, 30fps 및 지원하는 영상 규격을 선택해 주세요.",
        });
      if (
        [...jobs.values()].filter((j) =>
          ["queued", "rendering"].includes(j.status),
        ).length >= 3
      )
        return json(res, 429, {
          error: "렌더링 대기열이 가득 찼습니다. 완료 후 다시 시도해 주세요.",
        });
      const id = randomUUID(),
        job = {
          id,
          status: "queued",
          progress: 0,
          stage: "차례를 기다리고 있습니다",
          trip,
          tripTitle: trip.title,
          duration,
          width,
          height,
          fps,
          createdAt: new Date().toISOString(),
          fingerprint: createHash("sha256")
            .update(JSON.stringify(trip))
            .digest("hex"),
          storyboard: timeline(trip, duration),
        };
      jobs.set(id, job);
      await persist(job);
      json(res, 202, publicJob(job));
      void pump();
      return;
    }
    const match = path.match(/^\/api\/renders\/([a-f\d-]{36})(\/cancel)?$/);
    if (match) {
      const job = jobs.get(match[1]);
      if (!job)
        return json(res, 404, { error: "렌더링 기록을 찾을 수 없습니다." });
      if (match[2] && req.method === "POST") {
        await body(req);
        if (job.status === "queued") {
          job.status = "cancelled";
          job.stage = "렌더링을 취소했습니다.";
          await persist(job);
        } else if (job.status === "rendering") {
          controls.get(job.id)?.abort();
        }
        return json(res, 200, publicJob(job));
      }
      if (!match[2] && req.method === "GET")
        return json(res, 200, publicJob(job));
    }
    if (path === "/api/poster" && req.method === "POST") {
      const input = await body(req),
        trip = normalizeTrip(input.trip),
        id = randomUUID(),
        dir = join(renders, id);
      await mkdir(dir, { recursive: true });
      await poster(trip, dir);
      return json(res, 201, { id, outputs: outputs(id) });
    }
    const atlas = path.match(/^\/exports\/([a-f\d-]{36})\/atlas\.html$/);
    if (atlas && ["GET", "HEAD"].includes(req.method)) {
      const atlasPath = join(renders, atlas[1], "atlas.html");
      if (existsSync(atlasPath))
        return await serveFile(req, res, atlasPath, true);
      let trip;
      try {
        trip = JSON.parse(
          await readFile(join(renders, atlas[1], "trip.json"), "utf8"),
        );
      } catch {
        return json(res, 404, { error: "여행 파일을 찾을 수 없습니다." });
      }
      await writeFile(atlasPath, await createAtlas(trip));
      return await serveFile(req, res, atlasPath, true);
    }
    const artifact = path.match(
      /^\/exports\/([a-f\d-]{36})\/(film\.mp4|poster\.(?:svg|pdf|png)|trip\.json)$/,
    );
    if (artifact && ["GET", "HEAD"].includes(req.method))
      return await serveFile(
        req,
        res,
        join(renders, artifact[1], artifact[2]),
        url.searchParams.has("download"),
      );
    if (["GET", "HEAD"].includes(req.method)) {
      if (path === "/" || path === "/index.html")
        return await serveFile(req, res, join(root, "public/index.html"));
      if (["/app.mjs", "/style.css"].includes(path))
        return await serveFile(req, res, join(root, "public", path));
      if (/^\/shared\/[a-zA-Z0-9_.-]+\.mjs$/.test(path))
        return await serveFile(req, res, join(root, path.slice(1)));
    }
    json(res, 404, { error: "요청한 경로를 찾을 수 없습니다." });
  } catch (error) {
    if (!res.headersSent)
      json(res, error.status || 400, {
        error: String(error.message).slice(0, 500),
      });
    else res.end();
  }
});
const port = Number(process.env.PORT || 3000),
  host = process.env.HOST || "127.0.0.1";
server.listen(port, host, () =>
  console.log(`Route Film listening on ${host}:${server.address().port}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    for (const control of controls.values()) control.abort();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });

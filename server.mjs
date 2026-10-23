import { createServer } from "node:http";
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  rename,
  stat,
  rm,
  access,
} from "node:fs/promises";
import { createReadStream, constants } from "node:fs";
import { resolve, join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
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
import { createRequestGuard } from "./lib/access.mjs";
import { TaskQueue } from "./lib/task-queue.mjs";
import { synthesize } from "./lib/audio.mjs";
import { HttpError, clientError, logFailure } from "./lib/errors.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const data = resolve(process.env.DATA_DIR || join(root, "data"));
const renders = join(data, "renders");
process.env.XDG_CACHE_HOME ||= join(data, "cache");
await mkdir(process.env.XDG_CACHE_HOME, { recursive: true });
await mkdir(renders, { recursive: true });
const jobs = new Map();
const controls = new Map();
const posterControls = new Set();
const backgroundTasks = new Set();
let shuttingDown = false;
sharp.concurrency(2);
function setting(name, fallback, min, max) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max)
    throw new Error(`${name} 설정 범위를 확인해 주세요.`);
  return value;
}
const queue = new TaskQueue({
  concurrency: setting("RENDER_CONCURRENCY", 1, 1, 4),
  limit: setting("RENDER_QUEUE_LIMIT", 3, 1, 20),
});
const threads = setting("RENDER_THREADS", 2, 1, 4);

async function persist(job) {
  const dir = join(renders, job.id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "job.json.tmp"), JSON.stringify(job, null, 2));
  await rename(join(dir, "job.json.tmp"), join(dir, "job.json"));
}
async function saveFinalState(job) {
  try {
    await persist(job);
  } catch (error) {
    logFailure("job-state-save", error);
    job.status = "failed";
    job.error =
      "작업 상태를 저장하지 못했습니다. 저장 공간과 권한을 확인해 주세요. 이미 생성된 결과 파일은 보존됩니다.";
    job.stage = job.error;
  }
}
for (const name of await readdir(renders)) {
  if (!/^[a-f\d-]{36}$/.test(name)) continue;
  try {
    const job = JSON.parse(
      await readFile(join(renders, name, "job.json"), "utf8"),
    );
    if (job.id !== name || !job.createdAt || !job.trip)
      throw new Error("Invalid job record");
    jobs.set(name, job);
    if (["rendering", "queued"].includes(job.status)) {
      job.status = "failed";
      job.error =
        "서버가 재시작되어 렌더링이 중단되었습니다. 같은 여행으로 다시 시도해 주세요.";
      job.stage = job.error;
      await saveFinalState(job);
    }
  } catch (error) {
    logFailure("job-restore", error);
  }
}
function jobSummary(job) {
  const summary = Object.fromEntries(
    [
      "id",
      "status",
      "progress",
      "stage",
      "tripTitle",
      "createdAt",
      "completedAt",
      "duration",
      "width",
      "height",
      "fps",
      "error",
      "outputs",
    ]
      .filter((key) => job[key] !== undefined)
      .map((key) => [key, job[key]]),
  );
  // Older completed jobs predate the standalone HTML field; keep their download
  // available without rewriting the original record or including private inputs.
  if (summary.outputs && !summary.outputs.html)
    summary.outputs = {
      ...summary.outputs,
      html: `/exports/${job.id}/atlas.html`,
    };
  return summary;
}
function jobDetail(job) {
  return { ...jobSummary(job), trip: job.trip, storyboard: job.storyboard };
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
async function cleanupTemporary(dir) {
  for (const name of [
    "score.wav",
    "film.partial.mp4",
    "poster.partial.png",
    "poster.partial.pdf",
    "job.json.tmp",
  ]) {
    try {
      await rm(join(dir, name), { force: true });
    } catch (error) {
      logFailure("temporary-file-cleanup", error);
    }
  }
}
function parseTrip(value) {
  try {
    return normalizeTrip(value);
  } catch (error) {
    throw new HttpError(400, error.message);
  }
}
async function chromiumPath() {
  const path = process.env.CHROMIUM_PATH || "/usr/bin/chromium";
  try {
    await access(path, constants.X_OK);
  } catch {
    throw new HttpError(
      503,
      "Chromium을 찾거나 실행할 수 없습니다. Chromium을 설치하고 CHROMIUM_PATH를 실행 파일 경로로 설정해 주세요.",
    );
  }
  return path;
}
async function poster(trip, dir, signal) {
  signal.throwIfAborted();
  const executablePath = await chromiumPath();
  await writeFile(join(dir, "trip.json"), JSON.stringify(trip, null, 2));
  const svg = renderPoster(trip, { width: 1123, height: 1587 });
  await writeFile(join(dir, "poster.svg"), svg);
  await sharp(Buffer.from(svg), { limitInputPixels: 30000000 })
    .resize(3508, 4961, { fit: "fill" })
    .png()
    .withMetadata({ density: 300 })
    .toFile(join(dir, "poster.partial.png"));
  signal.throwIfAborted();
  await rename(join(dir, "poster.partial.png"), join(dir, "poster.png"));
  let browser;
  const closeOnAbort = () => {
    if (browser)
      void browser
        .close()
        .catch((error) => logFailure("browser-cancel", error));
  };
  signal.addEventListener("abort", closeOnAbort, { once: true });
  try {
    browser = await chromium.launch({
      executablePath,
      headless: true,
      env: process.env,
    });
    signal.throwIfAborted();
    const page = await browser.newPage();
    await page.setContent(
      `<html><head><meta charset="utf-8"><style>@page{size:A3;margin:0}html,body{margin:0;width:297mm;height:420mm}body>svg{display:block;width:297mm;height:420mm}</style></head><body>${svg}</body></html>`,
    );
    await page.evaluate(() => document.fonts.ready);
    signal.throwIfAborted();
    await page.pdf({
      path: join(dir, "poster.partial.pdf"),
      format: "A3",
      printBackground: true,
      preferCSSPageSize: true,
    });
    signal.throwIfAborted();
    await rename(join(dir, "poster.partial.pdf"), join(dir, "poster.pdf"));
  } finally {
    signal.removeEventListener("abort", closeOnAbort);
    if (browser) await browser.close();
  }
  signal.throwIfAborted();
  await writeFile(join(dir, "atlas.html"), await createAtlas(trip));
  signal.throwIfAborted();
}
function failJob(job, error, signal) {
  job.status = signal.aborted ? "cancelled" : "failed";
  job.error = signal.aborted
    ? "렌더링을 취소했습니다. 여행은 저장되어 있습니다."
    : clientError(error).error;
  job.stage = job.error;
  if (!signal.aborted) logFailure("render", error);
}
async function run(job, signal) {
  const dir = join(renders, job.id);
  let encoder, completion, onAbort;
  try {
    signal.throwIfAborted();
    job.status = "rendering";
    job.stage = "영화의 장면을 구성하고 있습니다";
    job.progress = 0;
    await persist(job);
    await synthesize(job.trip, job.duration, join(dir, "score.wav"), {
      signal,
    });
    signal.throwIfAborted();
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
        join(dir, "film.partial.mp4"),
      ],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    // Encoder diagnostics stay internal; they can contain absolute file paths.
    encoder.stderr.resume();
    let inputError;
    encoder.stdin.on("error", (error) => {
      inputError = error;
    });
    completion = new Promise((resolve, reject) => {
      encoder.once("error", reject);
      encoder.once("close", (code) =>
        code === 0
          ? resolve()
          : reject(
              new HttpError(
                500,
                "영상 인코딩을 완료하지 못했습니다. FFmpeg와 저장 공간을 확인한 후 다시 시도해 주세요.",
              ),
            ),
      );
    });
    completion.catch(() => {});
    onAbort = () => encoder.kill("SIGTERM");
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
    let saved = Date.now();
    for (let i = 0; i < total; i++) {
      signal.throwIfAborted();
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
      signal.throwIfAborted();
      if (pixels.length !== job.width * job.height * 3)
        throw new Error("Invalid frame dimensions");
      if (!encoder.stdin.write(pixels))
        await Promise.race([
          once(encoder.stdin, "drain"),
          completion.then(() => {
            throw new Error("Encoder exited before input ended");
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
    signal.throwIfAborted();
    await rename(join(dir, "film.partial.mp4"), join(dir, "film.mp4"));
    job.progress = 94;
    job.stage = "인쇄용 포스터를 만들고 있습니다";
    await persist(job);
    await poster(job.trip, dir, signal);
    signal.throwIfAborted();
    job.status = "completed";
    job.progress = 100;
    job.stage = "여행이 한 편의 영화가 되었습니다";
    job.outputs = outputs(job.id, true);
    job.completedAt = new Date().toISOString();
  } catch (error) {
    failJob(job, error, signal);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
    if (encoder && completion) {
      if (encoder.exitCode === null && encoder.signalCode === null)
        encoder.kill("SIGTERM");
      const force = setTimeout(() => encoder.kill("SIGKILL"), 2000);
      force.unref();
      await completion.catch(() => {});
      clearTimeout(force);
    }
    // Do not delete an input WAV until FFmpeg has closed its handles.
    await cleanupTemporary(dir);
    controls.delete(job.id);
    await saveFinalState(job);
  }
}
function startFilm(job, ticket, controller) {
  const task = ticket
    .run(() => run(job, controller.signal), controller.signal)
    .catch(async (error) => {
      failJob(job, error, controller.signal);
      controls.delete(job.id);
      await cleanupTemporary(join(renders, job.id));
      await saveFinalState(job);
    });
  backgroundTasks.add(task);
  void task
    .finally(() => backgroundTasks.delete(task))
    .catch((error) => logFailure("background-task", error));
}
function json(res, status, value, headers = {}) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(JSON.stringify(value));
}
async function body(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 128000)
      throw new HttpError(413, "여행 데이터는 128KB 이하여야 합니다.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "올바른 JSON 여행 파일이 필요합니다.");
  }
}
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
};
async function serveFile(req, res, path, attachment = false) {
  let fileStat;
  try {
    fileStat = await stat(path);
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes(error.code))
      throw new HttpError(404, "파일을 찾을 수 없습니다.");
    throw error;
  }
  if (!fileStat.isFile()) throw new HttpError(404, "파일을 찾을 수 없습니다.");
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
  let options;
  if (range) {
    const start = Number(range[1]),
      end = range[2]
        ? Math.min(Number(range[2]), fileStat.size - 1)
        : fileStat.size - 1;
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start > end ||
      start >= fileStat.size
    ) {
      res.writeHead(416, { "Content-Range": `bytes */${fileStat.size}` });
      return res.end();
    }
    options = { start, end };
    headers["Content-Range"] = `bytes ${start}-${end}/${fileStat.size}`;
    headers["Content-Length"] = end - start + 1;
  } else headers["Content-Length"] = fileStat.size;
  res.writeHead(options ? 206 : 200, headers);
  if (req.method === "HEAD") return res.end();
  const stream = createReadStream(path, options);
  stream.on("error", (error) => {
    logFailure("download", error);
    res.destroy();
  });
  res.once("close", () => stream.destroy());
  stream.pipe(res);
}
const guard = createRequestGuard({
  allowedHosts: process.env.ALLOWED_HOSTS || "",
  allowedOrigins: process.env.ALLOWED_ORIGINS || "",
  getPort: () => server.address()?.port,
});
export const server = createServer(async (req, res) => {
  try {
    guard(req);
    const url = new URL(req.url, "http://localhost"),
      path = url.pathname;
    if (path === "/api/health" && req.method === "GET")
      return json(res, 200, {
        ok: true,
        renderer: "procedural-svg-ffmpeg",
        version: "1.0.0",
      });
    if (shuttingDown && req.method === "POST")
      throw new HttpError(
        503,
        "서버를 종료하고 있습니다. 잠시 후 다시 시도해 주세요.",
      );
    if (path === "/api/renders" && req.method === "GET")
      return json(
        res,
        200,
        [...jobs.values()]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 50)
          .map(jobSummary),
      );
    if (path === "/api/renders" && req.method === "POST") {
      const input = await body(req),
        trip = parseTrip(input?.trip);
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
        throw new HttpError(
          400,
          "10–60초, 30fps 및 지원하는 영상 규격을 선택해 주세요.",
        );
      const ticket = queue.reserve();
      const id = randomUUID(),
        controller = new AbortController();
      const job = {
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
        storyboard: timeline(trip, duration),
      };
      jobs.set(id, job);
      controls.set(id, controller);
      try {
        await persist(job);
      } catch (error) {
        ticket.release();
        controls.delete(id);
        failJob(job, error, controller.signal);
        await cleanupTemporary(join(renders, id));
        throw error;
      }
      json(res, 202, jobDetail(job));
      startFilm(job, ticket, controller);
      return;
    }
    const match = path.match(/^\/api\/renders\/([a-f\d-]{36})(\/cancel)?$/);
    if (match) {
      const job = jobs.get(match[1]);
      if (!job) throw new HttpError(404, "렌더링 기록을 찾을 수 없습니다.");
      if (match[2] && req.method === "POST") {
        await body(req);
        if (["queued", "rendering"].includes(job.status))
          controls.get(job.id)?.abort();
        return json(res, 200, jobDetail(job));
      }
      if (!match[2] && req.method === "GET")
        return json(res, 200, jobDetail(job));
    }
    if (path === "/api/poster" && req.method === "POST") {
      const input = await body(req),
        trip = parseTrip(input?.trip),
        ticket = queue.reserve();
      const controller = new AbortController(),
        id = randomUUID(),
        dir = join(renders, id);
      const onClose = () => {
        if (!res.writableFinished) controller.abort();
      };
      res.once("close", onClose);
      posterControls.add(controller);
      const task = (async () => {
        try {
          await mkdir(dir, { recursive: true });
          await ticket.run(
            () => poster(trip, dir, controller.signal),
            controller.signal,
          );
          controller.signal.throwIfAborted();
          return { id, outputs: outputs(id) };
        } finally {
          res.removeListener("close", onClose);
          posterControls.delete(controller);
          ticket.release();
          await cleanupTemporary(dir);
        }
      })();
      backgroundTasks.add(task);
      try {
        return json(res, 201, await task);
      } finally {
        backgroundTasks.delete(task);
      }
    }
    const atlas = path.match(/^\/exports\/([a-f\d-]{36})\/atlas\.html$/);
    if (atlas && ["GET", "HEAD"].includes(req.method)) {
      const atlasPath = join(renders, atlas[1], "atlas.html");
      try {
        await access(atlasPath);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        let trip;
        try {
          trip = JSON.parse(
            await readFile(join(renders, atlas[1], "trip.json"), "utf8"),
          );
        } catch (readError) {
          if (readError.code === "ENOENT")
            throw new HttpError(404, "여행 파일을 찾을 수 없습니다.");
          throw readError;
        }
        await writeFile(atlasPath, await createAtlas(trip));
      }
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
      if (path === "/style.css" || /^\/[a-zA-Z0-9_.-]+\.mjs$/.test(path))
        return await serveFile(req, res, join(root, "public", path.slice(1)));
      if (/^\/shared\/[a-zA-Z0-9_.-]+\.mjs$/.test(path))
        return await serveFile(req, res, join(root, path.slice(1)));
    }
    throw new HttpError(404, "요청한 경로를 찾을 수 없습니다.");
  } catch (error) {
    const response = clientError(error);
    if (response.status >= 500) logFailure("request", error);
    if (!res.headersSent)
      json(
        res,
        response.status,
        { error: response.error },
        error instanceof HttpError && error.retryAfter
          ? { "Retry-After": String(error.retryAfter) }
          : {},
      );
    else if (!res.writableEnded) res.end();
  }
});
const port = setting("PORT", 3000, 0, 65535),
  host = process.env.HOST || "127.0.0.1";
server.listen(port, host, () =>
  console.log(`Route Film listening on ${host}:${server.address().port}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const control of [...controls.values(), ...posterControls])
      control.abort();
    const forced = setTimeout(() => process.exit(1), 5000);
    forced.unref();
    const closed = new Promise((resolve) => server.close(resolve));
    await Promise.allSettled([...backgroundTasks]);
    await closed;
    clearTimeout(forced);
    process.exit(0);
  });

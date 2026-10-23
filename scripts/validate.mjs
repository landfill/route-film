import { mkdir, writeFile, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import sharp from "sharp";
import { sampleTrips } from "../shared/samples.mjs";
import { timeline, normalizeTrip } from "../shared/core.mjs";

const base = process.env.APP_URL || "http://127.0.0.1:3000";
const root = resolve(import.meta.dirname, "..");
const output = process.argv
  .find((arg) => arg.startsWith("--output="))
  ?.slice(9);
const input = process.argv.find((arg) => arg.startsWith("--input="))?.slice(8);
const artifacts = resolve(root, output || "artifacts");
await mkdir(artifacts, { recursive: true });
const short = process.argv.includes("--prototype");
const portrait = process.argv.includes("--portrait");
const selectedTrip = process.argv
  .find((arg) => arg.startsWith("--trip="))
  ?.slice(7);
const chosen = input
  ? [normalizeTrip(JSON.parse(await readFile(resolve(root, input), "utf8")))]
  : selectedTrip
    ? sampleTrips.filter((t) => t.id === selectedTrip)
    : short || portrait
      ? [sampleTrips[0]]
      : sampleTrips;
assert.ok(chosen.length, "Unknown trip ID");
const report = [];
for (const [index, trip] of chosen.entries()) {
  const duration = short ? 12 : 60;
  const width = portrait ? 1080 : 1920,
    height = portrait ? 1920 : 1080;
  console.log(
    `Rendering ${trip.title}: ${duration}s ${width}×${height} at 30fps`,
  );
  const response = await fetch(base + "/api/renders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trip, duration, width, height, fps: 30 }),
  });
  const created = await response.json();
  assert.equal(response.status, 202, created.error);
  let job = created,
    last = -1;
  const deadline = Date.now() + 30 * 60 * 1000;
  while (["queued", "rendering"].includes(job.status)) {
    assert.ok(Date.now() < deadline, "Render timed out");
    await new Promise((r) => setTimeout(r, 1000));
    job = await (await fetch(base + "/api/renders/" + created.id)).json();
    if (Math.floor(job.progress / 10) !== last) {
      console.log(`${job.id} ${job.progress}% ${job.stage}`);
      last = Math.floor(job.progress / 10);
    }
  }
  assert.equal(job.status, "completed", job.error);
  const name = input
    ? "custom"
    : short
      ? "prototype"
      : portrait
        ? "portrait"
        : trip.id === "kyoto-sea"
          ? "kyoto"
          : "seoul";
  const dest = resolve(artifacts, name);
  await mkdir(dest, { recursive: true });
  for (const [format, url] of Object.entries(job.outputs)) {
    const fetched = await fetch(base + url);
    assert.equal(fetched.status, 200);
    await writeFile(
      resolve(
        dest,
        format === "json"
          ? "trip.json"
          : format === "html"
            ? "atlas.html"
            : format === "mp4"
              ? "film.mp4"
              : `poster.${format}`,
      ),
      Buffer.from(await fetched.arrayBuffer()),
    );
  }
  const movie = resolve(dest, "film.mp4");
  const probe = JSON.parse(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-count_frames",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      movie,
    ]),
  );
  const video = probe.streams.find((s) => s.codec_type === "video"),
    audio = probe.streams.find((s) => s.codec_type === "audio");
  assert.equal(video.width, width);
  assert.equal(video.height, height);
  assert.equal(video.r_frame_rate, "30/1");
  assert.equal(Number(video.nb_read_frames), duration * 30);
  assert.ok(Math.abs(Number(probe.format.duration) - duration) < 0.1);
  assert.equal(audio.codec_name, "aac");
  execFileSync(
    "ffmpeg",
    ["-v", "error", "-xerror", "-i", movie, "-f", "null", "-"],
    { maxBuffer: 1024 * 1024 },
  );
  const { spawnSync } = await import("node:child_process");
  const signal = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-i",
      movie,
      "-vf",
      "blackdetect=d=0.15:pix_th=0.10",
      "-af",
      "volumedetect",
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
  );
  assert.equal(signal.status, 0);
  assert.ok(!signal.stderr.includes("black_start:"), "Unexpected black frames");
  const peak = signal.stderr.match(/max_volume: ([\-\d.]+) dB/),
    mean = signal.stderr.match(/mean_volume: ([\-\d.]+) dB/);
  assert.ok(
    peak && Number(peak[1]) < 0 && Number(peak[1]) > -45,
    "Audio is audible and unclipped",
  );
  const sceneList = timeline(trip, duration);
  const tiles = [];
  for (const [i, scene] of sceneList.entries()) {
    const t = (scene.start + scene.end) / 2;
    const frame = resolve(dest, `frame-${String(i).padStart(2, "0")}.png`);
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-ss",
      String(t),
      "-i",
      movie,
      "-frames:v",
      "1",
      frame,
    ]);
    const thumb = await sharp(frame)
      .resize(480, 270, { fit: "contain", background: "#eee9df" })
      .png()
      .toBuffer();
    tiles.push({
      input: thumb,
      left: (i % 3) * 480,
      top: Math.floor(i / 3) * 270,
    });
  }
  await sharp({
    create: {
      width: 1440,
      height: Math.ceil(tiles.length / 3) * 270,
      channels: 3,
      background: "#eee9df",
    },
  })
    .composite(tiles)
    .png()
    .toFile(resolve(dest, "contact-sheet.png"));
  const png = await sharp(resolve(dest, "poster.png")).metadata();
  assert.equal(png.width, 3508);
  assert.equal(png.height, 4961);
  const pdfInfo = execFileSync("pdfinfo", [resolve(dest, "poster.pdf")], {
    encoding: "utf8",
  });
  assert.match(pdfInfo, /Pages:\s+1/);
  assert.match(pdfInfo, /A3/);
  const pdfText = execFileSync(
    "pdftotext",
    [resolve(dest, "poster.pdf"), "-"],
    { encoding: "utf8" },
  );
  assert.ok(pdfText.includes(trip.title));
  for (const stop of trip.stops)
    assert.ok(pdfText.includes(stop.name), `Missing poster label ${stop.name}`);
  const entry = {
    name,
    id: job.id,
    trip: trip.title,
    duration: probe.format.duration,
    width,
    height,
    fps: video.r_frame_rate,
    frames: video.nb_read_frames,
    videoCodec: video.codec_name,
    audioCodec: audio.codec_name,
    audioPeakDb: Number(peak[1]),
    audioMeanDb: Number(mean?.[1]),
    blackSegments: 0,
    fullDecode: "passed",
    poster: "A3 single-page PDF, vector SVG, 3508x4961 PNG",
    storyboard: sceneList,
    outputs: job.outputs,
  };
  report.push(entry);
  await writeFile(
    resolve(dest, "validation.json"),
    JSON.stringify(entry, null, 2),
  );
  console.log(
    `PASS ${name}: ${duration * 30} frames, A3 + 300dpi PNG, no black segments, audio peak ${peak[1]} dB`,
  );
}
await writeFile(
  resolve(
    artifacts,
    short
      ? "prototype-report.json"
      : portrait
        ? "portrait-report.json"
        : selectedTrip
          ? `${selectedTrip}-report.json`
          : "validation-report.json",
  ),
  JSON.stringify(report, null, 2),
);
console.log("Validation completed. Artifacts retained in artifacts/.");

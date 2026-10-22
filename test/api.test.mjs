import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { sampleTrips } from "../shared/samples.mjs";
let child, base, temp;
const interrupted = "11111111-1111-4111-8111-111111111111";
before(async () => {
  temp = await mkdtemp(join(tmpdir(), "route-film-test-"));
  await mkdir(join(temp, "renders", interrupted), { recursive: true });
  await writeFile(
    join(temp, "renders", interrupted, "job.json"),
    JSON.stringify({
      id: interrupted,
      status: "rendering",
      createdAt: "2026-01-01",
      trip: sampleTrips[0],
    }),
  );
  child = spawn(process.execPath, ["server.mjs"], {
    cwd: resolve(import.meta.dirname, ".."),
    env: { ...process.env, PORT: "0", DATA_DIR: temp },
    stdio: ["ignore", "pipe", "pipe"],
  });
  base = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Server startup timeout")),
      15000,
    );
    child.stdout.on("data", (b) => {
      const m = String(b).match(/127\.0\.0\.1:(\d+)/);
      if (m) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${m[1]}`);
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited ${code}`));
    });
  });
});
after(async () => {
  if (child) {
    child.kill();
    await once(child, "exit");
  }
  if (temp) await rm(temp, { recursive: true, force: true });
});
const post = (path, value, extra = {}) =>
  fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extra },
    body: JSON.stringify(value),
  });
test("health and real application entry point are served", async () => {
  assert.equal((await (await fetch(base + "/api/health")).json()).ok, true);
  const r = await fetch(base + "/");
  assert.equal(r.status, 200);
  assert.match(await r.text(), /app\.mjs/);
  assert.equal((await fetch(base + "/server.mjs")).status, 404);
});
test("interrupted render survives restart as retryable failure", async () => {
  const job = await (await fetch(base + "/api/renders/" + interrupted)).json();
  assert.equal(job.status, "failed");
  assert.match(job.error, /재시작/);
  assert.equal(job.trip.title, sampleTrips[0].title);
});
test("invalid JSON, coordinates, dimensions and cross-origin mutation are rejected", async () => {
  assert.equal(
    (await fetch(base + "/api/renders", { method: "POST", body: "{broken" }))
      .status,
    400,
  );
  const invalid = structuredClone(sampleTrips[0]);
  invalid.stops[0].lat = 91;
  assert.equal((await post("/api/renders", { trip: invalid })).status, 400);
  assert.equal(
    (await post("/api/renders", { trip: sampleTrips[0], width: 10000 })).status,
    400,
  );
  assert.equal(
    (
      await post(
        "/api/renders",
        { trip: sampleTrips[0] },
        { Origin: "https://untrusted.example" },
      )
    ).status,
    403,
  );
});
test("a real queued render can cancel and retry with a fresh job", async () => {
  const response = await post("/api/renders", {
    trip: sampleTrips[0],
    duration: 10,
    width: 640,
    height: 360,
  });
  assert.equal(response.status, 202);
  const job = await response.json();
  assert.ok(job.id);
  assert.equal((await post(`/api/renders/${job.id}/cancel`, {})).status, 200);
  let cancelled;
  for (let i = 0; i < 40; i++) {
    cancelled = await (await fetch(base + "/api/renders/" + job.id)).json();
    if (cancelled.status === "cancelled") break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(cancelled.status, "cancelled");
  const retry = await (
    await post("/api/renders", {
      trip: cancelled.trip,
      duration: 10,
      width: 640,
      height: 360,
    })
  ).json();
  assert.notEqual(retry.id, job.id);
  await post(`/api/renders/${retry.id}/cancel`, {});
});
test("poster endpoint creates real A3 PDF and 300dpi PNG with safe artifact routing", async () => {
  const response = await post("/api/poster", { trip: sampleTrips[1] });
  assert.equal(response.status, 201);
  const result = await response.json();
  const atlas = await fetch(base + result.outputs.html);
  assert.equal(atlas.status, 200);
  assert.match(await atlas.text(), /여행 타임라인/);
  const pdf = Buffer.from(
    await (await fetch(base + result.outputs.pdf)).arrayBuffer(),
  );
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  const png = Buffer.from(
    await (await fetch(base + result.outputs.png)).arrayBuffer(),
  );
  assert.equal(png.readUInt32BE(16), 3508);
  assert.equal(png.readUInt32BE(20), 4961);
  assert.equal(
    (await fetch(base + `/exports/${result.id}/score.wav`)).status,
    404,
  );
});

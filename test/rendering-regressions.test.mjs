import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { sampleTrips } from "../shared/samples.mjs";
import {
  normalizeTrip,
  renderPoster,
  renderFrame,
  timeline,
} from "../shared/core.mjs";
import { synthesize } from "../lib/audio.mjs";
import { bundleOfflineModule } from "../lib/offline.mjs";
import { TaskQueue } from "../lib/task-queue.mjs";

test("seed accepts only bounded integer numbers, including zero", () => {
  for (const seed of [
    "",
    " ",
    true,
    false,
    [],
    {},
    null,
    "42",
    Infinity,
    NaN,
    1.5,
    -1,
    2147483648,
  ])
    assert.throws(() => normalizeTrip({ ...sampleTrips[0], seed }));
  for (const seed of [0, 42, 2147483647])
    assert.equal(normalizeTrip({ ...sampleTrips[0], seed }).seed, seed);
  const { seed, ...missing } = sampleTrips[0];
  assert.equal(normalizeTrip(missing).seed, 2718);
});
test("SVG references remain isolated while literal URL text and escaped user data are unchanged", () => {
  const trip = structuredClone(sampleTrips[0]);
  trip.title = "url(#evil)";
  trip.stops[0].name = '한글 "A" & <B>';
  trip.stops[0].note = '기억 url(#evil) fill="url(#note)"';
  const time = timeline(trip).find((s) => s.type === "place").start + 1;
  for (const svg of [
    renderPoster(trip),
    renderFrame(trip, 1),
    renderFrame(trip, time),
  ]) {
    assert.doesNotMatch(svg, />[^<]*url\(#rf-[^<]*evil/);
    assert.match(svg, /url\(#evil\)/);
  }
  assert.match(
    renderPoster(trip),
    /기억 url\(#evil\) fill=&quot;url\(#note\)&quot;/,
  );
  assert.match(renderPoster(trip), /한글 &quot;A&quot; &amp; &lt;B&gt;/);
});
test("offline bundle includes real module imports without network dependencies", async () => {
  const dir = await mkdtemp(join(tmpdir(), "route-bundle-"));
  try {
    await writeFile(join(dir, "value.mjs"), "export const value = 21;");
    await writeFile(
      join(dir, "entry.mjs"),
      'import {value} from "./value.mjs"; export const result = value * 2;',
    );
    const code = await bundleOfflineModule(join(dir, "entry.mjs"));
    const context = {};
    vm.runInNewContext(code, context);
    assert.equal(context.RouteFilmCore.result, 42);
    assert.doesNotMatch(code, /import\s*\(/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("audio synthesis remains byte-identical across runs, yields promptly and supports cancellation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "route-audio-"));
  try {
    let yielded = false;
    setImmediate(() => (yielded = true));
    await synthesize(sampleTrips[0], 0.2, join(dir, "one.wav"));
    assert.equal(yielded, true);
    await synthesize(sampleTrips[0], 0.2, join(dir, "two.wav"));
    assert.deepEqual(
      await readFile(join(dir, "one.wav")),
      await readFile(join(dir, "two.wav")),
    );
    const fixture = JSON.parse(
      await readFile(new URL("./fixtures-audio.json", import.meta.url), "utf8"),
    );
    assert.equal(
      createHash("sha256")
        .update(await readFile(join(dir, "one.wav")))
        .digest("hex"),
      fixture.sha256,
    );
    const control = new AbortController();
    let tick = false;
    setImmediate(() => {
      tick = true;
      control.abort();
    });
    await assert.rejects(
      synthesize(sampleTrips[0], 60, join(dir, "cancelled.wav"), {
        signal: control.signal,
      }),
      { name: "AbortError" },
    );
    assert.equal(tick, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("queue reserves synchronously, bounds combined work and cancels pending tasks before execution", async () => {
  const queue = new TaskQueue({ concurrency: 1, limit: 2 });
  let done,
    began = false;
  const first = queue
    .reserve()
    .run(() => new Promise((resolve) => (done = resolve)));
  const controller = new AbortController();
  const second = queue.reserve().run(async () => {
    began = true;
  }, controller.signal);
  assert.throws(
    () => queue.reserve(),
    (error) => error.status === 429,
  );
  controller.abort();
  await assert.rejects(second, { name: "AbortError" });
  assert.equal(began, false);
  assert.equal(queue.size, 1);
  await new Promise((resolve) => setImmediate(resolve));
  done();
  await first;
  assert.equal(queue.size, 0);
});

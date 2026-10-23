import test from "node:test";
import assert from "node:assert/strict";
import { requestJSON, ApiError, createJobPoller } from "../public/client.mjs";
import { restoreTrip } from "../public/storage.mjs";
import { sampleTrips } from "../shared/samples.mjs";
const flush = () => new Promise((resolve) => setImmediate(resolve));
function clock() {
  const pending = new Map();
  let id = 0;
  return {
    pending,
    schedule: (fn, delay) => {
      pending.set(++id, { fn, delay });
      return id;
    },
    unschedule: (key) => pending.delete(key),
    async run() {
      const [key, task] = pending.entries().next().value;
      pending.delete(key);
      task.fn();
      await flush();
    },
  };
}
test("HTTP error preserves status and numeric/date Retry-After without losing network errors", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "Wait" }), {
        status: 429,
        headers: { "Retry-After": "7" },
      });
    await assert.rejects(
      requestJSON("/test"),
      (error) => error.status === 429 && error.retryAfterMs === 7000,
    );
    globalThis.fetch = async () => new Response("not JSON", { status: 404 });
    await assert.rejects(requestJSON("/test"), (error) => error.status === 404);
    globalThis.fetch = async () => {
      throw new TypeError("network");
    };
    await assert.rejects(requestJSON("/test"), (error) => error.status === 0);
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "Wait" }), {
        status: 429,
        headers: { "Retry-After": new Date(Date.now() + 60000).toUTCString() },
      });
    await assert.rejects(
      requestJSON("/test"),
      (error) => error.retryAfterMs > 58000 && error.retryAfterMs <= 60000,
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("permanent failures stop polling; explicit start can retry without unbounded notifications", async () => {
  for (const status of [401, 403, 404, 410]) {
    const time = clock(),
      issues = [];
    let calls = 0;
    const poller = createJobPoller({
      ...time,
      getJob: async () => {
        calls++;
        throw new ApiError("Missing", { status });
      },
      onJob: () => assert.fail(),
      onIssue: (error, info) => issues.push(info),
    });
    poller.start("job");
    await flush();
    assert.equal(calls, 1);
    assert.equal(time.pending.size, 0);
    assert.equal(issues[0].terminal, true);
    poller.start("job");
    await flush();
    assert.equal(calls, 2);
    poller.stop();
  }
});
test("429 honors Retry-After; temporary failures use bounded backoff and stop", async () => {
  const time = clock(),
    issues = [];
  let calls = 0;
  const poller = createJobPoller({
    ...time,
    maxFailures: 3,
    getJob: async () => {
      calls++;
      throw new ApiError("Busy", { status: 429, retryAfterMs: 9000 });
    },
    onJob() {},
    onIssue: (error, info) => issues.push(info),
  });
  poller.start("job");
  await flush();
  assert.equal([...time.pending.values()][0].delay, 9000);
  await time.run();
  await time.run();
  assert.equal(calls, 3);
  assert.equal(time.pending.size, 0);
  assert.equal(issues.length, 2);
  assert.equal(issues.at(-1).terminal, true);
  const transient = clock();
  let tries = 0;
  const recovered = [];
  const retry = createJobPoller({
    ...transient,
    getJob: async () => {
      if (++tries < 3) throw new ApiError("Temporary", { status: 503 });
      return { status: "completed" };
    },
    onJob: (job) => recovered.push(job),
  });
  retry.start("job");
  await flush();
  assert.equal([...transient.pending.values()][0].delay, 1000);
  await transient.run();
  assert.equal([...transient.pending.values()][0].delay, 2000);
  await transient.run();
  assert.equal(recovered.length, 1);
  assert.equal(transient.pending.size, 0);
});
test("an old job response cannot overwrite a new one even when transport ignores abort", async () => {
  const time = clock(),
    resolvers = {},
    jobs = [];
  const poller = createJobPoller({
    ...time,
    getJob: (id) => new Promise((resolve) => (resolvers[id] = resolve)),
    onJob: (job) => jobs.push(job.id),
  });
  poller.start("old");
  poller.start("new");
  resolvers.new({ id: "new", status: "completed" });
  await flush();
  resolvers.old({ id: "old", status: "rendering" });
  await flush();
  assert.deepEqual(jobs, ["new"]);
  assert.equal(time.pending.size, 0);
});
test("double-corrupt storage resets both editor and preview while valid unfinished drafts survive", () => {
  const invalid = structuredClone(sampleTrips[0]);
  invalid.stops[0].lat = 91;
  const double = restoreTrip(
    (key) => (key.includes(".valid.") ? "{broken" : JSON.stringify(invalid)),
    sampleTrips[0],
  );
  assert.deepEqual(double.trip, sampleTrips[0]);
  assert.deepEqual(double.valid, sampleTrips[0]);
  assert.equal(double.recovered, true);
  const retained = restoreTrip(
    (key) => JSON.stringify(key.includes(".valid.") ? sampleTrips[1] : invalid),
    sampleTrips[0],
  );
  assert.equal(retained.trip.stops[0].lat, 91);
  assert.deepEqual(retained.valid, sampleTrips[1]);
  assert.equal(retained.recovered, false);
  const recovered = restoreTrip(
    (key) =>
      key.includes(".valid.") ? JSON.stringify(sampleTrips[1]) : "{broken",
    sampleTrips[0],
  );
  assert.deepEqual(recovered.trip, sampleTrips[1]);
  assert.equal(recovered.recovered, true);
});

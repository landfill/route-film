import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdir,
  writeFile,
  readFile,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { join } from "node:path";
import { startServer, waitFor } from "./helpers/server.mjs";
import { sampleTrips } from "../shared/samples.mjs";
const film = { trip: sampleTrips[0], duration: 10, width: 640, height: 360 };
const fetchJob = async (app, id) =>
  (await fetch(app.base + "/api/renders/" + id)).json();
const cancelled = async (app, id) => {
  await app.post(`/api/renders/${id}/cancel`, {});
  return waitFor(
    async () => (await fetchJob(app, id)).status === "cancelled",
    "Render was not cancelled",
  );
};

test("film and standalone posters share reservations, reject overload, and release after cancellation", async () => {
  const app = await startServer({ RENDER_QUEUE_LIMIT: "1" });
  try {
    const response = await app.post("/api/renders", film);
    assert.equal(response.status, 202);
    const job = await response.json();
    const poster = await app.post("/api/poster", { trip: sampleTrips[0] });
    assert.equal(poster.status, 429);
    assert.equal(poster.headers.get("Retry-After"), "3");
    assert.equal((await app.post("/api/renders", film)).status, 429);
    await cancelled(app, job.id);
    await waitFor(async () => {
      const files = await readdir(join(app.dir, "renders", job.id));
      return (
        !files.includes("score.wav") && !files.includes("film.partial.mp4")
      );
    }, "Intermediate inputs leaked after cancellation");
    const first = app.post("/api/poster", { trip: sampleTrips[0] });
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(
      (await app.post("/api/poster", { trip: sampleTrips[1] })).status,
      429,
    );
    assert.equal((await first).status, 201);
    assert.equal(
      (await app.post("/api/poster", { trip: sampleTrips[1] })).status,
      201,
    );
  } finally {
    await app.close();
  }
});

test("disconnected queued and active poster requests release slots without leaving partial files", async () => {
  const app = await startServer({ RENDER_QUEUE_LIMIT: "2" });
  try {
    const job = await (await app.post("/api/renders", film)).json();
    const controller = new AbortController();
    const pending = app
      .post(
        "/api/poster",
        { trip: sampleTrips[0] },
        { signal: controller.signal },
      )
      .catch((error) => error);
    await waitFor(
      async () => (await readdir(join(app.dir, "renders"))).length === 2,
      "Poster request was not queued",
    );
    controller.abort();
    await pending;
    let second;
    await waitFor(async () => {
      const response = await app.post("/api/renders", film);
      if (response.status === 429) return false;
      assert.equal(response.status, 202);
      second = await response.json();
      return true;
    }, "Disconnected request retained its reservation");
    await cancelled(app, job.id);
    await cancelled(app, second.id);
    const before = new Set(await readdir(join(app.dir, "renders")));
    const activeController = new AbortController();
    const active = app
      .post(
        "/api/poster",
        { trip: sampleTrips[0] },
        { signal: activeController.signal },
      )
      .catch((error) => error);
    const posterId = await waitFor(async () => {
      for (const id of await readdir(join(app.dir, "renders")))
        if (!before.has(id)) {
          if (
            (await readdir(join(app.dir, "renders", id))).includes("poster.svg")
          )
            return id;
        }
    }, "Active poster did not start");
    activeController.abort();
    await active;
    await waitFor(
      async () =>
        !(await readdir(join(app.dir, "renders", posterId))).some((name) =>
          name.includes(".partial."),
        ),
      "Cancelled poster left a partial file",
    );
    const completed = await app.post("/api/poster", { trip: sampleTrips[1] });
    assert.equal(completed.status, 201);
  } finally {
    await app.close();
  }
});

test("initial metadata write failure returns 500, preserves server and frees reservation", async () => {
  const app = await startServer({ RENDER_QUEUE_LIMIT: "1" });
  try {
    const renders = join(app.dir, "renders");
    await rename(renders, renders + "-preserved");
    await writeFile(renders, "isolated write fault");
    const response = await app.post("/api/renders", film);
    assert.equal(response.status, 500);
    assert.ok(!(await response.text()).includes(app.dir));
    assert.equal((await fetch(app.base + "/api/health")).status, 200);
    assert.equal(app.child.exitCode, null);
    await rm(renders);
    await rename(renders + "-preserved", renders);
    const retry = await app.post("/api/renders", film);
    assert.equal(retry.status, 202);
    await cancelled(app, (await retry.json()).id);
  } finally {
    await app.close();
  }
});

test("periodic metadata save failure cannot kill the background scheduler", async () => {
  const app = await startServer({ RENDER_QUEUE_LIMIT: "1" });
  try {
    const job = await (
      await app.post("/api/renders", { ...film, width: 1280, height: 720 })
    ).json();
    const dir = join(app.dir, "renders", job.id);
    await waitFor(
      async () => (await fetchJob(app, job.id)).status === "rendering",
      "Render never started",
    );
    await waitFor(async () => {
      try {
        await stat(join(dir, "job.json.tmp"));
        return false;
      } catch {
        return true;
      }
    }, "Initial state write did not finish");
    await mkdir(join(dir, "job.json.tmp"));
    const failed = await waitFor(
      async () => {
        const current = await fetchJob(app, job.id);
        return current.status === "failed" && current;
      },
      "Save fault did not reach failed state",
      30000,
    );
    assert.match(failed.error, /保存|저장|서버/);
    assert.equal(app.child.exitCode, null);
    assert.equal((await fetch(app.base + "/api/health")).status, 200);
    let retry;
    await waitFor(async () => {
      retry = await app.post("/api/renders", film);
      if (retry.status === 429) return false;
      assert.equal(retry.status, 202);
      return true;
    }, "Failed render did not release its slot after cleanup");
    await cancelled(app, (await retry.json()).id);
  } finally {
    await app.close();
  }
});

test("final metadata save failure preserves completed artifacts, cleans WAV and keeps serving", async () => {
  const app = await startServer({ RENDER_QUEUE_LIMIT: "1" });
  try {
    const job = await (await app.post("/api/renders", film)).json(),
      dir = join(app.dir, "renders", job.id);
    await waitFor(
      async () => (await fetchJob(app, job.id)).progress === 94,
      "Poster phase never started",
      30000,
    );
    await mkdir(join(dir, "job.json.tmp"));
    const failed = await waitFor(
      async () => {
        const current = await fetchJob(app, job.id);
        return current.status === "failed" && current.outputs && current;
      },
      "Final save failure not recorded",
      30000,
    );
    for (const file of [
      "film.mp4",
      "poster.pdf",
      "poster.png",
      "trip.json",
      "atlas.html",
    ])
      assert.ok((await stat(join(dir, file))).size > 0);
    assert.ok(!(await readdir(dir)).includes("score.wav"));
    assert.equal((await fetch(app.base + failed.outputs.mp4)).status, 200);
    assert.equal((await fetch(app.base + "/api/health")).status, 200);
    assert.equal(app.child.exitCode, null);
    assert.equal(
      JSON.parse(await readFile(join(dir, "trip.json"), "utf8")).title,
      sampleTrips[0].title,
    );
  } finally {
    await app.close();
  }
});

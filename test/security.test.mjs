import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createConnection } from "node:net";
import { startServer } from "./helpers/server.mjs";
import { createRequestGuard } from "../lib/access.mjs";
import { sampleTrips } from "../shared/samples.mjs";

function duplicateHeaderRequest(port, headers) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    let response = "";
    socket.on("connect", () =>
      socket.write(
        `GET / HTTP/1.1\r\n${headers.join("\r\n")}\r\nConnection: close\r\n\r\n`,
      ),
    );
    socket.on("data", (data) => (response += data));
    socket.on("end", () =>
      resolve(Number(response.match(/^HTTP\/1\.1 (\d+)/)?.[1])),
    );
    socket.on("error", reject);
    socket.setTimeout(5000, () =>
      socket.destroy(new Error("Raw request timeout")),
    );
  });
}

test("untrusted Host is rejected before every GET/HEAD/POST route and same-host Origin cannot bypass it", async () => {
  const app = await startServer({ HOST: "0.0.0.0" });
  try {
    for (const method of ["GET", "HEAD", "POST"])
      for (const path of [
        "/",
        "/api/health",
        "/api/renders",
        "/exports/11111111-1111-4111-8111-111111111111/trip.json",
      ]) {
        assert.equal(
          (
            await app.raw(method, path, {
              Host: `evil.example:${app.port}`,
              Origin: `http://evil.example:${app.port}`,
            })
          ).status,
          403,
        );
      }
    for (const host of [
      "",
      "localhost@evil.example",
      "localhost,evil.example",
      "localhost:65536",
      "[not-ipv6]",
    ])
      assert.equal((await app.raw("GET", "/", { Host: host })).status, 400);
    assert.equal(
      await duplicateHeaderRequest(app.port, [
        "Host: localhost",
        "Host: evil.example",
      ]),
      400,
    );
    assert.equal(
      await duplicateHeaderRequest(app.port, [
        `Host: localhost:${app.port}`,
        "Origin: http://localhost",
        "Origin: http://evil.example",
      ]),
      400,
    );
    assert.equal(
      (
        await app.raw("GET", "/api/health", {
          Host: `localhost:${app.port}`,
          Origin: `http://evil.example:${app.port}`,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await app.raw("GET", "/api/health", {
          Host: `localhost:${app.port}`,
          Origin: "null",
        })
      ).status,
      403,
    );
    assert.equal(
      (await app.raw("GET", "/api/health", { Host: "0.0.0.0" })).status,
      403,
    );
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      assert.equal(
        (
          await app.raw("GET", "/api/health", {
            Host: `${host}:${app.port}`,
            Origin: `http://${host}:${app.port}`,
          })
        ).status,
        200,
      );
    }
    assert.equal(
      (
        await app.raw("GET", "/api/health", {
          "X-Forwarded-Host": "evil.example",
          "X-Forwarded-Proto": "https",
        })
      ).status,
      200,
    );
  } finally {
    await app.close();
  }
});

test("custom proxy domain and HTTPS origin are explicit; forwarded headers confer no trust", async () => {
  const app = await startServer({
    ALLOWED_HOSTS: "atlas.example",
    ALLOWED_ORIGINS: "https://atlas.example",
  });
  try {
    assert.equal(
      (
        await app.raw("GET", "/api/health", {
          Host: "atlas.example",
          Origin: "https://atlas.example",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await app.raw("GET", "/api/health", {
          Host: "atlas.example",
          Origin: "http://atlas.example",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await app.raw("GET", "/api/health", {
          Host: "evil.example",
          Origin: "https://atlas.example",
          "X-Forwarded-Host": "atlas.example",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await app.raw("GET", "/api/health", {
          Host: "localhost",
          Origin: "https://atlas.example",
        })
      ).status,
      403,
    );
  } finally {
    await app.close();
  }
  assert.throws(() =>
    createRequestGuard({ allowedHosts: "0.0.0.0", getPort: () => 3000 }),
  );
  assert.throws(() =>
    createRequestGuard({ allowedHosts: "*.example", getPort: () => 3000 }),
  );
  assert.throws(() =>
    createRequestGuard({
      allowedOrigins: "https://evil.example",
      getPort: () => 3000,
    }),
  );
  const standardPort = createRequestGuard({ getPort: () => 80 });
  for (const hostname of ["localhost", "127.0.0.1", "[::1]"]) {
    assert.doesNotThrow(() =>
      standardPort({
        headers: { host: `${hostname}:80`, origin: `http://${hostname}` },
      }),
    );
  }
});

test("list contains summaries while detail preserves the exact retry snapshot", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const app = await startServer({}, async (dir) => {
    await mkdir(join(dir, "renders", id), { recursive: true });
    await writeFile(
      join(dir, "renders", id, "job.json"),
      JSON.stringify({
        id,
        status: "completed",
        createdAt: "2026-01-01",
        tripTitle: sampleTrips[0].title,
        trip: sampleTrips[0],
        storyboard: [{ private: true }],
        outputs: { mp4: `/exports/${id}/film.mp4` },
      }),
    );
  });
  try {
    const jobs = await (await fetch(app.base + "/api/renders")).json();
    assert.equal(jobs.length, 1);
    assert.equal("trip" in jobs[0], false);
    assert.equal("storyboard" in jobs[0], false);
    assert.equal(jobs[0].outputs.html, `/exports/${id}/atlas.html`);
    assert.deepEqual(
      (await (await fetch(app.base + "/api/renders/" + id)).json()).trip,
      sampleTrips[0],
    );
  } finally {
    await app.close();
  }
});

test("missing Chromium is a diagnostic 503; invalid trip remains 400 without path disclosure", async () => {
  const app = await startServer({
    CHROMIUM_PATH: "/definitely-not-a-browser/private-path",
  });
  try {
    const response = await app.post("/api/poster", { trip: sampleTrips[0] });
    assert.equal(response.status, 503);
    const error = (await response.json()).error;
    assert.match(error, /Chromium.*CHROMIUM_PATH/);
    assert.doesNotMatch(error, /private-path|launch\(|at .*mjs/);
    assert.equal(
      (await app.post("/api/poster", { trip: { ...sampleTrips[0], seed: "" } }))
        .status,
      400,
    );
    assert.equal((await app.post("/api/poster", {})).status, 400);
    assert.equal((await fetch(app.base + "/api/health")).status, 200);
  } finally {
    await app.close();
  }
});

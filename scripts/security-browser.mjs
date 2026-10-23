import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { startServer, waitFor } from "../test/helpers/server.mjs";
import { sampleTrips } from "../shared/samples.mjs";
import { createAtlas } from "../lib/atlas.mjs";

const app = await startServer();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
});
const checks = [],
  pageErrors = [];
const artifact = resolve(import.meta.dirname, "../artifacts/security");
await mkdir(artifact, { recursive: true });
try {
  const recovery = await browser.newContext();
  await recovery.addInitScript((sample) => {
    const brokenDraft = structuredClone(sample);
    brokenDraft.stops[0].lat = 91;
    localStorage.setItem("route-film.trip.v1", JSON.stringify(brokenDraft));
    localStorage.setItem("route-film.valid.v1", "{broken");
  }, sampleTrips[0]);
  const page = await recovery.newPage();
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.goto(app.base);
  await page.locator("#stage svg").waitFor();
  assert.equal(
    await page.getByLabel("위도", { exact: true }).inputValue(),
    String(sampleTrips[0].stops[0].lat),
  );
  assert.equal(await page.locator("#errors").isHidden(), true);
  assert.match(await page.locator("#notice").textContent(), /복구/);
  assert.equal(
    await page.getByLabel("위도", { exact: true }).getAttribute("min"),
    "-90",
  );
  assert.equal(
    await page.getByLabel("위도", { exact: true }).getAttribute("max"),
    "90",
  );
  await page.screenshot({
    path: resolve(artifact, "recovery.png"),
    fullPage: true,
  });
  checks.push(
    "Both corrupt stores reset editor and preview to the same sample; latitude limits match",
  );
  await recovery.close();

  for (const status of [401, 403, 404, 410]) {
    const context = await browser.newContext();
    const id = "22222222-2222-4222-8222-222222222222";
    let requests = 0;
    await context.addInitScript(
      ({ id, trip }) =>
        localStorage.setItem(
          "route-film.job.v1",
          JSON.stringify({ id, snapshot: trip }),
        ),
      { id, trip: sampleTrips[0] },
    );
    const current = await context.newPage();
    current.on("pageerror", (e) => pageErrors.push(e.message));
    await current.clock.install();
    await current.route(`**/api/renders/${id}`, (route) => {
      requests++;
      return route.fulfill({
        status: requests === 1 ? 200 : status,
        contentType: "application/json",
        body: JSON.stringify(
          requests === 1
            ? {
                id,
                status: "rendering",
                progress: 10,
                tripTitle: "Browser regression",
                trip: sampleTrips[0],
                width: 1920,
                height: 1080,
              }
            : { error: "작업 상태를 확인할 수 없습니다." },
        ),
      });
    });
    await current.goto(app.base);
    await current.locator("#stage svg").waitFor();
    await current.locator('[data-action="export"]').first().click();
    await current.locator("#poll-status-retry").waitFor();
    assert.equal(requests, 2);
    await current.clock.runFor(20000);
    assert.equal(requests, 2);
    await current.locator("#poll-status-retry").click();
    await waitFor(
      () => requests === 3,
      "Manual polling retry did not request status",
    );
    checks.push(
      `HTTP${status}: polling stops for 20 simulated seconds and manual retry makes one request`,
    );
    await context.close();
  }

  const retryContext = await browser.newContext();
  const id = "33333333-3333-4333-8333-333333333333";
  let attempts = 0;
  await retryContext.addInitScript(
    ({ id, trip }) =>
      localStorage.setItem(
        "route-film.job.v1",
        JSON.stringify({ id, snapshot: trip }),
      ),
    { id, trip: sampleTrips[0] },
  );
  const retryPage = await retryContext.newPage();
  retryPage.on("pageerror", (e) => pageErrors.push(e.message));
  await retryPage.clock.install();
  await retryPage.route(`**/api/renders/${id}`, (route) => {
    attempts++;
    const transient = attempts === 2;
    return route.fulfill({
      status: transient ? 429 : 200,
      headers: transient ? { "Retry-After": "9" } : {},
      contentType: "application/json",
      body: JSON.stringify(
        transient
          ? { error: "대기해 주세요." }
          : {
              id,
              status: attempts === 1 ? "rendering" : "completed",
              progress: attempts === 1 ? 10 : 100,
              trip: sampleTrips[0],
              tripTitle: "Recovered export",
              outputs: {},
            },
      ),
    });
  });
  await retryPage.goto(app.base);
  await retryPage.locator("#stage svg").waitFor();
  await waitFor(() => attempts === 2, "429 was not reached");
  await retryPage
    .locator("#notice")
    .filter({ hasText: "대기해 주세요." })
    .waitFor();
  await retryPage.clock.runFor(8000);
  assert.equal(attempts, 2);
  await retryPage.clock.runFor(1100);
  await waitFor(() => attempts === 3, "Retry-After was not honored");
  checks.push("HTTP429 waits for Retry-After and then recovers to completed");
  await retryContext.close();

  const offline = await browser.newContext({ offline: true });
  const atlas = await offline.newPage();
  atlas.on("pageerror", (e) => pageErrors.push(e.message));
  const network = [];
  atlas.on("request", (req) => {
    if (req.url().startsWith("http")) network.push(req.url());
  });
  const trip = structuredClone(sampleTrips[0]);
  trip.title = "url(#evil)";
  trip.stops[0].name = '한글 "A" & <B>';
  trip.stops[0].note = "기억 url(#evil)";
  await atlas.setContent(await createAtlas(trip));
  await atlas.locator("#art svg").waitFor();
  assert.equal(await atlas.locator("h1").textContent(), trip.title);
  await atlas.locator('[data-place="kyoto-start"]').click();
  assert.equal(
    await atlas.locator("#memory").textContent(),
    trip.stops[0].note,
  );
  await atlas.locator("#film").click();
  assert.ok(
    (await atlas.locator("#art").textContent()).includes(trip.stops[0].name),
  );
  assert.deepEqual(network, []);
  await offline.close();
  checks.push(
    "Bundled atlas preserves literal URL text, Korean and escaped characters; offline execution has zero network requests",
  );

  const download = await app.post("/api/poster", { trip: sampleTrips[0] });
  assert.equal(download.status, 201);
  const output = await download.json();
  for (const type of ["html", "svg", "png", "pdf", "json"])
    assert.equal((await fetch(app.base + output.outputs[type])).status, 200);
  checks.push("Real poster and atlas downloads remain available");
  assert.deepEqual(pageErrors, []);
  const report = { checkedOn: new Date().toISOString(), checks, pageErrors };
  await writeFile(
    resolve(artifact, "browser-validation.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  await app.close();
}

import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { sampleTrips } from "../shared/samples.mjs";
const base = process.env.APP_URL || "http://127.0.0.1:3000";
const out = resolve(import.meta.dirname, "../artifacts");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  env: {
    ...process.env,
    XDG_CACHE_HOME: process.env.XDG_CACHE_HOME || "/workspace/.cache",
  },
});
const results = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "ko-KR",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base);
  await page.locator("#stage svg").waitFor();
  assert.equal(await page.locator(".stop-item").count(), 5);
  await page.screenshot({
    path: resolve(out, "atlas-desktop.png"),
    fullPage: true,
  });
  results.push("Initial atlas and 5-stop trip load");
  const originalLat = await page
    .getByLabel("위도", { exact: true })
    .inputValue();
  await page.getByLabel("위도", { exact: true }).fill("91");
  assert.equal(await page.locator("#errors").isVisible(), true);
  await page.reload();
  assert.equal(
    await page.getByLabel("위도", { exact: true }).inputValue(),
    "91",
  );
  await page.getByLabel("위도", { exact: true }).fill(originalLat);
  assert.equal(await page.locator("#errors").isHidden(), true);
  results.push(
    "Invalid draft persists while last valid preview survives reload; correction clears error",
  );
  await page
    .getByLabel("장소 이름", { exact: true })
    .fill("기억을 남기는 출발역");
  assert.match(
    await page.locator("#stage").textContent(),
    /기억을 남기는 출발역/,
  );
  await page.getByRole("tab", { name: "포스터", exact: true }).click();
  assert.match(
    await page.locator("#stage").textContent(),
    /기억을 남기는 출발역/,
  );
  await page.reload();
  assert.equal(
    await page.getByLabel("장소 이름", { exact: true }).inputValue(),
    "기억을 남기는 출발역",
  );
  results.push("Place edit updates map and poster and restores on reload");
  await page.locator("#add-stop").click();
  assert.equal(await page.locator(".stop-item").count(), 6);
  await page.locator("#remove-stop").click();
  assert.equal(await page.locator(".stop-item").count(), 5);
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON 저장", exact: true }).click();
  const download = await downloaded;
  assert.ok(download.suggestedFilename().endsWith(".json"));
  await download.saveAs(resolve(out, "edited-trip.json"));
  await page
    .locator("#import-file")
    .setInputFiles({
      name: "seoul.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(sampleTrips[1])),
    });
  assert.equal(
    await page.locator("#project-name").textContent(),
    sampleTrips[1].title,
  );
  results.push("Add/remove, real JSON download and second-trip import");
  await page.locator("#sample-select").selectOption("0");
  await page.getByRole("tab", { name: "여행 필름", exact: true }).click();
  await page.locator("#play").click();
  await page.waitForTimeout(1300);
  await page.locator("#play").click();
  assert.ok(Number(await page.locator("#timeline").inputValue()) > 0.8);
  await page.locator("#timeline").fill("39");
  await page.locator("#timeline").dispatchEvent("input");
  await page.screenshot({
    path: resolve(out, "film-preview.png"),
    fullPage: true,
  });
  await page.locator("#language").click();
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  await page.getByRole("tab", { name: "Atlas", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: resolve(out, "atlas-mobile-en.png"),
    fullPage: true,
  });
  results.push(
    "Playback, seeking, EN interface and mobile layout without horizontal overflow",
  );
  const recovery = await browser.newContext();
  await recovery.addInitScript(() =>
    localStorage.setItem("route-film.trip.v1", "{broken"),
  );
  const recovered = await recovery.newPage();
  await recovered.goto(base);
  await recovered.locator("#stage svg").waitFor();
  assert.equal(await recovered.locator(".stop-item").count(), 5);
  assert.match(await recovered.locator("#notice").textContent(), /문제/);
  await recovery.close();
  results.push("Corrupted storage recovers to a usable sample");
  if (process.argv.includes("--media")) {
    const jobs = await (await fetch(base + "/api/renders")).json();
    const movies = jobs
      .filter((j) => j.status === "completed" && j.duration === 60)
      .slice(0, 3);
    assert.ok(movies.length >= 2, "Two completed full-length movies required");
    const videoPage = await context.newPage();
    for (const job of movies) {
      await videoPage.goto(base);
      await videoPage.evaluate((url) => {
        document.body.innerHTML =
          '<video id="validation-video" controls muted style="width:100%"></video>';
        const v = document.querySelector("video");
        v.src = url;
      }, base + job.outputs.mp4);
      await videoPage.locator("video").evaluate(
        (v) =>
          new Promise((resolve, reject) => {
            v.addEventListener("loadedmetadata", resolve, { once: true });
            v.addEventListener(
              "error",
              () => reject(new Error("Video codec playback failed")),
              { once: true },
            );
            if (v.readyState >= 1) resolve();
          }),
      );
      const dimensions = await videoPage
        .locator("video")
        .evaluate((v) => ({
          width: v.videoWidth,
          height: v.videoHeight,
          duration: v.duration,
        }));
      assert.equal(dimensions.width, job.width);
      assert.equal(dimensions.height, job.height);
      assert.ok(Math.abs(dimensions.duration - 60) < 0.1);
      await videoPage.locator("video").evaluate((v) => v.play());
      await videoPage.waitForTimeout(2200);
      assert.ok(
        await videoPage
          .locator("video")
          .evaluate((v) => v.currentTime > 1.5 && !v.error),
      );
      for (const time of [10, 24, 39, 51, 58])
        await videoPage.locator("video").evaluate(
          (v, t) =>
            new Promise((resolve, reject) => {
              v.pause();
              v.addEventListener("seeked", resolve, { once: true });
              v.addEventListener("error", reject, { once: true });
              v.currentTime = t;
            }),
          time,
        );
      results.push(
        `Actual Chromium MP4 playback and scene seeking: ${job.tripTitle} ${job.width}x${job.height}`,
      );
    }
    await videoPage.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(out, "ui-validation.json"),
    JSON.stringify({ checks: results, pageErrors: errors }, null, 2),
  );
  console.log(JSON.stringify({ checks: results, pageErrors: errors }, null, 2));
} finally {
  await browser.close();
}

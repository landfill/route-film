import test from "node:test";
import assert from "node:assert/strict";
import { sampleTrips } from "../shared/samples.mjs";
import {
  normalizeTrip,
  validateTrip,
  distanceKm,
  totalDistanceKm,
  timeline,
  renderMap,
  renderFrame,
  renderPoster,
} from "../shared/core.mjs";
const trip = () => structuredClone(sampleTrips[0]);
test("both sample journeys validate including midnight rollover", () => {
  for (const s of sampleTrips) assert.deepEqual(validateTrip(s), []);
});
test("normalization copies data, trims text and uses canonical fields", () => {
  const t = trip();
  t.title = "  A trip  ";
  const n = normalizeTrip(t);
  assert.equal(n.title, "A trip");
  n.stops[0].name = "changed";
  assert.notEqual(t.stops[0].name, n.stops[0].name);
});
test("malformed coordinates, dates, ids and backward times are rejected", () => {
  for (const mutate of [
    (t) => (t.stops[0].lat = NaN),
    (t) => (t.stops[0].lon = 181),
    (t) => (t.stops[0].lat = "35"),
    (t) => (t.stops[0].datetime = "2026-02-31T12:00"),
    (t) => (t.stops[1].datetime = "2026-04-11T12:00"),
    (t) => (t.stops[1].id = t.stops[0].id),
    (t) => (t.stops[0].id = "<script>"),
  ]) {
    const t = trip();
    mutate(t);
    assert.ok(validateTrip(t).length);
    assert.throws(() => normalizeTrip(t));
  }
});
test("same location and equal timestamps are allowed with zero leg distance", () => {
  const t = trip();
  t.stops[1] = { ...t.stops[0], id: "duplicate-location" };
  assert.deepEqual(validateTrip(t), []);
  assert.equal(distanceKm(t.stops[0], t.stops[1]), 0);
  assert.ok(Number.isFinite(totalDistanceKm(t)));
});
test("Haversine is accurate for one equatorial degree and dateline crossing", () => {
  assert.ok(
    Math.abs(distanceKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }) - 111.195) <
      0.01,
  );
  assert.ok(
    Math.abs(distanceKm({ lat: 0, lon: 179 }, { lat: 0, lon: -179 }) - 222.39) <
      0.01,
  );
});
test("timeline is contiguous and exactly covers chosen duration", () => {
  for (const duration of [12, 60]) {
    const list = timeline(trip(), duration);
    assert.equal(list[0].start, 0);
    assert.equal(list.at(-1).end, duration);
    for (let i = 1; i < list.length; i++)
      assert.equal(list[i].start, list[i - 1].end);
    assert.equal(list.filter((s) => s.type === "place").length, 5);
    assert.equal(list.filter((s) => s.type === "travel").length, 4);
  }
});
test("movie has deterministic animated frames and seeded original scenery", () => {
  const t = trip();
  assert.equal(renderFrame(t, 10), renderFrame(t, 10));
  assert.notEqual(renderFrame(t, 10), renderFrame(t, 10.2));
  const changed = trip();
  changed.seed = 99;
  assert.notEqual(renderFrame(t, 10), renderFrame(changed, 10));
});
test("edits are shared by atlas, film and poster; XML is escaped", () => {
  const t = trip();
  t.stops[0].name = "A < B & C";
  t.stops[0].note = "An edited note";
  const scene = timeline(t).find((s) => s.id === t.stops[0].id);
  for (const output of [
    renderMap(t),
    renderFrame(t, scene.start + 0.5),
    renderPoster(t),
  ]) {
    assert.match(output, /A &lt; B &amp; C/);
    assert.doesNotMatch(output, /< B/);
  }
  assert.match(renderPoster(t), /An edited note/);
});
test("same coordinate trip and long multilingual text render finite bounded SVG", () => {
  const t = trip();
  for (const s of t.stops) {
    s.lat = 0;
    s.lon = 0;
    s.name = "아주 긴 장소 이름 ".repeat(8).slice(0, 100);
    s.note = "오래 기억하고 싶은 장면 ".repeat(20);
  }
  normalizeTrip(t);
  for (const output of [renderMap(t), renderPoster(t), renderFrame(t, 17)]) {
    assert.doesNotMatch(output, /NaN|Infinity/);
    assert.match(output, /…/);
    assert.ok(output.length < 150000);
  }
});
test("12 stops and 2 stops retain all scenes and no unsupported counts accepted", () => {
  const t = trip();
  while (t.stops.length < 12) {
    const i = t.stops.length;
    t.stops.push({ ...t.stops.at(-1), id: `extra-${i}` });
  }
  assert.deepEqual(validateTrip(t), []);
  assert.equal(timeline(t).filter((s) => s.type === "place").length, 12);
  assert.match(renderPoster(t), /extra-11/);
  t.stops.push({ ...t.stops[0], id: "too-many" });
  assert.ok(validateTrip(t).length);
  t.stops = t.stops.slice(0, 2);
  assert.deepEqual(validateTrip(t), []);
});
test("portrait is a separately composed cinematic layout, not a stretched landscape", () => {
  const s = renderFrame(trip(), 30, { width: 1080, height: 1920 });
  assert.match(s, /portrait-art/);
  assert.match(s, /viewBox="0 0 1080 1920"/);
  assert.doesNotMatch(s, /scale\(0.5625 1.777/);
});
test("southern and western coordinates carry truthful hemisphere labels", () => {
  const t = trip();
  t.stops[0].lat = -33.86;
  t.stops[0].lon = -70.66;
  assert.match(renderPoster(t), /33.8600° S \/ 70.6600° W/);
});
test("coexisting inline SVG scenes have isolated paint and clip identifiers", () => {
  const a = renderFrame(trip(), 8),
    b = renderFrame(trip(), 50);
  const ids = (s) => [...s.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ids(a).length);
  for (const id of ids(a)) assert.ok(!ids(b).includes(id));
  assert.match(renderMap(trip()), /data-stop-id="kyoto-start"/);
  for (const s of [a, b])
    for (const match of s.matchAll(/url\(#([^)]+)\)/g))
      assert.ok(ids(s).includes(match[1]));
});

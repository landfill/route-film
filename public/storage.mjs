import { normalizeTrip } from "../shared/core.mjs";

function isEditableDraft(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.title === "string" &&
    (value.subtitle === undefined || typeof value.subtitle === "string") &&
    Array.isArray(value.stops) &&
    value.stops.length >= 2 &&
    value.stops.length <= 12 &&
    value.stops.every(
      (stop) =>
        stop &&
        ["id", "name", "datetime", "mode", "scene"].every(
          (key) => typeof stop[key] === "string",
        ) &&
        (typeof stop.lat === "number" || stop.lat === "") &&
        (typeof stop.lon === "number" || stop.lon === "") &&
        (stop.note === undefined || typeof stop.note === "string"),
    )
  );
}

export function restoreTrip(read, sample) {
  const fallback = () => ({
    trip: structuredClone(sample),
    valid: normalizeTrip(sample),
    recovered: true,
  });
  let raw;
  try {
    raw = read("route-film.trip.v1");
  } catch {
    return fallback();
  }
  if (!raw) return { ...fallback(), recovered: false };
  let draft;
  try {
    draft = JSON.parse(raw);
  } catch {
    draft = null;
  }
  if (isEditableDraft(draft)) {
    try {
      return { trip: draft, valid: normalizeTrip(draft), recovered: false };
    } catch {
      try {
        const valid = normalizeTrip(JSON.parse(read("route-film.valid.v1")));
        return { trip: draft, valid, recovered: false };
      } catch {
        return fallback();
      }
    }
  }
  try {
    const valid = normalizeTrip(JSON.parse(read("route-film.valid.v1")));
    return { trip: structuredClone(valid), valid, recovered: true };
  } catch {
    return fallback();
  }
}

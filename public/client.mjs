export class ApiError extends Error {
  constructor(message, { status = 0, retryAfterMs = 0 } = {}) {
    super(message);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}
export async function requestJSON(
  url,
  options = {},
  fallback = "서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    if (options.signal?.aborted || error.name === "AbortError") throw error;
    throw new ApiError(fallback);
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(fallback, { status: response.status });
  }
  if (!response.ok) {
    const header = response.headers.get("Retry-After");
    const retryAfterMs =
      header === null
        ? 0
        : /^\d+(?:\.\d+)?$/.test(header)
          ? Number(header) * 1000
          : Math.max(0, Date.parse(header) - Date.now()) || 0;
    throw new ApiError(typeof data.error === "string" ? data.error : fallback, {
      status: response.status,
      retryAfterMs,
    });
  }
  return data;
}

// An in-flight response belongs to one immutable ID and generation. Switching jobs
// cancels both the timer and fetch; a late response cannot overwrite a newer job.
export function createJobPoller({
  getJob,
  onJob,
  onIssue,
  maxFailures = 5,
  intervalMs = 1200,
  schedule = setTimeout,
  unschedule = clearTimeout,
}) {
  let generation = 0,
    timer,
    controller;
  function stop() {
    generation++;
    if (timer !== undefined) unschedule(timer);
    timer = undefined;
    controller?.abort();
    controller = undefined;
  }
  function start(id) {
    stop();
    const version = generation;
    let failures = 0;
    const check = async () => {
      if (version !== generation) return;
      controller = new AbortController();
      try {
        const job = await getJob(id, controller.signal);
        if (version !== generation) return;
        failures = 0;
        onJob(job);
        if (
          version === generation &&
          ["queued", "rendering"].includes(job.status)
        )
          timer = schedule(check, intervalMs);
      } catch (error) {
        if (version !== generation || controller.signal.aborted) return;
        failures++;
        const retryable =
          !error.status ||
          error.status === 408 ||
          error.status === 429 ||
          error.status >= 500;
        const terminal = !retryable || failures >= maxFailures;
        if (failures === 1 || terminal)
          onIssue?.(error, { terminal, failures });
        if (version !== generation || terminal) return;
        const delay = Math.max(
          Math.min(30000, 1000 * 2 ** (failures - 1)),
          error.retryAfterMs || 0,
        );
        timer = schedule(check, delay);
      }
    };
    void check();
  }
  return { start, stop };
}

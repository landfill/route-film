import { abortError, HttpError } from "./errors.mjs";

// Reservations count before any asynchronous initialization, so concurrent requests
// cannot all observe an empty queue and bypass its combined film/poster limit.
export class TaskQueue {
  #used = 0;
  #active = 0;
  #pending = [];
  constructor({ concurrency = 1, limit = 3 } = {}) {
    if (
      !Number.isInteger(concurrency) ||
      concurrency < 1 ||
      !Number.isInteger(limit) ||
      limit < concurrency
    )
      throw new Error("Invalid render queue configuration");
    this.concurrency = concurrency;
    this.limit = limit;
  }
  get size() {
    return this.#used;
  }
  reserve() {
    if (this.#used >= this.limit)
      throw new HttpError(
        429,
        "렌더링 대기열이 가득 찼습니다. 잠시 후 다시 시도해 주세요.",
        { retryAfter: 3 },
      );
    this.#used++;
    let state = "reserved";
    const release = () => {
      if (state !== "released") {
        state = "released";
        this.#used--;
      }
    };
    return {
      release: () => {
        if (state === "reserved") release();
      },
      run: (task, signal) => {
        if (state !== "reserved")
          throw new Error("Render reservation already consumed");
        state = "queued";
        return new Promise((resolve, reject) => {
          const entry = {
            task,
            signal,
            resolve,
            reject,
            release,
            onAbort: null,
          };
          entry.onAbort = () => {
            const index = this.#pending.indexOf(entry);
            if (index < 0) return;
            this.#pending.splice(index, 1);
            release();
            reject(abortError());
          };
          if (signal?.aborted) {
            release();
            reject(abortError());
            return;
          }
          signal?.addEventListener("abort", entry.onAbort, { once: true });
          this.#pending.push(entry);
          this.#drain();
        });
      },
    };
  }
  #drain() {
    while (this.#active < this.concurrency && this.#pending.length) {
      const entry = this.#pending.shift();
      entry.signal?.removeEventListener("abort", entry.onAbort);
      this.#active++;
      Promise.resolve()
        .then(() => {
          entry.signal?.throwIfAborted();
          return entry.task();
        })
        .then(
          (value) => {
            this.#active--;
            entry.release();
            entry.resolve(value);
            this.#drain();
          },
          (error) => {
            this.#active--;
            entry.release();
            entry.reject(error);
            this.#drain();
          },
        );
    }
  }
}

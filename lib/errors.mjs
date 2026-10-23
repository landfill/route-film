export class HttpError extends Error {
  constructor(status, message, { retryAfter } = {}) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function abortError() {
  return new DOMException("작업을 취소했습니다.", "AbortError");
}

export function clientError(error) {
  if (error instanceof HttpError)
    return { status: error.status, error: error.message };
  if (error?.name === "AbortError")
    return { status: 499, error: "작업을 취소했습니다." };
  return {
    status: 500,
    error:
      "서버에서 작업을 완료하지 못했습니다. 설정과 저장 공간을 확인한 후 다시 시도해 주세요.",
  };
}

// Log only a category and error code, never request bodies, environment values,
// filesystem paths or command output that could contain private trip information.
export function logFailure(category, error) {
  const code =
    typeof error?.code === "string" && /^[A-Z0-9_]+$/.test(error.code)
      ? error.code
      : error?.name === "AbortError"
        ? "ABORTED"
        : "INTERNAL";
  console.error(`[route-film] ${category}: ${code}`);
}

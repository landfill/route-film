import { isIP } from "node:net";
import { HttpError } from "./errors.mjs";

function parseAuthority(value) {
  if (typeof value !== "string" || !value || /[\s\\/@?#,%]/.test(value))
    throw new Error("Invalid authority");
  const match = value.match(
    /^(\[[0-9a-fA-F:.]+\]|[A-Za-z0-9.-]+)(?::([0-9]{1,5}))?$/,
  );
  if (
    !match ||
    (match[2] && (Number(match[2]) < 1 || Number(match[2]) > 65535))
  )
    throw new Error("Invalid authority");
  let hostname = match[1].toLowerCase();
  if (hostname.startsWith("[")) {
    hostname = hostname.slice(1, -1);
    if (isIP(hostname) !== 6) throw new Error("Invalid IPv6");
    hostname = new URL(`http://[${hostname}]`).hostname.slice(1, -1);
  } else if (
    !isIP(hostname) &&
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/.test(
      hostname,
    )
  ) {
    throw new Error("Invalid hostname");
  }
  return { hostname, port: match[2] ? Number(match[2]) : undefined };
}

function displayHost(hostname) {
  return hostname.includes(":") ? `[${hostname}]` : hostname;
}

export function createRequestGuard({
  allowedHosts = "",
  allowedOrigins = "",
  getPort,
}) {
  const hosts = new Set(["localhost", "127.0.0.1", "::1"]);
  for (const value of allowedHosts
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)) {
    let parsed;
    try {
      parsed = parseAuthority(value);
    } catch {
      throw new Error(
        "ALLOWED_HOSTS에는 포트·스킴·와일드카드 없는 호스트 이름을 지정해 주세요.",
      );
    }
    if (parsed.port || ["0.0.0.0", "::"].includes(parsed.hostname))
      throw new Error("ALLOWED_HOSTS에는 실제 접속 호스트를 지정해 주세요.");
    hosts.add(parsed.hostname);
  }
  const origins = new Set();
  for (const value of allowedOrigins
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)) {
    try {
      const url = new URL(value);
      const parsed = parseAuthority(url.host);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash ||
        !hosts.has(parsed.hostname)
      )
        throw new Error();
      origins.add(url.origin);
    } catch {
      throw new Error(
        "ALLOWED_ORIGINS에는 허용 호스트의 정확한 http(s) 출처를 지정해 주세요.",
      );
    }
  }
  return function guard(req) {
    if (req.rawHeaders) {
      const names = req.rawHeaders
        .filter((_, i) => i % 2 === 0)
        .map((s) => s.toLowerCase());
      if (
        names.filter((s) => s === "host").length !== 1 ||
        names.filter((s) => s === "origin").length > 1
      )
        throw new HttpError(400, "요청 헤더 형식이 올바르지 않습니다.");
    }
    let authority;
    try {
      authority = parseAuthority(req.headers.host);
    } catch {
      throw new HttpError(400, "요청 Host 형식이 올바르지 않습니다.");
    }
    if (!hosts.has(authority.hostname))
      throw new HttpError(403, "허용되지 않은 호스트입니다.");
    if (req.headers.origin !== undefined) {
      let origin;
      try {
        if (typeof req.headers.origin !== "string") throw new Error();
        const url = new URL(req.headers.origin);
        if (
          url.origin !== req.headers.origin ||
          !["http:", "https:"].includes(url.protocol)
        )
          throw new Error();
        origin = url;
      } catch {
        throw new HttpError(403, "허용되지 않은 요청 출처입니다.");
      }
      const localOrigins = new Set(
        [...hosts]
          .filter((h) => ["localhost", "127.0.0.1", "::1"].includes(h))
          .map((h) => new URL(`http://${displayHost(h)}:${getPort()}`).origin),
      );
      // Both the approved origin and the HTTP authority must match. Proxy headers
      // are deliberately ignored; TLS proxies configure ALLOWED_ORIGINS explicitly.
      const requestOrigin = new URL(`${origin.protocol}//${req.headers.host}`)
        .origin;
      if (
        (!origins.has(origin.origin) && !localOrigins.has(origin.origin)) ||
        origin.origin !== requestOrigin
      )
        throw new HttpError(403, "허용되지 않은 요청 출처입니다.");
    }
  };
}

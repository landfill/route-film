import { spawn } from "node:child_process";
import { request } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";

export async function startServer(env = {}, initialize) {
  const dir = await mkdtemp(join(tmpdir(), "route-film-regression-"));
  if (initialize) await initialize(dir);
  let logs = "";
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: resolve(import.meta.dirname, "../.."),
    env: {
      ...process.env,
      ALLOWED_HOSTS: "",
      ALLOWED_ORIGINS: "",
      RENDER_CONCURRENCY: "1",
      RENDER_QUEUE_LIMIT: "3",
      ...env,
      PORT: "0",
      DATA_DIR: dir,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr.on("data", (bytes) => {
    logs += bytes;
  });
  const exit = once(child, "exit");
  let port;
  try {
    port = await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Server startup timeout")),
        15000,
      );
      child.stdout.on("data", (bytes) => {
        const m = String(bytes).match(/:(\d+)\s*$/);
        if (m) {
          clearTimeout(timeout);
          resolve(Number(m[1]));
        }
      });
      child.once("exit", (code) => {
        clearTimeout(timeout);
        reject(new Error(`Server exited ${code}: ${logs}`));
      });
    });
  } catch (error) {
    child.kill();
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
  const base = `http://127.0.0.1:${port}`;
  return {
    dir,
    child,
    port,
    base,
    logs: () => logs,
    async close() {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill();
        await exit;
      }
      await rm(dir, { recursive: true, force: true });
    },
    post: (path, value, options = {}) =>
      fetch(base + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
        ...options,
      }),
    raw: (method, path, headers = {}) =>
      new Promise((resolve, reject) => {
        const req = request(
          {
            hostname: "127.0.0.1",
            port,
            method,
            path,
            setHost: false,
            headers: { Host: `127.0.0.1:${port}`, ...headers },
          },
          (response) => {
            let body = "";
            response.on("data", (bytes) => (body += bytes));
            response.on("end", () =>
              resolve({ status: response.statusCode, body }),
            );
          },
        );
        req.on("error", reject);
        req.end();
      }),
  };
}
export async function waitFor(check, message, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw new Error(message);
}

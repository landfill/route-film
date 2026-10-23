import { build } from "esbuild";
import { fileURLToPath } from "node:url";

export async function bundleOfflineModule(entry) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "RouteFilmCore",
    platform: "browser",
    target: "es2022",
    charset: "utf8",
    legalComments: "inline",
    logLevel: "silent",
  });
  // Inline scripts must not be terminated by text from a bundled string literal.
  return result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
}

let coreBundle;
export function offlineCore() {
  if (!coreBundle) {
    coreBundle = bundleOfflineModule(
      fileURLToPath(new URL("../shared/core.mjs", import.meta.url)),
    ).catch((error) => {
      coreBundle = undefined;
      throw error;
    });
  }
  return coreBundle;
}

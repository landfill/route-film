import { mkdir, cp, readdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
for (const dir of ["shared", "public", "lib"])
  for (const file of await readdir(dir))
    if (file.endsWith(".mjs"))
      execFileSync(process.execPath, ["--check", `${dir}/${file}`]);
execFileSync(process.execPath, ["--check", "server.mjs"]);
const html = await readFile("public/index.html", "utf8");
if (!html.includes("app.mjs") || !html.includes("style.css"))
  throw new Error("Application entry points missing");
await mkdir("dist", { recursive: true });
for (const path of [
  "public",
  "shared",
  "lib",
  "server.mjs",
  "package.json",
  "package-lock.json",
])
  await cp(path, `dist/${path}`, { recursive: true });
const entries = {};
for (const dir of ["shared", "public", "lib"])
  for (const file of await readdir(dir))
    entries[`${dir}/${file}`] = createHash("sha256")
      .update(await readFile(`${dir}/${file}`))
      .digest("hex");
await writeFile(
  "dist/build-manifest.json",
  JSON.stringify({ version: "1.0.0", files: entries }, null, 2),
);
console.log(
  `Production package built: ${Object.keys(entries).length} verified assets + Node server in dist/`,
);

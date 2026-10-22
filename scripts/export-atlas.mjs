import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createAtlas } from "../lib/atlas.mjs";
import { sampleTrips } from "../shared/samples.mjs";
const root = resolve(import.meta.dirname, "..");
if (process.argv[2]) {
  const input = JSON.parse(await readFile(resolve(process.argv[2]), "utf8"));
  const output = resolve(process.argv[3] || "atlas.html");
  await writeFile(output, await createAtlas(input));
  console.log(output);
} else {
  for (const [i, trip] of sampleTrips.entries()) {
    const dir = resolve(root, "artifacts", i === 0 ? "kyoto" : "seoul");
    await mkdir(dir, { recursive: true });
    await writeFile(resolve(dir, "atlas.html"), await createAtlas(trip));
    console.log(resolve(dir, "atlas.html"));
  }
}

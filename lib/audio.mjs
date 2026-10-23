import { writeFile } from "node:fs/promises";
import { setImmediate as immediate } from "node:timers/promises";

// Same PCM synthesis, yielding between bounded chunks for progress and cancellation.
export async function synthesize(trip, duration, path, { signal } = {}) {
  signal?.throwIfAborted();
  const rate = 48000,
    n = Math.ceil(duration * rate),
    buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  let seed = Number(trip.seed) || 1,
    noise = 0;
  const chords = [
    [220, 261.626, 329.628],
    [174.614, 220, 261.626],
    [261.626, 329.628, 391.995],
    [195.998, 246.942, 293.665],
  ];
  for (let i = 0; i < n; i++) {
    if (i % 8192 === 0) {
      signal?.throwIfAborted();
      await immediate();
    }
    const t = i / rate,
      section = (t / duration) * 8,
      ci = Math.floor(section),
      mix = section - ci;
    const current = chords[ci % 4],
      next = chords[(ci + 1) % 4];
    const blend = Math.max(0, (mix - 0.78) / 0.22);
    const chord = (frequencies) =>
      frequencies.reduce(
        (v, f, k) =>
          v +
          Math.sin(t * f * Math.PI * 2) * (0.04 / (k + 1)) +
          Math.sin(t * f * 0.5 * Math.PI * 2) * 0.014,
        0,
      );
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    noise = noise * 0.985 + (seed / 2147483648) * 0.015;
    const wave = noise * 0.11 * (0.5 + 0.5 * Math.sin(t * 0.55));
    const pulse = t % 3.75,
      bell =
        Math.sin(2 * Math.PI * (current[2] * 2) * t) *
        Math.exp(-pulse * 3) *
        0.016;
    const fade = Math.min(1, t / 2.5, (duration - t) / 4);
    const sample =
      (chord(current) * (1 - blend) + chord(next) * blend + wave + bell) *
      Math.max(0, fade);
    buf.writeInt16LE(
      Math.max(-32767, Math.min(32767, Math.round(sample * 32767))),
      44 + i * 2,
    );
  }
  signal?.throwIfAborted();
  await writeFile(path, buf);
}

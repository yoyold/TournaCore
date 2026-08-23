/**
 * Seeded pseudo-randomness.
 *
 * Anywhere this application appears to draw at random it must in fact draw
 * reproducibly: a group draw or a Swiss pairing is derived on every read, so an
 * unseeded generator would reshuffle the tournament on each reload. Seeding from
 * stable input — usually the stage id — keeps derivation pure while still
 * producing a spread that looks drawn rather than ordered.
 */

/** Fisher-Yates driven by a seeded generator, so the draw is reproducible. */
export function deterministicShuffle<T>(values: readonly T[], seed: string): T[] {
  const result = [...values];
  const random = mulberry32(hashString(seed));

  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = result[i];
    const b = result[j];
    if (a === undefined || b === undefined) continue;
    result[i] = b;
    result[j] = a;
  }

  return result;
}

/** FNV-1a, for turning a seed string into a generator state. */
export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Small, fast, well-distributed 32-bit generator. */
export function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

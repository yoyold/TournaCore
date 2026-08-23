import type { GroupStageConfig } from '@models/index';

/**
 * Assigns entry slots to groups.
 *
 * Returns one array of 1-based slot indices per group, in the order they should
 * be listed.
 *
 * `snake` is the default for a reason: filling groups in sequence would put
 * seeds 1 to 4 together and leave the bottom group with only weak entries, which
 * decides the stage before it starts. Reversing direction on every pass spreads
 * strength evenly — the first group gets the strongest seed and, to compensate,
 * the weakest of the next pass.
 */
export function distributeSlots(
  slotCount: number,
  groupCount: number,
  distribution: GroupStageConfig['distribution'],
  /** Stable seed for the random variant, so a reload does not redraw. */
  drawSeed = 'groups',
): number[][] {
  const groups: number[][] = Array.from({ length: Math.max(groupCount, 1) }, () => []);
  if (slotCount < 1 || groupCount < 1) return groups;

  const slots = Array.from({ length: slotCount }, (_, i) => i + 1);

  switch (distribution) {
    case 'sequential': {
      // Fill each group before starting the next.
      const perGroup = Math.ceil(slotCount / groupCount);
      slots.forEach((slot, index) => {
        const group = Math.min(Math.floor(index / perGroup), groupCount - 1);
        groups[group]?.push(slot);
      });
      return groups;
    }

    case 'random': {
      const shuffled = deterministicShuffle(slots, drawSeed);
      shuffled.forEach((slot, index) => {
        groups[index % groupCount]?.push(slot);
      });
      return groups;
    }

    case 'manual':
      // Nothing to compute: the caller supplies the assignment. Falls back to
      // snake so a half-configured stage still produces a sensible structure.
      return distributeSlots(slotCount, groupCount, 'snake', drawSeed);

    case 'snake':
    default: {
      slots.forEach((slot, index) => {
        const pass = Math.floor(index / groupCount);
        const withinPass = index % groupCount;
        // Every other pass runs right to left.
        const group = pass % 2 === 0 ? withinPass : groupCount - 1 - withinPass;
        groups[group]?.push(slot);
      });
      return groups;
    }
  }
}

/** Fisher-Yates driven by a seeded generator, so the draw is reproducible. */
function deterministicShuffle(values: readonly number[], seed: string): number[] {
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

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

import { deterministicShuffle } from '@domain/random';

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
  /** Explicit membership for `manual`. */
  manual?: readonly (readonly number[])[],
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

    case 'manual': {
      /*
       * The assignment is a fact the caller holds — a draw made elsewhere, or an
       * imported tournament whose groups were already played. Only slots that
       * actually exist are kept, so a stale assignment cannot invent entrants.
       */
      if (manual === undefined) {
        // Half-configured: still produce something playable rather than nothing.
        return distributeSlots(slotCount, groupCount, 'snake', drawSeed);
      }

      manual.forEach((members, index) => {
        const target = groups[index];
        if (!target) return;
        for (const slot of members) {
          if (slot >= 1 && slot <= slotCount) target.push(slot);
        }
      });
      return groups;
    }

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

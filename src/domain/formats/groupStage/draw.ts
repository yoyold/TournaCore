import { deterministicShuffle } from '@domain/random';

/**
 * A random group draw that keeps entries carrying the same label apart.
 *
 * The label is opaque here on purpose. This layer knows nothing about teams or
 * regions — it only knows that some entries should not sit together if that can
 * be avoided, which is the same problem whether the thing being separated is a
 * region, a club or an organisation.
 *
 * The result is a draw, not a rule: the caller is expected to store it. Deriving
 * it on every read would mean that editing a team's region redraws the groups of
 * a tournament that has already been played, and a stored result names a
 * position rather than a pairing — so the whole table would silently change
 * hands.
 */
export function drawGroups(input: {
  slotCount: number;
  groupCount: number;
  /** What must be kept apart, per 1-based slot. Undefined constrains nothing. */
  labelOf: (slot: number) => string | undefined;
  /** Stable seed, so the same field and the same stage draw the same groups. */
  seed: string;
}): number[][] {
  const { slotCount, groupCount, labelOf, seed } = input;

  const size = Math.max(groupCount, 1);
  const groups: number[][] = Array.from({ length: size }, () => []);
  if (slotCount < 1) return groups;

  /*
   * Group sizes are settled before anything is drawn. Spreading labels is the
   * goal, but a draw that achieved it by making one group twice the size of
   * another would have broken the format to satisfy a preference.
   */
  const base = Math.floor(slotCount / size);
  const remainder = slotCount % size;
  const capacity = Array.from({ length: size }, (_, index) =>
    index < remainder ? base + 1 : base,
  );

  const labels = new Map<number, string>();
  const cohorts = new Map<string, number[]>();
  const unlabelled: number[] = [];

  for (let slot = 1; slot <= slotCount; slot += 1) {
    const label = labelOf(slot)?.trim().toLowerCase();
    if (label === undefined || label === '') {
      unlabelled.push(slot);
      continue;
    }
    labels.set(slot, label);
    const cohort = cohorts.get(label);
    if (cohort) cohort.push(slot);
    else cohorts.set(label, [slot]);
  }

  /*
   * Largest cohort first: the crowded labels have the fewest places left once
   * everyone else is seated, so they choose while there is still room.
   *
   * Entries without a label go last, and one at a time. Two teams with no
   * region on record are not known to share one, so keeping them apart would be
   * an invention rather than a precaution.
   */
  const ordered = [...cohorts.values()]
    .sort((a, b) => b.length - a.length || (a[0] ?? 0) - (b[0] ?? 0))
    .concat(unlabelled.map((slot) => [slot]));

  const indices = Array.from({ length: size }, (_, index) => index);

  for (const cohort of ordered) {
    const placed = new Array<number>(size).fill(0);
    const members = deterministicShuffle(cohort, `${seed}:cohort:${String(cohort[0] ?? 0)}`);

    for (const slot of members) {
      // Ties break on a per-slot shuffle rather than on group order, which would
      // otherwise fill the first groups first every single time.
      const candidates = deterministicShuffle(indices, `${seed}:slot:${String(slot)}`);

      let best: { index: number; slots: number[]; sameLabel: number; room: number } | undefined;

      for (const index of candidates) {
        const slots = groups[index];
        if (slots === undefined) continue;

        const room = (capacity[index] ?? 0) - slots.length;
        if (room <= 0) continue;

        const sameLabel = placed[index] ?? 0;

        // Fewest of this label already there, then the most room left, so the
        // groups fill evenly rather than one at a time.
        if (
          best === undefined ||
          sameLabel < best.sameLabel ||
          (sameLabel === best.sameLabel && room > best.room)
        ) {
          best = { index, slots, sameLabel, room };
        }
      }

      if (best === undefined) break;
      best.slots.push(slot);
      placed[best.index] = best.sameLabel + 1;
    }
  }

  repair(groups, labels);

  // Within a group the order carries no meaning, and ascending is the order
  // every other distribution produces.
  return groups.map((slots) => [...slots].sort((a, b) => a - b));
}

/** How many same-label pairs a draw contains — the quantity to be minimised. */
export function collisionsIn(
  groups: readonly (readonly number[])[],
  labelOf: (slot: number) => string | undefined,
): number {
  let total = 0;

  for (const slots of groups) {
    const counts = new Map<string, number>();
    for (const slot of slots) {
      const label = labelOf(slot)?.trim().toLowerCase();
      if (label === undefined || label === '') continue;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    for (const count of counts.values()) total += (count * (count - 1)) / 2;
  }

  return total;
}

/** Passes over the draw. Each one strictly improves it, so this only bounds work. */
const MAX_REPAIR_PASSES = 8;

/**
 * Swaps pairs between groups for as long as that removes a collision.
 *
 * Seating each label optimally on its own does not make the whole draw optimal,
 * because the labels compete for the same places. Rather than solve that
 * exactly — it is the kind of problem with no cheap exact answer — the greedy
 * draw is repaired until no single swap improves it. Group sizes survive by
 * construction, since a swap trades one entry for another.
 */
function repair(groups: number[][], labels: ReadonlyMap<number, string>): void {
  const counts = groups.map((slots) => {
    const map = new Map<string, number>();
    for (const slot of slots) {
      const label = labels.get(slot);
      if (label !== undefined) map.set(label, (map.get(label) ?? 0) + 1);
    }
    return map;
  });

  const countOf = (group: number, label: string | undefined): number =>
    label === undefined ? 0 : (counts[group]?.get(label) ?? 0);

  const move = (group: number, label: string | undefined, by: number): void => {
    if (label === undefined) return;
    counts[group]?.set(label, countOf(group, label) + by);
  };

  for (let pass = 0; pass < MAX_REPAIR_PASSES; pass += 1) {
    let improved = false;

    for (let i = 0; i < groups.length; i += 1) {
      const left = groups[i];
      if (left === undefined) continue;

      for (let j = i + 1; j < groups.length; j += 1) {
        const right = groups[j];
        if (right === undefined) continue;

        for (let x = 0; x < left.length; x += 1) {
          const slotHere = left[x];
          if (slotHere === undefined) continue;
          const here = labels.get(slotHere);

          for (let y = 0; y < right.length; y += 1) {
            const slotThere = right[y];
            if (slotThere === undefined) continue;
            const there = labels.get(slotThere);
            if (here === there) continue;

            /*
             * Taking one of a label out of a group of k drops k-1 pairs; putting
             * one into a group of k creates k. No other group is touched.
             */
            const delta =
              countOf(i, there) -
              Math.max(countOf(i, here) - 1, 0) +
              countOf(j, here) -
              Math.max(countOf(j, there) - 1, 0);

            if (delta >= 0) continue;

            left[x] = slotThere;
            right[y] = slotHere;

            move(i, here, -1);
            move(i, there, 1);
            move(j, there, -1);
            move(j, here, 1);
            improved = true;

            // What sat at x is now somebody else, so the rest of this row is
            // about a slot that is no longer here.
            break;
          }
        }
      }
    }

    if (!improved) return;
  }
}

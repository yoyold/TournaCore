import { describe, expect, it } from 'vitest';

import { collisionsIn, drawGroups } from './draw';

/** Labels a field from a compact spec, e.g. "EU EU NA" for slots 1, 2 and 3. */
function fieldOf(spec: string): {
  slotCount: number;
  labelOf: (slot: number) => string | undefined;
} {
  const labels = spec
    .trim()
    .split(/\s+/)
    .filter((entry) => entry !== '')
    .map((entry) => (entry === '-' ? undefined : entry));
  return {
    slotCount: labels.length,
    labelOf: (slot) => labels[slot - 1],
  };
}

const draw = (spec: string, groupCount: number, seed = 'stage-1'): number[][] =>
  drawGroups({ ...fieldOf(spec), groupCount, seed });

const sizes = (groups: readonly (readonly number[])[]): number[] => groups.map((g) => g.length);

const repeat = (label: string, times: number): string => Array(times).fill(label).join(' ');

describe('drawGroups', () => {
  it('places every entry exactly once', () => {
    const groups = draw(repeat('EU', 5) + ' ' + repeat('NA', 7), 4);
    const all = groups.flat().sort((a, b) => a - b);
    expect(all).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  });

  it('keeps the groups the same size', () => {
    expect(sizes(draw(repeat('EU', 16), 4))).toEqual([4, 4, 4, 4]);
  });

  /** An uneven field cannot be split evenly; the surplus goes to the front. */
  it('spreads an uneven field as evenly as it can', () => {
    expect(sizes(draw(repeat('EU', 14), 4))).toEqual([4, 4, 3, 3]);
  });

  /**
   * The point of the whole exercise: four regions of four into four groups can
   * be drawn so that no group repeats a region, and it must be.
   */
  it('separates regions completely when the field allows it', () => {
    const spec = [repeat('EU', 4), repeat('NA', 4), repeat('APAC', 4), repeat('SA', 4)].join(' ');
    const groups = draw(spec, 4);

    expect(collisionsIn(groups, fieldOf(spec).labelOf)).toBe(0);
  });

  /**
   * Twelve of one region into four groups cannot avoid meeting — but three
   * groups of one region and one clean group would be a worse draw than three
   * apiece, and the draw has to find the even split.
   */
  it('spreads a region that cannot be separated', () => {
    const spec = repeat('EU', 12) + ' ' + repeat('NA', 4);
    const { labelOf } = fieldOf(spec);
    const groups = draw(spec, 4);

    for (const group of groups) {
      const eu = group.filter((slot) => labelOf(slot) === 'EU').length;
      expect(eu).toBe(3);
    }
  });

  /** The shape a real event has: several regions of unequal size. */
  it('reaches the best achievable draw for an uneven field', () => {
    const spec = [repeat('EU', 20), repeat('NA', 12), repeat('APAC', 10), repeat('SA', 6)].join(
      ' ',
    );
    const { labelOf } = fieldOf(spec);
    const groups = draw(spec, 8);

    /*
     * The best any draw can manage, region by region. Spreading n entries over
     * g groups as evenly as possible is the floor for that region, and here the
     * four floors can be reached at once: 48 entries fill eight groups of six
     * exactly, so no region has to give way to another.
     */
    const eu = 4 * 3 + 4 * 1; // 20: four groups of three, four of two
    const na = 4 * 1; //         12: four groups of two, four of one
    const apac = 2 * 1; //       10: two groups of two, six of one
    const sa = 0; //              6: one per group, nobody meets

    expect(collisionsIn(groups, labelOf)).toBe(eu + na + apac + sa);
  });

  /**
   * The greedy pass alone is not optimal, so it is repaired until no single
   * swap improves it. That property is worth asserting directly rather than
   * trusting a total.
   */
  it('leaves no swap that would remove a collision', () => {
    const spec = [repeat('EU', 9), repeat('NA', 7), repeat('APAC', 5), repeat('SA', 3)].join(' ');
    const { labelOf } = fieldOf(spec);
    const groups = draw(spec, 6);
    const before = collisionsIn(groups, labelOf);

    for (let i = 0; i < groups.length; i += 1) {
      for (let j = i + 1; j < groups.length; j += 1) {
        for (const here of groups[i] ?? []) {
          for (const there of groups[j] ?? []) {
            const swapped = groups.map((group) =>
              group.map((slot) => (slot === here ? there : slot === there ? here : slot)),
            );
            expect(collisionsIn(swapped, labelOf)).toBeGreaterThanOrEqual(before);
          }
        }
      }
    }
  });

  /**
   * Two teams with no region recorded are not known to share one. Treating the
   * blank as a region would spread them apart for no reason, and worse, would
   * push teams that really do share a region together to make room.
   */
  it('does not treat a missing label as a region of its own', () => {
    const spec = [repeat('EU', 4), '- - - -'].join(' ');
    const { labelOf } = fieldOf(spec);
    const groups = draw(spec, 4);

    expect(collisionsIn(groups, labelOf)).toBe(0);
    for (const group of groups) {
      expect(group.filter((slot) => labelOf(slot) === 'EU')).toHaveLength(1);
    }
  });

  it('ignores the case and padding a region was typed with', () => {
    const groups = draw('EU  eu  " EU "  NA'.replace(/"/g, ''), 2);
    const labelOf = (slot: number): string | undefined => ['EU', 'eu', ' EU ', 'NA'][slot - 1];
    expect(collisionsIn(groups, labelOf)).toBe(1);
  });

  describe('reproducibility', () => {
    const spec = [repeat('EU', 9), repeat('NA', 7)].join(' ');

    it('draws the same groups for the same seed', () => {
      expect(draw(spec, 4, 'stage-a')).toEqual(draw(spec, 4, 'stage-a'));
    });

    /** Two tournaments drawn from the same field must not get the same groups. */
    it('draws differently for a different seed', () => {
      const a = draw(spec, 4, 'stage-a');
      const b = draw(spec, 4, 'stage-b');
      expect(a).not.toEqual(b);
    });

    /** A draw that always seated slot 1 in group A would not be a draw. */
    it('does not always place the first entry in the first group', () => {
      const seeds = Array.from({ length: 20 }, (_, i) => `stage-${String(i)}`);
      const firstGroups = seeds.map((seed) =>
        draw(spec, 4, seed).findIndex((group) => group.includes(1)),
      );
      expect(new Set(firstGroups).size).toBeGreaterThan(1);
    });
  });

  describe('degenerate fields', () => {
    it('returns empty groups for an empty field', () => {
      expect(draw('', 4)).toEqual([[], [], [], []]);
    });

    it('puts everyone in one group when there is only one', () => {
      expect(sizes(draw(repeat('EU', 5), 1))).toEqual([5]);
    });

    it('copes with more groups than entries', () => {
      const groups = draw('EU NA', 4);
      expect(groups.flat()).toHaveLength(2);
      expect(sizes(groups)).toEqual([1, 1, 0, 0]);
    });

    it('treats a group count below one as one group', () => {
      expect(sizes(draw(repeat('EU', 3), 0))).toEqual([3]);
    });
  });
});

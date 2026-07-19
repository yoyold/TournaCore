import { describe, expect, it } from 'vitest';

import { InvariantError } from '@utils/invariant';

import {
  byeCount,
  matchesPerRound,
  nextPowerOfTwo,
  roundCount,
  seedOrder,
  singleEliminationMatchCount,
} from './bracketMath';

describe('nextPowerOfTwo', () => {
  it.each([
    [0, 1],
    [1, 1],
    [2, 2],
    [3, 4],
    [5, 8],
    [8, 8],
    [13, 16],
    [17, 32],
    [128, 128],
  ])('nextPowerOfTwo(%i) === %i', (input, expected) => {
    expect(nextPowerOfTwo(input)).toBe(expected);
  });

  it('rejects negative values', () => {
    expect(() => nextPowerOfTwo(-1)).toThrow(InvariantError);
  });

  it('rejects fractional values', () => {
    expect(() => nextPowerOfTwo(4.5)).toThrow(InvariantError);
  });
});

describe('byeCount', () => {
  it('assigns no byes for powers of two', () => {
    for (const n of [2, 4, 8, 16, 32, 64, 128]) {
      expect(byeCount(n)).toBe(0);
    }
  });

  it('computes byes for uneven participant counts', () => {
    expect(byeCount(13)).toBe(3);
    expect(byeCount(3)).toBe(1);
    expect(byeCount(5)).toBe(3);
    expect(byeCount(100)).toBe(28);
  });

  it('handles degenerate cases', () => {
    expect(byeCount(0)).toBe(0);
    expect(byeCount(1)).toBe(0);
  });
});

describe('roundCount', () => {
  it.each([
    [2, 1],
    [4, 2],
    [8, 3],
    [13, 4],
    [16, 4],
    [128, 7],
  ])('roundCount(%i) === %i', (input, expected) => {
    expect(roundCount(input)).toBe(expected);
  });

  it('has no rounds without an opponent', () => {
    expect(roundCount(0)).toBe(0);
    expect(roundCount(1)).toBe(0);
  });
});

describe('singleEliminationMatchCount', () => {
  it('needs n-1 matches to determine a winner', () => {
    for (const n of [2, 3, 4, 7, 8, 13, 16, 100]) {
      expect(singleEliminationMatchCount(n)).toBe(n - 1);
    }
  });

  it('adds the third place match', () => {
    expect(singleEliminationMatchCount(8, { thirdPlaceMatch: true })).toBe(8);
    expect(singleEliminationMatchCount(4, { thirdPlaceMatch: true })).toBe(4);
  });

  it('skips the third place match when there can be no third place', () => {
    expect(singleEliminationMatchCount(2, { thirdPlaceMatch: true })).toBe(1);
    expect(singleEliminationMatchCount(3, { thirdPlaceMatch: true })).toBe(2);
  });

  it('handles degenerate cases', () => {
    expect(singleEliminationMatchCount(0)).toBe(0);
    expect(singleEliminationMatchCount(1)).toBe(0);
  });
});

describe('matchesPerRound', () => {
  it('halves the field each round', () => {
    expect(matchesPerRound(16)).toEqual([8, 4, 2, 1]);
    expect(matchesPerRound(8)).toEqual([4, 2, 1]);
  });

  it('rounds uneven participant counts up to the bracket size', () => {
    expect(matchesPerRound(13)).toEqual([8, 4, 2, 1]);
  });

  it('sums to the match count of the padded bracket size', () => {
    for (const n of [4, 8, 13, 16, 32]) {
      const total = matchesPerRound(n).reduce((a, b) => a + b, 0);
      expect(total).toBe(nextPowerOfTwo(n) - 1);
    }
  });

  it('returns an empty list for degenerate cases', () => {
    expect(matchesPerRound(1)).toEqual([]);
  });
});

describe('seedOrder', () => {
  it('produces the conventional standard order', () => {
    expect(seedOrder(2)).toEqual([1, 2]);
    expect(seedOrder(4)).toEqual([1, 4, 3, 2]);
    expect(seedOrder(8)).toEqual([1, 8, 5, 4, 3, 6, 7, 2]);
  });

  it('pairs first round slots to a constant seed sum', () => {
    // The defining property: seed 1 faces the weakest, seed 2 the second
    // weakest, and so on.
    for (const size of [2, 4, 8, 16, 32, 64]) {
      const order = seedOrder(size);
      for (let i = 0; i < order.length; i += 2) {
        expect(order[i]! + order[i + 1]!).toBe(size + 1);
      }
    }
  });

  it('contains every seed exactly once', () => {
    for (const size of [4, 8, 16, 64]) {
      const order = seedOrder(size);
      expect(new Set(order).size).toBe(size);
      expect(Math.min(...order)).toBe(1);
      expect(Math.max(...order)).toBe(size);
    }
  });

  it('places seeds 1 and 2 at opposite ends', () => {
    // So they can only meet in the final.
    for (const size of [4, 8, 16, 32]) {
      const order = seedOrder(size);
      expect(order[0]).toBe(1);
      expect(order[order.length - 1]).toBe(2);
    }
  });

  it('rejects sizes that are not powers of two', () => {
    expect(() => seedOrder(6)).toThrow(InvariantError);
    expect(() => seedOrder(13)).toThrow(InvariantError);
  });

  it('handles the degenerate case size = 1', () => {
    expect(seedOrder(1)).toEqual([1]);
  });
});

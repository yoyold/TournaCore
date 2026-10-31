import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SWISS_TIEBREAKERS,
  DEFAULT_TIEBREAKERS,
  isPinnedTiebreaker,
  moveTiebreaker,
  type Tiebreaker,
} from './stage';

describe('isPinnedTiebreaker', () => {
  it('pins what the chain depends on and nothing else', () => {
    expect(isPinnedTiebreaker('points')).toBe(true);
    expect(isPinnedTiebreaker('seed')).toBe(true);
    expect(isPinnedTiebreaker('head_to_head')).toBe(false);
    expect(isPinnedTiebreaker('map_difference')).toBe(false);
  });
});

describe('moveTiebreaker', () => {
  /** The reason the control exists: map difference ahead of the direct match. */
  it('lifts a criterion past the one in front of it', () => {
    expect(moveTiebreaker(DEFAULT_TIEBREAKERS, 'map_difference', -1)).toEqual([
      'points',
      'map_difference',
      'head_to_head',
      'round_difference',
      'seed',
    ]);
  });

  it('drops a criterion behind the one after it', () => {
    expect(moveTiebreaker(DEFAULT_TIEBREAKERS, 'head_to_head', 1)).toEqual([
      'points',
      'map_difference',
      'head_to_head',
      'round_difference',
      'seed',
    ]);
  });

  /** Points first and seed last are what make the order a total one. */
  it('never moves a pinned criterion', () => {
    expect(moveTiebreaker(DEFAULT_TIEBREAKERS, 'points', 1)).toEqual([...DEFAULT_TIEBREAKERS]);
    expect(moveTiebreaker(DEFAULT_TIEBREAKERS, 'seed', -1)).toEqual([...DEFAULT_TIEBREAKERS]);
  });

  /** A pinned criterion is passed over rather than swapped with. */
  it('keeps the pinned criteria in their own places', () => {
    const moved = moveTiebreaker(DEFAULT_TIEBREAKERS, 'head_to_head', -1);

    expect(moved[0]).toBe('points');
    expect(moved.at(-1)).toBe('seed');
    expect(moved).toEqual([...DEFAULT_TIEBREAKERS]);
  });

  it('stops at the end of the chain instead of wrapping around', () => {
    expect(moveTiebreaker(DEFAULT_TIEBREAKERS, 'round_difference', 1)).toEqual([
      ...DEFAULT_TIEBREAKERS,
    ]);
  });

  it('leaves a chain it was asked about a criterion outside of alone', () => {
    expect(moveTiebreaker(DEFAULT_TIEBREAKERS, 'buchholz', -1)).toEqual([...DEFAULT_TIEBREAKERS]);
  });

  it('works on the longer Swiss chain too', () => {
    expect(moveTiebreaker(DEFAULT_SWISS_TIEBREAKERS, 'map_difference', -1)).toEqual([
      'points',
      'buchholz',
      'median_buchholz',
      'map_difference',
      'head_to_head',
      'seed',
    ]);
  });

  it('returns a copy rather than reordering the chain it was given', () => {
    const chain: Tiebreaker[] = [...DEFAULT_TIEBREAKERS];

    moveTiebreaker(chain, 'map_difference', -1);

    expect(chain).toEqual([...DEFAULT_TIEBREAKERS]);
  });
});

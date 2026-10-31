import { describe, expect, it } from 'vitest';

import { asId, type GameResult, type MatchFormat } from '@models/index';

import {
  gamesFromSeries,
  isPlayableSeries,
  looksLikeSeriesInOneMap,
  seriesLimits,
  seriesOf,
} from './seriesScore';

const BO1: MatchFormat = { kind: 'single_game' };
const BO3: MatchFormat = { kind: 'bo', games: 3 };
const BO5: MatchFormat = { kind: 'bo', games: 5 };

let counter = 0;
const newId = (): GameResult['id'] => {
  counter += 1;
  return asId<GameResult['id']>(`g${String(counter)}`);
};

function map(winner: 'A' | 'B' | undefined, scoreA = 0, scoreB = 0): GameResult {
  return { id: newId(), index: 1, scoreA, scoreB, ...(winner ? { winner } : {}) };
}

describe('seriesLimits', () => {
  it('reads the wins a format needs and the maps it can run to', () => {
    expect(seriesLimits(BO3)).toEqual({ needed: 2, maxMaps: 3 });
    expect(seriesLimits(BO5)).toEqual({ needed: 3, maxMaps: 5 });
    expect(seriesLimits(BO1)).toEqual({ needed: 1, maxMaps: 1 });
  });
});

describe('isPlayableSeries', () => {
  it('accepts the scores a best of three can end on', () => {
    expect(isPlayableSeries({ winsA: 2, winsB: 0 }, BO3)).toBe(true);
    expect(isPlayableSeries({ winsA: 2, winsB: 1 }, BO3)).toBe(true);
    expect(isPlayableSeries({ winsA: 0, winsB: 2 }, BO3)).toBe(true);
  });

  /** A series stops the moment somebody reaches the required wins. */
  it('rejects a score that would mean playing on after it was over', () => {
    expect(isPlayableSeries({ winsA: 3, winsB: 1 }, BO3)).toBe(false);
    expect(isPlayableSeries({ winsA: 3, winsB: 0 }, BO3)).toBe(false);
  });

  it('rejects an unfinished or tied series', () => {
    expect(isPlayableSeries({ winsA: 1, winsB: 1 }, BO3)).toBe(false);
    expect(isPlayableSeries({ winsA: 1, winsB: 0 }, BO3)).toBe(false);
    expect(isPlayableSeries({ winsA: 0, winsB: 0 }, BO3)).toBe(false);
    expect(isPlayableSeries({ winsA: 2, winsB: 2 }, BO3)).toBe(false);
  });

  it('rejects nonsense outright', () => {
    expect(isPlayableSeries({ winsA: -1, winsB: 2 }, BO3)).toBe(false);
    expect(isPlayableSeries({ winsA: 1.5, winsB: 2 }, BO3)).toBe(false);
  });

  it('handles a best of one, where the series is the map', () => {
    expect(isPlayableSeries({ winsA: 1, winsB: 0 }, BO1)).toBe(true);
    expect(isPlayableSeries({ winsA: 1, winsB: 1 }, BO1)).toBe(false);
  });
});

describe('gamesFromSeries', () => {
  it('produces one map per win, to the side that took it', () => {
    const games = gamesFromSeries({ score: { winsA: 2, winsB: 1 }, newId });

    expect(games).toHaveLength(3);
    expect(games.filter((game) => game.winner === 'A')).toHaveLength(2);
    expect(games.filter((game) => game.winner === 'B')).toHaveLength(1);
  });

  it('numbers the maps from one', () => {
    const games = gamesFromSeries({ score: { winsA: 3, winsB: 0 }, newId });
    expect(games.map((game) => game.index)).toEqual([1, 2, 3]);
  });

  /**
   * A series score says how many maps each side took and nothing about what
   * happened inside them. Inventing a score would be making data up.
   */
  it('claims nothing about the score inside a map', () => {
    const games = gamesFromSeries({ score: { winsA: 2, winsB: 0 }, newId });
    expect(games.every((game) => game.scoreA === 0 && game.scoreB === 0)).toBe(true);
  });

  it('round trips through the tally it was built from', () => {
    const score = { winsA: 3, winsB: 2 };
    expect(seriesOf(gamesFromSeries({ score, newId }))).toEqual(score);
  });
});

describe('seriesOf', () => {
  it('counts map wins, ignoring maps nobody won', () => {
    expect(seriesOf([map('A'), map('B'), map(undefined), map('A')])).toEqual({
      winsA: 2,
      winsB: 1,
    });
  });
});

/**
 * The trap: a finished best-of-three written as "2:1" on the single map row the
 * panel used to offer. It reads as one map won 2-1 — one win out of two — so the
 * match stays open and the result counts for nothing.
 */
describe('looksLikeSeriesInOneMap', () => {
  it('recognises a series score typed into the only map', () => {
    expect(looksLikeSeriesInOneMap([map('A', 2, 1)], BO3)).toEqual({ winsA: 2, winsB: 1 });
    expect(looksLikeSeriesInOneMap([map('B', 0, 2)], BO3)).toEqual({ winsA: 0, winsB: 2 });
    expect(looksLikeSeriesInOneMap([map('A', 3, 2)], BO5)).toEqual({ winsA: 3, winsB: 2 });
  });

  it('leaves a genuine map score alone', () => {
    expect(looksLikeSeriesInOneMap([map('A', 13, 7)], BO3)).toBeUndefined();
    expect(looksLikeSeriesInOneMap([map('A', 16, 14)], BO3)).toBeUndefined();
  });

  it('leaves a series that already counts alone', () => {
    expect(looksLikeSeriesInOneMap([map('A'), map('A')], BO3)).toBeUndefined();
  });

  it('only ever reads a single row that way', () => {
    expect(looksLikeSeriesInOneMap([map('A', 2, 1), map('B', 1, 2)], BO3)).toBeUndefined();
  });

  it('leaves an empty record alone', () => {
    expect(looksLikeSeriesInOneMap([], BO3)).toBeUndefined();
  });

  /** A best of one is its own series, so nothing can be misread. */
  it('never reinterprets a best of one', () => {
    expect(looksLikeSeriesInOneMap([map('A', 1, 0)], BO1)).toBeUndefined();
  });

  it('refuses a row that is not a score this format could end on', () => {
    expect(looksLikeSeriesInOneMap([map('A', 3, 1)], BO3)).toBeUndefined();
    expect(looksLikeSeriesInOneMap([map(undefined, 1, 1)], BO3)).toBeUndefined();
  });
});

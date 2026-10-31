import { gamesToWin, type GameResult, type GameResultId, type MatchFormat } from '@models/index';

/**
 * Recording a best-of series by its series score rather than map by map.
 *
 * "2:1" is how a result is usually written down and how most sources publish
 * one, and an organiser entering an archive of finished events rarely has the
 * individual maps at all. The engine counts map wins, so a series score is
 * stored as the map wins it is made of, with the scores inside each map left
 * unknown — which is exactly what is known and nothing more.
 */

export interface SeriesScore {
  winsA: number;
  winsB: number;
}

/** Map wins the format requires, and the most a series can run to. */
export function seriesLimits(format: MatchFormat): { needed: number; maxMaps: number } {
  return {
    needed: gamesToWin(format),
    maxMaps: format.kind === 'single_game' ? 1 : format.games,
  };
}

/**
 * Whether a series score is one this format could actually produce.
 *
 * A series ends the moment one side reaches the required wins, so the winner is
 * on exactly that number and the loser below it.
 */
export function isPlayableSeries(score: SeriesScore, format: MatchFormat): boolean {
  const { needed, maxMaps } = seriesLimits(format);
  const high = Math.max(score.winsA, score.winsB);
  const low = Math.min(score.winsA, score.winsB);

  return (
    Number.isInteger(score.winsA) &&
    Number.isInteger(score.winsB) &&
    low >= 0 &&
    high === needed &&
    low < needed &&
    high + low <= maxMaps
  );
}

/**
 * The maps a series score consists of.
 *
 * The order is not a claim about the order they were played in — that is not
 * something a series score records. What it carries is the count, which is what
 * every table and rating in the application reads.
 */
export function gamesFromSeries(input: {
  score: SeriesScore;
  newId: () => GameResultId;
}): GameResult[] {
  const { score, newId } = input;
  const games: GameResult[] = [];

  const push = (winner: 'A' | 'B'): void => {
    games.push({ id: newId(), index: games.length + 1, scoreA: 0, scoreB: 0, winner });
  };

  for (let i = 0; i < score.winsA; i += 1) push('A');
  for (let i = 0; i < score.winsB; i += 1) push('B');

  return games;
}

/**
 * A series score read off maps already recorded.
 *
 * Used to show the panel what is currently stored, whichever way it was entered.
 */
export function seriesOf(games: readonly GameResult[]): SeriesScore {
  let winsA = 0;
  let winsB = 0;
  for (const game of games) {
    if (game.winner === 'A') winsA += 1;
    else if (game.winner === 'B') winsB += 1;
  }
  return { winsA, winsB };
}

/**
 * Whether the stored maps look like a series score typed into the first map.
 *
 * The trap this detects: a best-of-three entered as a single map reading "2:1".
 * It is a complete, decided series written on the only row the panel offered,
 * and the engine reads it as one map won by the side that scored more — one map
 * win out of the two needed, so the match stays open and the table ignores it.
 *
 * Deliberately narrow. The maps have to be a single row, the row has to read as
 * a score this format could only ever produce as a series, and the match has to
 * be undecided — a series that already counts is never reinterpreted.
 */
export function looksLikeSeriesInOneMap(
  games: readonly GameResult[],
  format: MatchFormat,
): SeriesScore | undefined {
  const { needed } = seriesLimits(format);
  // A best-of-one is its own series; there is nothing to misread.
  if (needed < 2 || games.length !== 1) return undefined;

  const only = games[0];
  if (!only) return undefined;

  const score: SeriesScore = { winsA: only.scoreA, winsB: only.scoreB };
  if (!isPlayableSeries(score, format)) return undefined;

  // Already decided as maps: leave it alone, whatever it looks like.
  const tally = seriesOf(games);
  if (tally.winsA >= needed || tally.winsB >= needed) return undefined;

  return score;
}

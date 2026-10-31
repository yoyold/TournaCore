import { describe, expect, it } from 'vitest';

import {
  asId,
  now,
  type GameResult,
  type Match,
  type MatchFormat,
  type StageId,
  type TournamentId,
} from '@models/index';

import { repairSeriesScores } from './seriesScores';

const CUP = asId<TournamentId>('t1');
const OTHER = asId<TournamentId>('t2');
const STAGE = asId<StageId>('s1');

const tournaments = [
  { id: CUP, name: 'Ruhm Cup' },
  { id: OTHER, name: 'Zweiter Cup' },
];

let counter = 0;

function match(options: {
  games: { scoreA: number; scoreB: number }[];
  format?: MatchFormat;
  tournamentId?: TournamentId;
  outcome?: Match['outcome'];
}): Match {
  counter += 1;
  const id = asId<Match['id']>(`${STAGE}/main/r0/m${String(counter)}`);

  return {
    id,
    tournamentId: options.tournamentId ?? CUP,
    stageId: STAGE,
    position: { round: 0, indexInRound: counter },
    slotA: { kind: 'seeded', slotIndex: 1 },
    slotB: { kind: 'seeded', slotIndex: 2 },
    format: options.format ?? { kind: 'bo', games: 3 },
    games: options.games.map((game, index): GameResult => {
      counter += 1;
      return {
        id: asId<GameResult['id']>(`g${String(counter)}`),
        index: index + 1,
        scoreA: game.scoreA,
        scoreB: game.scoreB,
        ...(game.scoreA === game.scoreB
          ? {}
          : { winner: game.scoreA > game.scoreB ? ('A' as const) : ('B' as const) }),
      };
    }),
    ...(options.outcome ? { outcome: options.outcome } : {}),
    createdAt: now(),
    updatedAt: '2026-01-01T12:00:00.000Z',
  };
}

describe('repairSeriesScores', () => {
  it('expands a series score written on the only map', () => {
    const stored = match({ games: [{ scoreA: 2, scoreB: 1 }] });

    const [entry] = repairSeriesScores({ tournaments, matches: [stored] });

    expect(entry?.name).toBe('Ruhm Cup');
    const repaired = entry?.matches[0];
    expect(repaired?.games).toHaveLength(3);
    expect(repaired?.outcome?.winner).toBe('A');
    expect(repaired?.outcome?.reason).toBe('played');
  });

  /** The whole point: it was stored and counted for nothing. */
  it('turns a result that decided nothing into one that decides the match', () => {
    const stored = match({ games: [{ scoreA: 0, scoreB: 2 }] });
    expect(stored.outcome).toBeUndefined();

    const repaired = repairSeriesScores({ tournaments, matches: [stored] })[0]?.matches[0];
    expect(repaired?.outcome?.winner).toBe('B');
  });

  /**
   * Elo folds results in sequence, so stamping a correction with the moment of
   * the repair would reorder an archive the same way a bulk import once did.
   */
  it('dates the result from the record rather than from the repair', () => {
    const stored = match({ games: [{ scoreA: 2, scoreB: 0 }] });

    const repaired = repairSeriesScores({ tournaments, matches: [stored] })[0]?.matches[0];
    expect(repaired?.outcome?.decidedAt).toBe('2026-01-01T12:00:00.000Z');
  });

  it('keeps who won exactly as recorded', () => {
    const stored = match({ games: [{ scoreA: 1, scoreB: 2 }] });

    const repaired = repairSeriesScores({ tournaments, matches: [stored] })[0]?.matches[0];
    expect(repaired?.games.filter((game) => game.winner === 'B')).toHaveLength(2);
    expect(repaired?.games.filter((game) => game.winner === 'A')).toHaveLength(1);
  });

  it('leaves a genuine map score alone', () => {
    const stored = match({ games: [{ scoreA: 13, scoreB: 7 }] });
    expect(repairSeriesScores({ tournaments, matches: [stored] })).toEqual([]);
  });

  it('leaves a series that already counts alone', () => {
    const stored = match({
      games: [
        { scoreA: 13, scoreB: 7 },
        { scoreA: 13, scoreB: 9 },
      ],
    });

    expect(repairSeriesScores({ tournaments, matches: [stored] })).toEqual([]);
  });

  /** A walkover is somebody's decision, not a misreading. */
  it('leaves an explicitly recorded outcome alone', () => {
    const stored = match({
      games: [{ scoreA: 2, scoreB: 1 }],
      outcome: { winner: 'A', reason: 'walkover', decidedAt: '2026-01-01T12:00:00.000Z' },
    });

    expect(repairSeriesScores({ tournaments, matches: [stored] })).toEqual([]);
  });

  it('groups what it finds by tournament', () => {
    const matches = [
      match({ games: [{ scoreA: 2, scoreB: 1 }] }),
      match({ games: [{ scoreA: 2, scoreB: 0 }] }),
      match({ games: [{ scoreA: 1, scoreB: 2 }], tournamentId: OTHER }),
    ];

    const repaired = repairSeriesScores({ tournaments, matches });

    expect(repaired).toHaveLength(2);
    expect(repaired[0]?.matches).toHaveLength(2);
    expect(repaired[1]?.matches).toHaveLength(1);
  });

  it('finds nothing in an archive that has nothing wrong with it', () => {
    expect(repairSeriesScores({ tournaments, matches: [] })).toEqual([]);
  });
});

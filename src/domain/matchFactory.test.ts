import { describe, expect, it } from 'vitest';

import {
  asId,
  type GameResult,
  type GameResultId,
  type Match,
  type MatchOutcome,
  type StageId,
  type TournamentId,
} from '@models/index';

import { applyMatchResult, clearMatchResult, materializeMatch } from './matchFactory';

import type { StructuralMatch } from './formats/types';

const TOURNAMENT = asId<TournamentId>('t1');
const STAGE = asId<StageId>('s1');
const TIMESTAMP = '2026-02-01T12:00:00.000Z';

const structural: StructuralMatch = {
  id: asId<Match['id']>('s1/winner/r1/m0'),
  position: { bracket: 'winner', round: 1, indexInRound: 0 },
  slotA: { kind: 'winner_of', matchId: asId<Match['id']>('s1/winner/r0/m0') },
  slotB: { kind: 'winner_of', matchId: asId<Match['id']>('s1/winner/r0/m1') },
  format: { kind: 'bo', games: 3 },
};

const game = (index: number, scoreA: number, scoreB: number): GameResult => ({
  id: asId<GameResultId>(`g${String(index)}`),
  index,
  scoreA,
  scoreB,
  ...(scoreA === scoreB ? {} : { winner: scoreA > scoreB ? ('A' as const) : ('B' as const) }),
});

const apply = (
  games: GameResult[],
  overrides: Partial<Parameters<typeof applyMatchResult>[0]> = {},
) =>
  applyMatchResult({
    existing: undefined,
    structural,
    tournamentId: TOURNAMENT,
    stageId: STAGE,
    games,
    timestamp: TIMESTAMP,
    ...overrides,
  });

describe('materializeMatch', () => {
  it('adopts the identifier from the structure', () => {
    const match = materializeMatch({
      structural,
      tournamentId: TOURNAMENT,
      stageId: STAGE,
      timestamp: TIMESTAMP,
    });

    // The identifier is derived from stage and position, so the new record
    // attaches to exactly the match that was clicked.
    expect(match.id).toBe(structural.id);
    expect(match.position).toEqual(structural.position);
  });

  it('starts without games or an outcome', () => {
    const match = materializeMatch({
      structural,
      tournamentId: TOURNAMENT,
      stageId: STAGE,
      timestamp: TIMESTAMP,
    });

    expect(match.games).toEqual([]);
    expect(match.outcome).toBeUndefined();
  });
});

describe('applyMatchResult', () => {
  it('creates a record for a match that was never stored', () => {
    const match = apply([game(1, 13, 7), game(2, 13, 9)]);

    expect(match.id).toBe(structural.id);
    expect(match.games).toHaveLength(2);
    expect(match.createdAt).toBe(TIMESTAMP);
  });

  it('derives the outcome once the series is decided', () => {
    const match = apply([game(1, 13, 7), game(2, 9, 13), game(3, 13, 11)]);

    expect(match.outcome?.winner).toBe('A');
    expect(match.outcome?.reason).toBe('played');
  });

  it('leaves a half-played series open', () => {
    // Best of three needs two map wins; one is not a result.
    const match = apply([game(1, 13, 7)]);

    expect(match.outcome).toBeUndefined();
  });

  it('lets an explicit outcome override the maps', () => {
    const forfeit: MatchOutcome = { winner: 'B', reason: 'forfeit', decidedAt: TIMESTAMP };
    const match = apply([game(1, 13, 0), game(2, 13, 0)], { outcome: forfeit });

    expect(match.outcome).toEqual(forfeit);
  });

  it('keeps user-entered fields of an existing record', () => {
    const existing: Match = {
      ...materializeMatch({
        structural,
        tournamentId: TOURNAMENT,
        stageId: STAGE,
        timestamp: '2026-01-01T00:00:00.000Z',
      }),
      notes: 'Verzögerung wegen technischer Pause',
      streamUrl: 'https://example.invalid/stream',
      scheduledAt: '2026-02-01T18:00:00.000Z',
    };

    const match = apply([game(1, 13, 7), game(2, 13, 4)], { existing });

    expect(match.notes).toBe('Verzögerung wegen technischer Pause');
    expect(match.streamUrl).toBe('https://example.invalid/stream');
    expect(match.scheduledAt).toBe('2026-02-01T18:00:00.000Z');
    expect(match.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(match.updatedAt).toBe(TIMESTAMP);
  });

  it('takes the participants from the structure, not from the stored record', () => {
    // A stored slot can be stale after the bracket was regenerated.
    const existing: Match = {
      ...materializeMatch({
        structural,
        tournamentId: TOURNAMENT,
        stageId: STAGE,
        timestamp: TIMESTAMP,
      }),
      slotA: { kind: 'tbd' },
      slotB: { kind: 'tbd' },
    };

    const match = apply([], { existing });

    expect(match.slotA).toEqual(structural.slotA);
    expect(match.slotB).toEqual(structural.slotB);
  });

  it('is pure: the same input yields the same record', () => {
    const games = [game(1, 13, 7), game(2, 13, 4)];
    expect(apply(games)).toEqual(apply(games));
  });
});

describe('clearMatchResult', () => {
  it('removes games and outcome', () => {
    const decided = apply([game(1, 13, 7), game(2, 13, 4)]);
    const cleared = clearMatchResult(decided, '2026-02-02T00:00:00.000Z');

    expect(cleared.games).toEqual([]);
    expect(cleared.outcome).toBeUndefined();
    expect('outcome' in cleared).toBe(false);
  });

  it('keeps everything the user typed', () => {
    const decided: Match = {
      ...apply([game(1, 13, 7), game(2, 13, 4)]),
      notes: 'Behalten',
      vodUrl: 'https://example.invalid/vod',
    };

    const cleared = clearMatchResult(decided, TIMESTAMP);

    expect(cleared.notes).toBe('Behalten');
    expect(cleared.vodUrl).toBe('https://example.invalid/vod');
  });
});

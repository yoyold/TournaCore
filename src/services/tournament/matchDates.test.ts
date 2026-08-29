import { describe, expect, it } from 'vitest';

import {
  asId,
  now,
  type Match,
  type MatchId,
  type MatchSlot,
  type Stage,
  type StageId,
  type Tournament,
  type TournamentId,
} from '@models/index';

import { repairMatchDates } from './matchDates';

const TOURNAMENT = asId<TournamentId>('t1');
const STAGE = asId<StageId>('s1');
const IMPORTED_AT = '2026-08-27T10:00:00.000Z';

function tournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: TOURNAMENT,
    name: 'Ancient Cup',
    slug: 'ancient-cup',
    gameId: asId<Tournament['gameId']>('g1'),
    status: 'completed',
    participants: [],
    stageIds: [STAGE],
    createdAt: '2019-05-04T00:00:00.000Z',
    updatedAt: now(),
    ...overrides,
  };
}

function stage(id: StageId = STAGE, order = 0): Stage {
  return {
    id,
    tournamentId: TOURNAMENT,
    name: 'Main',
    order,
    format: {
      kind: 'single_elimination',
      thirdPlaceMatch: false,
      byePlacement: 'seeded',
      matchFormats: { default: { kind: 'bo', games: 1 } },
    },
    entrySeeding: [],
    createdAt: now(),
    updatedAt: now(),
  };
}

function match(
  id: string,
  decidedAt: string,
  options: { round?: number; index?: number; stageId?: StageId; slotA?: MatchSlot } = {},
): Match {
  return {
    id: asId<MatchId>(id),
    tournamentId: TOURNAMENT,
    stageId: options.stageId ?? STAGE,
    position: { round: options.round ?? 0, indexInRound: options.index ?? 0 },
    slotA: options.slotA ?? { kind: 'seeded', slotIndex: 1 },
    slotB: { kind: 'seeded', slotIndex: 2 },
    format: { kind: 'bo', games: 1 },
    games: [],
    outcome: { winner: 'A', reason: 'played', decidedAt },
    createdAt: now(),
    updatedAt: now(),
  };
}

const winnerOf = (id: string): MatchSlot => ({ kind: 'winner_of', matchId: asId<MatchId>(id) });

/** Two results stamped at the same instant: the fingerprint of a bulk write. */
const bulk = (): Match[] => [
  match('r1', IMPORTED_AT, { round: 1, slotA: winnerOf('r0m0') }),
  match('r0m0', IMPORTED_AT, { round: 0, index: 0 }),
  match('r0m1', IMPORTED_AT, { round: 0, index: 1 }),
];

const repair = (matches: Match[], overrides: Partial<Tournament> = {}) =>
  repairMatchDates({
    tournaments: [tournament(overrides)],
    stages: [stage()],
    matches,
  });

describe('repairMatchDates', () => {
  it('moves bulk-stamped results onto the date the tournament was played', () => {
    const [entry] = repair(bulk());

    expect(entry?.name).toBe('Ancient Cup');
    expect(entry?.playedAt).toBe('2019-05-04T00:00:00.000Z');
    for (const updated of entry?.matches ?? []) {
      expect(updated.outcome?.decidedAt.slice(0, 10)).toBe('2019-05-04');
    }
  });

  it('prefers the date the tournament started over the date it was created', () => {
    const [entry] = repair(bulk(), { startsAt: '2018-01-02T00:00:00.000Z' });
    expect(entry?.playedAt).toBe('2018-01-02T00:00:00.000Z');
  });

  /** The whole point: Elo folds results in sequence, so the sequence must be real. */
  it('re-dates them in the order they could have been played', () => {
    const [entry] = repair(bulk());
    const order = [...(entry?.matches ?? [])].sort((a, b) =>
      (a.outcome?.decidedAt ?? '').localeCompare(b.outcome?.decidedAt ?? ''),
    );

    expect(order.map((updated) => updated.id)).toEqual(['r0m0', 'r0m1', 'r1']);
  });

  it('gives every result its own moment', () => {
    const [entry] = repair(bulk());
    const stamps = new Set((entry?.matches ?? []).map((updated) => updated.outcome?.decidedAt));
    expect(stamps.size).toBe(3);
  });

  /**
   * Results entered by hand each carry the moment they were entered, which is
   * already an order. Replacing it would discard something real.
   */
  it('leaves a tournament whose results have distinct times alone', () => {
    const entered = [
      match('r0m0', '2026-03-01T18:00:00.000Z', { round: 0, index: 0 }),
      match('r0m1', '2026-03-01T18:40:00.000Z', { round: 0, index: 1 }),
      match('r1', '2026-03-01T19:30:00.000Z', { round: 1, slotA: winnerOf('r0m0') }),
    ];

    expect(repair(entered)).toEqual([]);
  });

  it('reports nothing when the dates are already right', () => {
    const [entry] = repair(bulk());
    const alreadyRepaired = (entry?.matches ?? []).map((updated) => updated);
    expect(repair(alreadyRepaired)).toEqual([]);
  });

  it('ignores a tournament with no results at all', () => {
    expect(repair([])).toEqual([]);
  });

  it('ignores a tournament with a single result', () => {
    expect(repair([match('r0m0', IMPORTED_AT)])).toEqual([]);
  });

  it('leaves a tournament without a usable date alone', () => {
    expect(repair(bulk(), { createdAt: 'not a date' })).toEqual([]);
  });

  /** A playoff cannot be dated before the group stage that filled it. */
  it('keeps a later stage after the one that feeds it', () => {
    const second = asId<StageId>('s2');
    const matches = [
      match('p0', IMPORTED_AT, { stageId: second }),
      match('p1', IMPORTED_AT, { stageId: second, index: 1 }),
      match('g0', IMPORTED_AT, { round: 0, index: 0 }),
      match('g1', IMPORTED_AT, { round: 0, index: 1 }),
    ];

    const [entry] = repairMatchDates({
      tournaments: [tournament({ stageIds: [STAGE, second] })],
      stages: [stage(STAGE, 0), stage(second, 1)],
      matches,
    });

    const order = [...(entry?.matches ?? [])].sort((a, b) =>
      (a.outcome?.decidedAt ?? '').localeCompare(b.outcome?.decidedAt ?? ''),
    );

    expect(order.map((updated) => updated.id)).toEqual(['g0', 'g1', 'p0', 'p1']);
  });

  /** Nothing about who won what may move; only when it was recorded. */
  it('changes the time and nothing else', () => {
    const before = bulk();
    const [entry] = repair(before);

    for (const updated of entry?.matches ?? []) {
      const original = before.find((match) => match.id === updated.id);
      expect({ ...updated, outcome: undefined }).toEqual({ ...original, outcome: undefined });
      expect(updated.outcome?.winner).toBe(original?.outcome?.winner);
      expect(updated.outcome?.reason).toBe(original?.outcome?.reason);
    }
  });

  it('does not mutate the matches it was given', () => {
    const before = bulk();
    repair(before);
    expect(before.every((match) => match.outcome?.decidedAt === IMPORTED_AT)).toBe(true);
  });
});

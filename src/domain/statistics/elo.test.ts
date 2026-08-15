import { describe, expect, it } from 'vitest';

import {
  asId,
  now,
  type Match,
  type MatchOutcome,
  type Participant,
  type SeedingRule,
  type Stage,
  type StageId,
  type TeamId,
  type Tournament,
  type TournamentId,
} from '@models/index';

import { makeMatchId } from '../matchId';

import { ELO_K, ELO_START, computeEloRatings, eloLeaderboard, expectedScore } from './elo';

const STAGE = asId<StageId>('s1');
const TOURNAMENT = asId<TournamentId>('t1');

const team = (n: number): TeamId => asId<TeamId>(`team${String(n)}`);

function tournament(count: number): Tournament {
  return {
    id: TOURNAMENT,
    name: 'Test Cup',
    slug: 'test-cup',
    gameId: asId<Tournament['gameId']>('g1'),
    status: 'live',
    participants: Array.from({ length: count }, (_, i) => ({
      id: asId<Participant['id']>(`p${String(i + 1)}`),
      teamId: team(i + 1),
      seed: i + 1,
      status: 'active' as const,
    })),
    stageIds: [STAGE],
    createdAt: now(),
    updatedAt: now(),
  };
}

function stage(slots: number): Stage {
  return {
    id: STAGE,
    tournamentId: TOURNAMENT,
    name: 'Bracket',
    order: 0,
    format: {
      kind: 'single_elimination',
      thirdPlaceMatch: false,
      byePlacement: 'seeded',
      matchFormats: { default: { kind: 'bo', games: 3 } },
    },
    entrySeeding: [
      {
        id: asId<SeedingRule['id']>('rule-1'),
        source: { kind: 'participants' },
        targetSlots: { from: 1, to: slots },
        order: 'as_ranked',
      },
    ],
    createdAt: now(),
    updatedAt: now(),
  };
}

function match(
  round: number,
  indexInRound: number,
  winner: 'A' | 'B',
  options: { reason?: MatchOutcome['reason']; at?: string } = {},
): Match {
  const position = { bracket: 'winner' as const, round, indexInRound };
  return {
    id: makeMatchId(STAGE, position),
    tournamentId: TOURNAMENT,
    stageId: STAGE,
    position,
    slotA: { kind: 'tbd' },
    slotB: { kind: 'tbd' },
    format: { kind: 'bo', games: 3 },
    games: [],
    outcome: {
      winner,
      reason: options.reason ?? 'played',
      decidedAt: options.at ?? '2026-01-01T00:00:00.000Z',
    },
    createdAt: now(),
    updatedAt: now(),
  };
}

/** Four participants seed as [1, 4, 3, 2], so match 0 is team1 against team4. */
const setup = (matches: Match[], count = 4) => ({
  tournaments: [tournament(count)],
  stages: [stage(count)],
  matches,
});

/** A second tournament whose only match pairs team1 against team2. */
function secondTournament(winner: 'A' | 'B', at: string) {
  const id = asId<TournamentId>('t2');
  const stageId = asId<StageId>('s2');
  const position = { bracket: 'winner' as const, round: 0, indexInRound: 0 };

  return {
    tournament: {
      id,
      name: 'Second Cup',
      slug: 'second-cup',
      gameId: asId<Tournament['gameId']>('g1'),
      status: 'live' as const,
      participants: [
        { id: asId<Participant['id']>('q1'), teamId: team(1), seed: 1, status: 'active' as const },
        { id: asId<Participant['id']>('q2'), teamId: team(2), seed: 2, status: 'active' as const },
      ],
      stageIds: [stageId],
      createdAt: now(),
      updatedAt: now(),
    },
    stage: { ...stage(2), id: stageId, tournamentId: id },
    match: {
      ...match(0, 0, winner, { at }),
      id: makeMatchId(stageId, position),
      tournamentId: id,
      stageId,
    },
  };
}

describe('expectedScore', () => {
  it('is even between equal ratings', () => {
    expect(expectedScore(1000, 1000)).toBe(0.5);
  });

  it('favours the higher rating', () => {
    expect(expectedScore(1200, 1000)).toBeGreaterThan(0.5);
    expect(expectedScore(1000, 1200)).toBeLessThan(0.5);
  });

  it('is symmetric: the pair of expectations sums to one', () => {
    expect(expectedScore(1337, 980) + expectedScore(980, 1337)).toBeCloseTo(1, 10);
  });

  it('gives a 400-point lead roughly a ten-to-one edge', () => {
    expect(expectedScore(1400, 1000)).toBeCloseTo(10 / 11, 6);
  });
});

describe('computeEloRatings', () => {
  it('starts everyone at the same rating', () => {
    const ratings = computeEloRatings(setup([]));
    expect(ratings.size).toBe(0);

    const played = computeEloRatings(setup([match(0, 0, 'A')]));
    // Only teams that played appear; both moved away from the start value.
    expect(played.get(team(1))?.rating).toBeGreaterThan(ELO_START);
    expect(played.get(team(4))?.rating).toBeLessThan(ELO_START);
  });

  it('moves both sides by the same amount, so the exchange nets to zero', () => {
    const ratings = computeEloRatings(setup([match(0, 0, 'A')]));

    const winner = ratings.get(team(1))!;
    const loser = ratings.get(team(4))!;

    expect(winner.rating - ELO_START).toBeCloseTo(ELO_START - loser.rating, 10);
    expect(winner.rating + loser.rating).toBeCloseTo(2 * ELO_START, 10);
  });

  it('awards half the K factor when equals meet', () => {
    const ratings = computeEloRatings(setup([match(0, 0, 'A')]));
    expect(ratings.get(team(1))?.rating).toBeCloseTo(ELO_START + ELO_K / 2, 10);
  });

  /**
   * Both finalists of a single elimination bracket arrive with the same number of
   * wins, so an uneven pairing only occurs across tournaments — which is also
   * where a circuit rating earns its keep.
   */
  it('pays more for beating a stronger opponent, across tournaments', () => {
    const first = setup([
      match(0, 0, 'A', { at: '2026-01-01T00:00:00.000Z' }),
      match(0, 1, 'A', { at: '2026-01-01T01:00:00.000Z' }),
      match(1, 0, 'A', { at: '2026-01-01T02:00:00.000Z' }),
    ]);

    // A second tournament where the now-strong team1 loses to team2.
    const second = secondTournament('B', '2026-02-01T00:00:00.000Z');

    const ratings = computeEloRatings({
      tournaments: [...first.tournaments, second.tournament],
      stages: [...first.stages, second.stage],
      matches: [...first.matches, second.match],
    });

    const upsetGain = ratings.get(team(2))?.lastChange ?? 0;
    expect(upsetGain).toBeGreaterThan(ELO_K / 2);
  });

  it('counts wins, losses and matches', () => {
    const ratings = computeEloRatings(
      setup([
        match(0, 0, 'A', { at: '2026-01-01T00:00:00.000Z' }),
        match(0, 1, 'A', { at: '2026-01-02T00:00:00.000Z' }),
        match(1, 0, 'A', { at: '2026-01-03T00:00:00.000Z' }),
      ]),
    );

    expect(ratings.get(team(1))).toMatchObject({ matches: 2, wins: 2, losses: 0 });
    expect(ratings.get(team(4))).toMatchObject({ matches: 1, wins: 0, losses: 1 });
  });

  it('tracks a peak that a later loss cannot lower', () => {
    const ratings = computeEloRatings(
      setup([
        match(0, 0, 'A', { at: '2026-01-01T00:00:00.000Z' }),
        match(0, 1, 'A', { at: '2026-01-02T00:00:00.000Z' }),
        match(1, 0, 'B', { at: '2026-01-03T00:00:00.000Z' }),
      ]),
    );

    const winnerThenLoser = ratings.get(team(1))!;
    expect(winnerThenLoser.peak).toBeGreaterThan(winnerThenLoser.rating);
  });

  /**
   * Elo measures playing strength. Not turning up is not a performance, and
   * counting it would let a team climb without ever playing.
   */
  it('ignores walkovers and forfeits', () => {
    const walkover = computeEloRatings(setup([match(0, 0, 'A', { reason: 'walkover' })]));
    expect(walkover.size).toBe(0);

    const forfeit = computeEloRatings(setup([match(0, 0, 'A', { reason: 'forfeit' })]));
    expect(forfeit.size).toBe(0);
  });

  it('ignores byes, which produce no match at all', () => {
    // Three participants in a bracket of four: the top seed advances on a bye.
    const ratings = computeEloRatings(setup([], 3));
    expect(ratings.get(team(1))).toBeUndefined();
  });

  it('flags a rating as provisional until enough matches back it', () => {
    const ratings = computeEloRatings(setup([match(0, 0, 'A')]));
    expect(ratings.get(team(1))?.provisional).toBe(true);
  });

  /**
   * Elo depends on the order results arrive in, so a stable total order matters
   * more here than anywhere else in the derivation: without the identifier as a
   * tie-breaker, matches decided in the same millisecond could be processed
   * either way round and the table would shift on every reload.
   */
  it('is deterministic even when matches share a timestamp', () => {
    const sameInstant = [
      match(0, 0, 'A', { at: '2026-01-01T00:00:00.000Z' }),
      match(0, 1, 'B', { at: '2026-01-01T00:00:00.000Z' }),
    ];

    const first = eloLeaderboard(setup(sameInstant));
    // Feed the same matches in the opposite order; the result must not change.
    const second = eloLeaderboard(setup([...sameInstant].reverse()));

    expect(first.map((entry) => [entry.teamId, entry.rating])).toEqual(
      second.map((entry) => [entry.teamId, entry.rating]),
    );
  });

  it('reflects a corrected result', () => {
    const before = computeEloRatings(setup([match(0, 0, 'A')]));
    expect(before.get(team(1))?.rating).toBeGreaterThan(ELO_START);

    const after = computeEloRatings(setup([match(0, 0, 'B')]));
    expect(after.get(team(1))?.rating).toBeLessThan(ELO_START);
  });
});

describe('eloLeaderboard', () => {
  it('orders by rating, strongest first', () => {
    const board = eloLeaderboard(
      setup([
        match(0, 0, 'A', { at: '2026-01-01T00:00:00.000Z' }),
        match(0, 1, 'A', { at: '2026-01-02T00:00:00.000Z' }),
        match(1, 0, 'A', { at: '2026-01-03T00:00:00.000Z' }),
      ]),
    );

    expect(board[0]?.teamId).toBe(team(1));
    for (let i = 1; i < board.length; i += 1) {
      expect(board[i - 1]!.rating).toBeGreaterThanOrEqual(board[i]!.rating);
    }
  });

  it('is empty when nothing has been played', () => {
    expect(eloLeaderboard(setup([]))).toEqual([]);
  });
});

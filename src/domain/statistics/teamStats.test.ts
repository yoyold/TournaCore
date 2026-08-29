import { describe, expect, it } from 'vitest';

import {
  asId,
  now,
  type GameResult,
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

import { computeAllTeamStatistics, computeTeamStatistics } from './teamStats';

const STAGE = asId<StageId>('s1');
const TOURNAMENT = asId<TournamentId>('t1');

const team = (n: number): TeamId => asId<TeamId>(`team${String(n)}`);

function participants(count: number): Participant[] {
  return Array.from({ length: count }, (_, i) => ({
    id: asId<Participant['id']>(`p${String(i + 1)}`),
    teamId: team(i + 1),
    seed: i + 1,
    status: 'active' as const,
  }));
}

function tournament(count: number, overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: TOURNAMENT,
    name: 'Test Cup',
    slug: 'test-cup',
    gameId: asId<Tournament['gameId']>('g1'),
    status: 'live',
    participants: participants(count),
    stageIds: [STAGE],
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  };
}

function stage(slots = 4, overrides: Partial<Stage> = {}): Stage {
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
    ...overrides,
  };
}

const games = (winsA: number, winsB: number): GameResult[] => [
  ...Array.from({ length: winsA }, (_, i) => ({
    id: asId<GameResult['id']>(`ga${String(i)}`),
    index: i + 1,
    scoreA: 13,
    scoreB: 5,
    winner: 'A' as const,
  })),
  ...Array.from({ length: winsB }, (_, i) => ({
    id: asId<GameResult['id']>(`gb${String(i)}`),
    index: winsA + i + 1,
    scoreA: 5,
    scoreB: 13,
    winner: 'B' as const,
  })),
];

function match(
  round: number,
  indexInRound: number,
  winner: 'A' | 'B',
  options: { maps?: [number, number]; reason?: MatchOutcome['reason']; at?: string } = {},
): Match {
  const position = { bracket: 'winner' as const, round, indexInRound };
  const [a, b] = options.maps ?? (winner === 'A' ? [2, 1] : [1, 2]);
  return {
    id: makeMatchId(STAGE, position),
    tournamentId: TOURNAMENT,
    stageId: STAGE,
    position,
    slotA: { kind: 'tbd' },
    slotB: { kind: 'tbd' },
    format: { kind: 'bo', games: 3 },
    games: games(a, b),
    outcome: {
      winner,
      reason: options.reason ?? 'played',
      decidedAt: options.at ?? '2026-01-01T00:00:00.000Z',
    },
    createdAt: now(),
    updatedAt: now(),
  };
}

describe('computeAllTeamStatistics', () => {
  it('counts wins and losses of a played match', () => {
    // Four participants seed as [1, 4, 3, 2]; match 0 is team1 against team4.
    const stats = computeAllTeamStatistics({
      tournaments: [tournament(4)],
      stages: [stage(4)],
      matches: [match(0, 0, 'A')],
    });

    expect(stats.get(team(1))).toMatchObject({ wins: 1, losses: 0, matchesPlayed: 1 });
    expect(stats.get(team(4))).toMatchObject({ wins: 0, losses: 1, matchesPlayed: 1 });
  });

  it('records map scores from each team perspective', () => {
    const stats = computeAllTeamStatistics({
      tournaments: [tournament(4)],
      stages: [stage(4)],
      matches: [match(0, 0, 'A', { maps: [2, 1] })],
    });

    expect(stats.get(team(1))).toMatchObject({ mapsWon: 2, mapsLost: 1 });
    expect(stats.get(team(4))).toMatchObject({ mapsWon: 1, mapsLost: 2 });
  });

  it('computes a win rate, and reports zero rather than NaN without matches', () => {
    const stats = computeAllTeamStatistics({
      tournaments: [tournament(4)],
      stages: [stage(4)],
      matches: [match(0, 0, 'A')],
    });

    expect(stats.get(team(1))?.winRate).toBe(1);
    expect(stats.get(team(4))?.winRate).toBe(0);
    // Team 2 has not played yet but did enter.
    expect(stats.get(team(2))).toMatchObject({
      winRate: 0,
      matchesPlayed: 0,
      tournamentsEntered: 1,
    });
  });

  /**
   * Advancing past an empty slot is not a win. Counting byes would inflate the
   * win rate of exactly the strongest seeds, who receive them.
   */
  it('does not count byes as wins', () => {
    // Three participants in a bracket of four: the top seed gets a bye.
    const stats = computeAllTeamStatistics({
      tournaments: [tournament(3)],
      stages: [stage(3)],
      matches: [],
    });

    // The bye recipient has no result, while the pair that actually played does.
    expect(stats.get(team(1))).toMatchObject({ wins: 0, matchesPlayed: 0 });
    expect(stats.get(team(1))?.tournamentsEntered).toBe(1);
  });

  it('counts every entrant of a tournament', () => {
    const stats = computeAllTeamStatistics({
      tournaments: [tournament(4)],
      stages: [stage(4)],
      matches: [],
    });

    for (let i = 1; i <= 4; i += 1) {
      expect(stats.get(team(i))?.tournamentsEntered).toBe(1);
    }
  });

  it('credits a tournament win only once the tournament is complete', () => {
    const unfinished = computeAllTeamStatistics({
      tournaments: [tournament(2)],
      stages: [stage(2)],
      matches: [],
    });
    expect(unfinished.get(team(1))?.tournamentsWon).toBe(0);

    const finished = computeAllTeamStatistics({
      tournaments: [tournament(2)],
      stages: [stage(2)],
      matches: [match(0, 0, 'A')],
    });
    expect(finished.get(team(1))?.tournamentsWon).toBe(1);
    expect(finished.get(team(2))?.tournamentsWon).toBe(0);
  });

  it('builds a head-to-head record per opponent', () => {
    const stats = computeAllTeamStatistics({
      tournaments: [tournament(4)],
      stages: [stage(4)],
      matches: [match(0, 0, 'A')],
    });

    expect(stats.get(team(1))?.opponents).toEqual([{ teamId: team(4), wins: 1, losses: 0 }]);
    expect(stats.get(team(4))?.opponents).toEqual([{ teamId: team(1), wins: 0, losses: 1 }]);
  });

  it('records match history with the opposing team and tournament', () => {
    const stats = computeAllTeamStatistics({
      tournaments: [tournament(4)],
      stages: [stage(4)],
      matches: [match(0, 0, 'A')],
    });

    const history = stats.get(team(1))?.history ?? [];
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      opponentTeamId: team(4),
      won: true,
      tournamentName: 'Test Cup',
      walkover: false,
    });
  });

  it('orders history with the most recent match first', () => {
    const stats = computeAllTeamStatistics({
      tournaments: [tournament(4)],
      stages: [stage(4)],
      matches: [
        match(0, 0, 'A', { at: '2026-01-01T00:00:00.000Z' }),
        match(0, 1, 'A', { at: '2026-01-02T00:00:00.000Z' }),
        match(1, 0, 'A', { at: '2026-01-03T00:00:00.000Z' }),
      ],
    });

    const history = stats.get(team(1))?.history ?? [];
    expect(history.map((entry) => entry.playedAt)).toEqual([
      '2026-01-03T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
    ]);
  });

  it('marks a walkover as such while still counting the result', () => {
    const stats = computeAllTeamStatistics({
      tournaments: [tournament(4)],
      stages: [stage(4)],
      matches: [match(0, 0, 'A', { reason: 'walkover' })],
    });

    expect(stats.get(team(1))).toMatchObject({ wins: 1 });
    expect(stats.get(team(1))?.history[0]?.walkover).toBe(true);
  });

  it('aggregates across several tournaments', () => {
    const second: Tournament = {
      ...tournament(4),
      id: asId<TournamentId>('t2'),
      slug: 'second-cup',
      stageIds: [asId<StageId>('s2')],
      participants: participants(4).map((p) => ({
        ...p,
        id: asId<Participant['id']>(`${p.id}-b`),
      })),
    };
    const secondStage: Stage = {
      ...stage(4),
      id: asId<StageId>('s2'),
      tournamentId: second.id,
    };
    const secondMatch: Match = {
      ...match(0, 0, 'A'),
      id: makeMatchId(secondStage.id, { bracket: 'winner', round: 0, indexInRound: 0 }),
      tournamentId: second.id,
      stageId: secondStage.id,
    };

    const stats = computeAllTeamStatistics({
      tournaments: [tournament(4), second],
      stages: [stage(), secondStage],
      matches: [match(0, 0, 'A'), secondMatch],
    });

    expect(stats.get(team(1))).toMatchObject({
      wins: 2,
      matchesPlayed: 2,
      tournamentsEntered: 2,
    });
  });

  /**
   * The same property the bracket has, one level up: statistics are derived, so
   * a corrected result updates a team's profile with no invalidation step.
   */
  it('reflects a corrected result', () => {
    const before = computeAllTeamStatistics({
      tournaments: [tournament(4)],
      stages: [stage(4)],
      matches: [match(0, 0, 'A')],
    });
    expect(before.get(team(1))?.wins).toBe(1);

    const after = computeAllTeamStatistics({
      tournaments: [tournament(4)],
      stages: [stage(4)],
      matches: [match(0, 0, 'B')],
    });
    expect(after.get(team(1))?.wins).toBe(0);
    expect(after.get(team(4))?.wins).toBe(1);
  });
});

describe('computeTeamStatistics', () => {
  it('returns an empty record for a team that never played', () => {
    const stats = computeTeamStatistics(asId<TeamId>('unknown'), {
      tournaments: [],
      stages: [],
      matches: [],
    });

    expect(stats).toMatchObject({ matchesPlayed: 0, wins: 0, winRate: 0, history: [] });
  });
});

/**
 * The trophy cabinet. Placements come out of the final standings, which a
 * bracket already ranks by how far each participant got.
 */
describe('placements', () => {
  /** Four teams seed as [1, 4, 3, 2], so the final is team 1 against team 2. */
  const played = [match(0, 0, 'A'), match(0, 1, 'A'), match(1, 0, 'A')];

  const cabinet = (
    matches: Match[],
    overrides: Partial<Tournament> = {},
    stageOverrides: Partial<Stage> = {},
  ) =>
    computeAllTeamStatistics({
      tournaments: [tournament(4, overrides)],
      stages: [stage(4, stageOverrides)],
      matches,
    });

  it('records the winner as first', () => {
    const stats = cabinet(played);
    expect(stats.get(team(1))?.placements).toMatchObject([{ rank: 1, tournamentName: 'Test Cup' }]);
  });

  it('records the beaten finalist as second', () => {
    expect(cabinet(played).get(team(3))?.placements).toMatchObject([{ rank: 2 }]);
  });

  /**
   * Losing a semi-final says nothing about which of the two losers was better,
   * so both come third. A cabinet that awarded one of them fourth would be
   * inventing a result nobody played for.
   */
  it('gives both losing semi-finalists a third place', () => {
    const stats = cabinet(played);
    expect(stats.get(team(4))?.placements).toMatchObject([{ rank: 3 }]);
    expect(stats.get(team(2))?.placements).toMatchObject([{ rank: 3 }]);
  });

  it('leaves out everyone below third', () => {
    const stats = computeAllTeamStatistics({
      tournaments: [tournament(8)],
      stages: [stage(8)],
      matches: [
        match(0, 0, 'A'),
        match(0, 1, 'A'),
        match(0, 2, 'A'),
        match(0, 3, 'A'),
        match(1, 0, 'A'),
        match(1, 1, 'A'),
        match(2, 0, 'A'),
      ],
    });

    // Eight teams: one first, one second, two thirds, four with nothing.
    const withTrophies = [...stats.values()].filter((entry) => entry.placements.length > 0);
    expect(withTrophies).toHaveLength(4);
  });

  it('hands out nothing while the tournament is unfinished', () => {
    expect(cabinet([match(0, 0, 'A')]).get(team(1))?.placements).toEqual([]);
  });

  it('marks a world championship, whatever the case', () => {
    for (const name of ['World Championship 2018', 'APEX world championship']) {
      expect(cabinet(played, { name }).get(team(1))?.placements[0]?.major).toBe(true);
    }
  });

  it('leaves an ordinary tournament unmarked', () => {
    expect(cabinet(played, { name: 'Spring Cup' }).get(team(1))?.placements[0]?.major).toBe(false);
  });

  it('dates a placement from the tournament rather than from now', () => {
    const stats = cabinet(played, { startsAt: '2018-11-03T00:00:00.000Z' });
    expect(stats.get(team(1))?.placements[0]?.at).toBe('2018-11-03T00:00:00.000Z');
  });

  /** A cabinet reads by weight: best first, and among equals the most recent. */
  it('sorts the best first and the most recent among equals', () => {
    const second = asId<TournamentId>('t2');
    const secondStage = asId<StageId>('s2');

    const other: Tournament = {
      ...tournament(2, { startsAt: '2019-01-01T00:00:00.000Z' }),
      id: second,
      name: 'Second Cup',
      slug: 'second-cup',
      stageIds: [secondStage],
      participants: [
        { id: asId<Participant['id']>('q1'), teamId: team(9), seed: 1, status: 'active' },
        { id: asId<Participant['id']>('q2'), teamId: team(1), seed: 2, status: 'active' },
      ],
    };

    const otherStage: Stage = { ...stage(2), id: secondStage, tournamentId: second };
    const otherPosition = { bracket: 'winner' as const, round: 0, indexInRound: 0 };
    const otherMatch: Match = {
      ...match(0, 0, 'A'),
      id: makeMatchId(secondStage, otherPosition),
      tournamentId: second,
      stageId: secondStage,
    };

    const stats = computeAllTeamStatistics({
      tournaments: [tournament(4, { startsAt: '2018-01-01T00:00:00.000Z' }), other],
      stages: [stage(4), otherStage],
      matches: [...played, otherMatch],
    });

    // First at the older event outranks second at the newer one.
    expect(stats.get(team(1))?.placements.map((entry) => entry.rank)).toEqual([1, 2]);
  });

  it('still counts a win as a win', () => {
    expect(cabinet(played).get(team(1))?.tournamentsWon).toBe(1);
    expect(cabinet(played).get(team(3))?.tournamentsWon).toBe(0);
  });
});

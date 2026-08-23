import { describe, expect, it } from 'vitest';

import {
  DEFAULT_POINT_SYSTEM,
  DEFAULT_TIEBREAKERS,
  asId,
  now,
  type Match,
  type MatchOutcome,
  type Participant,
  type SeedingRule,
  type Stage,
  type StageId,
  type Tournament,
  type TournamentId,
} from '@models/index';

import { deriveTournamentState } from './derive';

const TOURNAMENT = asId<TournamentId>('t1');
const GROUPS = asId<StageId>('s-groups');
const PLAYOFFS = asId<StageId>('s-playoffs');

function tournament(count: number): Tournament {
  return {
    id: TOURNAMENT,
    name: 'Combined Cup',
    slug: 'combined-cup',
    gameId: asId<Tournament['gameId']>('g1'),
    status: 'live',
    participants: Array.from({ length: count }, (_, i) => ({
      id: asId<Participant['id']>(`p${String(i + 1)}`),
      teamId: asId<Participant['teamId']>(`team${String(i + 1)}`),
      seed: i + 1,
      status: 'active' as const,
    })),
    stageIds: [GROUPS, PLAYOFFS],
    createdAt: now(),
    updatedAt: now(),
  };
}

/** Eight participants in two groups of four. */
function groupStage(): Stage {
  return {
    id: GROUPS,
    tournamentId: TOURNAMENT,
    name: 'Group Stage',
    order: 0,
    format: {
      kind: 'group_stage',
      groupCount: 2,
      distribution: 'snake',
      perGroup: {
        legs: 1,
        pointSystem: DEFAULT_POINT_SYSTEM,
        tiebreakers: [...DEFAULT_TIEBREAKERS],
        matchFormat: { kind: 'bo', games: 1 },
      },
    },
    entrySeeding: [
      {
        id: asId<SeedingRule['id']>('rule-groups'),
        source: { kind: 'participants' },
        targetSlots: { from: 1, to: 8 },
        order: 'as_ranked',
      },
    ],
    createdAt: now(),
    updatedAt: now(),
  };
}

/** Knockout for the top two of each group. */
function playoffStage(): Stage {
  return {
    id: PLAYOFFS,
    tournamentId: TOURNAMENT,
    name: 'Playoffs',
    order: 1,
    format: {
      kind: 'single_elimination',
      thirdPlaceMatch: false,
      byePlacement: 'seeded',
      matchFormats: { default: { kind: 'bo', games: 3 } },
    },
    entrySeeding: [
      {
        id: asId<SeedingRule['id']>('rule-playoffs'),
        source: { kind: 'group_standings', stageId: GROUPS, placeRange: { from: 1, to: 2 } },
        targetSlots: { from: 1, to: 4 },
        order: 'snake',
      },
    ],
    createdAt: now(),
    updatedAt: now(),
  };
}

/** Records a result for every group fixture, favouring the lower seed number. */
function playGroupStage(): Match[] {
  const state = deriveTournamentState({
    tournament: tournament(8),
    stages: [groupStage(), playoffStage()],
    matches: [],
  });

  const groupMatches = state.byStageId.get(GROUPS)?.resolved.matches ?? [];

  return groupMatches.map((match) => {
    // Side with the stronger (lower) participant number wins, giving a stable
    // and predictable table.
    const a = match.slotA.kind === 'participant' ? match.slotA.participantId : '';
    const b = match.slotB.kind === 'participant' ? match.slotB.participantId : '';
    const winner: 'A' | 'B' = numberOf(a) < numberOf(b) ? 'A' : 'B';

    const outcome: MatchOutcome = {
      winner,
      reason: 'played',
      decidedAt: '2026-01-01T00:00:00.000Z',
    };

    return {
      id: match.id,
      tournamentId: TOURNAMENT,
      stageId: GROUPS,
      position: match.position,
      slotA: { kind: 'tbd' },
      slotB: { kind: 'tbd' },
      format: match.format,
      games: [],
      outcome,
      createdAt: now(),
      updatedAt: now(),
    } satisfies Match;
  });
}

const numberOf = (participantId: string): number => Number(participantId.replace('p', '')) || 999;

/**
 * The composition the architecture was built for: a group stage feeding a
 * knockout, with neither format knowing the other exists.
 */
describe('group stage into playoffs', () => {
  it('leaves the playoff bracket empty while the groups are still running', () => {
    const state = deriveTournamentState({
      tournament: tournament(8),
      stages: [groupStage(), playoffStage()],
      matches: [],
    });

    const playoffs = state.byStageId.get(PLAYOFFS);
    // Provisional group tables must not populate a bracket that would then
    // reshuffle on every result.
    expect(playoffs?.seededSlots.size).toBe(0);
  });

  it('fills the bracket from the group tables once the groups finish', () => {
    const matches = playGroupStage();
    const state = deriveTournamentState({
      tournament: tournament(8),
      stages: [groupStage(), playoffStage()],
      matches,
    });

    expect(state.byStageId.get(GROUPS)?.isComplete).toBe(true);

    const playoffs = state.byStageId.get(PLAYOFFS);
    expect(playoffs?.seededSlots.size).toBe(4);

    // Every playoff entrant finished first or second in a group.
    const groupTables = state.byStageId.get(GROUPS)?.groupStandings ?? [];
    const qualified = new Set(
      groupTables.flatMap((table) =>
        table.filter((entry) => entry.rank <= 2).map((entry) => entry.participantId),
      ),
    );

    for (const participantId of playoffs?.seededSlots.values() ?? []) {
      expect(qualified.has(participantId)).toBe(true);
    }
  });

  /**
   * Snake ordering exists so the two winners cannot meet in the semifinal. That
   * is the whole reason a bracket is seeded rather than drawn at random.
   */
  it('keeps the two group winners apart in the bracket', () => {
    const matches = playGroupStage();
    const state = deriveTournamentState({
      tournament: tournament(8),
      stages: [groupStage(), playoffStage()],
      matches,
    });

    const groupTables = state.byStageId.get(GROUPS)?.groupStandings ?? [];
    const winners = groupTables
      .map((table) => table.find((entry) => entry.rank === 1)?.participantId)
      .filter((id): id is NonNullable<typeof id> => id !== undefined);

    const semifinals = (state.byStageId.get(PLAYOFFS)?.resolved.matches ?? []).filter(
      (match) => match.position.round === 0,
    );

    const together = semifinals.some((match) => {
      const a = match.slotA.kind === 'participant' ? match.slotA.participantId : undefined;
      const b = match.slotB.kind === 'participant' ? match.slotB.participantId : undefined;
      return a !== undefined && b !== undefined && winners.includes(a) && winners.includes(b);
    });

    expect(together).toBe(false);
  });

  it('reflects a corrected group result in the playoff line-up', () => {
    const matches = playGroupStage();

    const before = deriveTournamentState({
      tournament: tournament(8),
      stages: [groupStage(), playoffStage()],
      matches,
    });
    const lineUpBefore = [...(before.byStageId.get(PLAYOFFS)?.seededSlots.values() ?? [])];

    // Flip every group result the other way.
    const flipped = matches.map((match) => ({
      ...match,
      outcome: match.outcome
        ? {
            ...match.outcome,
            winner: match.outcome.winner === 'A' ? ('B' as const) : ('A' as const),
          }
        : undefined,
    }));

    const after = deriveTournamentState({
      tournament: tournament(8),
      stages: [groupStage(), playoffStage()],
      matches: flipped as Match[],
    });
    const lineUpAfter = [...(after.byStageId.get(PLAYOFFS)?.seededSlots.values() ?? [])];

    // A different set qualified, with no invalidation step anywhere.
    expect(lineUpAfter).not.toEqual(lineUpBefore);
    expect(lineUpAfter).toHaveLength(4);
  });
});

/** A standalone league: one round robin and nothing else. */
describe('league without a knockout', () => {
  const LEAGUE = asId<StageId>('s-league');

  function leagueStage(legs: 1 | 2): Stage {
    return {
      id: LEAGUE,
      tournamentId: TOURNAMENT,
      name: 'League',
      order: 0,
      format: {
        kind: 'round_robin',
        legs,
        pointSystem: DEFAULT_POINT_SYSTEM,
        tiebreakers: [...DEFAULT_TIEBREAKERS],
        matchFormat: { kind: 'bo', games: 1 },
      },
      entrySeeding: [
        {
          id: asId<SeedingRule['id']>('rule-league'),
          source: { kind: 'participants' },
          targetSlots: { from: 1, to: 6 },
          order: 'as_ranked',
        },
      ],
      createdAt: now(),
      updatedAt: now(),
    };
  }

  it('schedules a full single round', () => {
    const state = deriveTournamentState({
      tournament: { ...tournament(6), stageIds: [LEAGUE] },
      stages: [leagueStage(1)],
      matches: [],
    });

    // Six participants: fifteen fixtures.
    expect(state.stages[0]?.resolved.matches).toHaveLength(15);
    expect(state.stages[0]?.standings).toHaveLength(6);
  });

  it('doubles the schedule for home and away', () => {
    const state = deriveTournamentState({
      tournament: { ...tournament(6), stageIds: [LEAGUE] },
      stages: [leagueStage(2)],
      matches: [],
    });

    expect(state.stages[0]?.resolved.matches).toHaveLength(30);
  });

  it('starts every participant on zero points', () => {
    const state = deriveTournamentState({
      tournament: { ...tournament(6), stageIds: [LEAGUE] },
      stages: [leagueStage(1)],
      matches: [],
    });

    for (const entry of state.stages[0]?.standings ?? []) {
      expect(entry.points).toBe(0);
    }
  });
});

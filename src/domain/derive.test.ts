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
  type Tournament,
} from '@models/index';

import { deriveTournamentState } from './derive';
import { makeMatchId } from './matchId';

const TOURNAMENT = asId<Tournament['id']>('t1');
const STAGE_A = asId<StageId>('s-groups');
const STAGE_B = asId<StageId>('s-playoffs');
const GAME = asId<Tournament['gameId']>('g1');

function participants(count: number): Participant[] {
  return Array.from({ length: count }, (_, i) => ({
    id: asId<Participant['id']>(`p${String(i + 1)}`),
    teamId: asId<Participant['teamId']>(`team${String(i + 1)}`),
    seed: i + 1,
    status: 'active' as const,
  }));
}

function tournament(count: number, stageIds: StageId[]): Tournament {
  return {
    id: TOURNAMENT,
    name: 'Test Cup',
    slug: 'test-cup',
    gameId: GAME,
    status: 'live',
    participants: participants(count),
    stageIds,
    createdAt: now(),
    updatedAt: now(),
  };
}

function singleEliminationStage(
  id: StageId,
  order: number,
  slots: number,
  rules?: SeedingRule[],
): Stage {
  return {
    id,
    tournamentId: TOURNAMENT,
    name: 'Bracket',
    order,
    format: {
      kind: 'single_elimination',
      thirdPlaceMatch: false,
      byePlacement: 'seeded',
      matchFormats: { default: { kind: 'bo', games: 3 } },
    },
    entrySeeding: rules ?? [
      {
        id: asId<SeedingRule['id']>(`rule-${id}`),
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
  stageId: StageId,
  round: number,
  indexInRound: number,
  outcome?: MatchOutcome,
  games: GameResult[] = [],
): Match {
  const position = { bracket: 'winner' as const, round, indexInRound };
  return {
    id: makeMatchId(stageId, position),
    tournamentId: TOURNAMENT,
    stageId,
    position,
    slotA: { kind: 'tbd' },
    slotB: { kind: 'tbd' },
    format: { kind: 'bo', games: 3 },
    games,
    createdAt: now(),
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...(outcome ? { outcome } : {}),
  };
}

const won = (winner: 'A' | 'B'): MatchOutcome => ({
  winner,
  reason: 'played',
  decidedAt: '2026-01-01T00:00:00.000Z',
});

describe('deriveTournamentState', () => {
  it('derives a bracket with no results at all', () => {
    const stage = singleEliminationStage(STAGE_A, 0, 4);
    const state = deriveTournamentState({
      tournament: tournament(4, [STAGE_A]),
      stages: [stage],
      matches: [],
    });

    expect(state.stages).toHaveLength(1);
    expect(state.stages[0]?.resolved.matches).toHaveLength(3);
    expect(state.isComplete).toBe(false);
    expect(state.finalStandings).toEqual([]);
  });

  it('seeds participants into the first stage in seed order', () => {
    const stage = singleEliminationStage(STAGE_A, 0, 4);
    const state = deriveTournamentState({
      tournament: tournament(4, [STAGE_A]),
      stages: [stage],
      matches: [],
    });

    const first = state.stages[0]?.resolved.matches[0];
    expect(first?.slotA).toEqual({ kind: 'participant', participantId: 'p1' });
    expect(first?.slotB).toEqual({ kind: 'participant', participantId: 'p4' });
  });

  it('ignores stages belonging to another tournament', () => {
    const foreign: Stage = {
      ...singleEliminationStage(asId<StageId>('other'), 0, 4),
      tournamentId: asId<Tournament['id']>('t2'),
    };

    const state = deriveTournamentState({
      tournament: tournament(4, [STAGE_A]),
      stages: [singleEliminationStage(STAGE_A, 0, 4), foreign],
      matches: [],
    });

    expect(state.stages).toHaveLength(1);
  });

  it('derives the outcome from map results when none is recorded', () => {
    const stage = singleEliminationStage(STAGE_A, 0, 2);
    const games: GameResult[] = [
      { id: asId<GameResult['id']>('g1'), index: 1, scoreA: 13, scoreB: 7, winner: 'A' },
      { id: asId<GameResult['id']>('g2'), index: 2, scoreA: 5, scoreB: 13, winner: 'B' },
      { id: asId<GameResult['id']>('g3'), index: 3, scoreA: 13, scoreB: 11, winner: 'A' },
    ];

    const state = deriveTournamentState({
      tournament: tournament(2, [STAGE_A]),
      stages: [stage],
      matches: [match(STAGE_A, 0, 0, undefined, games)],
    });

    const final = state.stages[0]?.resolved.matches[0];
    expect(final?.winnerId).toBe('p1');
    expect(final?.outcome?.reason).toBe('played');
    expect(state.isComplete).toBe(true);
  });

  it('does not decide a match while the series is still open', () => {
    const games: GameResult[] = [
      { id: asId<GameResult['id']>('g1'), index: 1, scoreA: 13, scoreB: 7, winner: 'A' },
    ];

    const state = deriveTournamentState({
      tournament: tournament(2, [STAGE_A]),
      stages: [singleEliminationStage(STAGE_A, 0, 2)],
      matches: [match(STAGE_A, 0, 0, undefined, games)],
    });

    // Best of three needs two map wins.
    expect(state.stages[0]?.resolved.matches[0]?.status).toBe('ready');
    expect(state.isComplete).toBe(false);
  });

  it('lets an explicit outcome override the map results', () => {
    // A walkover is recorded directly, even though the maps say otherwise.
    const games: GameResult[] = [
      { id: asId<GameResult['id']>('g1'), index: 1, scoreA: 13, scoreB: 0, winner: 'A' },
      { id: asId<GameResult['id']>('g2'), index: 2, scoreA: 13, scoreB: 0, winner: 'A' },
    ];
    const forfeit: MatchOutcome = {
      winner: 'B',
      reason: 'forfeit',
      decidedAt: '2026-01-02T00:00:00.000Z',
    };

    const state = deriveTournamentState({
      tournament: tournament(2, [STAGE_A]),
      stages: [singleEliminationStage(STAGE_A, 0, 2)],
      matches: [match(STAGE_A, 0, 0, forfeit, games)],
    });

    expect(state.stages[0]?.resolved.matches[0]?.winnerId).toBe('p2');
  });

  it('reports final standings once the last stage completes', () => {
    const state = deriveTournamentState({
      tournament: tournament(2, [STAGE_A]),
      stages: [singleEliminationStage(STAGE_A, 0, 2)],
      matches: [match(STAGE_A, 0, 0, won('A'))],
    });

    expect(state.isComplete).toBe(true);
    expect(state.finalStandings[0]?.participantId).toBe('p1');
    expect(state.finalStandings[0]?.rank).toBe(1);
  });

  describe('multi-stage tournaments', () => {
    /** Qualifier of four, then a final bracket fed by the top two. */
    function twoStageSetup() {
      const qualifier = singleEliminationStage(STAGE_A, 0, 4);
      const playoffs: Stage = {
        ...singleEliminationStage(STAGE_B, 1, 2),
        entrySeeding: [
          {
            id: asId<SeedingRule['id']>('rule-playoffs'),
            source: { kind: 'stage_standings', stageId: STAGE_A, placeRange: { from: 1, to: 2 } },
            targetSlots: { from: 1, to: 2 },
            order: 'as_ranked',
          },
        ],
      };
      return { qualifier, playoffs };
    }

    it('leaves the later stage undetermined while the earlier one is open', () => {
      const { qualifier, playoffs } = twoStageSetup();

      const state = deriveTournamentState({
        tournament: tournament(4, [STAGE_A, STAGE_B]),
        stages: [qualifier, playoffs],
        matches: [],
      });

      // Placement-based seeding refuses to draw from an unfinished stage, so
      // the later bracket stays empty rather than showing provisional entries
      // that would reshuffle with every new result.
      const later = state.byStageId.get(STAGE_B);
      expect(later?.seededSlots.size).toBe(0);
      expect(later?.resolved.matches[0]?.slotA.kind).toBe('bye');
    });

    it('feeds the qualifier result into the next stage', () => {
      const { qualifier, playoffs } = twoStageSetup();

      const state = deriveTournamentState({
        tournament: tournament(4, [STAGE_A, STAGE_B]),
        stages: [qualifier, playoffs],
        // Standard seeding for four is [1, 4, 3, 2], so the second first-round
        // match is p3 against p2 and side A there is p3.
        matches: [
          match(STAGE_A, 0, 0, won('A')), // p1 beats p4
          match(STAGE_A, 0, 1, won('A')), // p3 beats p2
          match(STAGE_A, 1, 0, won('A')), // p1 beats p3 in the qualifier final
        ],
      });

      const final = state.byStageId.get(STAGE_B)?.resolved.matches[0];
      expect(final?.slotA).toEqual({ kind: 'participant', participantId: 'p1' });
      expect(final?.slotB).toEqual({ kind: 'participant', participantId: 'p3' });
      expect(final?.status).toBe('ready');
    });

    it('propagates a corrected early result across the stage boundary', () => {
      const { qualifier, playoffs } = twoStageSetup();
      const base = tournament(4, [STAGE_A, STAGE_B]);

      const before = deriveTournamentState({
        tournament: base,
        stages: [qualifier, playoffs],
        matches: [match(STAGE_A, 0, 0, won('A')), match(STAGE_A, 0, 1, won('A'))],
      });
      expect(before.byStageId.get(STAGE_A)?.standings[0]?.participantId).toBeDefined();

      // Correct the very first match: p4 won after all.
      const after = deriveTournamentState({
        tournament: base,
        stages: [qualifier, playoffs],
        matches: [match(STAGE_A, 0, 0, won('B')), match(STAGE_A, 0, 1, won('A'))],
      });

      const qualifierFinal = after.byStageId.get(STAGE_A)?.resolved.matches.at(-1);
      expect(qualifierFinal?.slotA).toEqual({ kind: 'participant', participantId: 'p4' });
    });

    it('derives stages in configured order regardless of input order', () => {
      const { qualifier, playoffs } = twoStageSetup();

      const state = deriveTournamentState({
        tournament: tournament(4, [STAGE_A, STAGE_B]),
        // Deliberately reversed.
        stages: [playoffs, qualifier],
        matches: [],
      });

      expect(state.stages.map((s) => s.stage.id)).toEqual([STAGE_A, STAGE_B]);
    });
  });

  it('is deterministic', () => {
    const input = {
      tournament: tournament(13, [STAGE_A]),
      stages: [singleEliminationStage(STAGE_A, 0, 13)],
      matches: [match(STAGE_A, 0, 3, won('A'))],
    };

    const a = deriveTournamentState(input);
    const b = deriveTournamentState(input);

    expect(JSON.stringify(a.stages[0]?.resolved.matches)).toBe(
      JSON.stringify(b.stages[0]?.resolved.matches),
    );
  });
});

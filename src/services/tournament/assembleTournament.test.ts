import { describe, expect, it } from 'vitest';

import { deriveTournamentState } from '@domain/derive';
import { now, type Game, type Team } from '@models/index';

import { assembleTournament, type TournamentDraft } from './assembleTournament';

const emptyContext = { existingTeams: [], existingGames: [], existingSlugs: [] };

function draft(overrides: Partial<TournamentDraft> = {}): TournamentDraft {
  return {
    name: 'Summer Cup',
    participants: [
      { name: 'Nova Collective' },
      { name: 'Iron Meridian' },
      { name: 'Solstice Nine' },
    ],
    format: {
      kind: 'single_elimination',
      thirdPlaceMatch: false,
      defaultBestOf: 3,
      finalBestOf: 5,
    },
    ...overrides,
  };
}

describe('assembleTournament', () => {
  it('creates a team for each new participant', () => {
    const result = assembleTournament(draft(), emptyContext);

    expect(result.newTeams).toHaveLength(3);
    expect(result.tournament.participants).toHaveLength(3);
    for (const participant of result.tournament.participants) {
      expect(result.newTeams.some((team) => team.id === participant.teamId)).toBe(true);
    }
  });

  it('seeds participants in input order', () => {
    const result = assembleTournament(draft(), emptyContext);
    expect(result.tournament.participants.map((p) => p.seed)).toEqual([1, 2, 3]);
  });

  it('reuses an existing team matched by name, case-insensitively', () => {
    const existing: Team = {
      id: 'team-existing' as Team['id'],
      name: 'Nova Collective',
      tag: 'NOV',
      socials: [],
      archived: false,
      createdAt: now(),
      updatedAt: now(),
    };

    const result = assembleTournament(draft(), { ...emptyContext, existingTeams: [existing] });

    // Only the two genuinely new teams are created; Nova is reused.
    expect(result.newTeams).toHaveLength(2);
    const novaParticipant = result.tournament.participants[0]!;
    expect(novaParticipant.teamId).toBe('team-existing');
  });

  it('carries a country code onto a new team', () => {
    const result = assembleTournament(
      draft({ participants: [{ name: 'Nova', countryCode: 'DE' }, { name: 'Iron' }] }),
      emptyContext,
    );
    expect(result.newTeams.find((t) => t.name === 'Nova')?.countryCode).toBe('DE');
  });

  it('makes the slug unique against existing tournaments', () => {
    const result = assembleTournament(draft(), { ...emptyContext, existingSlugs: ['summer-cup'] });
    expect(result.tournament.slug).toBe('summer-cup-2');
  });

  it('omits blank optional fields rather than storing empty strings', () => {
    const result = assembleTournament(draft({ description: '   ', organizer: '' }), emptyContext);
    expect('description' in result.tournament).toBe(false);
    expect('organizer' in result.tournament).toBe(false);
  });

  it('creates a game when one is named', () => {
    const result = assembleTournament(draft({ gameName: 'Counter-Strike 2' }), emptyContext);
    expect(result.newGame?.name).toBe('Counter-Strike 2');
    expect(result.tournament.gameId).toBe(result.newGame?.id);
  });

  it('reuses an existing game by name', () => {
    const game: Game = {
      id: 'game-cs' as Game['id'],
      name: 'Counter-Strike 2',
      shortName: 'CS2',
      maps: [],
      defaultMatchFormat: { kind: 'bo', games: 3 },
      createdAt: now(),
      updatedAt: now(),
    };
    const result = assembleTournament(draft({ gameName: 'counter-strike 2' }), {
      ...emptyContext,
      existingGames: [game],
    });
    expect(result.newGame).toBeUndefined();
    expect(result.tournament.gameId).toBe('game-cs');
  });

  it('gives the final its own best-of', () => {
    const result = assembleTournament(
      draft({
        participants: names(4),
        format: {
          kind: 'single_elimination',
          thirdPlaceMatch: false,
          defaultBestOf: 1,
          finalBestOf: 5,
        },
      }),
      emptyContext,
    );

    if (result.stages[0]!.format.kind !== 'single_elimination') throw new Error('wrong format');
    // Four participants make two rounds; the final is round index 1.
    expect(result.stages[0]!.format.matchFormats.default).toEqual({ kind: 'single_game' });
    expect(result.stages[0]!.format.matchFormats.byRound?.[1]).toEqual({ kind: 'bo', games: 5 });
  });

  /**
   * The wizard renders its preview by deriving from the assembled entities before
   * saving. This proves those entities are internally consistent — the whole point
   * of building without persisting.
   */
  it('produces entities that derive into a valid bracket', () => {
    const result = assembleTournament(draft({ participants: names(8) }), emptyContext);

    const state = deriveTournamentState({
      tournament: result.tournament,
      stages: result.stages,
      matches: [],
    });

    const stage = state.stages[0]!;
    expect(stage.resolved.matches).toHaveLength(7);
    // The top seed is placed and waiting to play.
    const firstMatch = stage.resolved.matches[0]!;
    expect(firstMatch.slotA).toEqual({
      kind: 'participant',
      participantId: result.tournament.participants[0]!.id,
    });
  });
});

describe('assembleTournament with league and group formats', () => {
  it('builds a single league stage for a round robin', () => {
    const result = assembleTournament(
      draft({
        participants: names(6),
        format: { kind: 'round_robin', legs: 2, defaultBestOf: 1 },
      }),
      emptyContext,
    );

    expect(result.stages).toHaveLength(1);
    const format = result.stages[0]!.format;
    expect(format.kind).toBe('round_robin');
    if (format.kind === 'round_robin') expect(format.legs).toBe(2);
  });

  it('builds only a group stage when nothing advances', () => {
    const result = assembleTournament(
      draft({
        participants: names(8),
        format: {
          kind: 'group_stage',
          groupCount: 2,
          legs: 1,
          defaultBestOf: 1,
          advancePerGroup: 0,
          playoffBestOf: 3,
          playoffFinalBestOf: 5,
        },
      }),
      emptyContext,
    );

    expect(result.stages).toHaveLength(1);
    expect(result.stages[0]!.format.kind).toBe('group_stage');
  });

  /**
   * The engine has no "groups into playoffs" format. It is two stages linked by
   * a seeding rule, which is what makes further combinations configuration
   * rather than code.
   */
  it('links a group stage to a knockout with a seeding rule', () => {
    const result = assembleTournament(
      draft({
        participants: names(16),
        format: {
          kind: 'group_stage',
          groupCount: 4,
          legs: 1,
          defaultBestOf: 1,
          advancePerGroup: 2,
          playoffBestOf: 3,
          playoffFinalBestOf: 5,
        },
      }),
      emptyContext,
    );

    expect(result.stages).toHaveLength(2);
    expect(result.tournament.stageIds).toEqual(result.stages.map((stage) => stage.id));

    const playoffs = result.stages[1]!;
    expect(playoffs.format.kind).toBe('single_elimination');
    expect(playoffs.order).toBe(1);

    const rule = playoffs.entrySeeding[0]!;
    expect(rule.source).toEqual({
      kind: 'group_standings',
      stageId: result.stages[0]!.id,
      placeRange: { from: 1, to: 2 },
    });
    // Four groups, top two each: an eight-slot bracket.
    expect(rule.targetSlots).toEqual({ from: 1, to: 8 });
    expect(rule.order).toBe('snake');
  });

  it('derives a group stage that is playable from the start', () => {
    const result = assembleTournament(
      draft({
        participants: names(8),
        format: {
          kind: 'group_stage',
          groupCount: 2,
          legs: 1,
          defaultBestOf: 1,
          advancePerGroup: 2,
          playoffBestOf: 3,
          playoffFinalBestOf: 5,
        },
      }),
      emptyContext,
    );

    const state = deriveTournamentState({
      tournament: result.tournament,
      stages: result.stages,
      matches: [],
    });

    // Two groups of four: six fixtures each, all ready to play.
    expect(state.stages[0]?.resolved.matches).toHaveLength(12);
    expect(state.stages[0]?.groupStandings).toHaveLength(2);
    expect(state.stages[0]?.resolved.matches.every((m) => m.status === 'ready')).toBe(true);
  });
});

/**
 * Groups feeding a double elimination playoff.
 *
 * The shape asserted here is the one a real event of this kind produces: eight
 * groups of six, the top two of each into a sixteen-team bracket. A group stage
 * has already given everyone five games, so letting a single defeat end the
 * event is a choice rather than the only option — and the engine needed no
 * change to allow it, because the two stages are linked by a seeding rule
 * rather than by a format that knows about both.
 */
describe('a group stage feeding a double elimination playoff', () => {
  const eightGroupsOf6 = (
    overrides: Partial<Extract<TournamentDraft['format'], { kind: 'group_stage' }>> = {},
  ) =>
    assembleTournament(
      draft({
        participants: names(48),
        format: {
          kind: 'group_stage',
          groupCount: 8,
          legs: 1,
          defaultBestOf: 3,
          advancePerGroup: 2,
          playoffBestOf: 3,
          playoffFinalBestOf: 5,
          playoffFormat: 'double_elimination',
          ...overrides,
        },
      }),
      emptyContext,
    );

  const roundsOf = (result: ReturnType<typeof assembleTournament>, bracket: string) =>
    deriveTournamentState({
      tournament: result.tournament,
      stages: result.stages,
      matches: [],
    })
      .stages[1]!.structure.rounds.filter((round) => round.bracket === bracket)
      .map((round) => round.matchCount);

  it('builds a loser bracket for the qualifiers', () => {
    const result = eightGroupsOf6();
    const playoffs = result.stages[1]!;

    expect(playoffs.format).toMatchObject({
      kind: 'double_elimination',
      grandFinal: 'bracket_reset',
    });
    expect(playoffs.entrySeeding[0]!.targetSlots).toEqual({ from: 1, to: 16 });

    // Sixteen qualifiers: the winner bracket halves each round, the loser
    // bracket alternates between taking casualties and playing them off.
    expect(roundsOf(result, 'winner')).toEqual([8, 4, 2, 1]);
    expect(roundsOf(result, 'loser')).toEqual([4, 4, 2, 2, 1, 1]);
    expect(roundsOf(result, 'grand_final')).toEqual([1, 1]);
  });

  it('can end the grand final in one match', () => {
    const result = eightGroupsOf6({ playoffGrandFinal: 'single' });
    expect(result.stages[1]!.format).toMatchObject({ grandFinal: 'single' });
    expect(roundsOf(result, 'grand_final')).toEqual([1]);
  });

  /** Group winners and runners-up are spread, so no group is replayed at once. */
  it('keeps the qualifiers of one group apart in the first round', () => {
    const result = eightGroupsOf6();
    const rule = result.stages[1]!.entrySeeding[0]!;
    expect(rule.order).toBe('snake');
    expect(rule.source).toMatchObject({ kind: 'group_standings', placeRange: { from: 1, to: 2 } });
  });

  it('leaves a group stage without playoffs alone', () => {
    const result = eightGroupsOf6({ advancePerGroup: 0 });
    expect(result.stages).toHaveLength(1);
    expect(result.stages[0]!.format.kind).toBe('group_stage');
  });

  /** Stages drawn before the setting existed keep the bracket they were given. */
  it('still builds a single elimination playoff when none is chosen', () => {
    const result = assembleTournament(
      draft({
        participants: names(48),
        format: {
          kind: 'group_stage',
          groupCount: 8,
          legs: 1,
          defaultBestOf: 3,
          advancePerGroup: 2,
          playoffBestOf: 3,
          playoffFinalBestOf: 5,
        },
      }),
      emptyContext,
    );

    expect(result.stages[1]!.format.kind).toBe('single_elimination');
  });
});

function names(count: number) {
  return Array.from({ length: count }, (_, i) => ({ name: `Team ${String(i + 1)}` }));
}

/**
 * A tournament exists before its field does, so every format has to assemble
 * and derive from nothing. The wizard runs the real derivation to build its
 * preview, so a format that cannot cope with an empty field takes the page down
 * on the way to creating one.
 */
describe('a tournament created before its field is known', () => {
  const formats: TournamentDraft['format'][] = [
    { kind: 'single_elimination', thirdPlaceMatch: true, defaultBestOf: 3, finalBestOf: 5 },
    { kind: 'double_elimination', grandFinal: 'bracket_reset', defaultBestOf: 3, finalBestOf: 5 },
    { kind: 'swiss', rounds: 5, defaultBestOf: 3 },
    { kind: 'round_robin', legs: 2, defaultBestOf: 3 },
    {
      kind: 'group_stage',
      groupCount: 4,
      legs: 1,
      defaultBestOf: 3,
      advancePerGroup: 2,
      playoffBestOf: 3,
      playoffFinalBestOf: 5,
    },
  ];

  for (const format of formats) {
    it(`assembles and derives ${format.kind} with no participants`, () => {
      const result = assembleTournament(draft({ participants: [], format }), emptyContext);

      expect(result.tournament.status).toBe('registration');
      expect(result.tournament.participants).toEqual([]);

      const state = deriveTournamentState({
        tournament: result.tournament,
        stages: result.stages,
        matches: [],
      });

      // Nothing is drawn, and nothing pretends to have been played.
      expect(state.stages[0]?.resolved.matches.every((match) => match.isBye)).toBe(true);
    });
  }

  it('goes live as soon as the field can be drawn', () => {
    const two = [{ name: 'Nova Collective' }, { name: 'Iron Meridian' }];
    expect(assembleTournament(draft({ participants: two }), emptyContext).tournament.status).toBe(
      'live',
    );
  });

  it('stays open for entries with a single entrant', () => {
    const one = [{ name: 'Nova Collective' }];
    expect(assembleTournament(draft({ participants: one }), emptyContext).tournament.status).toBe(
      'registration',
    );
  });
});

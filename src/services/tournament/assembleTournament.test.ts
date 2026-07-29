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
    format: { thirdPlaceMatch: false, defaultBestOf: 3, finalBestOf: 5 },
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
        format: { thirdPlaceMatch: false, defaultBestOf: 1, finalBestOf: 5 },
      }),
      emptyContext,
    );

    if (result.stage.format.kind !== 'single_elimination') throw new Error('wrong format');
    // Four participants make two rounds; the final is round index 1.
    expect(result.stage.format.matchFormats.default).toEqual({ kind: 'single_game' });
    expect(result.stage.format.matchFormats.byRound?.[1]).toEqual({ kind: 'bo', games: 5 });
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
      stages: [result.stage],
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

function names(count: number) {
  return Array.from({ length: count }, (_, i) => ({ name: `Team ${String(i + 1)}` }));
}

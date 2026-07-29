import { roundCount } from '@domain/bracket/bracketMath';
import {
  newGameId,
  newParticipantId,
  newSeedingRuleId,
  newStageId,
  newTeamId,
  newTournamentId,
  now,
  type Game,
  type MatchFormat,
  type Participant,
  type SingleEliminationConfig,
  type Stage,
  type Team,
  type Tournament,
} from '@models/index';
import { uniqueSlug } from '@utils/slug';

import { deriveTag, type ParsedParticipant } from './parseParticipants';

export type BestOf = 1 | 3 | 5 | 7;

export interface TournamentDraft {
  name: string;
  description?: string;
  organizer?: string;
  startsAt?: string;
  /** Optional game title; a Game record is created when provided. */
  gameName?: string;
  participants: readonly ParsedParticipant[];
  format: {
    thirdPlaceMatch: boolean;
    defaultBestOf: BestOf;
    finalBestOf: BestOf;
  };
}

export interface AssembleContext {
  existingTeams: readonly Team[];
  existingGames: readonly Game[];
  existingSlugs: readonly string[];
}

export interface AssembledTournament {
  /** Teams that did not exist yet and must be persisted. */
  newTeams: Team[];
  /** Game to persist, when the draft named one that did not exist. */
  newGame?: Game;
  tournament: Tournament;
  stage: Stage;
}

/**
 * Assembles the entities for a new single elimination tournament from wizard input.
 *
 * Two behaviours are worth calling out. Teams are matched to existing records by
 * name, case-insensitively, so running two tournaments with the same clubs reuses
 * their teams rather than duplicating them — the "teams persist and are reused"
 * promise, delivered without a separate team-management step. And nothing here is
 * persisted: the caller decides when to save, which lets the wizard render a live
 * preview from the very same entities it will later store.
 */
export function assembleTournament(
  draft: TournamentDraft,
  context: AssembleContext,
): AssembledTournament {
  const timestamp = now();

  const teamsByName = new Map(context.existingTeams.map((team) => [team.name.toLowerCase(), team]));
  const newTeams: Team[] = [];

  const participants: Participant[] = draft.participants.map((parsed, index) => {
    const existing = teamsByName.get(parsed.name.toLowerCase());
    const team = existing ?? createTeam(parsed, timestamp);
    if (!existing) {
      newTeams.push(team);
      teamsByName.set(parsed.name.toLowerCase(), team);
    }

    return {
      id: newParticipantId(),
      teamId: team.id,
      seed: index + 1,
      status: 'active' as const,
    };
  });

  const { gameId, newGame } = resolveGame(draft.gameName, context.existingGames, timestamp);

  const tournamentId = newTournamentId();
  const stageId = newStageId();

  const stage: Stage = {
    id: stageId,
    tournamentId,
    name: 'Main Bracket',
    order: 0,
    format: buildFormat(draft.format, participants.length),
    entrySeeding: [
      {
        id: newSeedingRuleId(),
        source: { kind: 'participants' },
        targetSlots: { from: 1, to: Math.max(participants.length, 1) },
        order: 'as_ranked',
      },
    ],
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const tournament: Tournament = {
    id: tournamentId,
    name: draft.name.trim(),
    slug: uniqueSlug(draft.name, context.existingSlugs),
    gameId,
    status: 'live',
    participants,
    stageIds: [stageId],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(draft.description?.trim() ? { description: draft.description.trim() } : {}),
    ...(draft.organizer?.trim() ? { organizer: draft.organizer.trim() } : {}),
    ...(draft.startsAt ? { startsAt: draft.startsAt } : {}),
  };

  return { newTeams, tournament, stage, ...(newGame ? { newGame } : {}) };
}

function createTeam(parsed: ParsedParticipant, timestamp: string): Team {
  return {
    id: newTeamId(),
    name: parsed.name,
    tag: deriveTag(parsed.name),
    socials: [],
    archived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(parsed.countryCode !== undefined ? { countryCode: parsed.countryCode } : {}),
  };
}

function resolveGame(
  gameName: string | undefined,
  existingGames: readonly Game[],
  timestamp: string,
): { gameId: Game['id']; newGame?: Game } {
  const trimmed = gameName?.trim();
  if (!trimmed) {
    // No game named. A placeholder id keeps the required reference without a
    // record; nothing reads it until game management exists.
    return { gameId: newGameId() };
  }

  const existing = existingGames.find((game) => game.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) return { gameId: existing.id };

  const game: Game = {
    id: newGameId(),
    name: trimmed,
    shortName: deriveTag(trimmed),
    maps: [],
    defaultMatchFormat: { kind: 'bo', games: 3 },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return { gameId: game.id, newGame: game };
}

function buildFormat(
  format: TournamentDraft['format'],
  participantCount: number,
): SingleEliminationConfig {
  const rounds = roundCount(participantCount);
  const defaultFormat: MatchFormat = bestOf(format.defaultBestOf);

  return {
    kind: 'single_elimination',
    thirdPlaceMatch: format.thirdPlaceMatch,
    byePlacement: 'seeded',
    matchFormats: {
      default: defaultFormat,
      // Give the final its own best-of. The third place match shares the final
      // round index, so both pick it up.
      ...(rounds >= 1 ? { byRound: { [rounds - 1]: bestOf(format.finalBestOf) } } : {}),
    },
  };
}

function bestOf(games: BestOf): MatchFormat {
  return games === 1 ? { kind: 'single_game' } : { kind: 'bo', games };
}

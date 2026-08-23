import { roundCount } from '@domain/bracket/bracketMath';
import {
  DEFAULT_POINT_SYSTEM,
  DEFAULT_SWISS_TIEBREAKERS,
  DEFAULT_TIEBREAKERS,
  newGameId,
  newParticipantId,
  newSeedingRuleId,
  newStageId,
  newTeamId,
  newTournamentId,
  now,
  type FormatConfig,
  type Game,
  type MatchFormat,
  type Participant,
  type SeedingRule,
  type Stage,
  type StageId,
  type Team,
  type Tournament,
  type TournamentId,
} from '@models/index';
import { uniqueSlug } from '@utils/slug';

import { deriveTag, type ParsedParticipant } from './parseParticipants';

export type BestOf = 1 | 3 | 5 | 7;

/**
 * The tournament shapes the wizard offers.
 *
 * Deliberately a small, named set rather than a free-form stage editor. These
 * cover what organisers actually run, and each maps onto the generic stage model
 * underneath — so a full editor can be added later without changing anything the
 * engine does.
 */
export type FormatChoice =
  | {
      kind: 'single_elimination';
      thirdPlaceMatch: boolean;
      defaultBestOf: BestOf;
      finalBestOf: BestOf;
    }
  | {
      kind: 'double_elimination';
      /** Whether the loser bracket winner has to beat the winner bracket twice. */
      grandFinal: 'single' | 'bracket_reset';
      defaultBestOf: BestOf;
      finalBestOf: BestOf;
    }
  | {
      kind: 'swiss';
      rounds: number;
      defaultBestOf: BestOf;
    }
  | {
      kind: 'round_robin';
      /** 1 for a single round, 2 for home and away. */
      legs: 1 | 2;
      defaultBestOf: BestOf;
    }
  | {
      kind: 'group_stage';
      groupCount: number;
      legs: 1 | 2;
      defaultBestOf: BestOf;
      /**
       * Places per group that carry over into a knockout stage.
       * Zero means the group stage is the whole tournament.
       */
      advancePerGroup: number;
      playoffBestOf: BestOf;
      playoffFinalBestOf: BestOf;
    };

export interface TournamentDraft {
  name: string;
  description?: string;
  organizer?: string;
  startsAt?: string;
  gameName?: string;
  participants: readonly ParsedParticipant[];
  format: FormatChoice;
}

export interface AssembleContext {
  existingTeams: readonly Team[];
  existingGames: readonly Game[];
  existingSlugs: readonly string[];
}

export interface AssembledTournament {
  newTeams: Team[];
  newGame?: Game;
  tournament: Tournament;
  /** One or more stages, in playing order. */
  stages: Stage[];
}

/**
 * Assembles the entities for a new tournament from wizard input.
 *
 * Nothing is persisted: the caller decides when to save, which is what lets the
 * wizard preview the real thing rather than an approximation of it.
 *
 * Teams are matched to existing records by name, case-insensitively, so running
 * two tournaments with the same clubs reuses them instead of duplicating.
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

  const stages = buildStages(draft.format, participants.length, tournamentId, timestamp);

  const tournament: Tournament = {
    id: tournamentId,
    name: draft.name.trim(),
    slug: uniqueSlug(draft.name, context.existingSlugs),
    gameId,
    status: 'live',
    participants,
    stageIds: stages.map((stage) => stage.id),
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(draft.description?.trim() ? { description: draft.description.trim() } : {}),
    ...(draft.organizer?.trim() ? { organizer: draft.organizer.trim() } : {}),
    ...(draft.startsAt ? { startsAt: draft.startsAt } : {}),
  };

  return { newTeams, tournament, stages, ...(newGame ? { newGame } : {}) };
}

/**
 * Turns a format choice into stages.
 *
 * A group stage with knockout becomes two stages linked by a seeding rule — the
 * engine has no notion of "group stage into playoffs" as a format, only stages
 * that read from one another. That is what makes further combinations a matter
 * of configuration rather than code.
 */
function buildStages(
  choice: FormatChoice,
  participantCount: number,
  tournamentId: TournamentId,
  timestamp: string,
): Stage[] {
  const firstStageId = newStageId();
  const slots = Math.max(participantCount, 1);

  const entrySeeding: SeedingRule[] = [
    {
      id: newSeedingRuleId(),
      source: { kind: 'participants' },
      targetSlots: { from: 1, to: slots },
      order: 'as_ranked',
    },
  ];

  const base = {
    tournamentId,
    order: 0,
    entrySeeding,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  switch (choice.kind) {
    case 'single_elimination':
      return [
        {
          ...base,
          id: firstStageId,
          name: 'Main Bracket',
          format: singleElimination(choice, participantCount),
        },
      ];

    case 'double_elimination':
      return [
        {
          ...base,
          id: firstStageId,
          name: 'Main Bracket',
          format: doubleElimination(choice, participantCount),
        },
      ];

    case 'swiss':
      return [
        {
          ...base,
          id: firstStageId,
          name: 'Swiss',
          format: {
            kind: 'swiss',
            rounds: choice.rounds,
            pairing: 'dutch',
            // Meeting the same opponent twice wastes a round that could have
            // separated the field instead.
            avoidRematches: true,
            pointSystem: DEFAULT_POINT_SYSTEM,
            tiebreakers: [...DEFAULT_SWISS_TIEBREAKERS],
            matchFormat: bestOf(choice.defaultBestOf),
          },
        },
      ];

    case 'round_robin':
      return [
        {
          ...base,
          id: firstStageId,
          name: 'League',
          format: {
            kind: 'round_robin',
            legs: choice.legs,
            pointSystem: DEFAULT_POINT_SYSTEM,
            tiebreakers: [...DEFAULT_TIEBREAKERS],
            matchFormat: bestOf(choice.defaultBestOf),
          },
        },
      ];

    case 'group_stage': {
      const groupStage: Stage = {
        ...base,
        id: firstStageId,
        name: 'Group Stage',
        format: {
          kind: 'group_stage',
          groupCount: choice.groupCount,
          distribution: 'snake',
          perGroup: {
            legs: choice.legs,
            pointSystem: DEFAULT_POINT_SYSTEM,
            tiebreakers: [...DEFAULT_TIEBREAKERS],
            matchFormat: bestOf(choice.defaultBestOf),
          },
        },
      };

      if (choice.advancePerGroup < 1) return [groupStage];

      const qualifiers = choice.groupCount * choice.advancePerGroup;
      const playoffs: Stage = {
        id: newStageId(),
        tournamentId,
        name: 'Playoffs',
        order: 1,
        format: singleElimination(
          {
            kind: 'single_elimination',
            thirdPlaceMatch: false,
            defaultBestOf: choice.playoffBestOf,
            finalBestOf: choice.playoffFinalBestOf,
          },
          qualifiers,
        ),
        entrySeeding: [
          {
            id: newSeedingRuleId(),
            source: {
              kind: 'group_standings',
              stageId: firstStageId,
              placeRange: { from: 1, to: choice.advancePerGroup },
            },
            targetSlots: { from: 1, to: qualifiers },
            // Snake keeps the group winners in opposite halves of the bracket,
            // so they cannot meet before the final.
            order: 'snake',
          },
        ],
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      return [groupStage, playoffs];
    }

    default:
      return [];
  }
}

function singleElimination(
  choice: Extract<FormatChoice, { kind: 'single_elimination' }>,
  participantCount: number,
): FormatConfig {
  const rounds = roundCount(participantCount);

  return {
    kind: 'single_elimination',
    thirdPlaceMatch: choice.thirdPlaceMatch,
    byePlacement: 'seeded',
    // Stated rather than inherited: the arrangement decides which position each
    // seed occupies, and a stored result names a position.
    seedArrangement: 'standard',
    matchFormats: {
      default: bestOf(choice.defaultBestOf),
      // The final gets its own length; the third place match shares that round.
      ...(rounds >= 1 ? { byRound: { [rounds - 1]: bestOf(choice.finalBestOf) } } : {}),
    },
  };
}

function doubleElimination(
  choice: Extract<FormatChoice, { kind: 'double_elimination' }>,
  participantCount: number,
): FormatConfig {
  const rounds = roundCount(participantCount);

  return {
    kind: 'double_elimination',
    grandFinal: choice.grandFinal,
    seedArrangement: 'standard',
    // The drop order that keeps a beaten opponent out of the way. The other
    // strategies exist so an imported bracket can be reproduced exactly.
    loserBracketSeeding: 'balanced',
    matchFormats: {
      default: bestOf(choice.defaultBestOf),
      // Applies to the winner bracket final and, through it, the grand final.
      ...(rounds >= 1 ? { byRound: { [rounds - 1]: bestOf(choice.finalBestOf) } } : {}),
    },
  };
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

function bestOf(games: BestOf): MatchFormat {
  return games === 1 ? { kind: 'single_game' } : { kind: 'bo', games };
}

export type { StageId };

import {
  outcomeFromGames,
  type GameResult,
  type IsoDateTime,
  type Match,
  type MatchOutcome,
  type StageId,
  type TournamentId,
} from '@models/index';

import type { StructuralMatch } from './formats/types';

export interface MaterializeInput {
  structural: StructuralMatch;
  tournamentId: TournamentId;
  stageId: StageId;
  /** Passed in rather than read from the clock, so this stays pure. */
  timestamp: IsoDateTime;
}

/**
 * Creates the stored record for a match that so far existed only in the derived
 * structure.
 *
 * Most matches of a bracket have no row in the database: only results are
 * persisted, and a match nobody has played yet carries no information worth
 * storing. The moment someone enters a score — or a note, or a stream link — the
 * match needs a record, and this builds it.
 *
 * The identifier comes from the structure and is derived from stage and
 * position, so the new record attaches to exactly the match that was clicked.
 */
export function materializeMatch(input: MaterializeInput): Match {
  const { structural, tournamentId, stageId, timestamp } = input;

  return {
    id: structural.id,
    tournamentId,
    stageId,
    position: structural.position,
    slotA: structural.slotA,
    slotB: structural.slotB,
    format: structural.format,
    games: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export interface ApplyResultInput {
  /** Existing record, or undefined when the match has never been stored. */
  existing: Match | undefined;
  structural: StructuralMatch;
  tournamentId: TournamentId;
  stageId: StageId;
  games: GameResult[];
  /**
   * Explicit outcome for a walkover, forfeit or administrative correction.
   * When omitted the outcome follows from the maps played.
   */
  outcome?: MatchOutcome | undefined;
  timestamp: IsoDateTime;
}

/**
 * Applies a result to a match, creating the record if needed.
 *
 * An explicit outcome always wins over the maps: that is how a walkover is
 * expressed, and how an administrator overrides what was played. Without one the
 * outcome is left off the record entirely and derived from the games, so a
 * half-entered series stays open rather than declaring a premature winner.
 */
export function applyMatchResult(input: ApplyResultInput): Match {
  const { existing, structural, tournamentId, stageId, games, outcome, timestamp } = input;

  const base = existing ?? materializeMatch({ structural, tournamentId, stageId, timestamp });

  const derived = outcome ?? outcomeFromGames(games, base.format, timestamp);

  return {
    ...base,
    // The structure is the authority on who plays whom; a stored slot could be
    // stale after the bracket was regenerated.
    position: structural.position,
    slotA: structural.slotA,
    slotB: structural.slotB,
    format: structural.format,
    games,
    ...(derived ? { outcome: derived } : {}),
    updatedAt: timestamp,
  };
}

/**
 * Removes a result while keeping everything a user typed.
 *
 * Notes, schedule and links survive: clearing a score is a correction, not a
 * reason to discard the rest of the record.
 */
export function clearMatchResult(match: Match, timestamp: IsoDateTime): Match {
  const { outcome: _outcome, ...rest } = match;
  return { ...rest, games: [], updatedAt: timestamp };
}

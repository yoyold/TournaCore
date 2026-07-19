import type { IsoDateTime, Timestamps } from './common';
import type { GameResultId, MapId, MatchId, ParticipantId, StageId, TournamentId } from './ids';

/** How many games decide a match. */
export type MatchFormat = { kind: 'bo'; games: 1 | 3 | 5 | 7 } | { kind: 'single_game' };

/** Best-of format per round, falling back to `default` for unlisted rounds. */
export interface RoundMatchFormats {
  default: MatchFormat;
  /** Keyed by round index, 0 being the first round. */
  byRound?: Record<number, MatchFormat>;
}

export type MatchStatus =
  /** Waiting for at least one participant to be determined. */
  | 'pending'
  /** Both participants known, not started. */
  | 'ready'
  | 'live'
  | 'completed'
  /** Decided without being played. */
  | 'walkover'
  | 'cancelled';

export type BracketSection = 'winner' | 'loser' | 'grand_final' | 'third_place';

/**
 * Where a match sits inside its stage's structure.
 *
 * Set by the format engine, never by the user. Together with the stage this
 * uniquely identifies a match, which is what makes deterministic match
 * identifiers possible.
 */
export interface MatchPosition {
  bracket?: BracketSection;
  /** 0-based. */
  round: number;
  /** 0-based index within the round. */
  indexInRound: number;
  /** Group index for group stages, 0-based. */
  groupIndex?: number;
  /** Leg for double round robin. */
  leg?: 1 | 2;
}

/**
 * A match slot is either a concrete participant or a reference to something not
 * yet decided.
 *
 * Resolving these references IS the automatic progression. There is no separate
 * "advance the winner" step anywhere in the codebase, which is precisely why a
 * corrected result propagates instead of leaving the bracket inconsistent.
 */
export type MatchSlot =
  | { kind: 'participant'; participantId: ParticipantId }
  | { kind: 'winner_of'; matchId: MatchId }
  | { kind: 'loser_of'; matchId: MatchId }
  /** Filled by a seeding rule. `slotIndex` is 1-based. */
  | { kind: 'seeded'; slotIndex: number }
  /** No opponent: the other side advances without playing. */
  | { kind: 'bye' }
  | { kind: 'tbd' };

export type MatchWinner = 'A' | 'B' | 'draw';

/** Result of a single map. */
export interface GameResult {
  id: GameResultId;
  /** 1-based map number within the match. */
  index: number;
  mapId?: MapId;
  scoreA: number;
  scoreB: number;
  winner?: MatchWinner;
  pickedBy?: 'A' | 'B' | 'decider';
  sideA?: string;
  notes?: string;
}

export type OutcomeReason =
  | 'played'
  /** No opponent existed; awarded by the bracket structure. */
  | 'bye'
  | 'walkover'
  | 'forfeit'
  | 'disqualification'
  /** Set by an administrator, overriding the played result. */
  | 'manual';

export interface MatchOutcome {
  winner: MatchWinner;
  reason: OutcomeReason;
  decidedAt: IsoDateTime;
}

/**
 * A match as stored.
 *
 * Note what is here and what is not. Stored: the structural slots, the schedule,
 * per-map results, notes and links — everything a user enters or the structure
 * fixes. Not stored: which participant actually occupies each slot, and the
 * aggregate score. Both are derived, so correcting an earlier result updates
 * them automatically.
 */
export interface Match extends Timestamps {
  id: MatchId;
  tournamentId: TournamentId;
  stageId: StageId;
  position: MatchPosition;
  slotA: MatchSlot;
  slotB: MatchSlot;
  format: MatchFormat;
  scheduledAt?: IsoDateTime;
  games: GameResult[];
  outcome?: MatchOutcome;
  streamUrl?: string;
  vodUrl?: string;
  notes?: string;
}

/**
 * Aggregate match score, derived from the per-map results.
 *
 * Deliberately not a stored field: keeping it in sync with `games[]` by hand is
 * exactly the kind of redundancy that drifts.
 */
export function matchScore(games: readonly GameResult[]): { a: number; b: number } {
  let a = 0;
  let b = 0;
  for (const game of games) {
    if (game.winner === 'A') a += 1;
    else if (game.winner === 'B') b += 1;
  }
  return { a, b };
}

/** Number of map wins required to take the match. */
export function gamesToWin(format: MatchFormat): number {
  return format.kind === 'single_game' ? 1 : Math.ceil(format.games / 2);
}

/**
 * Derives the outcome implied by the maps played, or undefined while the match
 * is still open. Explicitly recorded outcomes (walkover, forfeit) take
 * precedence and are handled by the caller.
 */
export function outcomeFromGames(
  games: readonly GameResult[],
  format: MatchFormat,
  decidedAt: IsoDateTime,
): MatchOutcome | undefined {
  const needed = gamesToWin(format);
  const { a, b } = matchScore(games);

  if (a >= needed && a > b) return { winner: 'A', reason: 'played', decidedAt };
  if (b >= needed && b > a) return { winner: 'B', reason: 'played', decidedAt };
  return undefined;
}

import type {
  FormatConfig,
  MatchFormat,
  MatchId,
  MatchOutcome,
  MatchPosition,
  MatchSlot,
  MatchStatus,
  ParticipantId,
  StageId,
} from '@models/index';

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

/**
 * One match as the format defines it, before any results exist.
 *
 * The slots here are structural references ("winner of match X"), not concrete
 * participants. Which team actually plays is derived, never stored.
 */
export interface StructuralMatch {
  id: MatchId;
  position: MatchPosition;
  slotA: MatchSlot;
  slotB: MatchSlot;
  format: MatchFormat;
}

export interface RoundInfo {
  /** 0-based. */
  round: number;
  /** Display name such as "Quarterfinals" is resolved in the UI layer. */
  matchCount: number;
  bracket?: MatchPosition['bracket'];
}

/** The complete match skeleton of one stage. */
export interface GeneratedStructure {
  stageId: StageId;
  /** Number of entry slots the structure consumes, padded to the format's needs. */
  slotCount: number;
  matches: StructuralMatch[];
  rounds: RoundInfo[];
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/** A slot after resolution: known participant, a bye, or still undetermined. */
export type ResolvedSlot =
  | { kind: 'participant'; participantId: ParticipantId }
  | { kind: 'bye' }
  | { kind: 'tbd'; source: MatchSlot };

export interface ResolvedMatch {
  id: MatchId;
  position: MatchPosition;
  format: MatchFormat;
  slotA: ResolvedSlot;
  slotB: ResolvedSlot;
  status: MatchStatus;
  outcome?: MatchOutcome;
  /** Winning participant, once decided. Undefined for draws and open matches. */
  winnerId?: ParticipantId;
  loserId?: ParticipantId;
  /**
   * True when the match exists only to carry a participant past an empty slot.
   * Such matches are decided on creation and are not shown as playable.
   */
  isBye: boolean;
}

export interface ResolvedStructure {
  stageId: StageId;
  matches: ResolvedMatch[];
  byId: ReadonlyMap<MatchId, ResolvedMatch>;
  /** True once every playable match has an outcome. */
  isComplete: boolean;
}

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

export interface Standing {
  participantId: ParticipantId;
  /** 1-based. Equal ranks share a value, e.g. two participants placed 3rd. */
  rank: number;
  /** Points where the format awards them; undefined for pure brackets. */
  points?: number;
  wins: number;
  losses: number;
  draws: number;
  mapsWon: number;
  mapsLost: number;
  /** Which criterion settled a tie against the next entry, for UI explanation. */
  tiebreakerApplied?: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidationIssue {
  /** Stable key so the UI can translate the message. */
  code: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export const VALID: ValidationResult = { valid: true, issues: [] };

export function invalid(code: string, message: string): ValidationResult {
  return { valid: false, issues: [{ code, severity: 'error', message }] };
}

// ---------------------------------------------------------------------------
// The format contract
// ---------------------------------------------------------------------------

export interface ResolveInput {
  structure: GeneratedStructure;
  /** Recorded outcomes, keyed by match. Absent means the match is still open. */
  results: ReadonlyMap<MatchId, MatchOutcome>;
  /** Entry slots filled by seeding rules, keyed by 1-based slot index. */
  seededSlots: ReadonlyMap<number, ParticipantId>;
}

export interface StandingsInput<TConfig extends FormatConfig> {
  structure: ResolvedStructure;
  config: TConfig;
  seededSlots: ReadonlyMap<number, ParticipantId>;
}

/**
 * The contract every tournament format implements.
 *
 * Formats are plugins registered in a registry, so adding one means a new file
 * and a registration call rather than a change to the engine. All four methods
 * are pure: same input, same output, no I/O, no clock beyond what is passed in.
 */
export interface TournamentFormat<TConfig extends FormatConfig = FormatConfig> {
  readonly kind: TConfig['kind'];

  /** Builds the match skeleton. Must be deterministic. */
  generateStructure(input: {
    stageId: StageId;
    config: TConfig;
    slotCount: number;
  }): GeneratedStructure;

  /** Resolves structural references against known results. */
  resolveSlots(input: ResolveInput): ResolvedStructure;

  /** Ranking as of the current state. */
  computeStandings(input: StandingsInput<TConfig>): Standing[];

  /** Checks a configuration before generating, so the UI can explain problems. */
  validate(config: TConfig, slotCount: number): ValidationResult;
}

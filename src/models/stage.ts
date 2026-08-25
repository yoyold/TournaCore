import type { Timestamps } from './common';
import type { ParticipantId, SeedingRuleId, StageId, TournamentId } from './ids';
import type { MatchFormat, RoundMatchFormats } from './match';

// ---------------------------------------------------------------------------
// Scoring and tiebreaking
// ---------------------------------------------------------------------------

export interface PointSystem {
  win: number;
  draw: number;
  loss: number;
  forfeit: number;
}

/**
 * A single criterion in a tiebreaking chain.
 *
 * Applied in the order configured, each one only deciding among entries the
 * previous criteria left level. `seed` is the usual final fallback because it
 * always produces a total order, while `manual` hands the decision to an
 * administrator.
 */
export type Tiebreaker =
  | 'points'
  | 'head_to_head'
  | 'map_difference'
  | 'round_difference'
  | 'maps_won'
  | 'buchholz'
  | 'median_buchholz'
  | 'seed'
  | 'manual';

export const DEFAULT_POINT_SYSTEM: PointSystem = { win: 3, draw: 1, loss: 0, forfeit: 0 };

export const DEFAULT_TIEBREAKERS: readonly Tiebreaker[] = [
  'points',
  'head_to_head',
  'map_difference',
  'round_difference',
  'seed',
];

// ---------------------------------------------------------------------------
// Format configuration
// ---------------------------------------------------------------------------

/**
 * Which arrangement of the standard seeding order a bracket uses.
 *
 * Both put the same participants in the same first-round pairings and let seeds
 * one and two meet only in the final. They differ in the *order* of the matches,
 * and that is not cosmetic: a stored result names a position, not a pairing, so
 * changing the arrangement under existing data silently reassigns every result.
 *
 * It is therefore configuration rather than a constant. `standard` is what
 * tournament software agrees on and what new tournaments use; `mirrored` exists
 * because stages created before this was configurable were drawn that way, and
 * their recorded results have to keep meaning what they meant.
 */
export type SeedArrangement = 'standard' | 'mirrored';

/** Arrangement for a stage that predates the setting. Never change this. */
export const LEGACY_SEED_ARRANGEMENT: SeedArrangement = 'mirrored';

export interface SingleEliminationConfig {
  kind: 'single_elimination';
  thirdPlaceMatch: boolean;
  /** Whether byes follow the seeding or are drawn at random. */
  byePlacement: 'seeded' | 'random';
  /** Absent on stages created before the setting existed. */
  seedArrangement?: SeedArrangement;
  matchFormats: RoundMatchFormats;
}

export interface DoubleEliminationConfig {
  kind: 'double_elimination';
  /** Whether the loser bracket winner needs to beat the winner bracket twice. */
  grandFinal: 'single' | 'bracket_reset';
  /**
   * How winner bracket casualties are distributed across the loser bracket
   * round that receives them.
   *
   * - `standard` keeps the order, which frequently pairs someone straight back
   *   against the opponent who just knocked them out.
   * - `reversed` turns the whole round around. This is what most bracket
   *   software does, so it is the setting that reproduces an imported draw —
   *   but from sixteen participants upwards it mixes the halves of the bracket
   *   early and can still produce a rematch a round or two later.
   * - `balanced` swaps each pair of drop slots, sending a casualty to the
   *   sibling subtree. Provably rematch-free wherever the round offers a
   *   choice, and the default for tournaments created here.
   * - `alternating` reverses the first drop round, then reverses and rotates by
   *   half on the next, and so on. Challonge draws its brackets this way, so it
   *   is what an import from there needs.
   */
  loserBracketSeeding: 'standard' | 'reversed' | 'balanced' | 'alternating';
  /** Absent on stages created before the setting existed. */
  seedArrangement?: SeedArrangement;
  matchFormats: RoundMatchFormats;
}

export interface RoundRobinConfig {
  kind: 'round_robin';
  /** 1 for a single round, 2 for home and away. */
  legs: 1 | 2;
  pointSystem: PointSystem;
  tiebreakers: Tiebreaker[];
  matchFormat: MatchFormat;
}

export interface GroupStageConfig {
  kind: 'group_stage';
  groupCount: number;
  /**
   * How participants are spread across groups. `snake` alternates direction each
   * pass so group strength stays balanced.
   */
  distribution: 'snake' | 'sequential' | 'random' | 'manual';
  /**
   * Explicit membership for `manual`: one array of 1-based entry slots per
   * group.
   *
   * Needed wherever the grouping is a fact rather than something to compute — a
   * draw made elsewhere, or an imported tournament whose groups were already
   * played. Ignored by every other distribution.
   */
  groups?: number[][];
  perGroup: Omit<RoundRobinConfig, 'kind'>;
}

export interface SwissConfig {
  kind: 'swiss';
  rounds: number;
  pairing: 'dutch' | 'random_within_score_group';
  avoidRematches: boolean;
  pointSystem: PointSystem;
  tiebreakers: Tiebreaker[];
  matchFormat: MatchFormat;
}

/**
 * Default tie-breaking for Swiss.
 *
 * Strength of schedule comes first here, unlike in a league: two participants on
 * the same score have faced entirely different opponents, and which of those
 * fields was harder is the most informative thing left to compare.
 */
export const DEFAULT_SWISS_TIEBREAKERS: readonly Tiebreaker[] = [
  'points',
  'buchholz',
  'median_buchholz',
  'head_to_head',
  'map_difference',
  'seed',
];

export type FormatConfig =
  | SingleEliminationConfig
  | DoubleEliminationConfig
  | RoundRobinConfig
  | GroupStageConfig
  | SwissConfig;

export type FormatKind = FormatConfig['kind'];

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/** Inclusive range, 1-based. */
export interface Range {
  from: number;
  to: number;
}

/**
 * Where the participants of a stage come from.
 *
 * This union is the mechanism that makes multi-phase tournaments composable.
 * Because a stage declares its own source rather than a preceding stage pushing
 * into it, arbitrary chains work without any format knowing about the others.
 */
export type SeedingSource =
  /** Straight from the tournament entry list. */
  | { kind: 'participants'; seedRange?: Range }
  /** Placements in a round robin or Swiss stage. */
  | { kind: 'stage_standings'; stageId: StageId; placeRange: Range }
  /** Placements within each group, e.g. the top two of every group. */
  | { kind: 'group_standings'; stageId: StageId; placeRange: Range }
  /** Losers of one bracket round, used to feed a loser bracket. */
  | { kind: 'bracket_losers'; stageId: StageId; round: number }
  | { kind: 'manual'; participantIds: ParticipantId[] };

/** Fills a contiguous range of a stage's entry slots from one source. */
export interface SeedingRule {
  id: SeedingRuleId;
  source: SeedingSource;
  targetSlots: Range;
  /**
   * `snake` reverses every other group when merging multiple sources, so group
   * winners do not all end up in the same half of a bracket.
   */
  order: 'as_ranked' | 'snake' | 'random';
}

// ---------------------------------------------------------------------------
// Stage
// ---------------------------------------------------------------------------

export interface Stage extends Timestamps {
  id: StageId;
  tournamentId: TournamentId;
  name: string;
  /** Position within the tournament, ascending. */
  order: number;
  format: FormatConfig;
  entrySeeding: SeedingRule[];
}

/** Total number of entry slots a stage's seeding rules provide. */
export function stageSlotCount(rules: readonly SeedingRule[]): number {
  let max = 0;
  for (const rule of rules) {
    if (rule.targetSlots.to > max) max = rule.targetSlots.to;
  }
  return max;
}

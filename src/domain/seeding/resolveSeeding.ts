import { assertNever } from '@utils/invariant';

import type { ResolvedStructure, Standing } from '../formats/types';
import type {
  Participant,
  ParticipantId,
  SeedingRule,
  SeedingSource,
  StageId,
} from '@models/index';

/**
 * What a previously derived stage exposes to the stages that follow it.
 *
 * Kept deliberately narrow: seeding only ever needs rankings and the resolved
 * bracket, never the full derivation. A narrow interface also keeps this module
 * free of a circular dependency on the derivation entry point.
 */
export interface SeedingSourceStage {
  stageId: StageId;
  standings: readonly Standing[];
  resolved: ResolvedStructure;
  /**
   * Whether every playable match of the stage has a result.
   *
   * Placement-based sources refuse to produce participants before this is true.
   * An unfinished stage does have standings, but they are provisional — feeding
   * them forward would populate the next bracket with entries that reshuffle on
   * every new result, which reads as the software randomly changing its mind.
   */
  isComplete: boolean;
  /** Standings per group, for stages that have groups. Empty otherwise. */
  groupStandings?: readonly (readonly Standing[])[];
}

export interface ResolveSeedingInput {
  rules: readonly SeedingRule[];
  participants: readonly Participant[];
  /** Stages already derived, keyed by id. Later stages read from these. */
  previousStages: ReadonlyMap<StageId, SeedingSourceStage>;
  /**
   * Used to make `random` ordering reproducible.
   *
   * Derivation must be deterministic — the same inputs must always produce the
   * same bracket, otherwise two devices would disagree and a reload would
   * reshuffle a running tournament. A random draw is therefore seeded from a
   * stable value rather than Math.random.
   */
  drawSeed: string;
}

/**
 * Resolves a stage's seeding rules into concrete entry slots.
 *
 * Returns a map from 1-based slot index to participant. Slots left unfilled —
 * because a source has not produced enough results yet, or because the bracket
 * is padded beyond the participant count — are simply absent, and the format
 * treats them as byes or as undetermined.
 */
export function resolveSeeding(input: ResolveSeedingInput): Map<number, ParticipantId> {
  const { rules, participants, previousStages, drawSeed } = input;
  const slots = new Map<number, ParticipantId>();

  for (const rule of rules) {
    const candidates = participantsFromSource(rule.source, participants, previousStages);
    const ordered = applyOrder(candidates, rule.order, `${drawSeed}:${rule.id}`);

    const { from, to } = rule.targetSlots;
    for (let offset = 0; offset <= to - from; offset += 1) {
      const participantId = ordered[offset];
      if (participantId === undefined) break;
      slots.set(from + offset, participantId);
    }
  }

  return slots;
}

function participantsFromSource(
  source: SeedingSource,
  participants: readonly Participant[],
  previousStages: ReadonlyMap<StageId, SeedingSourceStage>,
): ParticipantId[] {
  switch (source.kind) {
    case 'participants': {
      const active = [...participants]
        .filter((p) => p.status === 'active')
        .sort((a, b) => a.seed - b.seed);
      const range = source.seedRange;
      const selected = range
        ? active.filter((p) => p.seed >= range.from && p.seed <= range.to)
        : active;
      return selected.map((p) => p.id);
    }

    case 'stage_standings': {
      const stage = previousStages.get(source.stageId);
      if (!stage?.isComplete) return [];
      return pickPlaces(stage.standings, source.placeRange);
    }

    case 'group_standings': {
      const stage = previousStages.get(source.stageId);
      if (!stage?.isComplete || !stage.groupStandings) return [];
      /*
       * Collected place by place across groups rather than group by group:
       * all group winners first, then all runners-up. Combined with `snake`
       * ordering this keeps the winners out of the same bracket half.
       */
      const result: ParticipantId[] = [];
      for (let place = source.placeRange.from; place <= source.placeRange.to; place += 1) {
        for (const group of stage.groupStandings) {
          const entry = group.find((s) => s.rank === place);
          if (entry) result.push(entry.participantId);
        }
      }
      return result;
    }

    case 'bracket_losers': {
      const stage = previousStages.get(source.stageId);
      if (!stage) return [];
      return stage.resolved.matches
        .filter((m) => m.position.round === source.round && !m.isBye)
        .sort((a, b) => a.position.indexInRound - b.position.indexInRound)
        .flatMap((m) => (m.loserId === undefined ? [] : [m.loserId]));
    }

    case 'manual':
      return [...source.participantIds];

    default:
      return assertNever(source, 'unhandled seeding source');
  }
}

function pickPlaces(
  standings: readonly Standing[],
  range: { from: number; to: number },
): ParticipantId[] {
  return standings
    .filter((s) => s.rank >= range.from && s.rank <= range.to)
    .sort((a, b) => a.rank - b.rank)
    .map((s) => s.participantId);
}

function applyOrder(
  ids: readonly ParticipantId[],
  order: SeedingRule['order'],
  seed: string,
): ParticipantId[] {
  switch (order) {
    case 'as_ranked':
      return [...ids];

    case 'snake':
      return snake([...ids]);

    case 'random':
      return deterministicShuffle([...ids], seed);

    default:
      return assertNever(order, 'unhandled seeding order');
  }
}

/**
 * Reverses every second pair, spreading equally ranked entries apart.
 *
 * Used when several sources of equal strength feed one bracket, so that the
 * winners of group A and group B do not land in the same half.
 */
function snake(ids: ParticipantId[]): ParticipantId[] {
  const result: ParticipantId[] = [];
  for (let i = 0; i < ids.length; i += 2) {
    const first = ids[i];
    const second = ids[i + 1];
    if (first === undefined) break;
    if (second === undefined) {
      result.push(first);
      break;
    }
    // Alternate the pair order so consecutive ranks end up on opposite sides.
    if ((i / 2) % 2 === 0) result.push(first, second);
    else result.push(second, first);
  }
  return result;
}

/**
 * Fisher-Yates driven by a seeded generator.
 *
 * Math.random would break determinism: reloading a tournament would redraw it.
 */
function deterministicShuffle(ids: ParticipantId[], seed: string): ParticipantId[] {
  const random = mulberry32(hashString(seed));
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = ids[i];
    const b = ids[j];
    if (a === undefined || b === undefined) continue;
    ids[i] = b;
    ids[j] = a;
  }
  return ids;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

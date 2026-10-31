import { computeStandings } from '@domain/standings/computeStandings';

import { VALID } from '../types';

import { generateRoundRobin } from './generate';

import type {
  ResolveInput,
  ResolvedMatch,
  ResolvedSlot,
  ResolvedStructure,
  Standing,
  StandingsInput,
  TournamentFormat,
  ValidationResult,
} from '../types';
import type { MatchId, MatchSlot, ParticipantId, RoundRobinConfig, StageId } from '@models/index';

/** Upper bound: a full double round robin above this is unmanageable in one table. */
const MAX_SLOTS = 64;

/**
 * Resolves a schedule whose pairings never depend on a result.
 *
 * Every slot is an entry slot, so this is a straight lookup — no ordering
 * constraints and no propagation, unlike an elimination bracket.
 */
export function resolveRoundRobin(input: ResolveInput): ResolvedStructure {
  const { structure, results, seededSlots, entriesPending = false } = input;

  const resolved = new Map<MatchId, ResolvedMatch>();
  const ordered: ResolvedMatch[] = [];

  for (const match of structure.matches) {
    const slotA = resolveSlot(match.slotA, seededSlots, entriesPending);
    const slotB = resolveSlot(match.slotB, seededSlots, entriesPending);

    const participantA = slotA.kind === 'participant' ? slotA.participantId : undefined;
    const participantB = slotB.kind === 'participant' ? slotB.participantId : undefined;

    /*
     * A slot still waiting on an earlier stage is not an absent opponent: the
     * fixture will be played, by somebody nobody has named yet.
     */
    const isPending = slotA.kind === 'tbd' || slotB.kind === 'tbd';

    /*
     * An unfilled slot means the entry list is shorter than the schedule expects.
     * The fixture simply cannot be played, so it is marked as a bye rather than
     * being awarded to whoever happens to be present — a league where a team
     * collects points against nobody is not a league.
     */
    const isBye = !isPending && (participantA === undefined || participantB === undefined);

    const recorded = results.get(match.id);
    const outcome = isBye || isPending ? undefined : recorded;

    const status = isPending
      ? ('pending' as const)
      : isBye
        ? ('cancelled' as const)
        : outcome
          ? outcome.reason === 'played' || outcome.reason === 'manual'
            ? ('completed' as const)
            : ('walkover' as const)
          : ('ready' as const);

    const winnerId =
      outcome && outcome.winner !== 'draw'
        ? outcome.winner === 'A'
          ? participantA
          : participantB
        : undefined;
    const loserId =
      outcome && outcome.winner !== 'draw'
        ? outcome.winner === 'A'
          ? participantB
          : participantA
        : undefined;

    const entry: ResolvedMatch = {
      id: match.id,
      position: match.position,
      format: match.format,
      slotA,
      slotB,
      status,
      isBye,
      ...(outcome ? { outcome } : {}),
      ...(winnerId !== undefined ? { winnerId } : {}),
      ...(loserId !== undefined ? { loserId } : {}),
    };

    resolved.set(match.id, entry);
    ordered.push(entry);
  }

  const isComplete = ordered.every((match) => match.isBye || match.outcome !== undefined);

  return { stageId: structure.stageId, matches: ordered, byId: resolved, isComplete };
}

function resolveSlot(
  slot: MatchSlot,
  seededSlots: ReadonlyMap<number, ParticipantId>,
  entriesPending: boolean,
): ResolvedSlot {
  if (slot.kind === 'participant') {
    return { kind: 'participant', participantId: slot.participantId };
  }
  if (slot.kind === 'seeded') {
    const participantId = seededSlots.get(slot.slotIndex);
    if (participantId !== undefined) return { kind: 'participant', participantId };
    return entriesPending ? { kind: 'tbd', source: slot } : { kind: 'bye' };
  }
  return { kind: 'bye' };
}

function validate(_config: RoundRobinConfig, slotCount: number): ValidationResult {
  const issues = [];

  if (slotCount < 2) {
    issues.push({
      code: 'round_robin.too_few_participants',
      severity: 'error' as const,
      message: 'A round robin needs at least two participants.',
    });
  }

  if (slotCount > MAX_SLOTS) {
    issues.push({
      code: 'round_robin.too_many_participants',
      severity: 'error' as const,
      message: `A round robin supports at most ${String(MAX_SLOTS)} participants.`,
    });
  }

  // `legs` needs no check: the type admits only 1 or 2.
  return issues.length === 0 ? VALID : { valid: false, issues };
}

function standings(input: StandingsInput<RoundRobinConfig>): Standing[] {
  return computeStandings({
    participants: [...input.seededSlots.values()],
    matches: input.structure.matches,
    storedMatches: input.storedMatches ?? new Map(),
    pointSystem: input.config.pointSystem,
    tiebreakers: input.config.tiebreakers,
    seedOf: (participantId) => seedOfSlot(input.seededSlots, participantId),
  });
}

/** Entry slot a participant occupies, which doubles as its seed. */
export function seedOfSlot(
  seededSlots: ReadonlyMap<number, ParticipantId>,
  participantId: ParticipantId,
): number {
  for (const [slotIndex, id] of seededSlots) {
    if (id === participantId) return slotIndex;
  }
  return Number.MAX_SAFE_INTEGER;
}

export const roundRobinFormat: TournamentFormat<RoundRobinConfig> = {
  kind: 'round_robin',
  generateStructure: ({
    stageId,
    config,
    slotCount,
  }: {
    stageId: StageId;
    config: RoundRobinConfig;
    slotCount: number;
  }) =>
    generateRoundRobin({
      stageId,
      shape: { slotCount, legs: config.legs, matchFormat: config.matchFormat },
    }),
  resolveSlots: resolveRoundRobin,
  computeStandings: standings,
  validate,
};

export { generateRoundRobin, circleMethodRounds } from './generate';

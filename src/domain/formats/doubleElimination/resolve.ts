import { assertNever } from '@utils/invariant';

import type { ResolveInput, ResolvedMatch, ResolvedSlot, ResolvedStructure } from '../types';
import type {
  DoubleEliminationConfig,
  MatchId,
  MatchOutcome,
  MatchSlot,
  MatchStatus,
  ParticipantId,
} from '@models/index';

/**
 * Resolves a double elimination structure.
 *
 * Structural order is dependency order — every winner bracket round precedes the
 * loser rounds that take its casualties, and the grand final comes last — so one
 * pass suffices, with no recursion or fixpoint loop.
 *
 * Two things make this more than the single elimination resolver:
 *
 * 1. **Empty slots propagate.** A bye in the winner bracket produces no loser,
 *    so the loser bracket match expecting one has an empty side. Left as "to be
 *    determined" it would wait for a player who is never coming and hold the
 *    stage open forever. Resolved as a bye it advances, which is what actually
 *    happens in a bracket short of a power of two.
 * 2. **The bracket reset is conditional.** It exists in the structure but is
 *    only played when the loser bracket entrant wins the grand final. Reported
 *    as cancelled otherwise, so a match nobody will ever play cannot make a
 *    finished tournament look unfinished.
 */
export function resolveDoubleElimination(
  input: ResolveInput<DoubleEliminationConfig>,
): ResolvedStructure {
  const { structure, results, seededSlots } = input;

  const resolved = new Map<MatchId, ResolvedMatch>();
  const ordered: ResolvedMatch[] = [];

  for (const match of structure.matches) {
    const slotA = resolveSlot(match.slotA, resolved, seededSlots);
    const slotB = resolveSlot(match.slotB, resolved, seededSlots);

    const participantA = slotA.kind === 'participant' ? slotA.participantId : undefined;
    const participantB = slotB.kind === 'participant' ? slotB.participantId : undefined;

    const isEmpty = slotA.kind === 'bye' && slotB.kind === 'bye';
    const isBye =
      (slotA.kind === 'bye' && slotB.kind === 'participant') ||
      (slotB.kind === 'bye' && slotA.kind === 'participant');

    const isReset = match.position.bracket === 'grand_final' && match.position.round === 1;
    const notNeeded = isReset && !resetRequired(structure, resolved);

    const recorded = results.get(match.id);
    let outcome: MatchOutcome | undefined = recorded;
    let status: MatchStatus;

    if (isEmpty || notNeeded) {
      // Nothing to play. A recorded result cannot resurrect a match the
      // structure never called for.
      outcome = undefined;
      status = 'cancelled';
    } else if (isBye) {
      outcome = {
        winner: slotA.kind === 'participant' ? 'A' : 'B',
        reason: 'bye',
        decidedAt: '',
      };
      status = 'walkover';
    } else if (recorded) {
      status =
        recorded.reason === 'played' || recorded.reason === 'manual' ? 'completed' : 'walkover';
    } else if (participantA !== undefined && participantB !== undefined) {
      status = 'ready';
    } else {
      status = 'pending';
    }

    const winnerId = outcome ? (outcome.winner === 'A' ? participantA : participantB) : undefined;
    const loserId = outcome ? (outcome.winner === 'A' ? participantB : participantA) : undefined;

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

  const isComplete = ordered.every(
    (match) => match.isBye || match.status === 'cancelled' || match.outcome !== undefined,
  );

  return { stageId: structure.stageId, matches: ordered, byId: resolved, isComplete };
}

/**
 * Whether the bracket reset has to be played.
 *
 * The grand final's side A is by construction the winner bracket entrant, who
 * arrives having lost nothing. If they win, the tournament is over. If they
 * lose, both finalists have one loss and the format demands a decider.
 */
function resetRequired(
  structure: ResolveInput<DoubleEliminationConfig>['structure'],
  resolved: ReadonlyMap<MatchId, ResolvedMatch>,
): boolean {
  const grandFinal = structure.matches.find(
    (match) => match.position.bracket === 'grand_final' && match.position.round === 0,
  );
  if (!grandFinal) return false;

  const outcome = resolved.get(grandFinal.id)?.outcome;
  // Still undecided: the reset is not cancelled, it simply has no participants
  // yet, and stays pending.
  if (!outcome) return true;

  return outcome.winner !== 'A';
}

function resolveSlot(
  slot: MatchSlot,
  resolved: ReadonlyMap<MatchId, ResolvedMatch>,
  seededSlots: ReadonlyMap<number, ParticipantId>,
): ResolvedSlot {
  switch (slot.kind) {
    case 'participant':
      return { kind: 'participant', participantId: slot.participantId };

    case 'bye':
      return { kind: 'bye' };

    case 'seeded': {
      const participantId = seededSlots.get(slot.slotIndex);
      return participantId === undefined ? { kind: 'bye' } : { kind: 'participant', participantId };
    }

    case 'winner_of':
      return yieldFrom(resolved.get(slot.matchId), 'winner', slot);

    case 'loser_of':
      return yieldFrom(resolved.get(slot.matchId), 'loser', slot);

    case 'tbd':
      return { kind: 'tbd', source: slot };

    default:
      return assertNever(slot, 'unhandled match slot');
  }
}

/** What a match hands on to the one referencing it. */
function yieldFrom(
  source: ResolvedMatch | undefined,
  want: 'winner' | 'loser',
  slot: MatchSlot,
): ResolvedSlot {
  if (!source) return { kind: 'tbd', source: slot };

  // A match both of whose sides were empty produces nobody at all. Whoever was
  // meant to come from it does not exist, so the referencing slot is a bye too —
  // that is how an empty corner of an oversized bracket collapses inwards.
  if (source.slotA.kind === 'bye' && source.slotB.kind === 'bye') return { kind: 'bye' };

  if (want === 'winner') {
    return source.winnerId !== undefined
      ? { kind: 'participant', participantId: source.winnerId }
      : { kind: 'tbd', source: slot };
  }

  // A bye has no loser, so nobody drops into the loser bracket from it.
  if (source.isBye) return { kind: 'bye' };

  return source.loserId !== undefined
    ? { kind: 'participant', participantId: source.loserId }
    : { kind: 'tbd', source: slot };
}

import { assertNever } from '@utils/invariant';

import type { ResolvedMatch, ResolvedSlot, ResolveInput, ResolvedStructure } from '../types';
import type { MatchId, MatchOutcome, MatchSlot, MatchStatus, ParticipantId } from '@models/index';

/** Participant occupying a resolved slot, or undefined for byes and open slots. */
function occupant(slot: ResolvedSlot): ParticipantId | undefined {
  return slot.kind === 'participant' ? slot.participantId : undefined;
}

/**
 * Resolves a bracket's structural references into concrete participants.
 *
 * Matches are processed in structural order, which for an elimination bracket
 * means every match a later one depends on has already been resolved. That is
 * what allows a single pass without recursion or a fixpoint loop.
 *
 * Byes are resolved here rather than being a special case in the caller: a match
 * facing an empty slot is decided immediately, and its winner flows onward
 * through exactly the same mechanism as a played result.
 */
export function resolveSingleElimination(input: ResolveInput): ResolvedStructure {
  const { structure, results, seededSlots } = input;

  const resolved = new Map<MatchId, ResolvedMatch>();
  const ordered: ResolvedMatch[] = [];

  for (const match of structure.matches) {
    const slotA = resolveSlot(match.slotA, resolved, seededSlots);
    const slotB = resolveSlot(match.slotB, resolved, seededSlots);

    const participantA = occupant(slotA);
    const participantB = occupant(slotB);

    /*
     * A bye match: exactly one side is empty while the other is known.
     *
     * Two byes can never meet. Byes occupy the highest seed numbers, and every
     * first-round pair sums to size+1, so a pair of byes would require the
     * participant count to be at most half the bracket size — impossible, since
     * the size is the smallest power of two that fits them.
     */
    const isBye =
      (slotA.kind === 'bye' && slotB.kind === 'participant') ||
      (slotB.kind === 'bye' && slotA.kind === 'participant');

    const recorded = results.get(match.id);
    let outcome: MatchOutcome | undefined = recorded;
    let status: MatchStatus;

    if (isBye) {
      // Decided by structure. A recorded result cannot override an absent opponent.
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

  const isComplete = ordered.every((match) => match.isBye || match.outcome !== undefined);

  return { stageId: structure.stageId, matches: ordered, byId: resolved, isComplete };
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
      // An entry slot with no participant is a bye, not an error: the bracket is
      // padded to a power of two and the surplus slots stay empty by design.
      return participantId === undefined ? { kind: 'bye' } : { kind: 'participant', participantId };
    }

    case 'winner_of': {
      const source = resolved.get(slot.matchId);
      return source?.winnerId !== undefined
        ? { kind: 'participant', participantId: source.winnerId }
        : { kind: 'tbd', source: slot };
    }

    case 'loser_of': {
      const source = resolved.get(slot.matchId);
      // A bye match has no real loser, so nobody drops down from it.
      if (source === undefined || source.isBye) return { kind: 'tbd', source: slot };
      return source.loserId !== undefined
        ? { kind: 'participant', participantId: source.loserId }
        : { kind: 'tbd', source: slot };
    }

    case 'tbd':
      return { kind: 'tbd', source: slot };

    default:
      return assertNever(slot, 'unhandled match slot');
  }
}

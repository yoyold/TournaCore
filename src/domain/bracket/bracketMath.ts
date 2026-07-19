import { InvariantError } from '@utils/invariant';

/**
 * Arithmetic for elimination brackets.
 *
 * Deliberately pure functions without dependencies: these values are needed both
 * by the format engine when generating structures and by the tournament wizard
 * when rendering a preview and validating input. Two separate implementations
 * would drift apart eventually, and a preview that disagrees with the resulting
 * bracket is especially confusing for users.
 */

/** Smallest power of two >= n. Always 1 for n <= 1. */
export function nextPowerOfTwo(n: number): number {
  assertNonNegativeInteger(n, 'nextPowerOfTwo');
  if (n <= 1) return 1;
  return 2 ** Math.ceil(Math.log2(n));
}

/**
 * Number of byes for a given participant count.
 *
 * Example: 13 participants fill a bracket of 16, leaving 3 byes.
 *
 * Byes are represented as a dedicated match slot kind and resolve to a decided
 * match immediately. Progression therefore needs no special case for them, which
 * is what makes arbitrary participant counts work without a separate code path.
 */
export function byeCount(participantCount: number): number {
  assertNonNegativeInteger(participantCount, 'byeCount');
  if (participantCount < 2) return 0;
  return nextPowerOfTwo(participantCount) - participantCount;
}

/** Number of rounds in a single elimination bracket, excluding a third place match. */
export function roundCount(participantCount: number): number {
  assertNonNegativeInteger(participantCount, 'roundCount');
  if (participantCount < 2) return 0;
  return Math.log2(nextPowerOfTwo(participantCount));
}

/** Total number of matches in a single elimination bracket. */
export function singleEliminationMatchCount(
  participantCount: number,
  options: { thirdPlaceMatch?: boolean } = {},
): number {
  assertNonNegativeInteger(participantCount, 'singleEliminationMatchCount');
  if (participantCount < 2) return 0;

  // Exactly one participant is eliminated per match, so determining a winner
  // always takes n-1 matches regardless of byes: bye matches are never created.
  const base = participantCount - 1;
  const needsThirdPlace = options.thirdPlaceMatch === true && participantCount >= 4;
  return needsThirdPlace ? base + 1 : base;
}

/** Match count per round, index 0 being the first round. */
export function matchesPerRound(participantCount: number): number[] {
  const rounds = roundCount(participantCount);
  const size = nextPowerOfTwo(participantCount);
  return Array.from({ length: rounds }, (_, round) => size / 2 ** (round + 1));
}

/**
 * Standard seeding order for a bracket of the given size.
 *
 * Returns seed numbers in slot order such that the strongest participants are
 * placed as far apart as possible. For 8 slots this yields
 * `[1, 8, 5, 4, 3, 6, 7, 2]`, so seeds 1 and 2 can only meet in the final.
 *
 * This also drives bye distribution: because byes occupy the highest seed
 * numbers, they automatically fall to the strongest participants, matching
 * common tournament practice.
 *
 * @param size Bracket size, must be a power of two.
 */
export function seedOrder(size: number): number[] {
  assertNonNegativeInteger(size, 'seedOrder');
  if (size !== nextPowerOfTwo(size)) {
    throw new InvariantError(`seedOrder expects a power of two, received ${String(size)}`);
  }
  if (size < 2) return [1];

  // Iterative doubling: each seed s of one level expands into the pair
  // (s, complement) of the next, where complement = 2n+1-s.
  //
  // The order within each pair must alternate by position. Without that
  // alternation the result is still a valid bracket with a constant pair sum,
  // but not the arrangement tournaments conventionally use: size 8 would come
  // out as [1,8,4,5,2,7,3,6] instead of [1,8,5,4,3,6,7,2].
  let order = [1, 2];
  while (order.length < size) {
    const total = order.length * 2 + 1;
    const next: number[] = [];
    order.forEach((seed, index) => {
      const complement = total - seed;
      if (index % 2 === 0) next.push(seed, complement);
      else next.push(complement, seed);
    });
    order = next;
  }
  return order;
}

function assertNonNegativeInteger(value: number, fn: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new InvariantError(`${fn} expects a non-negative integer, received ${String(value)}`);
  }
}

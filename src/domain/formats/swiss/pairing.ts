import { deterministicShuffle } from '@domain/random';

import type { ParticipantId, SwissConfig } from '@models/index';

/**
 * Upper bound on backtracking steps per score group.
 *
 * A rematch-free pairing is a perfect matching problem, and while real score
 * groups are small enough to solve instantly, a pathological one could otherwise
 * run for a very long time inside a pure derivation the UI calls on every
 * render. Exhausting the budget falls back to a pairing that permits rematches,
 * which is worse but immediate and still correct.
 */
const MAX_STEPS = 20000;

export interface PairingInput {
  /** Participants ordered by current standing, strongest first. */
  ranked: readonly ParticipantId[];
  /** Score each participant carries into this round, for grouping. */
  pointsOf: (participantId: ParticipantId) => number;
  /** Pairings that have already been played, as unordered keys. */
  played: ReadonlySet<string>;
  /** Participants who have already sat out a round. */
  byes: ReadonlySet<ParticipantId>;
  mode: SwissConfig['pairing'];
  avoidRematches: boolean;
  /** Stable seed for the shuffled variant, so a reload does not re-pair. */
  drawSeed: string;
}

export interface PairingResult {
  pairs: [ParticipantId, ParticipantId][];
  /** Participant sitting this round out, when the field is odd. */
  bye?: ParticipantId;
}

/** Unordered key for a pairing, so A-B and B-A are the same meeting. */
export function meetingKey(a: ParticipantId, b: ParticipantId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Pairs one Swiss round.
 *
 * The principle is that participants meet others on the same score, so that
 * every round narrows the field's uncertainty rather than repeating what is
 * already known. Everything else follows from making that work on real fields:
 *
 * - **Score groups.** Participants are grouped by points and paired inside their
 *   group. An odd group floats its lowest-ranked member down into the next one,
 *   which is why an unequal group size does not stall the round.
 * - **The bye.** An odd field means somebody sits out. It goes to the
 *   lowest-ranked participant who has not had one, because a bye is a free point
 *   and handing a second one to the same player would distort the table.
 * - **Rematches.** Two participants who have already met should not be paired
 *   again while any alternative exists. That is a matching problem rather than a
 *   local choice, so it is searched with backtracking instead of swapping
 *   neighbours and hoping.
 *
 * Deterministic throughout: the shuffled variant draws from a seeded generator,
 * so a round pairs the same way every time it is derived.
 */
export function pairRound(input: PairingInput): PairingResult {
  const { ranked, pointsOf, played, byes, mode, avoidRematches, drawSeed } = input;

  const pool = [...ranked];
  let bye: ParticipantId | undefined;

  if (pool.length % 2 === 1) {
    bye = chooseBye(pool, byes);
    pool.splice(pool.indexOf(bye), 1);
  }

  const canPlay = (a: ParticipantId, b: ParticipantId): boolean =>
    !avoidRematches || !played.has(meetingKey(a, b));

  /*
   * Score groups shape the preference, they do not partition the field.
   *
   * Treating them as a hard boundary is the obvious implementation and it is
   * wrong: two groups can each be unpairable on their own while a rematch-free
   * pairing of the round exists across them. Real Swiss floats players between
   * groups for exactly this reason, so the search runs over the whole field and
   * same-score opponents are merely tried first.
   */
  const ordered =
    mode === 'random_within_score_group'
      ? groupByScore(pool, pointsOf).flatMap((group, index) =>
          deterministicShuffle(group, `${drawSeed}:${String(index)}`),
        )
      : pool;

  const pairs = pairPool(ordered, canPlay, pointsOf, mode);

  return { pairs, ...(bye !== undefined ? { bye } : {}) };
}

/**
 * Lowest-ranked participant who has not had a bye yet.
 *
 * Falls back to the lowest-ranked overall once everyone has had one, which only
 * happens when the round count exceeds the field size.
 */
function chooseBye(
  ranked: readonly ParticipantId[],
  byes: ReadonlySet<ParticipantId>,
): ParticipantId {
  for (let i = ranked.length - 1; i >= 0; i -= 1) {
    const candidate = ranked[i];
    if (candidate !== undefined && !byes.has(candidate)) return candidate;
  }
  const last = ranked.at(-1);
  if (last === undefined) throw new Error('chooseBye called on an empty field');
  return last;
}

/** Splits the ranked list into runs of equal score, keeping the order. */
function groupByScore(
  ranked: readonly ParticipantId[],
  pointsOf: (participantId: ParticipantId) => number,
): ParticipantId[][] {
  const groups: ParticipantId[][] = [];
  let current: ParticipantId[] = [];
  let score: number | undefined;

  for (const participantId of ranked) {
    const points = pointsOf(participantId);
    if (score === undefined || points === score) {
      current.push(participantId);
      score = points;
      continue;
    }
    groups.push(current);
    current = [participantId];
    score = points;
  }

  if (current.length > 0) groups.push(current);
  return groups;
}

/**
 * Pairs an even-sized pool, preferring a rematch-free arrangement.
 *
 * Falls back to allowing rematches only when no rematch-free pairing of this
 * pool exists — a round that cannot be paired at all would be worse than one
 * that repeats a meeting.
 */
function pairPool(
  pool: readonly ParticipantId[],
  canPlay: (a: ParticipantId, b: ParticipantId) => boolean,
  pointsOf: (participantId: ParticipantId) => number,
  mode: SwissConfig['pairing'],
): [ParticipantId, ParticipantId][] {
  if (pool.length < 2) return [];

  const strict = search(pool, canPlay, pointsOf, mode, { steps: 0 });
  return strict ?? search(pool, () => true, pointsOf, mode, { steps: 0 }) ?? [];
}

function search(
  pool: readonly ParticipantId[],
  canPlay: (a: ParticipantId, b: ParticipantId) => boolean,
  pointsOf: (participantId: ParticipantId) => number,
  mode: SwissConfig['pairing'],
  budget: { steps: number },
): [ParticipantId, ParticipantId][] | undefined {
  if (pool.length === 0) return [];

  budget.steps += 1;
  if (budget.steps > MAX_STEPS) return undefined;

  const [first, ...rest] = pool;
  if (first === undefined) return [];

  for (const index of preferenceOrder(first, rest, pointsOf, mode)) {
    const candidate = rest[index];
    if (candidate === undefined || !canPlay(first, candidate)) continue;

    const remaining = rest.filter((_, i) => i !== index);
    const sub = search(remaining, canPlay, pointsOf, mode, budget);
    if (sub) return [[first, candidate], ...sub];
  }

  return undefined;
}

/**
 * Order in which opponents are tried for the leading participant.
 *
 * Same-score opponents come first, because that is what makes a round
 * informative. Within them the Dutch system folds: the top of the score group
 * plays the top of its bottom half, which separates the group faster than
 * pairing neighbours would. Everyone else follows by how close their score is,
 * so when a rematch blocks the ideal partner the search steps down gently rather
 * than jumping to an arbitrary opponent.
 */
function preferenceOrder(
  first: ParticipantId,
  rest: readonly ParticipantId[],
  pointsOf: (participantId: ParticipantId) => number,
  mode: SwissConfig['pairing'],
): number[] {
  const score = pointsOf(first);
  const sameScore: number[] = [];
  const others: { index: number; distance: number }[] = [];

  rest.forEach((participantId, index) => {
    const distance = Math.abs(pointsOf(participantId) - score);
    if (distance === 0) sameScore.push(index);
    else others.push({ index, distance });
  });

  const preferred =
    mode === 'random_within_score_group'
      ? // Already shuffled within the group; adjacent pairing is the neutral choice.
        sameScore
      : foldOrder(sameScore);

  // Closest score first, so a blocked pairing floats one group at a time.
  others.sort((a, b) => a.distance - b.distance || a.index - b.index);

  return [...preferred, ...others.map((entry) => entry.index)];
}

/** The fold partner first, then outwards through the rest of the group. */
function foldOrder(indices: readonly number[]): number[] {
  const fold = Math.floor((indices.length + 1) / 2) - 1;
  const order: number[] = [];
  for (let i = fold; i < indices.length; i += 1) {
    const value = indices[i];
    if (value !== undefined) order.push(value);
  }
  for (let i = 0; i < fold; i += 1) {
    const value = indices[i];
    if (value !== undefined) order.push(value);
  }
  return order;
}

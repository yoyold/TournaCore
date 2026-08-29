import type { MatchId, MatchPosition, MatchSlot } from '@models/index';

/** Anything that names its position and where its two entrants come from. */
export interface OrderableMatch {
  id: MatchId;
  position: MatchPosition;
  slotA: MatchSlot;
  slotB: MatchSlot;
}

/**
 * The order matches can be played in.
 *
 * A bracket is a dependency graph, not a list: the loser bracket's first round
 * cannot be played before the winner bracket's, and the grand final cannot be
 * played before anything. Sorting by round or by identifier gets this wrong —
 * alphabetically the grand final comes first — which matters wherever results
 * are read in sequence rather than as a set. Elo is such a place: beating a
 * team before they have climbed is worth less than beating them after.
 *
 * The depth of a match is how many matches must be decided before it can start.
 * Matches at equal depth could genuinely have been played in parallel, so among
 * those the position decides, purely so the order is total.
 */
export function playOrder<T extends OrderableMatch>(matches: readonly T[]): T[] {
  const byId = new Map<MatchId, T>(matches.map((match) => [match.id, match]));
  const depths = new Map<MatchId, number>();

  const depthOf = (match: T, visiting: Set<MatchId>): number => {
    const known = depths.get(match.id);
    if (known !== undefined) return known;

    // A structure cannot legitimately contain a cycle, but a corrupt or
    // partially imported one might, and this must not recur forever.
    if (visiting.has(match.id)) return 0;
    visiting.add(match.id);

    let depth = 0;
    for (const slot of [match.slotA, match.slotB]) {
      if (slot.kind !== 'winner_of' && slot.kind !== 'loser_of') continue;
      const source = byId.get(slot.matchId);
      if (source === undefined) continue;
      depth = Math.max(depth, depthOf(source, visiting) + 1);
    }

    visiting.delete(match.id);
    depths.set(match.id, depth);
    return depth;
  };

  for (const match of matches) depthOf(match, new Set());

  return [...matches].sort(
    (a, b) =>
      (depths.get(a.id) ?? 0) - (depths.get(b.id) ?? 0) ||
      a.position.round - b.position.round ||
      (a.position.groupIndex ?? 0) - (b.position.groupIndex ?? 0) ||
      a.position.indexInRound - b.position.indexInRound ||
      a.id.localeCompare(b.id),
  );
}

import { nextPowerOfTwo, seedOrder } from '@domain/bracket/bracketMath';

import type { ChallongeMatch } from './challongeSchema';
import type { ParticipantId } from '@models/index';

/**
 * Which entry slot each participant of a recorded bracket started in.
 *
 * Challonge numbers the entrants of a bracket, and for a bracket fed by a
 * qualifying phase those numbers are a *label read off the finished draw*
 * rather than the seeding that produced it: the participants who received a bye
 * are numbered one upwards, then the rest in the order they appear from the top
 * of the bracket. Taking them for seeds draws a bracket in which the first two
 * numbers share a half, which no generator would produce, and the recorded
 * results then have nowhere to sit.
 *
 * The draw itself is unambiguous, though. The second round says which
 * first-round matches sit next to each other and who skipped the round
 * entirely, and that is enough to place every entrant in the layout without
 * consulting a single seed number.
 *
 * Returns `undefined` whenever the recorded rounds do not describe a complete
 * draw of the expected shape — a partially played bracket, a field whose byes
 * fall elsewhere than this generator puts them. Guessing there would invent a
 * line-up, so the caller is left to fall back on the orderings it can derive.
 */
export function recordedDraw(
  matches: readonly ChallongeMatch[],
  byChallongeId: ReadonlyMap<string, ParticipantId>,
): ParticipantId[] | undefined {
  const winnerBracket = matches.filter((match) => (match.round ?? 0) > 0);
  if (winnerBracket.length === 0) return undefined;

  const entrants = new Set<string>();
  for (const match of winnerBracket) {
    if (match.player1_id) entrants.add(match.player1_id);
    if (match.player2_id) entrants.add(match.player2_id);
  }

  const count = entrants.size;
  if (count < 2) return undefined;

  const size = nextPowerOfTwo(count);
  const half = size / 2;

  const firstRound = Math.min(...winnerBracket.map((match) => match.round ?? 0));
  const opening = winnerBracket.filter((match) => match.round === firstRound);
  const second = winnerBracket.filter((match) => match.round === firstRound + 1);

  const layout = layoutOfOpeningRound({ opening, second, half });
  if (!layout) return undefined;

  const order = seedOrder(size, 'standard');
  const slots = new Array<string | undefined>(size + 1);

  for (const [index, entry] of layout.entries()) {
    const sideA = order[index * 2];
    const sideB = order[index * 2 + 1];
    if (sideA === undefined || sideB === undefined) return undefined;

    if (entry.kind === 'match') {
      slots[sideA] = entry.a;
      slots[sideB] = entry.b;
      continue;
    }

    // A bye occupies whichever of the two slots is a real entry rather than the
    // padding that produced the bye. If this generator did not put a bye here,
    // the two draws differ in shape and nothing can be salvaged.
    const real = [sideA, sideB].filter((slot) => slot <= count);
    if (real.length !== 1 || real[0] === undefined) return undefined;
    slots[real[0]] = entry.participant;
  }

  const lineUp: ParticipantId[] = [];
  for (let slot = 1; slot <= count; slot += 1) {
    const challongeId = slots[slot];
    const participant = challongeId === undefined ? undefined : byChallongeId.get(challongeId);
    if (participant === undefined) return undefined;
    lineUp.push(participant);
  }

  return lineUp;
}

type LayoutEntry = { kind: 'match'; a: string; b: string } | { kind: 'bye'; participant: string };

/**
 * The opening round from top to bottom, byes included.
 *
 * Challonge records no fixture for a bye, so the round it serves is shorter
 * than the layout and says nothing about where the gaps are. The round after it
 * is complete, and each of its two sides is either a first-round winner — whose
 * match therefore sits in that position — or somebody who has not played yet,
 * which is precisely a bye.
 */
function layoutOfOpeningRound(input: {
  opening: readonly ChallongeMatch[];
  second: readonly ChallongeMatch[];
  half: number;
}): LayoutEntry[] | undefined {
  const { opening, second, half } = input;

  if (half === 1) {
    const only = opening[0];
    if (opening.length !== 1 || !only?.player1_id || !only.player2_id) return undefined;
    return [{ kind: 'match', a: only.player1_id, b: only.player2_id }];
  }

  if (second.length !== half / 2) return undefined;

  const openingBy = new Map<string, number>();
  for (const [index, match] of opening.entries()) {
    for (const player of [match.player1_id, match.player2_id]) {
      // Two entrants of one match cannot both be reported by the next round, so
      // a duplicate here means the rounds were not read as expected.
      if (!player || openingBy.has(player)) return undefined;
      openingBy.set(player, index);
    }
  }

  const layout: LayoutEntry[] = [];
  const taken = new Set<number>();

  for (const match of second) {
    for (const player of [match.player1_id, match.player2_id]) {
      if (!player) return undefined;

      const index = openingBy.get(player);
      if (index === undefined) {
        layout.push({ kind: 'bye', participant: player });
        continue;
      }

      const played = opening[index];
      if (taken.has(index) || !played?.player1_id || !played.player2_id) return undefined;
      taken.add(index);
      layout.push({ kind: 'match', a: played.player1_id, b: played.player2_id });
    }
  }

  return taken.size === opening.length ? layout : undefined;
}

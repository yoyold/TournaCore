import { makeMatchId } from '@domain/matchId';

import type { GeneratedStructure, RoundInfo, StructuralMatch } from '../types';
import type { MatchFormat, MatchPosition, StageId } from '@models/index';

export interface RoundRobinShape {
  slotCount: number;
  legs: 1 | 2;
  matchFormat: MatchFormat;
  /** Set when this round robin is one group of a group stage. */
  groupIndex?: number;
  /** Entry slot indices to use, 1-based. Defaults to 1..slotCount. */
  slotIndices?: readonly number[];
}

/**
 * Pairings for one leg, by the circle method.
 *
 * One entry stays put while the rest rotate around it, which produces a schedule
 * where everyone meets everyone exactly once and nobody plays twice in a round.
 *
 * An odd number of entries gets a placeholder, and whoever draws it sits that
 * round out. Returning the bye explicitly rather than silently dropping the pair
 * keeps the round numbering intact for every participant.
 */
export function circleMethodRounds(
  slotIndices: readonly number[],
): (readonly [number, number])[][] {
  const entries = [...slotIndices];
  // A placeholder keeps the rotation even; 0 is never a valid 1-based slot.
  const BYE = 0;
  if (entries.length % 2 === 1) entries.push(BYE);

  const half = entries.length / 2;
  const roundCount = entries.length - 1;
  const rounds: (readonly [number, number])[][] = [];

  let rotating = entries.slice(1);
  const fixed = entries[0] ?? BYE;

  for (let round = 0; round < roundCount; round += 1) {
    const order = [fixed, ...rotating];
    const pairs: (readonly [number, number])[] = [];

    for (let i = 0; i < half; i += 1) {
      const home = order[i];
      const away = order[order.length - 1 - i];
      if (home === undefined || away === undefined) continue;
      if (home === BYE || away === BYE) continue;

      /*
       * Alternate which side is listed first as the rounds progress. Over a full
       * schedule this spreads the nominal home side evenly, which matters
       * wherever side A carries an advantage.
       */
      pairs.push(round % 2 === 0 ? [home, away] : [away, home]);
    }

    rounds.push(pairs);
    rotating = [rotating[rotating.length - 1] ?? BYE, ...rotating.slice(0, -1)];
  }

  return rounds;
}

/**
 * Builds a round robin schedule.
 *
 * Every pairing is a fixed match between two entry slots — unlike an elimination
 * bracket, nothing here depends on an earlier result, so the whole schedule is
 * known the moment the participants are.
 */
export function generateRoundRobin(input: {
  stageId: StageId;
  shape: RoundRobinShape;
}): GeneratedStructure {
  const { stageId, shape } = input;
  const slotIndices = shape.slotIndices ?? Array.from({ length: shape.slotCount }, (_, i) => i + 1);

  const matches: StructuralMatch[] = [];
  const rounds: RoundInfo[] = [];

  if (slotIndices.length < 2) {
    return { stageId, slotCount: shape.slotCount, matches, rounds };
  }

  const legPairs = circleMethodRounds(slotIndices);

  for (let leg = 1; leg <= shape.legs; leg += 1) {
    legPairs.forEach((pairs, legRound) => {
      // Legs continue the round numbering rather than restarting it, so round 1
      // of the return leg reads as a later round, which is what it is.
      const round = (leg - 1) * legPairs.length + legRound;

      pairs.forEach(([home, away], indexInRound) => {
        // The return leg swaps sides, which is the point of playing one.
        const [slotA, slotB] = leg === 1 ? [home, away] : [away, home];

        const position: MatchPosition = {
          round,
          indexInRound,
          ...(shape.groupIndex !== undefined ? { groupIndex: shape.groupIndex } : {}),
          ...(shape.legs === 2 ? { leg: leg as 1 | 2 } : {}),
        };

        matches.push({
          id: makeMatchId(stageId, position),
          position,
          slotA: { kind: 'seeded', slotIndex: slotA },
          slotB: { kind: 'seeded', slotIndex: slotB },
          format: shape.matchFormat,
        });
      });

      rounds.push({ round, matchCount: pairs.length });
    });
  }

  return { stageId, slotCount: shape.slotCount, matches, rounds };
}

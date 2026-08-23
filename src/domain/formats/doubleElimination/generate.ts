import {
  loserBracketRoundCount,
  nextPowerOfTwo,
  roundCount,
  seedOrder,
} from '@domain/bracket/bracketMath';
import { makeMatchId } from '@domain/matchId';
import { invariant } from '@utils/invariant';

import { formatForRound } from '../singleElimination/generate';

import type { GeneratedStructure, RoundInfo, StructuralMatch } from '../types';
import type {
  DoubleEliminationConfig,
  MatchId,
  MatchPosition,
  MatchSlot,
  StageId,
} from '@models/index';

/**
 * Builds a double elimination structure: winner bracket, loser bracket and
 * grand final.
 *
 * The winner bracket is an ordinary single elimination bracket. The loser
 * bracket alternates between two kinds of round — a *drop-in* round, where the
 * players just knocked out of the winner bracket enter, and a *consolidation*
 * round, where the survivors of the previous drop-in play each other off. That
 * alternation is the whole shape of the format, and it is why the loser bracket
 * needs about twice as many rounds as the winner bracket.
 *
 * As everywhere else, the field is padded to a power of two and the surplus
 * entry slots resolve to byes, so any participant count works without a special
 * case. A bye in the winner bracket produces no loser, which the resolver turns
 * into a bye in the loser bracket rather than a match that waits forever.
 */
export function generateDoubleElimination(input: {
  stageId: StageId;
  config: DoubleEliminationConfig;
  slotCount: number;
}): GeneratedStructure {
  const { stageId, config, slotCount } = input;

  const size = nextPowerOfTwo(slotCount);
  const winnerRounds = roundCount(slotCount);
  const matches: StructuralMatch[] = [];
  const rounds: RoundInfo[] = [];

  if (winnerRounds === 0) {
    return { stageId, slotCount: size, matches, rounds };
  }

  const winnerId = (round: number, indexInRound: number): MatchId =>
    makeMatchId(stageId, { bracket: 'winner', round, indexInRound });
  const loserId = (round: number, indexInRound: number): MatchId =>
    makeMatchId(stageId, { bracket: 'loser', round, indexInRound });

  // ---------------------------------------------------------------------
  // Winner bracket
  // ---------------------------------------------------------------------

  const order = seedOrder(size, config.seedArrangement);

  for (let index = 0; index < size / 2; index += 1) {
    const seedA = order[index * 2];
    const seedB = order[index * 2 + 1];
    invariant(
      seedA !== undefined && seedB !== undefined,
      'seedOrder must supply two seeds per first-round match',
    );

    const position: MatchPosition = { bracket: 'winner', round: 0, indexInRound: index };
    matches.push({
      id: makeMatchId(stageId, position),
      position,
      slotA: { kind: 'seeded', slotIndex: seedA },
      slotB: { kind: 'seeded', slotIndex: seedB },
      format: formatForRound(config.matchFormats, 0),
    });
  }

  for (let round = 1; round < winnerRounds; round += 1) {
    for (let index = 0; index < size / 2 ** (round + 1); index += 1) {
      const position: MatchPosition = { bracket: 'winner', round, indexInRound: index };
      matches.push({
        id: makeMatchId(stageId, position),
        position,
        slotA: { kind: 'winner_of', matchId: winnerId(round - 1, index * 2) },
        slotB: { kind: 'winner_of', matchId: winnerId(round - 1, index * 2 + 1) },
        format: formatForRound(config.matchFormats, round),
      });
    }
  }

  for (let round = 0; round < winnerRounds; round += 1) {
    rounds.push({ round, matchCount: size / 2 ** (round + 1), bracket: 'winner' });
  }

  // ---------------------------------------------------------------------
  // Loser bracket
  // ---------------------------------------------------------------------

  const loserRounds = loserBracketRoundCount(slotCount);

  for (let round = 0; round < loserRounds; round += 1) {
    const count = loserRoundMatchCount(size, round);

    for (let index = 0; index < count; index += 1) {
      const position: MatchPosition = { bracket: 'loser', round, indexInRound: index };
      const [slotA, slotB] = loserRoundSlots({
        round,
        index,
        count,
        seeding: config.loserBracketSeeding,
        winnerId,
        loserId,
      });

      matches.push({
        id: makeMatchId(stageId, position),
        position,
        slotA,
        slotB,
        /*
         * The loser bracket keeps the default length throughout. Per-round
         * overrides are keyed by round index, and the two brackets number their
         * rounds independently, so honouring them here would silently make an
         * unrelated loser round best-of-five because the winner bracket's final
         * was configured that way.
         */
        format: config.matchFormats.default,
      });
    }

    rounds.push({ round, matchCount: count, bracket: 'loser' });
  }

  // ---------------------------------------------------------------------
  // Grand final
  // ---------------------------------------------------------------------

  const finalFormat = formatForRound(config.matchFormats, winnerRounds - 1);
  const grandFinal: MatchPosition = { bracket: 'grand_final', round: 0, indexInRound: 0 };

  matches.push({
    id: makeMatchId(stageId, grandFinal),
    position: grandFinal,
    // Side A is always the winner bracket entrant. The resolver relies on that
    // to decide whether a bracket reset is needed.
    slotA: { kind: 'winner_of', matchId: winnerId(winnerRounds - 1, 0) },
    slotB:
      loserRounds > 0
        ? { kind: 'winner_of', matchId: loserId(loserRounds - 1, 0) }
        : // Two participants: nobody ever entered a loser bracket, so the second
          // chance is granted directly to whoever lost the only match.
          { kind: 'loser_of', matchId: winnerId(winnerRounds - 1, 0) },
    format: finalFormat,
  });

  rounds.push({ round: 0, matchCount: 1, bracket: 'grand_final' });

  if (config.grandFinal === 'bracket_reset') {
    const reset: MatchPosition = { bracket: 'grand_final', round: 1, indexInRound: 0 };

    matches.push({
      id: makeMatchId(stageId, reset),
      position: reset,
      /*
       * The reset is a rematch of the same two players, so it references the
       * grand final's own winner and loser. It is only played when the loser
       * bracket entrant won the first one — until then the resolver reports it
       * as cancelled rather than pending, so an undecided match nobody will
       * play cannot hold the stage open.
       */
      slotA: { kind: 'winner_of', matchId: makeMatchId(stageId, grandFinal) },
      slotB: { kind: 'loser_of', matchId: makeMatchId(stageId, grandFinal) },
      format: finalFormat,
    });

    rounds.push({ round: 1, matchCount: 1, bracket: 'grand_final' });
  }

  return { stageId, slotCount: size, matches, rounds };
}

/**
 * Matches in one loser bracket round.
 *
 * Round 0 takes the first round's losers. From there the rounds alternate:
 * an odd round is a drop-in that keeps the field the same size, an even round
 * halves it.
 */
export function loserRoundMatchCount(size: number, round: number): number {
  if (round === 0) return size / 4;
  return round % 2 === 1 ? size / 2 ** ((round + 1) / 2 + 1) : size / 2 ** (round / 2 + 2);
}

/**
 * Which winner bracket match a drop slot takes its casualty from.
 *
 * `dropRound` counts drop-in rounds from one, and only `alternating` reads it:
 * that strategy switches rule each time, which is how Challonge draws a bracket
 * and therefore what reproducing an imported one requires.
 */
export function dropSlot(
  index: number,
  count: number,
  seeding: DoubleEliminationConfig['loserBracketSeeding'],
  dropRound: number,
): number {
  if (count < 2) return index;

  switch (seeding) {
    case 'reversed':
      return count - 1 - index;
    case 'balanced':
      return index ^ 1;
    case 'alternating':
      return dropRound % 2 === 1 ? count - 1 - index : index ^ 1;
    case 'standard':
      return index;
  }
}

function loserRoundSlots(input: {
  round: number;
  index: number;
  count: number;
  seeding: DoubleEliminationConfig['loserBracketSeeding'];
  winnerId: (round: number, indexInRound: number) => MatchId;
  loserId: (round: number, indexInRound: number) => MatchId;
}): [MatchSlot, MatchSlot] {
  const { round, index, count, seeding, winnerId, loserId } = input;

  if (round === 0) {
    // Two players knocked out by different opponents, so no arrangement here can
    // produce a rematch.
    return [
      { kind: 'loser_of', matchId: winnerId(0, index * 2) },
      { kind: 'loser_of', matchId: winnerId(0, index * 2 + 1) },
    ];
  }

  if (round % 2 === 0) {
    // Consolidation: survivors of the previous drop-in play each other.
    return [
      { kind: 'winner_of', matchId: loserId(round - 1, index * 2) },
      { kind: 'winner_of', matchId: loserId(round - 1, index * 2 + 1) },
    ];
  }

  /*
   * Drop-in round. The winner bracket round that feeds it follows from the
   * alternation: loser round 1 takes winner round 1's losers, loser round 3
   * takes winner round 2's, and so on.
   *
   * Which casualty lands on which survivor is the one real choice in the
   * design, and the three strategies differ only here. `balanced` is exact
   * rather than a heuristic: by this point loser round match i holds precisely
   * the players knocked out of winner bracket subtree i, so sending it the
   * casualty of the sibling subtree pairs two players whose paths could only
   * have crossed in the round just played — and neither was in it.
   *
   * The last drop-in round has a single match, so the winner bracket runner-up
   * plays whoever survived the loser bracket whatever the setting. A repeat
   * meeting there is inherent to the format.
   */
  const winnerRound = (round + 1) / 2;
  const dropIndex = dropSlot(index, count, seeding, winnerRound);

  return [
    { kind: 'winner_of', matchId: loserId(round - 1, index) },
    { kind: 'loser_of', matchId: winnerId(winnerRound, dropIndex) },
  ];
}

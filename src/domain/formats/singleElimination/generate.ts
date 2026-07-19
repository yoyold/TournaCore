import { nextPowerOfTwo, roundCount, seedOrder } from '@domain/bracket/bracketMath';
import { makeMatchId } from '@domain/matchId';
import { invariant } from '@utils/invariant';

import type { GeneratedStructure, RoundInfo, StructuralMatch } from '../types';
import type {
  MatchFormat,
  MatchPosition,
  MatchSlot,
  RoundMatchFormats,
  SingleEliminationConfig,
  StageId,
} from '@models/index';

/** Match format for a round, falling back to the configured default. */
export function formatForRound(formats: RoundMatchFormats, round: number): MatchFormat {
  return formats.byRound?.[round] ?? formats.default;
}

/**
 * Builds a single elimination bracket.
 *
 * The bracket is always padded to a power of two. Entry slots beyond the actual
 * participant count stay empty and resolve to byes, which is what lets any
 * participant count work without a dedicated code path.
 *
 * Slot indices follow the standard seeding order, so the strongest entries are
 * spread as far apart as possible and byes fall to the top seeds.
 */
export function generateSingleElimination(input: {
  stageId: StageId;
  config: SingleEliminationConfig;
  slotCount: number;
}): GeneratedStructure {
  const { stageId, config, slotCount } = input;

  const size = nextPowerOfTwo(slotCount);
  const rounds = roundCount(slotCount);
  const matches: StructuralMatch[] = [];
  const roundInfos: RoundInfo[] = [];

  if (rounds === 0) {
    return { stageId, slotCount: size, matches, rounds: roundInfos };
  }

  // Round 0 draws its participants directly from the entry slots, arranged by
  // the standard seeding order.
  const order = seedOrder(size);
  const firstRoundMatches = size / 2;

  for (let index = 0; index < firstRoundMatches; index += 1) {
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

  // Later rounds consume the winners of the two matches feeding them.
  for (let round = 1; round < rounds; round += 1) {
    const count = size / 2 ** (round + 1);
    for (let index = 0; index < count; index += 1) {
      const position: MatchPosition = { bracket: 'winner', round, indexInRound: index };
      const previous = (i: number): MatchSlot => ({
        kind: 'winner_of',
        matchId: makeMatchId(stageId, {
          bracket: 'winner',
          round: round - 1,
          indexInRound: i,
        }),
      });

      matches.push({
        id: makeMatchId(stageId, position),
        position,
        slotA: previous(index * 2),
        slotB: previous(index * 2 + 1),
        format: formatForRound(config.matchFormats, round),
      });
    }
  }

  for (let round = 0; round < rounds; round += 1) {
    roundInfos.push({ round, matchCount: size / 2 ** (round + 1), bracket: 'winner' });
  }

  // The third place match pairs the two semifinal losers. It only exists when
  // there are semifinals at all, i.e. from four participants upwards.
  if (config.thirdPlaceMatch && rounds >= 2) {
    const semifinalRound = rounds - 2;
    const position: MatchPosition = { bracket: 'third_place', round: rounds - 1, indexInRound: 0 };

    matches.push({
      id: makeMatchId(stageId, position),
      position,
      slotA: {
        kind: 'loser_of',
        matchId: makeMatchId(stageId, {
          bracket: 'winner',
          round: semifinalRound,
          indexInRound: 0,
        }),
      },
      slotB: {
        kind: 'loser_of',
        matchId: makeMatchId(stageId, {
          bracket: 'winner',
          round: semifinalRound,
          indexInRound: 1,
        }),
      },
      format: formatForRound(config.matchFormats, rounds - 1),
    });

    roundInfos.push({ round: rounds - 1, matchCount: 1, bracket: 'third_place' });
  }

  return { stageId, slotCount: size, matches, rounds: roundInfos };
}

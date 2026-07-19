import type { ResolvedMatch, Standing, StandingsInput } from '../types';
import type { ParticipantId, SingleEliminationConfig } from '@models/index';

interface Tally {
  wins: number;
  losses: number;
  mapsWon: number;
  mapsLost: number;
  /** Round in which the participant was eliminated; undefined if still alive. */
  eliminatedInRound?: number;
}

/**
 * Ranks participants of a single elimination bracket.
 *
 * Placement follows how far a participant got: the champion first, the runner-up
 * second, then everyone eliminated in each round sharing a rank. That shared
 * rank is correct rather than a shortcut — losing a quarterfinal says nothing
 * about who among the four losers was stronger, and inventing an order would be
 * fabricated precision. A third place match, when configured, resolves exactly
 * the one tie the format does settle.
 *
 * Byes never count as wins: advancing past an empty slot is not a result.
 */
export function computeSingleEliminationStandings(
  input: StandingsInput<SingleEliminationConfig>,
): Standing[] {
  const { structure, seededSlots } = input;

  const tallies = new Map<ParticipantId, Tally>();
  const ensure = (id: ParticipantId): Tally => {
    let tally = tallies.get(id);
    if (!tally) {
      tally = { wins: 0, losses: 0, mapsWon: 0, mapsLost: 0 };
      tallies.set(id, tally);
    }
    return tally;
  };

  for (const participantId of seededSlots.values()) ensure(participantId);

  const bracketMatches = structure.matches.filter((m) => m.position.bracket === 'winner');
  const finalRound = bracketMatches.reduce((max, m) => Math.max(max, m.position.round), 0);

  for (const match of structure.matches) {
    if (match.isBye || match.outcome === undefined) continue;
    if (match.winnerId !== undefined) ensure(match.winnerId).wins += 1;
    if (match.loserId !== undefined) {
      const tally = ensure(match.loserId);
      tally.losses += 1;
      if (match.position.bracket === 'winner') {
        tally.eliminatedInRound = match.position.round;
      }
    }
  }

  const champion = findChampion(structure.matches, finalRound);
  const thirdPlace = structure.matches.find((m) => m.position.bracket === 'third_place');

  const entries = [...tallies.entries()].map(([participantId, tally]) => ({
    participantId,
    tally,
    rank: placementRank(tally, finalRound, participantId === champion),
  }));

  /*
   * The third place match overrides the shared semifinal rank. Without it both
   * semifinal losers stay level on rank 3, which is the honest default.
   */
  if (thirdPlace?.outcome !== undefined) {
    for (const entry of entries) {
      if (entry.participantId === thirdPlace.winnerId) entry.rank = 3;
      else if (entry.participantId === thirdPlace.loserId) entry.rank = 4;
    }
  }

  entries.sort((a, b) => a.rank - b.rank || b.tally.wins - a.tally.wins);

  return entries.map(({ participantId, tally, rank }) => ({
    participantId,
    rank,
    wins: tally.wins,
    losses: tally.losses,
    draws: 0,
    mapsWon: tally.mapsWon,
    mapsLost: tally.mapsLost,
  }));
}

function findChampion(
  matches: readonly ResolvedMatch[],
  finalRound: number,
): ParticipantId | undefined {
  const final = matches.find(
    (m) => m.position.bracket === 'winner' && m.position.round === finalRound,
  );
  return final?.winnerId;
}

/**
 * Rank implied by the round a participant went out in.
 *
 * Losing the final is rank 2, losing a semifinal rank 3, a quarterfinal rank 5,
 * and so on — each round doubling the number of participants sharing the rank.
 */
function placementRank(tally: Tally, finalRound: number, isChampion: boolean): number {
  if (isChampion) return 1;
  if (tally.eliminatedInRound === undefined) {
    // Still in the bracket: provisionally ranked behind everyone eliminated.
    return 2;
  }
  const roundsSurvived = finalRound - tally.eliminatedInRound;
  return 2 ** roundsSurvived + 1;
}

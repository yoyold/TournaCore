import type { ResolvedMatch, Standing, StandingsInput } from '../types';
import type { DoubleEliminationConfig, Match, ParticipantId } from '@models/index';

/** How far a participant got, coarsest first. */
const TIER_CHAMPION = 0;
const TIER_RUNNER_UP = 1;
const TIER_ALIVE = 2;
const TIER_ELIMINATED = 3;

interface Entry {
  participantId: ParticipantId;
  tier: number;
  /** Loser bracket round the participant went out in; -1 while still alive. */
  eliminatedInRound: number;
  wins: number;
  losses: number;
  mapsWon: number;
  mapsLost: number;
}

/**
 * Ranks a double elimination tournament.
 *
 * Placement follows the order of elimination, which in this format is exact
 * where single elimination has to guess: everyone leaves through the loser
 * bracket, one round at a time, so the further a participant got the better they
 * placed. Only participants knocked out in the same loser round share a rank,
 * and that tie is real — they never played each other.
 *
 * Byes never count as wins: advancing past an empty slot is not a result.
 */
export function computeDoubleEliminationStandings(
  input: StandingsInput<DoubleEliminationConfig>,
): Standing[] {
  const { structure, seededSlots, storedMatches } = input;

  const entries = new Map<ParticipantId, Entry>();
  const ensure = (participantId: ParticipantId): Entry => {
    let entry = entries.get(participantId);
    if (!entry) {
      entry = {
        participantId,
        tier: TIER_ALIVE,
        eliminatedInRound: -1,
        wins: 0,
        losses: 0,
        mapsWon: 0,
        mapsLost: 0,
      };
      entries.set(participantId, entry);
    }
    return entry;
  };

  for (const participantId of seededSlots.values()) ensure(participantId);

  for (const match of structure.matches) {
    if (match.isBye || match.outcome === undefined) continue;

    const maps = mapTally(storedMatches?.get(match.id));

    if (match.winnerId !== undefined) {
      const winner = ensure(match.winnerId);
      winner.wins += 1;
      winner.mapsWon += match.outcome.winner === 'A' ? maps.a : maps.b;
      winner.mapsLost += match.outcome.winner === 'A' ? maps.b : maps.a;
    }

    if (match.loserId !== undefined) {
      const loser = ensure(match.loserId);
      loser.losses += 1;
      loser.mapsWon += match.outcome.winner === 'A' ? maps.b : maps.a;
      loser.mapsLost += match.outcome.winner === 'A' ? maps.a : maps.b;

      // Only the loser bracket eliminates. A defeat in the winner bracket costs
      // position, not participation.
      if (match.position.bracket === 'loser') {
        loser.tier = TIER_ELIMINATED;
        loser.eliminatedInRound = Math.max(loser.eliminatedInRound, match.position.round);
      }
    }
  }

  const decider = decidingMatch(structure.matches);
  if (decider?.outcome !== undefined) {
    if (decider.winnerId !== undefined) ensure(decider.winnerId).tier = TIER_CHAMPION;
    if (decider.loserId !== undefined) {
      const runnerUp = ensure(decider.loserId);
      runnerUp.tier = TIER_RUNNER_UP;
      runnerUp.eliminatedInRound = -1;
    }
  }

  const ordered = [...entries.values()].sort(
    (a, b) =>
      a.tier - b.tier ||
      b.eliminatedInRound - a.eliminatedInRound ||
      b.wins - a.wins ||
      a.participantId.localeCompare(b.participantId),
  );

  return assignRanks(ordered);
}

/**
 * The match that decides the title: the bracket reset when it was played,
 * otherwise the grand final itself.
 */
function decidingMatch(matches: readonly ResolvedMatch[]): ResolvedMatch | undefined {
  const finals = matches.filter((match) => match.position.bracket === 'grand_final');
  const reset = finals.find((match) => match.position.round === 1);
  if (reset?.outcome !== undefined) return reset;
  return finals.find((match) => match.position.round === 0);
}

/**
 * Standard competition ranking over the placement key.
 *
 * Wins and identifiers order the list for display but must not split a rank:
 * two participants knocked out in the same loser round finished level, and
 * separating them on a count of wins accumulated against different opponents
 * would be fabricated precision.
 */
function assignRanks(ordered: readonly Entry[]): Standing[] {
  const standings: Standing[] = [];
  let rank = 0;

  ordered.forEach((entry, index) => {
    const previous = index === 0 ? undefined : ordered[index - 1];
    const level =
      previous?.tier === entry.tier && previous.eliminatedInRound === entry.eliminatedInRound;

    if (!level) rank = index + 1;

    standings.push({
      participantId: entry.participantId,
      rank,
      wins: entry.wins,
      losses: entry.losses,
      draws: 0,
      mapsWon: entry.mapsWon,
      mapsLost: entry.mapsLost,
    });
  });

  return standings;
}

function mapTally(match: Match | undefined): { a: number; b: number } {
  if (!match) return { a: 0, b: 0 };
  let a = 0;
  let b = 0;
  for (const game of match.games) {
    if (game.winner === 'A') a += 1;
    else if (game.winner === 'B') b += 1;
  }
  return { a, b };
}

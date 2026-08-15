import { deriveTournamentState } from '../derive';

import type { Match, MatchId, Stage, TeamId, Tournament } from '@models/index';

/** Rating every team starts from. */
export const ELO_START = 1000;

/**
 * How far a single match can move a rating.
 *
 * 32 is the long-standing default and suits the scale of a tournament circuit:
 * a run of results moves a team noticeably within a season, while one upset does
 * not rewrite the table.
 */
export const ELO_K = 32;

/**
 * Below this many matches a rating says more about the schedule than the team,
 * so it is flagged rather than hidden — hiding it would make teams vanish from
 * their own leaderboard.
 */
export const PROVISIONAL_BELOW = 5;

export interface EloRating {
  teamId: TeamId;
  /** Full precision; round only for display. */
  rating: number;
  peak: number;
  matches: number;
  wins: number;
  losses: number;
  /** Points gained or lost in this team's most recent rated match. */
  lastChange: number;
  /** True while the rating rests on too few matches to mean much. */
  provisional: boolean;
}

export interface EloInput {
  tournaments: readonly Tournament[];
  stages: readonly Stage[];
  matches: readonly Match[];
}

interface RatedMatch {
  id: MatchId;
  winner: TeamId;
  loser: TeamId;
  playedAt: string;
}

/**
 * Computes Elo ratings from every played match.
 *
 * Unlike win rate, Elo depends on the order results arrive in: beating a strong
 * team early is worth less than beating them once they have climbed. Matches are
 * therefore sorted by the time they were decided, with the match identifier as a
 * tie-breaker so the order is total. Without that second key, two matches decided
 * in the same millisecond could be processed either way round and the table would
 * shift on reload — the exact non-determinism the rest of the derivation avoids.
 *
 * Walkovers and forfeits are excluded. Elo measures playing strength, and not
 * turning up is not a performance; counting it would let a team climb without
 * playing.
 *
 * Byes never appear here at all, since they produce no match.
 */
export function computeEloRatings(input: EloInput): Map<TeamId, EloRating> {
  const ratings = new Map<TeamId, EloRating>();
  const rated = collectRatedMatches(input);

  const ensure = (teamId: TeamId): EloRating => {
    let entry = ratings.get(teamId);
    if (!entry) {
      entry = {
        teamId,
        rating: ELO_START,
        peak: ELO_START,
        matches: 0,
        wins: 0,
        losses: 0,
        lastChange: 0,
        provisional: true,
      };
      ratings.set(teamId, entry);
    }
    return entry;
  };

  for (const match of rated) {
    const winner = ensure(match.winner);
    const loser = ensure(match.loser);

    /*
     * Both expectations are computed from the ratings as they stand before this
     * match. Updating the winner first and then deriving the loser's expectation
     * from the new value would make the exchange asymmetric, and the pair would
     * no longer sum to zero.
     */
    const winnerBefore = winner.rating;
    const loserBefore = loser.rating;

    const winnerExpected = expectedScore(winnerBefore, loserBefore);
    const change = ELO_K * (1 - winnerExpected);

    winner.rating = winnerBefore + change;
    loser.rating = loserBefore - change;

    winner.lastChange = change;
    loser.lastChange = -change;

    winner.matches += 1;
    winner.wins += 1;
    loser.matches += 1;
    loser.losses += 1;

    winner.peak = Math.max(winner.peak, winner.rating);
    loser.peak = Math.max(loser.peak, loser.rating);
  }

  for (const entry of ratings.values()) {
    entry.provisional = entry.matches < PROVISIONAL_BELOW;
  }

  return ratings;
}

/**
 * Ratings sorted for display: strongest first, then by matches played so a
 * settled rating outranks a provisional one on the same points, then by team id
 * so the order never depends on iteration order.
 */
export function eloLeaderboard(input: EloInput): EloRating[] {
  return [...computeEloRatings(input).values()].sort(
    (a, b) => b.rating - a.rating || b.matches - a.matches || a.teamId.localeCompare(b.teamId),
  );
}

/** Probability that a player of `rating` beats one of `opponentRating`. */
export function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - rating) / 400));
}

/**
 * Extracts the matches that count towards a rating, in a stable chronological
 * order.
 */
function collectRatedMatches(input: EloInput): RatedMatch[] {
  const { tournaments, stages, matches } = input;
  const stored = new Map(matches.map((match) => [match.id, match]));
  const rated: RatedMatch[] = [];

  for (const tournament of tournaments) {
    const teamOf = new Map(
      tournament.participants.map((participant) => [participant.id, participant.teamId]),
    );
    const state = deriveTournamentState({ tournament, stages, matches });

    for (const stage of state.stages) {
      for (const resolved of stage.resolved.matches) {
        if (resolved.isBye || resolved.outcome === undefined) continue;
        // Only results that were actually played on the server count.
        if (resolved.outcome.reason !== 'played' && resolved.outcome.reason !== 'manual') continue;
        if (resolved.winnerId === undefined || resolved.loserId === undefined) continue;

        const winner = teamOf.get(resolved.winnerId);
        const loser = teamOf.get(resolved.loserId);
        if (winner === undefined || loser === undefined) continue;
        // A team cannot rate against itself; guards against corrupt input.
        if (winner === loser) continue;

        rated.push({
          id: resolved.id,
          winner,
          loser,
          playedAt: resolved.outcome.decidedAt || (stored.get(resolved.id)?.updatedAt ?? ''),
        });
      }
    }
  }

  // Chronological, with the identifier as a total tie-breaker.
  return rated.sort((a, b) => a.playedAt.localeCompare(b.playedAt) || a.id.localeCompare(b.id));
}

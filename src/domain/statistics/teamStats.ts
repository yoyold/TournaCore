import {
  matchScore,
  type IsoDateTime,
  type Match,
  type Stage,
  type TeamId,
  type Tournament,
  type TournamentId,
} from '@models/index';

import { deriveTournamentState } from '../derive';

export interface MatchHistoryEntry {
  matchId: Match['id'];
  tournamentId: TournamentId;
  tournamentName: string;
  opponentTeamId?: TeamId;
  won: boolean;
  /** Map score from this team's perspective. */
  mapsWon: number;
  mapsLost: number;
  /** Whether the match was decided without being played. */
  walkover: boolean;
  playedAt: IsoDateTime;
}

/** A finish worth showing off: the top three of a completed tournament. */
export interface Placement {
  tournamentId: TournamentId;
  tournamentName: string;
  /** 1, 2 or 3. Ranks can be shared, so two teams may both come third. */
  rank: number;
  /** Whether the event was a world championship. */
  major: boolean;
  /** When the tournament was played, for ordering a cabinet. */
  at: IsoDateTime;
}

/**
 * Whether a tournament's name marks it as a world championship.
 *
 * Read off the name because that is the only thing recorded: a tournament has
 * no tier. It follows that renaming an event changes what its trophies look
 * like, which is a fair trade for not asking every organiser to classify their
 * own tournaments — but it is a naming convention, not a fact about the event.
 */
export function isWorldChampionship(name: string): boolean {
  return /world\s+championship/i.test(name);
}

export interface OpponentRecord {
  teamId: TeamId;
  wins: number;
  losses: number;
}

export interface TeamStatistics {
  teamId: TeamId;
  matchesPlayed: number;
  wins: number;
  losses: number;
  /** 0..1. Zero when no match has been played, rather than NaN. */
  winRate: number;
  mapsWon: number;
  mapsLost: number;
  tournamentsEntered: number;
  tournamentsWon: number;
  /** Top-three finishes, best and most recent first. */
  placements: Placement[];
  /** Sorted by most-played opponent first. */
  opponents: OpponentRecord[];
  /** Most recent match first. */
  history: MatchHistoryEntry[];
}

export interface StatisticsInput {
  tournaments: readonly Tournament[];
  stages: readonly Stage[];
  matches: readonly Match[];
}

/**
 * Aggregates per-team statistics across every tournament.
 *
 * Like the bracket itself, none of this is stored: win rates, head-to-head
 * records and match history are recomputed from the same match results the
 * bracket derives from. Correcting a result therefore updates a team's profile
 * without any invalidation step — the same property, applied one level up.
 *
 * All teams are aggregated in one pass because each tournament has to be derived
 * to know who actually occupied which slot, and deriving once per team would
 * repeat that work for every team in the field.
 *
 * Byes never count. Advancing past an empty slot is not a win, and treating it
 * as one would inflate the win rate of exactly the strongest seeds.
 */
export function computeAllTeamStatistics(input: StatisticsInput): Map<TeamId, TeamStatistics> {
  const { tournaments, stages, matches } = input;
  const stats = new Map<TeamId, TeamStatistics>();

  const ensure = (teamId: TeamId): TeamStatistics => {
    let entry = stats.get(teamId);
    if (!entry) {
      entry = {
        teamId,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        mapsWon: 0,
        mapsLost: 0,
        tournamentsEntered: 0,
        tournamentsWon: 0,
        placements: [],
        opponents: [],
        history: [],
      };
      stats.set(teamId, entry);
    }
    return entry;
  };

  const matchesById = new Map(matches.map((match) => [match.id, match]));
  // Head-to-head is accumulated separately, then folded into the result sorted.
  const headToHead = new Map<TeamId, Map<TeamId, OpponentRecord>>();

  for (const tournament of tournaments) {
    const teamOfParticipant = new Map(
      tournament.participants.map((participant) => [participant.id, participant.teamId]),
    );

    for (const participant of tournament.participants) {
      ensure(participant.teamId).tournamentsEntered += 1;
    }

    const state = deriveTournamentState({ tournament, stages, matches });

    for (const stage of state.stages) {
      for (const resolved of stage.resolved.matches) {
        if (resolved.isBye || resolved.outcome === undefined) continue;
        if (resolved.winnerId === undefined || resolved.loserId === undefined) continue;

        const winnerTeam = teamOfParticipant.get(resolved.winnerId);
        const loserTeam = teamOfParticipant.get(resolved.loserId);
        if (winnerTeam === undefined || loserTeam === undefined) continue;

        const stored = matchesById.get(resolved.id);
        const score = stored ? matchScore(stored.games) : { a: 0, b: 0 };
        // The stored score is in slot order; map it onto winner and loser.
        const winnerIsA = resolved.outcome.winner === 'A';
        const winnerMaps = winnerIsA ? score.a : score.b;
        const loserMaps = winnerIsA ? score.b : score.a;

        const walkover =
          resolved.outcome.reason !== 'played' && resolved.outcome.reason !== 'manual';
        const playedAt = resolved.outcome.decidedAt || (stored?.updatedAt ?? '');

        const winner = ensure(winnerTeam);
        winner.matchesPlayed += 1;
        winner.wins += 1;
        winner.mapsWon += winnerMaps;
        winner.mapsLost += loserMaps;
        winner.history.push({
          matchId: resolved.id,
          tournamentId: tournament.id,
          tournamentName: tournament.name,
          opponentTeamId: loserTeam,
          won: true,
          mapsWon: winnerMaps,
          mapsLost: loserMaps,
          walkover,
          playedAt,
        });

        const loser = ensure(loserTeam);
        loser.matchesPlayed += 1;
        loser.losses += 1;
        loser.mapsWon += loserMaps;
        loser.mapsLost += winnerMaps;
        loser.history.push({
          matchId: resolved.id,
          tournamentId: tournament.id,
          tournamentName: tournament.name,
          opponentTeamId: winnerTeam,
          won: false,
          mapsWon: loserMaps,
          mapsLost: winnerMaps,
          walkover,
          playedAt,
        });

        recordHeadToHead(headToHead, winnerTeam, loserTeam, true);
        recordHeadToHead(headToHead, loserTeam, winnerTeam, false);
      }
    }

    /*
     * Placements come from the final standings, which a bracket already ranks by
     * how far each participant got. Ranks can be shared — without a third place
     * match both losing semi-finalists come third — so a tournament can hand out
     * two bronzes, and pretending otherwise would invent a result nobody played
     * for.
     */
    if (state.isComplete) {
      const major = isWorldChampionship(tournament.name);
      const at = tournament.endsAt ?? tournament.startsAt ?? tournament.createdAt;

      for (const standing of state.finalStandings) {
        if (standing.rank > 3) continue;
        const teamId = teamOfParticipant.get(standing.participantId);
        if (teamId === undefined) continue;

        const entry = ensure(teamId);
        if (standing.rank === 1) entry.tournamentsWon += 1;
        entry.placements.push({
          tournamentId: tournament.id,
          tournamentName: tournament.name,
          rank: standing.rank,
          major,
          at,
        });
      }
    }
  }

  for (const entry of stats.values()) {
    entry.winRate = entry.matchesPlayed === 0 ? 0 : entry.wins / entry.matchesPlayed;
    entry.history.sort((a, b) => b.playedAt.localeCompare(a.playedAt));
    // Best first, and among equals the most recent — a cabinet reads by weight.
    entry.placements.sort((a, b) => a.rank - b.rank || b.at.localeCompare(a.at));
    entry.opponents = [...(headToHead.get(entry.teamId)?.values() ?? [])].sort(
      (a, b) => b.wins + b.losses - (a.wins + a.losses),
    );
  }

  return stats;
}

/** Statistics for a single team, or an empty record when it has never played. */
export function computeTeamStatistics(teamId: TeamId, input: StatisticsInput): TeamStatistics {
  return (
    computeAllTeamStatistics(input).get(teamId) ?? {
      teamId,
      matchesPlayed: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      mapsWon: 0,
      mapsLost: 0,
      tournamentsEntered: 0,
      tournamentsWon: 0,
      placements: [],
      opponents: [],
      history: [],
    }
  );
}

function recordHeadToHead(
  table: Map<TeamId, Map<TeamId, OpponentRecord>>,
  teamId: TeamId,
  opponentId: TeamId,
  won: boolean,
): void {
  let row = table.get(teamId);
  if (!row) {
    row = new Map();
    table.set(teamId, row);
  }
  let record = row.get(opponentId);
  if (!record) {
    record = { teamId: opponentId, wins: 0, losses: 0 };
    row.set(opponentId, record);
  }
  if (won) record.wins += 1;
  else record.losses += 1;
}

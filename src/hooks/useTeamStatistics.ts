import { useMemo } from 'react';

import { computeAllTeamStatistics, type TeamStatistics } from '@domain/statistics/teamStats';
import { useDataStore } from '@store/slices/dataSlice';

import type { TeamId } from '@models/index';

/**
 * Statistics for every team, derived from the stored results.
 *
 * Memoised on the store's entity records, which are replaced on write, so the
 * aggregation reruns exactly when something it depends on changed. Every team is
 * computed in one pass because each tournament has to be derived anyway.
 */
export function useAllTeamStatistics(): Map<TeamId, TeamStatistics> {
  const tournaments = useDataStore((s) => s.tournaments);
  const stages = useDataStore((s) => s.stages);
  const matches = useDataStore((s) => s.matches);

  return useMemo(
    () =>
      computeAllTeamStatistics({
        tournaments: Object.values(tournaments),
        stages: Object.values(stages),
        matches: Object.values(matches),
      }),
    [tournaments, stages, matches],
  );
}

const EMPTY: Omit<TeamStatistics, 'teamId'> = {
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

/** Statistics for one team, empty when it has not played yet. */
export function useTeamStatistics(teamId: TeamId | undefined): TeamStatistics {
  const all = useAllTeamStatistics();
  return useMemo(() => {
    if (teamId === undefined) return { teamId: '' as TeamId, ...EMPTY };
    return all.get(teamId) ?? { teamId, ...EMPTY };
  }, [all, teamId]);
}

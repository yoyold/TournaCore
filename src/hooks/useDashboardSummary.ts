import { useMemo } from 'react';

import { deriveTournamentState } from '@domain/derive';
import { useDataStore } from '@store/slices/dataSlice';

export interface DashboardSummary {
  /** Tournaments taking entries or being played. */
  activeTournaments: number;
  /** Teams in the archive, not counting archived ones. */
  registeredTeams: number;
  /** Fixtures with both participants known and no result yet. */
  upcomingMatches: number;
}

/**
 * The three figures the dashboard opens with.
 *
 * Counted rather than stored, like everything else here: a fixture is upcoming
 * because both its participants are known and nobody has recorded a result, not
 * because something marked it so. That means the figures cannot drift out of
 * step with the tournaments they describe.
 *
 * Memoised on the entity references, which the store replaces on write.
 */
export function useDashboardSummary(): DashboardSummary {
  const tournaments = useDataStore((s) => s.tournaments);
  const stages = useDataStore((s) => s.stages);
  const matches = useDataStore((s) => s.matches);
  const teams = useDataStore((s) => s.teams);

  return useMemo(() => {
    const allStages = Object.values(stages);
    const allMatches = Object.values(matches);

    let activeTournaments = 0;
    let upcomingMatches = 0;

    for (const tournament of Object.values(tournaments)) {
      // Finished and abandoned events are history, and a draft is not an event
      // yet — neither belongs in a view of what is going on now.
      if (tournament.status !== 'registration' && tournament.status !== 'live') continue;

      const state = deriveTournamentState({
        tournament,
        stages: allStages,
        matches: allMatches,
      });

      // Played to the end but never marked so: still not something going on.
      if (state.isComplete) continue;

      activeTournaments += 1;
      for (const stage of state.stages) {
        upcomingMatches += stage.resolved.matches.filter(
          (match) => match.status === 'ready',
        ).length;
      }
    }

    return {
      activeTournaments,
      registeredTeams: Object.values(teams).filter((team) => !team.archived).length,
      upcomingMatches,
    };
  }, [tournaments, stages, matches, teams]);
}

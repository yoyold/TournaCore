import { useMemo } from 'react';

import {
  computeEloRatings,
  eloHistory,
  eloLeaderboard,
  type EloPoint,
  type EloRating,
} from '@domain/statistics/elo';
import { useDataStore } from '@store/slices/dataSlice';

import type { TeamId } from '@models/index';

/** Elo leaderboard derived from every played match, strongest team first. */
export function useEloLeaderboard(): EloRating[] {
  const tournaments = useDataStore((s) => s.tournaments);
  const stages = useDataStore((s) => s.stages);
  const matches = useDataStore((s) => s.matches);

  return useMemo(
    () =>
      eloLeaderboard({
        tournaments: Object.values(tournaments),
        stages: Object.values(stages),
        matches: Object.values(matches),
      }),
    [tournaments, stages, matches],
  );
}

/** Everything a rating is computed from, memoised so the walk runs once. */
function useEloInput() {
  const tournaments = useDataStore((s) => s.tournaments);
  const stages = useDataStore((s) => s.stages);
  const matches = useDataStore((s) => s.matches);

  return useMemo(
    () => ({
      tournaments: Object.values(tournaments),
      stages: Object.values(stages),
      matches: Object.values(matches),
    }),
    [tournaments, stages, matches],
  );
}

/** One team's rating, or undefined while it has played nothing that counts. */
export function useEloRating(teamId: TeamId | undefined): EloRating | undefined {
  const input = useEloInput();

  return useMemo(
    () => (teamId === undefined ? undefined : computeEloRatings(input).get(teamId)),
    [input, teamId],
  );
}

/** How one team's rating moved over time, oldest first. */
export function useEloHistory(teamId: TeamId | undefined): EloPoint[] {
  const input = useEloInput();

  return useMemo(() => (teamId === undefined ? [] : eloHistory(input, teamId)), [input, teamId]);
}

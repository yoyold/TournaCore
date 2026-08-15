import { useMemo } from 'react';

import { eloLeaderboard, type EloRating } from '@domain/statistics/elo';
import { useDataStore } from '@store/slices/dataSlice';

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

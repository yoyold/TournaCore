import { useMemo } from 'react';

import { deriveTournamentState, type DerivedTournamentState } from '@domain/derive';
import { useDataStore } from '@store/slices/dataSlice';

import type { Team, TournamentId } from '@models/index';

export interface DerivedTournamentResult {
  state: DerivedTournamentState | undefined;
  /** Team lookup by participant, for rendering names and tags. */
  teamOf: (participantId: string) => Team | undefined;
}

/**
 * Derives a tournament's full state from the store.
 *
 * Memoised on the entity references rather than on their contents: the store
 * replaces objects on write, so identity comparison is both correct and cheap.
 * Recomputing on every render would be correct too, just wasteful once a bracket
 * carries a few hundred matches.
 */
export function useDerivedTournament(
  tournamentId: TournamentId | undefined,
): DerivedTournamentResult {
  const tournament = useDataStore((s) => (tournamentId ? s.tournaments[tournamentId] : undefined));
  const stages = useDataStore((s) => s.stages);
  const matches = useDataStore((s) => s.matches);
  const teams = useDataStore((s) => s.teams);

  const state = useMemo(() => {
    if (!tournament) return undefined;
    return deriveTournamentState({
      tournament,
      stages: Object.values(stages),
      matches: Object.values(matches),
    });
  }, [tournament, stages, matches]);

  const teamOf = useMemo(() => {
    const byParticipant = new Map<string, Team>();
    if (tournament) {
      for (const participant of tournament.participants) {
        const team = teams[participant.teamId];
        if (team) byParticipant.set(participant.id, team);
      }
    }
    return (participantId: string) => byParticipant.get(participantId);
  }, [tournament, teams]);

  return { state, teamOf };
}

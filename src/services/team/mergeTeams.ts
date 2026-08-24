import type { Team, TeamId, Tournament } from '@models/index';

export interface MergeInput {
  /** The team that disappears. */
  source: Team;
  /** The team that remains, and inherits the history. */
  target: Team;
  tournaments: readonly Tournament[];
  timestamp: string;
}

export interface MergeResult {
  /** The surviving team, with the names it used to compete under. */
  team: Team;
  /** Only the tournaments that actually changed. */
  tournaments: Tournament[];
  /** Entries that moved from one team to the other. */
  movedEntries: number;
}

/**
 * Folds one team into another.
 *
 * Clubs rename themselves, and over years the same team turns up in the record
 * under several names. Merging them has to keep every result: what changes is
 * only which team a tournament entry points at.
 *
 * Nothing is rewritten beyond those references. Matches address participants,
 * participants address teams, and statistics and ratings are derived from
 * matches — so moving the reference is enough for the whole history to reappear
 * under one name, with no result touched and nothing recalculated by hand.
 *
 * Pure: the caller decides what to persist.
 */
export function mergeTeams(input: MergeInput): MergeResult {
  const { source, target, tournaments, timestamp } = input;

  let movedEntries = 0;
  const changed: Tournament[] = [];

  for (const tournament of tournaments) {
    if (!tournament.participants.some((entry) => entry.teamId === source.id)) continue;

    const participants = tournament.participants.map((entry) => {
      if (entry.teamId !== source.id) return entry;
      movedEntries += 1;
      return { ...entry, teamId: target.id };
    });

    changed.push({ ...tournament, participants, updatedAt: timestamp });
  }

  return {
    team: { ...target, formerNames: formerNamesAfter(source, target), updatedAt: timestamp },
    tournaments: changed,
    movedEntries,
  };
}

/**
 * Every name the surviving team is now known to have used.
 *
 * The names the disappearing team carried come along with it: a club renamed
 * twice should still be findable under the first name.
 */
function formerNamesAfter(source: Team, target: Team): string[] {
  const names = new Set<string>([
    ...(target.formerNames ?? []),
    ...(source.formerNames ?? []),
    source.name,
  ]);

  names.delete(target.name);
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** How many tournament entries a team holds, for showing what a merge moves. */
export function countEntries(teamId: TeamId, tournaments: readonly Tournament[]): number {
  return tournaments.reduce(
    (sum, tournament) =>
      sum + tournament.participants.filter((entry) => entry.teamId === teamId).length,
    0,
  );
}

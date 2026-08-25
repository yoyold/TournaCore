import type { Team, Tournament } from '@models/index';

/**
 * Finds tournaments by what a person would remember about them.
 *
 * Not only the name. An archive spanning years is searched as often for "where
 * did this club play" as for a tournament's title, and the entrants are the
 * thing most likely to be remembered — so the teams that took part are matched
 * too, under any name they competed as.
 *
 * Every term has to match something. Typing two words narrows rather than
 * widens, which is what makes a search over hundreds of tournaments usable.
 */
export function searchTournaments(
  tournaments: readonly Tournament[],
  query: string,
  teamsById: Readonly<Record<string, Team | undefined>>,
): Tournament[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...tournaments];

  return tournaments.filter((tournament) => {
    const haystack = searchableText(tournament, teamsById);
    return terms.every((term) => haystack.includes(term));
  });
}

/** Everything about a tournament worth matching against, lowercased. */
function searchableText(
  tournament: Tournament,
  teamsById: Readonly<Record<string, Team | undefined>>,
): string {
  const parts: string[] = [tournament.name];

  if (tournament.organizer !== undefined) parts.push(tournament.organizer);

  for (const entry of tournament.participants) {
    const team = teamsById[entry.teamId];
    if (!team) continue;
    parts.push(team.name, team.tag);
    // A club that renamed itself played the older tournaments under the old
    // name, which is the name someone searching is likely to reach for.
    if (team.formerNames) parts.push(...team.formerNames);
  }

  return parts.join(' ').toLowerCase();
}

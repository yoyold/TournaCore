import type { Team } from '@models/index';

/**
 * Grouping and filtering teams by the region they compete in.
 *
 * A region is free text, because regional splits differ per game and no fixed
 * list survives contact with a new title. That makes spelling the only thing
 * holding a region together, so everything here compares case-insensitively and
 * displays the spelling the teams were actually given.
 */

/** A filter value, prefixed so that no region can collide with the specials. */
export type RegionFilter = 'all' | 'none' | `region:${string}`;

export interface RegionGroup<T> {
  /** The spelling to display, or undefined for the teams without a region. */
  label?: string;
  /** Stable identity for keys and filter values. */
  key: string;
  items: T[];
}

/** The comparable identity of a region, or undefined when there is none. */
export function regionKey(team: Team | undefined): string | undefined {
  const region = team?.region?.trim();
  return region ? region.toLowerCase() : undefined;
}

/**
 * Groups items under the region of the team behind them.
 *
 * Regions come out alphabetically and the teams without one last: an unlabelled
 * group at the top reads as though it were the most important one, when it is
 * really just the part nobody has filled in yet.
 */
export function groupByRegion<T>(
  items: readonly T[],
  teamOf: (item: T) => Team | undefined,
): RegionGroup<T>[] {
  const groups = new Map<string, RegionGroup<T>>();
  const unassigned: T[] = [];

  for (const item of items) {
    const team = teamOf(item);
    const key = regionKey(team);

    if (key === undefined) {
      unassigned.push(item);
      continue;
    }

    const group = groups.get(key);
    if (group) group.items.push(item);
    else groups.set(key, { key, label: team?.region?.trim() ?? key, items: [item] });
  }

  const sorted = [...groups.values()].sort((a, b) =>
    (a.label ?? a.key).localeCompare(b.label ?? b.key),
  );

  return unassigned.length > 0 ? [...sorted, { key: 'none', items: unassigned }] : sorted;
}

/**
 * The filter values worth offering for a set of teams.
 *
 * Derived from the teams present rather than from a fixed list, so a region
 * disappears from the filter once nothing is listed under it — a filter that
 * can only ever return nothing is noise.
 */
export function regionFilters(teams: readonly Team[]): RegionFilter[] {
  const groups = groupByRegion(teams, (team) => team);
  const named = groups.filter((group) => group.label !== undefined);

  const filters: RegionFilter[] = [
    'all',
    ...named.map((group): RegionFilter => `region:${group.key}`),
  ];
  return groups.length > named.length ? [...filters, 'none'] : filters;
}

/** The heading to show for a filter value, or undefined for the specials. */
export function regionLabelOf(teams: readonly Team[], filter: RegionFilter): string | undefined {
  if (filter === 'all' || filter === 'none') return undefined;
  const key = filter.slice('region:'.length);
  return groupByRegion(teams, (team) => team).find((group) => group.key === key)?.label;
}

/** Whether a team belongs in the list under the given filter. */
export function passesRegion(team: Team | undefined, filter: RegionFilter): boolean {
  const key = regionKey(team);
  if (filter === 'all') return true;
  if (filter === 'none') return key === undefined;
  return key === filter.slice('region:'.length);
}

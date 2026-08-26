import { describe, expect, it } from 'vitest';

import { asId, now, type Team, type TeamId } from '@models/index';

import { groupByRegion, passesRegion, regionFilters, regionKey, regionLabelOf } from './regions';

function team(name: string, region?: string): Team {
  return {
    id: asId<TeamId>(name),
    name,
    tag: name.slice(0, 3).toUpperCase(),
    socials: [],
    archived: false,
    createdAt: now(),
    updatedAt: now(),
    ...(region !== undefined ? { region } : {}),
  };
}

const TEAMS = [
  team('Fnatic', 'EU'),
  team('Cloud9', 'NA'),
  team('Alliance', 'eu'),
  team('Nobody'),
  team('Spacey', '  '),
];

const grouped = (): { key: string; label?: string; names: string[] }[] =>
  groupByRegion(TEAMS, (entry) => entry).map((group) => ({
    key: group.key,
    ...(group.label !== undefined ? { label: group.label } : {}),
    names: group.items.map((entry) => entry.name),
  }));

describe('regionKey', () => {
  it('ignores case and surrounding space', () => {
    expect(regionKey(team('a', 'EU'))).toBe('eu');
    expect(regionKey(team('a', ' eu '))).toBe('eu');
  });

  /** Blank is not a region, it is the absence of one. */
  it('treats blank and missing alike', () => {
    expect(regionKey(team('a', '   '))).toBeUndefined();
    expect(regionKey(team('a'))).toBeUndefined();
    expect(regionKey(undefined)).toBeUndefined();
  });
});

describe('groupByRegion', () => {
  it('puts differently spelled regions in one group', () => {
    const eu = grouped().find((group) => group.key === 'eu');
    expect(eu?.names).toEqual(['Fnatic', 'Alliance']);
  });

  it('displays the spelling the first team was given', () => {
    expect(grouped().find((group) => group.key === 'eu')?.label).toBe('EU');
  });

  it('sorts regions alphabetically', () => {
    expect(grouped().map((group) => group.key)).toEqual(['eu', 'na', 'none']);
  });

  /** An unlabelled group at the top reads as the most important one. */
  it('puts the teams without a region last, and without a label', () => {
    const last = grouped().at(-1);
    expect(last?.key).toBe('none');
    expect(last?.label).toBeUndefined();
    expect(last?.names).toEqual(['Nobody', 'Spacey']);
  });

  it('omits the group entirely when every team has a region', () => {
    const groups = groupByRegion([team('Fnatic', 'EU')], (entry) => entry);
    expect(groups.map((group) => group.key)).toEqual(['eu']);
  });

  it('groups nothing into nothing', () => {
    expect(groupByRegion([], (entry: Team) => entry)).toEqual([]);
  });
});

describe('regionFilters', () => {
  it('offers everything, each region, and the teams without one', () => {
    expect(regionFilters(TEAMS)).toEqual(['all', 'region:eu', 'region:na', 'none']);
  });

  /** A filter that can only ever return nothing is noise. */
  it('leaves out regions no team is listed under', () => {
    expect(regionFilters([team('Fnatic', 'EU')])).toEqual(['all', 'region:eu']);
  });

  it('names a filter after the spelling in use', () => {
    expect(regionLabelOf(TEAMS, 'region:eu')).toBe('EU');
    expect(regionLabelOf(TEAMS, 'all')).toBeUndefined();
    expect(regionLabelOf(TEAMS, 'region:cn')).toBeUndefined();
  });
});

describe('passesRegion', () => {
  it('lets everything through unfiltered', () => {
    expect(TEAMS.every((entry) => passesRegion(entry, 'all'))).toBe(true);
  });

  it('matches a region regardless of spelling', () => {
    expect(passesRegion(team('a', 'eu'), 'region:eu')).toBe(true);
    expect(passesRegion(team('a', 'EU'), 'region:eu')).toBe(true);
    expect(passesRegion(team('a', 'NA'), 'region:eu')).toBe(false);
  });

  it('selects the teams without a region', () => {
    expect(passesRegion(team('a'), 'none')).toBe(true);
    expect(passesRegion(team('a', 'EU'), 'none')).toBe(false);
  });

  /** A leaderboard row whose team was deleted still has to render somewhere. */
  it('counts a missing team as having no region', () => {
    expect(passesRegion(undefined, 'none')).toBe(true);
    expect(passesRegion(undefined, 'all')).toBe(true);
    expect(passesRegion(undefined, 'region:eu')).toBe(false);
  });
});

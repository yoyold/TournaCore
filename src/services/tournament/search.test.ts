import { describe, expect, it } from 'vitest';

import {
  asId,
  now,
  type Participant,
  type Team,
  type Tournament,
  type TournamentId,
} from '@models/index';

import { searchTournaments } from './search';

function team(id: string, name: string, tag: string, formerNames?: string[]): Team {
  return {
    id: asId<Team['id']>(id),
    name,
    tag,
    socials: [],
    archived: false,
    createdAt: now(),
    updatedAt: now(),
    ...(formerNames ? { formerNames } : {}),
  };
}

function tournament(id: string, name: string, teamIds: string[], organizer?: string): Tournament {
  return {
    id: asId<TournamentId>(id),
    name,
    slug: id,
    gameId: asId<Tournament['gameId']>('g1'),
    status: 'completed',
    participants: teamIds.map((teamId, index) => ({
      id: asId<Participant['id']>(`${id}-p${String(index)}`),
      teamId: asId<Team['id']>(teamId),
      seed: index + 1,
      status: 'active' as const,
    })),
    stageIds: [],
    createdAt: now(),
    updatedAt: now(),
    ...(organizer ? { organizer } : {}),
  };
}

const TEAMS: Record<string, Team> = {
  vici: team('vici', 'Vici Gaming', 'VG', ['Quantic Gaming']),
  fnatic: team('fnatic', 'Fnatic', 'FNC'),
  alliance: team('alliance', 'Alliance', 'ALL'),
};

const TOURNAMENTS = [
  tournament('a', 'EU World Qualifier 25', ['vici', 'fnatic'], 'YoYoLD'),
  tournament('b', 'Winter Ladder', ['fnatic', 'alliance']),
  tournament('c', 'Spring Cup', ['alliance'], 'Someone Else'),
];

const find = (query: string): string[] =>
  searchTournaments(TOURNAMENTS, query, TEAMS).map((entry) => entry.name);

describe('searchTournaments', () => {
  it('returns everything for an empty query', () => {
    expect(find('')).toHaveLength(3);
    expect(find('   ')).toHaveLength(3);
  });

  it('matches part of the tournament name', () => {
    expect(find('qualifier')).toEqual(['EU World Qualifier 25']);
  });

  it('ignores case', () => {
    expect(find('WINTER')).toEqual(['Winter Ladder']);
  });

  it('matches the organiser', () => {
    expect(find('yoyold')).toEqual(['EU World Qualifier 25']);
  });

  /**
   * The search an archive is actually used for: not "what was this tournament
   * called" but "where did this club play".
   */
  it('finds a tournament by a team that took part', () => {
    expect(find('fnatic')).toEqual(['EU World Qualifier 25', 'Winter Ladder']);
  });

  it('matches a team tag', () => {
    expect(find('VG')).toEqual(['EU World Qualifier 25']);
  });

  /** A club that renamed itself played the older tournaments under the old name. */
  it('finds a team under a name it no longer uses', () => {
    expect(find('quantic')).toEqual(['EU World Qualifier 25']);
  });

  it('narrows with each further word rather than widening', () => {
    expect(find('fnatic')).toHaveLength(2);
    expect(find('fnatic alliance')).toEqual(['Winter Ladder']);
  });

  it('finds nothing when nothing matches', () => {
    expect(find('astralis')).toEqual([]);
  });

  it('leaves the input alone', () => {
    const before = TOURNAMENTS.map((entry) => entry.id);
    searchTournaments(TOURNAMENTS, 'fnatic', TEAMS);
    expect(TOURNAMENTS.map((entry) => entry.id)).toEqual(before);
  });

  it('copes with a participant whose team is gone', () => {
    const orphaned = [tournament('d', 'Orphan Cup', ['deleted'])];
    // Deleting a team leaves its tournaments standing; searching must not throw.
    expect(searchTournaments(orphaned, 'orphan', TEAMS)).toHaveLength(1);
    expect(searchTournaments(orphaned, 'deleted', TEAMS)).toHaveLength(0);
  });
});

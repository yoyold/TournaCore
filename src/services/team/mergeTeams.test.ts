import { describe, expect, it } from 'vitest';

import {
  asId,
  now,
  type Participant,
  type Team,
  type Tournament,
  type TournamentId,
} from '@models/index';

import { countEntries, mergeTeams } from './mergeTeams';

const TIMESTAMP = '2026-01-01T00:00:00.000Z';

function team(id: string, name: string, formerNames?: string[]): Team {
  return {
    id: asId<Team['id']>(id),
    name,
    tag: name.slice(0, 3).toUpperCase(),
    socials: [],
    archived: false,
    createdAt: now(),
    updatedAt: now(),
    ...(formerNames ? { formerNames } : {}),
  };
}

function tournament(id: string, teamIds: string[]): Tournament {
  return {
    id: asId<TournamentId>(id),
    name: `Cup ${id}`,
    slug: `cup-${id}`,
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
  };
}

const OLD = team('old', 'Quantic Gaming');
const NEW = team('new', 'Vici Gaming');

describe('mergeTeams', () => {
  /**
   * The whole point: a club that renamed itself keeps the history it played
   * under the old name. Only the reference moves.
   */
  it('moves every entry of the disappearing team', () => {
    const result = mergeTeams({
      source: OLD,
      target: NEW,
      tournaments: [tournament('t1', ['old', 'x']), tournament('t2', ['y', 'old'])],
      timestamp: TIMESTAMP,
    });

    expect(result.movedEntries).toBe(2);
    for (const entry of result.tournaments.flatMap((t) => t.participants)) {
      expect(entry.teamId).not.toBe('old');
    }
  });

  it('leaves everyone else alone', () => {
    const result = mergeTeams({
      source: OLD,
      target: NEW,
      tournaments: [tournament('t1', ['old', 'x'])],
      timestamp: TIMESTAMP,
    });

    const others = result.tournaments[0]?.participants.filter((entry) => entry.teamId === 'x');
    expect(others).toHaveLength(1);
  });

  it('touches only the tournaments that change', () => {
    const result = mergeTeams({
      source: OLD,
      target: NEW,
      tournaments: [tournament('t1', ['old']), tournament('t2', ['x', 'y'])],
      timestamp: TIMESTAMP,
    });

    // Rewriting untouched tournaments would churn their timestamps for nothing.
    expect(result.tournaments.map((t) => t.id)).toEqual(['t1']);
  });

  it('keeps no result and no participant identity beyond the team reference', () => {
    const before = tournament('t1', ['old', 'x']);
    const result = mergeTeams({
      source: OLD,
      target: NEW,
      tournaments: [before],
      timestamp: TIMESTAMP,
    });

    const after = result.tournaments[0];
    // Participant ids and seeds are what matches address; they must not move.
    expect(after?.participants.map((entry) => entry.id)).toEqual(
      before.participants.map((entry) => entry.id),
    );
    expect(after?.participants.map((entry) => entry.seed)).toEqual([1, 2]);
  });
});

describe('former names', () => {
  it('records the name the club used to compete under', () => {
    const result = mergeTeams({ source: OLD, target: NEW, tournaments: [], timestamp: TIMESTAMP });
    expect(result.team.formerNames).toEqual(['Quantic Gaming']);
  });

  /** A club renamed twice should still be findable under the first name. */
  it('carries the disappearing team’s own former names along', () => {
    const twiceRenamed = team('old', 'Quantic Gaming', ['Quantic eSports']);
    const result = mergeTeams({
      source: twiceRenamed,
      target: NEW,
      tournaments: [],
      timestamp: TIMESTAMP,
    });

    // Kept sorted, so the list reads the same however the merges happened.
    expect(result.team.formerNames).toEqual(['Quantic eSports', 'Quantic Gaming']);
  });

  it('does not list the surviving name as a former one', () => {
    const confusing = team('old', 'Vici Gaming');
    const result = mergeTeams({
      source: confusing,
      target: NEW,
      tournaments: [],
      timestamp: TIMESTAMP,
    });

    expect(result.team.formerNames).toEqual([]);
  });

  it('does not repeat a name already recorded', () => {
    const target = team('new', 'Vici Gaming', ['Quantic Gaming']);
    const result = mergeTeams({ source: OLD, target, tournaments: [], timestamp: TIMESTAMP });

    expect(result.team.formerNames).toEqual(['Quantic Gaming']);
  });

  it('keeps the surviving team otherwise untouched', () => {
    const result = mergeTeams({ source: OLD, target: NEW, tournaments: [], timestamp: TIMESTAMP });

    expect(result.team.id).toBe(NEW.id);
    expect(result.team.name).toBe('Vici Gaming');
    expect(result.team.tag).toBe(NEW.tag);
  });
});

describe('countEntries', () => {
  it('counts the tournament entries a team holds', () => {
    const tournaments = [tournament('t1', ['old', 'x']), tournament('t2', ['old', 'old'])];
    expect(countEntries(asId<Team['id']>('old'), tournaments)).toBe(3);
  });

  it('is zero for a team nobody entered', () => {
    expect(countEntries(asId<Team['id']>('ghost'), [tournament('t1', ['x'])])).toBe(0);
  });
});

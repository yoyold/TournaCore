import { describe, expect, it } from 'vitest';

import {
  asId,
  now,
  type Participant,
  type SeedingRule,
  type Stage,
  type StageId,
  type Team,
  type TeamId,
  type TournamentId,
} from '@models/index';

import { applyField, composeField, resizeEntrySlots } from './registration';

function rule(overrides: { id: string } & Partial<Omit<SeedingRule, 'id'>>): SeedingRule {
  return {
    id: asId<SeedingRule['id']>(overrides.id),
    source: overrides.source ?? { kind: 'participants' },
    targetSlots: overrides.targetSlots ?? { from: 1, to: 8 },
    order: overrides.order ?? 'as_ranked',
  };
}

function stage(id: string, entrySeeding: SeedingRule[]): Stage {
  return {
    id: asId<StageId>(id),
    tournamentId: asId<TournamentId>('t1'),
    name: id,
    order: 0,
    format: {
      kind: 'single_elimination',
      thirdPlaceMatch: false,
      byePlacement: 'seeded',
      matchFormats: { default: { kind: 'bo', games: 1 } },
    },
    entrySeeding,
    createdAt: now(),
    updatedAt: now(),
  };
}

function team(id: string, name: string, countryCode?: string): Team {
  return {
    id: asId<TeamId>(id),
    name,
    tag: name.slice(0, 3).toUpperCase(),
    socials: [],
    archived: false,
    createdAt: now(),
    updatedAt: now(),
    ...(countryCode !== undefined ? { countryCode } : {}),
  };
}

describe('resizeEntrySlots', () => {
  it('restates the slots of the stage that reads the entry list', () => {
    const [resized] = resizeEntrySlots([stage('s1', [rule({ id: 'r1' })])], 12);
    expect(resized?.entrySeeding[0]?.targetSlots).toEqual({ from: 1, to: 12 });
  });

  /**
   * Later stages are fed by the ones before them, which is what lets a group
   * stage keep the groups and advancing places the organiser chose.
   */
  it('leaves a stage fed by another stage alone', () => {
    const fed = stage('s2', [
      rule({
        id: 'r2',
        source: {
          kind: 'group_standings',
          stageId: asId<StageId>('s1'),
          placeRange: { from: 1, to: 2 },
        },
        targetSlots: { from: 1, to: 4 },
      }),
    ]);

    expect(resizeEntrySlots([fed], 30)[0]).toBe(fed);
  });

  /** Identity is how the caller tells which stages actually need writing. */
  it('returns an already correct stage unchanged', () => {
    const only = stage('s1', [rule({ id: 'r1', targetSlots: { from: 1, to: 8 } })]);
    expect(resizeEntrySlots([only], 8)[0]).toBe(only);
  });

  it('keeps a stage representable when the field is empty', () => {
    const [resized] = resizeEntrySlots([stage('s1', [rule({ id: 'r1' })])], 0);
    expect(resized?.entrySeeding[0]?.targetSlots).toEqual({ from: 1, to: 1 });
  });

  it('does not mutate the stages it was given', () => {
    const original = stage('s1', [rule({ id: 'r1' })]);
    resizeEntrySlots([original], 20);
    expect(original.entrySeeding[0]?.targetSlots.to).toBe(8);
  });
});

describe('applyField', () => {
  const known = [team('t-fnatic', 'Fnatic', 'SE'), team('t-vici', 'Vici Gaming')];

  it('seeds participants in the order of the field', () => {
    const { participants } = applyField(
      [{ name: 'Vici Gaming', teamId: asId<TeamId>('t-vici') }, { name: 'Fnatic' }],
      [],
      known,
    );

    expect(participants.map((entry) => entry.teamId)).toEqual(['t-vici', 't-fnatic']);
    expect(participants.map((entry) => entry.seed)).toEqual([1, 2]);
  });

  it('reuses a known team named by a typed entry', () => {
    const { participants, newTeams } = applyField([{ name: 'fnatic' }], [], known);
    expect(newTeams).toEqual([]);
    expect(participants[0]?.teamId).toBe('t-fnatic');
  });

  it('creates a team for an entry that names none', () => {
    const { participants, newTeams } = applyField(
      [{ name: 'Newcomer', countryCode: 'DE' }],
      [],
      known,
    );

    expect(newTeams).toHaveLength(1);
    expect(newTeams[0]?.name).toBe('Newcomer');
    expect(newTeams[0]?.countryCode).toBe('DE');
    expect(participants[0]?.teamId).toBe(newTeams[0]?.id);
  });

  it('creates one team for a name entered twice', () => {
    const { newTeams } = applyField([{ name: 'Newcomer' }, { name: 'newcomer' }], [], known);
    expect(newTeams).toHaveLength(1);
  });

  /**
   * An entry that merely moved is the same entry. Minting a new participant for
   * it would discard whatever is recorded against the old one.
   */
  it('keeps the identity of a participant that only changed place', () => {
    const existing: Participant[] = [
      {
        id: asId<Participant['id']>('p-fnatic'),
        teamId: asId<TeamId>('t-fnatic'),
        seed: 1,
        status: 'withdrawn',
        note: 'travel',
      },
    ];

    const { participants } = applyField(
      [{ name: 'Vici Gaming' }, { name: 'Fnatic' }],
      existing,
      known,
    );

    const fnatic = participants[1];
    expect(fnatic?.id).toBe('p-fnatic');
    expect(fnatic?.seed).toBe(2);
    expect(fnatic?.status).toBe('withdrawn');
    expect(fnatic?.note).toBe('travel');
  });

  /** A rename leaves the old name behind; the id does not move. */
  it('prefers the named team over a matching name', () => {
    const renamed = [team('t-fnatic', 'Fnatic Rebrand')];
    const { participants, newTeams } = applyField(
      [{ name: 'Fnatic', teamId: asId<TeamId>('t-fnatic') }],
      [],
      renamed,
    );

    expect(newTeams).toEqual([]);
    expect(participants[0]?.teamId).toBe('t-fnatic');
  });

  it('empties a field without complaint', () => {
    expect(applyField([], [], known)).toEqual({ participants: [], newTeams: [] });
  });
});

describe('composeField', () => {
  const teams = [team('t-fnatic', 'Fnatic', 'SE'), team('t-vici', 'Vici Gaming')];
  const byId = (id: TeamId): Team | undefined => teams.find((entry) => entry.id === id);

  it('puts picked teams before typed ones', () => {
    const field = composeField([asId<TeamId>('t-vici')], byId, [{ name: 'Typed' }]);
    expect(field.map((entry) => entry.name)).toEqual(['Vici Gaming', 'Typed']);
  });

  it('carries the identity and country of a picked team', () => {
    const [entry] = composeField([asId<TeamId>('t-fnatic')], byId, []);
    expect(entry).toEqual({ name: 'Fnatic', teamId: 't-fnatic', countryCode: 'SE' });
  });

  /** Entering the same club twice is a slip, not an intention. */
  it('drops a typed line naming a team already picked', () => {
    const field = composeField([asId<TeamId>('t-fnatic')], byId, [
      { name: 'fnatic' },
      { name: 'Other' },
    ]);

    expect(field.map((entry) => entry.name)).toEqual(['Fnatic', 'Other']);
  });

  it('ignores a pick whose team is gone', () => {
    expect(composeField([asId<TeamId>('t-deleted')], byId, [])).toEqual([]);
  });

  it('ignores a pick repeated in the list', () => {
    const twice = [asId<TeamId>('t-vici'), asId<TeamId>('t-vici')];
    expect(composeField(twice, byId, [])).toHaveLength(1);
  });
});

import { describe, expect, it } from 'vitest';

import {
  asId,
  type Participant,
  type ParticipantId,
  type SeedingRule,
  type StageId,
} from '@models/index';

import { resolveSeeding, type SeedingSourceStage } from './resolveSeeding';

import type { ResolvedMatch, ResolvedStructure, Standing } from '../formats/types';

const STAGE = asId<StageId>('stage-source');

const pid = (n: number | string): ParticipantId => asId<ParticipantId>(`p${String(n)}`);

function participants(count: number): Participant[] {
  return Array.from({ length: count }, (_, i) => ({
    id: pid(i + 1),
    teamId: asId<Participant['teamId']>(`t${String(i + 1)}`),
    seed: i + 1,
    status: 'active' as const,
  }));
}

function rule(source: SeedingRule['source'], to: number, order: SeedingRule['order']): SeedingRule {
  return {
    id: asId<SeedingRule['id']>('rule-1'),
    source,
    targetSlots: { from: 1, to },
    order,
  };
}

function standings(ids: readonly ParticipantId[]): Standing[] {
  return ids.map((participantId, i) => ({
    participantId,
    rank: i + 1,
    wins: 0,
    losses: 0,
    draws: 0,
    mapsWon: 0,
    mapsLost: 0,
  }));
}

function sourceStage(overrides: Partial<SeedingSourceStage> = {}): SeedingSourceStage {
  const empty: ResolvedStructure = {
    stageId: STAGE,
    matches: [],
    byId: new Map(),
    isComplete: true,
  };
  return {
    stageId: STAGE,
    standings: [],
    resolved: empty,
    isComplete: true,
    ...overrides,
  };
}

const run = (
  rules: SeedingRule[],
  people: Participant[] = participants(8),
  previous: Map<StageId, SeedingSourceStage> = new Map(),
) => resolveSeeding({ rules, participants: people, previousStages: previous, drawSeed: 'seed' });

describe('resolveSeeding from the participant list', () => {
  it('fills slots in seed order', () => {
    const slots = run([rule({ kind: 'participants' }, 4, 'as_ranked')], participants(4));

    expect([...slots.entries()]).toEqual([
      [1, 'p1'],
      [2, 'p2'],
      [3, 'p3'],
      [4, 'p4'],
    ]);
  });

  it('skips withdrawn and disqualified entries', () => {
    const people = participants(4);
    people[1] = { ...people[1]!, status: 'withdrawn' };
    people[2] = { ...people[2]!, status: 'disqualified' };

    const slots = run([rule({ kind: 'participants' }, 4, 'as_ranked')], people);

    expect([...slots.values()]).toEqual(['p1', 'p4']);
  });

  it('honours a seed range', () => {
    const slots = run(
      [rule({ kind: 'participants', seedRange: { from: 3, to: 5 } }, 3, 'as_ranked')],
      participants(8),
    );

    expect([...slots.values()]).toEqual(['p3', 'p4', 'p5']);
  });

  it('leaves surplus slots empty rather than repeating entries', () => {
    // Eight slots, four participants: the rest become byes downstream.
    const slots = run([rule({ kind: 'participants' }, 8, 'as_ranked')], participants(4));

    expect(slots.size).toBe(4);
    expect(slots.get(5)).toBeUndefined();
  });

  it('respects the target slot offset', () => {
    const shifted: SeedingRule = {
      ...rule({ kind: 'participants' }, 4, 'as_ranked'),
      targetSlots: { from: 5, to: 8 },
    };

    const slots = run([shifted], participants(4));
    expect([...slots.keys()]).toEqual([5, 6, 7, 8]);
  });

  it('sorts an unsorted participant list by seed', () => {
    const shuffled = [...participants(4)].reverse();
    const slots = run([rule({ kind: 'participants' }, 4, 'as_ranked')], shuffled);

    expect([...slots.values()]).toEqual(['p1', 'p2', 'p3', 'p4']);
  });
});

describe('resolveSeeding from a previous stage', () => {
  it('takes the configured placements', () => {
    const previous = new Map([
      [STAGE, sourceStage({ standings: standings([pid(3), pid(1), pid(4), pid(2)]) })],
    ]);

    const slots = run(
      [
        rule(
          { kind: 'stage_standings', stageId: STAGE, placeRange: { from: 1, to: 2 } },
          2,
          'as_ranked',
        ),
      ],
      participants(4),
      previous,
    );

    expect([...slots.values()]).toEqual(['p3', 'p1']);
  });

  it('produces nothing while the source stage is unfinished', () => {
    // Standings of a running stage are provisional. Feeding them forward would
    // reshuffle the later bracket on every result.
    const previous = new Map([
      [STAGE, sourceStage({ standings: standings([pid(1), pid(2)]), isComplete: false })],
    ]);

    const slots = run(
      [
        rule(
          { kind: 'stage_standings', stageId: STAGE, placeRange: { from: 1, to: 2 } },
          2,
          'as_ranked',
        ),
      ],
      participants(4),
      previous,
    );

    expect(slots.size).toBe(0);
  });

  it('produces nothing when the source stage does not exist', () => {
    const slots = run([
      rule(
        { kind: 'stage_standings', stageId: STAGE, placeRange: { from: 1, to: 2 } },
        2,
        'as_ranked',
      ),
    ]);

    expect(slots.size).toBe(0);
  });

  it('collects group placements place by place', () => {
    const previous = new Map([
      [
        STAGE,
        sourceStage({
          groupStandings: [
            standings([pid('a1'), pid('a2'), pid('a3')]),
            standings([pid('b1'), pid('b2'), pid('b3')]),
          ],
        }),
      ],
    ]);

    const slots = run(
      [
        rule(
          { kind: 'group_standings', stageId: STAGE, placeRange: { from: 1, to: 2 } },
          4,
          'as_ranked',
        ),
      ],
      participants(4),
      previous,
    );

    // Group winners first, then the runners-up.
    expect([...slots.values()]).toEqual(['pa1', 'pb1', 'pa2', 'pb2']);
  });

  it('produces nothing from group placements when the stage has no groups', () => {
    const previous = new Map([[STAGE, sourceStage()]]);

    const slots = run(
      [
        rule(
          { kind: 'group_standings', stageId: STAGE, placeRange: { from: 1, to: 1 } },
          2,
          'as_ranked',
        ),
      ],
      participants(4),
      previous,
    );

    expect(slots.size).toBe(0);
  });

  it('collects the losers of a bracket round in match order', () => {
    const match = (indexInRound: number, loserId?: ParticipantId): ResolvedMatch => ({
      id: asId<ResolvedMatch['id']>(`m${String(indexInRound)}`),
      position: { bracket: 'winner', round: 0, indexInRound },
      format: { kind: 'bo', games: 3 },
      slotA: { kind: 'tbd', source: { kind: 'tbd' } },
      slotB: { kind: 'tbd', source: { kind: 'tbd' } },
      status: 'completed',
      isBye: false,
      ...(loserId !== undefined ? { loserId } : {}),
    });

    const previous = new Map([
      [
        STAGE,
        sourceStage({
          resolved: {
            stageId: STAGE,
            // Deliberately out of order, and one match still undecided.
            matches: [match(2, pid(6)), match(0, pid(4)), match(1)],
            byId: new Map(),
            isComplete: false,
          },
        }),
      ],
    ]);

    const slots = run(
      [rule({ kind: 'bracket_losers', stageId: STAGE, round: 0 }, 4, 'as_ranked')],
      participants(8),
      previous,
    );

    expect([...slots.values()]).toEqual(['p4', 'p6']);
  });

  it('takes a manual list verbatim', () => {
    const slots = run([rule({ kind: 'manual', participantIds: [pid(7), pid(2)] }, 2, 'as_ranked')]);

    expect([...slots.values()]).toEqual(['p7', 'p2']);
  });
});

describe('seeding order', () => {
  it('snake reverses every second pair', () => {
    const slots = run([rule({ kind: 'participants' }, 8, 'snake')], participants(8));

    // Pairs (1,2) (3,4) (5,6) (7,8) become 1,2 then 4,3 then 5,6 then 8,7.
    expect([...slots.values()]).toEqual(['p1', 'p2', 'p4', 'p3', 'p5', 'p6', 'p8', 'p7']);
  });

  it('snake handles an odd count without dropping the last entry', () => {
    const slots = run([rule({ kind: 'participants' }, 5, 'snake')], participants(5));
    expect([...slots.values()]).toHaveLength(5);
    expect(new Set(slots.values()).size).toBe(5);
  });

  it('random draws reproducibly for the same seed', () => {
    const draw = (drawSeed: string) => [
      ...resolveSeeding({
        rules: [rule({ kind: 'participants' }, 8, 'random')],
        participants: participants(8),
        previousStages: new Map(),
        drawSeed,
      }).values(),
    ];

    // Determinism is not optional: a reload must not redraw a running tournament.
    expect(draw('alpha')).toEqual(draw('alpha'));
    expect(draw('alpha')).not.toEqual(draw('beta'));
  });

  it('random keeps every participant exactly once', () => {
    const slots = run([rule({ kind: 'participants' }, 8, 'random')], participants(8));
    expect(new Set(slots.values()).size).toBe(8);
  });
});

describe('multiple rules', () => {
  it('merges disjoint sources into one slot range', () => {
    // The shape a multi-qualifier main event takes.
    const rules: SeedingRule[] = [
      {
        id: asId<SeedingRule['id']>('direct'),
        source: { kind: 'participants', seedRange: { from: 1, to: 2 } },
        targetSlots: { from: 1, to: 2 },
        order: 'as_ranked',
      },
      {
        id: asId<SeedingRule['id']>('qualified'),
        source: { kind: 'manual', participantIds: [pid('q1'), pid('q2')] },
        targetSlots: { from: 3, to: 4 },
        order: 'as_ranked',
      },
    ];

    const slots = run(rules, participants(8));

    expect([...slots.entries()]).toEqual([
      [1, 'p1'],
      [2, 'p2'],
      [3, 'pq1'],
      [4, 'pq2'],
    ]);
  });

  it('lets a later rule overwrite an overlapping slot', () => {
    const rules: SeedingRule[] = [
      {
        id: asId<SeedingRule['id']>('first'),
        source: { kind: 'manual', participantIds: [pid(1)] },
        targetSlots: { from: 1, to: 1 },
        order: 'as_ranked',
      },
      {
        id: asId<SeedingRule['id']>('second'),
        source: { kind: 'manual', participantIds: [pid(2)] },
        targetSlots: { from: 1, to: 1 },
        order: 'as_ranked',
      },
    ];

    expect(run(rules).get(1)).toBe('p2');
  });

  it('returns nothing for an empty rule set', () => {
    expect(run([]).size).toBe(0);
  });
});

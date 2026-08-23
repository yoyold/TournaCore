import { describe, expect, it } from 'vitest';

import {
  DEFAULT_POINT_SYSTEM,
  DEFAULT_TIEBREAKERS,
  asId,
  type GroupStageConfig,
  type MatchId,
  type MatchOutcome,
  type ParticipantId,
  type StageId,
} from '@models/index';

import { distributeSlots, generateGroupStage, groupStageFormat } from './index';

const STAGE = asId<StageId>('s1');

const config = (overrides: Partial<GroupStageConfig> = {}): GroupStageConfig => ({
  kind: 'group_stage',
  groupCount: 4,
  distribution: 'snake',
  perGroup: {
    legs: 1,
    pointSystem: DEFAULT_POINT_SYSTEM,
    tiebreakers: [...DEFAULT_TIEBREAKERS],
    matchFormat: { kind: 'bo', games: 1 },
  },
  ...overrides,
});

function seed(count: number): Map<number, ParticipantId> {
  const map = new Map<number, ParticipantId>();
  for (let i = 1; i <= count; i += 1) map.set(i, asId<ParticipantId>(`p${String(i)}`));
  return map;
}

describe('distributeSlots', () => {
  /**
   * Filling groups in order would put the four strongest seeds together and
   * leave the last group with only weak entries, deciding the stage before it
   * starts. Reversing direction each pass is what prevents that.
   */
  it('spreads seeds evenly with the snake pattern', () => {
    const groups = distributeSlots(16, 4, 'snake');

    expect(groups[0]).toEqual([1, 8, 9, 16]);
    expect(groups[1]).toEqual([2, 7, 10, 15]);
    expect(groups[2]).toEqual([3, 6, 11, 14]);
    expect(groups[3]).toEqual([4, 5, 12, 13]);
  });

  it('fills groups in order when asked to', () => {
    const groups = distributeSlots(8, 2, 'sequential');
    expect(groups[0]).toEqual([1, 2, 3, 4]);
    expect(groups[1]).toEqual([5, 6, 7, 8]);
  });

  it('places every slot exactly once, whatever the distribution', () => {
    for (const distribution of ['snake', 'sequential', 'random'] as const) {
      const groups = distributeSlots(13, 4, distribution);
      const all = groups.flat();

      expect(new Set(all).size, distribution).toBe(13);
      expect(
        all.sort((a, b) => a - b),
        distribution,
      ).toEqual(Array.from({ length: 13 }, (_, i) => i + 1));
    }
  });

  it('draws reproducibly, so a reload does not reshuffle the groups', () => {
    expect(distributeSlots(12, 3, 'random', 'stage-a')).toEqual(
      distributeSlots(12, 3, 'random', 'stage-a'),
    );
    expect(distributeSlots(12, 3, 'random', 'stage-a')).not.toEqual(
      distributeSlots(12, 3, 'random', 'stage-b'),
    );
  });

  it('keeps group sizes within one of each other when the field does not divide evenly', () => {
    const groups = distributeSlots(10, 4, 'snake');
    const sizes = groups.map((group) => group.length);

    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  });
});

describe('generateGroupStage', () => {
  it('creates a round robin inside every group', () => {
    const structure = generateGroupStage({ stageId: STAGE, config: config(), slotCount: 16 });

    // Four groups of four: six fixtures each.
    expect(structure.matches).toHaveLength(24);
    for (let groupIndex = 0; groupIndex < 4; groupIndex += 1) {
      expect(structure.matches.filter((m) => m.position.groupIndex === groupIndex)).toHaveLength(6);
    }
  });

  it('never pairs participants from different groups', () => {
    const structure = generateGroupStage({ stageId: STAGE, config: config(), slotCount: 16 });
    const groups = distributeSlots(16, 4, 'snake', STAGE);

    for (const match of structure.matches) {
      const groupIndex = match.position.groupIndex ?? -1;
      const members = new Set(groups[groupIndex] ?? []);
      const a = match.slotA.kind === 'seeded' ? match.slotA.slotIndex : -1;
      const b = match.slotB.kind === 'seeded' ? match.slotB.slotIndex : -1;

      expect(members.has(a)).toBe(true);
      expect(members.has(b)).toBe(true);
    }
  });

  it('gives every match a distinct identifier across groups', () => {
    const structure = generateGroupStage({ stageId: STAGE, config: config(), slotCount: 16 });
    expect(new Set(structure.matches.map((m) => m.id)).size).toBe(structure.matches.length);
  });

  it('is deterministic', () => {
    const a = generateGroupStage({ stageId: STAGE, config: config(), slotCount: 12 });
    const b = generateGroupStage({ stageId: STAGE, config: config(), slotCount: 12 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('groupStageFormat standings', () => {
  function derive(slotCount: number, results = new Map<MatchId, MatchOutcome>()) {
    const cfg = config();
    const structure = generateGroupStage({ stageId: STAGE, config: cfg, slotCount });
    const seededSlots = seed(slotCount);
    const resolved = groupStageFormat.resolveSlots({ structure, results, seededSlots });
    const input = { structure: resolved, config: cfg, seededSlots, storedMatches: new Map() };

    return {
      flat: groupStageFormat.computeStandings(input),
      groups: groupStageFormat.computeGroupStandings?.(input) ?? [],
    };
  }

  it('produces one table per group', () => {
    const { groups } = derive(16);
    expect(groups).toHaveLength(4);
    for (const table of groups) expect(table).toHaveLength(4);
  });

  /**
   * A following stage seeds "the top two of each group" from the flat list, so
   * every group winner has to outrank every runner-up. Ordering by points across
   * groups would be meaningless: the groups faced different opponents.
   */
  it('orders the flat list by placement within the group', () => {
    const { flat, groups } = derive(16);

    const winners = new Set(
      groups.map((table) => table.find((entry) => entry.rank === 1)?.participantId),
    );
    const topFour = flat.slice(0, 4).map((entry) => entry.participantId);

    for (const participantId of topFour) {
      expect(winners.has(participantId)).toBe(true);
    }
  });

  it('includes every participant exactly once in the flat list', () => {
    const { flat } = derive(16);
    expect(flat).toHaveLength(16);
    expect(new Set(flat.map((entry) => entry.participantId)).size).toBe(16);
  });
});

describe('groupStageFormat.validate', () => {
  it('accepts a normal setup', () => {
    expect(groupStageFormat.validate(config(), 16).valid).toBe(true);
  });

  it('rejects groups that cannot play a match', () => {
    // Four groups but only four participants: one each.
    const result = groupStageFormat.validate(config(), 4);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'group_stage.groups_too_small')).toBe(true);
  });

  it('rejects an absurd number of groups', () => {
    expect(groupStageFormat.validate(config({ groupCount: 99 }), 300).valid).toBe(false);
  });
});

describe('manual distribution', () => {
  /**
   * A stage set to manual before anyone has drawn the groups still has to
   * produce a playable structure, so it falls back to the seeded pattern rather
   * than leaving the groups empty.
   */
  it('falls back to the snake pattern until the draw is entered', () => {
    expect(distributeSlots(16, 4, 'manual')).toEqual(distributeSlots(16, 4, 'snake'));
  });
});

describe('groupStageFormat.validate group count', () => {
  it('rejects a stage with no groups at all', () => {
    const result = groupStageFormat.validate(config({ groupCount: 0 }), 8);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'group_stage.no_groups')).toBe(true);
  });

  it('rejects a field too large to schedule', () => {
    expect(groupStageFormat.validate(config(), 500).valid).toBe(false);
  });
});

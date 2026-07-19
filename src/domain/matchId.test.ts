import { describe, expect, it } from 'vitest';

import { asId, type StageId } from '@models/index';

import { makeMatchId } from './matchId';

const STAGE = asId<StageId>('stage-1');
const OTHER_STAGE = asId<StageId>('stage-2');

describe('makeMatchId', () => {
  it('is stable for the same position', () => {
    const position = { bracket: 'winner' as const, round: 2, indexInRound: 1 };
    expect(makeMatchId(STAGE, position)).toBe(makeMatchId(STAGE, position));
  });

  it('distinguishes stages', () => {
    const position = { bracket: 'winner' as const, round: 0, indexInRound: 0 };
    expect(makeMatchId(STAGE, position)).not.toBe(makeMatchId(OTHER_STAGE, position));
  });

  it('distinguishes every position component', () => {
    const base = { bracket: 'winner' as const, round: 1, indexInRound: 0 };
    const ids = new Set([
      makeMatchId(STAGE, base),
      makeMatchId(STAGE, { ...base, round: 2 }),
      makeMatchId(STAGE, { ...base, indexInRound: 1 }),
      makeMatchId(STAGE, { ...base, bracket: 'loser' }),
      makeMatchId(STAGE, { ...base, groupIndex: 0 }),
      makeMatchId(STAGE, { ...base, groupIndex: 1 }),
      makeMatchId(STAGE, { ...base, leg: 1 }),
      makeMatchId(STAGE, { ...base, leg: 2 }),
    ]);

    expect(ids.size).toBe(8);
  });

  it('falls back to a neutral section when no bracket is given', () => {
    const id = makeMatchId(STAGE, { round: 0, indexInRound: 0 });
    expect(id).toContain('main');
  });

  it('separates a group index from an identical round index', () => {
    // Without distinct prefixes, group 1 round 0 and group 0 round 1 would collide.
    const a = makeMatchId(STAGE, { groupIndex: 1, round: 0, indexInRound: 0 });
    const b = makeMatchId(STAGE, { groupIndex: 0, round: 1, indexInRound: 0 });
    expect(a).not.toBe(b);
  });
});

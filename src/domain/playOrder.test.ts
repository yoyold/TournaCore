import { describe, expect, it } from 'vitest';

import { asId, type MatchId, type MatchPosition, type MatchSlot } from '@models/index';

import { playOrder, type OrderableMatch } from './playOrder';

function match(
  id: string,
  position: Partial<MatchPosition>,
  slotA: MatchSlot = { kind: 'seeded', slotIndex: 1 },
  slotB: MatchSlot = { kind: 'seeded', slotIndex: 2 },
): OrderableMatch {
  return {
    id: asId<MatchId>(id),
    position: { round: 0, indexInRound: 0, ...position },
    slotA,
    slotB,
  };
}

const winnerOf = (id: string): MatchSlot => ({ kind: 'winner_of', matchId: asId<MatchId>(id) });
const loserOf = (id: string): MatchSlot => ({ kind: 'loser_of', matchId: asId<MatchId>(id) });

const ids = (matches: readonly OrderableMatch[]): string[] => playOrder(matches).map((m) => m.id);

describe('playOrder', () => {
  it('puts a match after the ones that feed it', () => {
    const first = match('w0', { round: 0 });
    const second = match('w1', { round: 1 }, winnerOf('w0'), { kind: 'seeded', slotIndex: 3 });

    // Given in the wrong order to prove it is not simply preserved.
    expect(ids([second, first])).toEqual(['w0', 'w1']);
  });

  /**
   * The case that started this: sorted by identifier the grand final comes
   * first, which is the one thing it can never be.
   */
  it('leaves the grand final last in a double elimination bracket', () => {
    const bracket = [
      match('grand_final', { round: 0 }, winnerOf('winner/r1'), winnerOf('loser/r1')),
      match('loser/r0', { round: 0 }, loserOf('winner/r0/m0'), loserOf('winner/r0/m1')),
      match('loser/r1', { round: 1 }, winnerOf('loser/r0'), loserOf('winner/r1')),
      match('winner/r0/m0', { round: 0 }),
      match('winner/r0/m1', { round: 0, indexInRound: 1 }),
      match('winner/r1', { round: 1 }, winnerOf('winner/r0/m0'), winnerOf('winner/r0/m1')),
    ];

    /*
     * The loser bracket's first round and the winner bracket's second are both
     * playable the moment the first round ends, so they sit at the same depth
     * and their order between themselves is arbitrary. What is not arbitrary is
     * that both follow round one and both precede the final.
     */
    expect(ids(bracket)).toEqual([
      'winner/r0/m0',
      'winner/r0/m1',
      'loser/r0',
      'winner/r1',
      'loser/r1',
      'grand_final',
    ]);
  });

  /** A loser bracket round cannot precede the winner bracket round it drains. */
  it('places a drop-in round after the round it takes casualties from', () => {
    const order = ids([
      match('lb1', { round: 1 }, winnerOf('lb0'), loserOf('wb1')),
      match('wb0', { round: 0 }),
      match('wb1', { round: 1 }, winnerOf('wb0'), { kind: 'seeded', slotIndex: 3 }),
      match('lb0', { round: 0 }, loserOf('wb0'), { kind: 'seeded', slotIndex: 4 }),
    ]);

    expect(order.indexOf('lb1')).toBeGreaterThan(order.indexOf('wb1'));
    expect(order.indexOf('lb0')).toBeGreaterThan(order.indexOf('wb0'));
  });

  /** Nothing in a league depends on anything else, so the rounds decide. */
  it('falls back to the round for fixtures that depend on nothing', () => {
    expect(
      ids([match('r2', { round: 2 }), match('r0', { round: 0 }), match('r1', { round: 1 })]),
    ).toEqual(['r0', 'r1', 'r2']);
  });

  it('separates the groups of one round by group index', () => {
    expect(
      ids([match('b', { round: 0, groupIndex: 1 }), match('a', { round: 0, groupIndex: 0 })]),
    ).toEqual(['a', 'b']);
  });

  it('orders matches that could have been played at once, so the order is total', () => {
    const twice = [match('m1', { indexInRound: 1 }), match('m0', { indexInRound: 0 })];
    expect(ids(twice)).toEqual(ids([...twice].reverse()));
  });

  it('ignores a reference to a match that is not there', () => {
    expect(ids([match('only', { round: 3 }, winnerOf('missing'))])).toEqual(['only']);
  });

  /** A structure cannot legitimately contain one, but this must still return. */
  it('survives a cycle', () => {
    const looped = [
      match('a', { round: 0 }, winnerOf('b')),
      match('b', { round: 1 }, winnerOf('a')),
    ];
    expect(ids(looped)).toHaveLength(2);
  });

  it('orders nothing into nothing', () => {
    expect(playOrder([])).toEqual([]);
  });

  it('leaves the input alone', () => {
    const given = [match('b', { round: 1 }), match('a', { round: 0 })];
    playOrder(given);
    expect(given.map((m) => m.id)).toEqual(['b', 'a']);
  });
});

import { describe, expect, it } from 'vitest';

import { asId, type Tournament, type TournamentId } from '@models/index';

import { byCreationDate } from './order';

function tournament(id: string, name: string, createdAt: string): Tournament {
  return {
    id: asId<TournamentId>(id),
    name,
    slug: id,
    gameId: asId<Tournament['gameId']>('g1'),
    status: 'completed',
    participants: [],
    stageIds: [],
    createdAt,
    updatedAt: createdAt,
  };
}

describe('byCreationDate', () => {
  it('puts the newest first', () => {
    const list = [
      tournament('a', 'Old Cup', '2019-04-01T00:00:00.000Z'),
      tournament('b', 'New Cup', '2025-09-06T00:00:00.000Z'),
      tournament('c', 'Middle Cup', '2022-01-15T00:00:00.000Z'),
    ];

    expect(byCreationDate(list).map((entry) => entry.name)).toEqual([
      'New Cup',
      'Middle Cup',
      'Old Cup',
    ]);
  });

  it('leaves the input alone', () => {
    const list = [
      tournament('a', 'Old Cup', '2019-04-01T00:00:00.000Z'),
      tournament('b', 'New Cup', '2025-09-06T00:00:00.000Z'),
    ];
    const before = list.map((entry) => entry.id);

    byCreationDate(list);
    expect(list.map((entry) => entry.id)).toEqual(before);
  });

  /**
   * A stored map has no order worth relying on, so an incomplete comparison
   * lets two tournaments swap places between renders.
   */
  it('orders tournaments created in the same moment consistently', () => {
    const moment = '2026-01-01T00:00:00.000Z';
    const list = [
      tournament('c', 'Zeta Cup', moment),
      tournament('a', 'Alpha Cup', moment),
      tournament('b', 'Alpha Cup', moment),
    ];

    const once = byCreationDate(list).map((entry) => entry.id);
    const again = byCreationDate([...list].reverse()).map((entry) => entry.id);

    expect(once).toEqual(['a', 'b', 'c']);
    expect(again).toEqual(once);
  });

  it('handles an empty list', () => {
    expect(byCreationDate([])).toEqual([]);
  });
});

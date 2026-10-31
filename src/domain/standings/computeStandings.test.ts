import { describe, expect, it } from 'vitest';

import {
  DEFAULT_POINT_SYSTEM,
  DEFAULT_TIEBREAKERS,
  asId,
  moveTiebreaker,
  now,
  type GameResult,
  type Match,
  type MatchId,
  type ParticipantId,
  type StageId,
  type Tiebreaker,
  type TournamentId,
} from '@models/index';

import { computeStandings } from './computeStandings';

import type { ResolvedMatch } from '../formats/types';

const STAGE = asId<StageId>('s1');
const CUP = asId<TournamentId>('t1');

const participant = (index: number): ParticipantId => asId<ParticipantId>(`p${String(index)}`);

let counter = 0;

/**
 * One played fixture, as both the resolved match the table walks and the stored
 * record it reads the map scores from.
 */
function fixture(
  a: number,
  b: number,
  mapsA: number,
  mapsB: number,
): { resolved: ResolvedMatch; stored: Match } {
  counter += 1;
  const id = asId<MatchId>(`${STAGE}/main/r0/m${String(counter)}`);
  const position = { round: 0, indexInRound: counter };
  const format = { kind: 'bo', games: 3 } as const;
  const winner = mapsA > mapsB ? ('A' as const) : ('B' as const);

  const games: GameResult[] = [];
  for (let i = 0; i < mapsA + mapsB; i += 1) {
    games.push({
      id: asId<GameResult['id']>(`${id}/g${String(i)}`),
      index: i + 1,
      scoreA: 0,
      scoreB: 0,
      winner: i < mapsA ? 'A' : 'B',
    });
  }

  return {
    resolved: {
      id,
      position,
      format,
      slotA: { kind: 'participant', participantId: participant(a) },
      slotB: { kind: 'participant', participantId: participant(b) },
      status: 'completed',
      outcome: { winner, reason: 'played', decidedAt: '2026-01-01T00:00:00.000Z' },
      winnerId: participant(winner === 'A' ? a : b),
      loserId: participant(winner === 'A' ? b : a),
      isBye: false,
    },
    stored: {
      id,
      tournamentId: CUP,
      stageId: STAGE,
      position,
      slotA: { kind: 'seeded', slotIndex: a },
      slotB: { kind: 'seeded', slotIndex: b },
      format,
      games,
      outcome: { winner, reason: 'played', decidedAt: '2026-01-01T00:00:00.000Z' },
      createdAt: now(),
      updatedAt: now(),
    },
  };
}

/**
 * A group of four in which the two leaders are level on points, and the two
 * criteria disagree about them: p2 won the match between them, p1 has much the
 * better map difference. Which of those decides is the organiser's rule, not
 * something the results can settle.
 */
const GROUP = [
  fixture(1, 3, 2, 0),
  fixture(1, 4, 2, 0),
  fixture(2, 1, 2, 1),
  fixture(3, 2, 2, 0),
  fixture(2, 4, 2, 1),
  fixture(4, 3, 2, 0),
];

function table(tiebreakers: readonly Tiebreaker[]) {
  return computeStandings({
    participants: [1, 2, 3, 4].map(participant),
    matches: GROUP.map((entry) => entry.resolved),
    storedMatches: new Map(GROUP.map((entry) => [entry.stored.id, entry.stored])),
    pointSystem: DEFAULT_POINT_SYSTEM,
    tiebreakers,
    seedOf: (participantId) => Number(participantId.slice(1)),
  });
}

describe('computeStandings tiebreaker order', () => {
  it('leaves the two leaders level on points', () => {
    const standings = table(DEFAULT_TIEBREAKERS);
    const leaders = standings.slice(0, 2);

    expect(leaders.every((entry) => entry.points === 6)).toBe(true);
    expect(leaders.every((entry) => entry.wins === 2 && entry.losses === 1)).toBe(true);
  });

  it('puts the winner of the direct match first by default', () => {
    const standings = table(DEFAULT_TIEBREAKERS);

    expect(standings[0]?.participantId).toBe(participant(2));
    expect(standings[1]?.participantId).toBe(participant(1));
    expect(standings[1]?.tiebreakerApplied).toBe('head_to_head');
  });

  /** The setting this is all for: the same results, ranked by map difference. */
  it('puts the better map difference first once that criterion leads', () => {
    const standings = table(moveTiebreaker(DEFAULT_TIEBREAKERS, 'map_difference', -1));

    expect(standings[0]?.participantId).toBe(participant(1));
    expect(standings[1]?.participantId).toBe(participant(2));
    expect(standings[1]?.tiebreakerApplied).toBe('map_difference');
  });

  it('reports the same record either way — only the order changes', () => {
    const byHeadToHead = table(DEFAULT_TIEBREAKERS);
    const byMapDifference = table(moveTiebreaker(DEFAULT_TIEBREAKERS, 'map_difference', -1));

    const record = (standings: ReturnType<typeof table>) =>
      [...standings]
        .sort((a, b) => a.participantId.localeCompare(b.participantId))
        .map((entry) => `${entry.participantId} ${String(entry.wins)}-${String(entry.losses)}`);

    expect(record(byMapDifference)).toEqual(record(byHeadToHead));
  });
});

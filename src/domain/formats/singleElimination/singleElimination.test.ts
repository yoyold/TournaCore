import { describe, expect, it } from 'vitest';

import { makeMatchId } from '@domain/matchId';
import {
  asId,
  type MatchId,
  type MatchOutcome,
  type ParticipantId,
  type SingleEliminationConfig,
  type StageId,
} from '@models/index';

import { generateSingleElimination } from './generate';
import { resolveSingleElimination } from './resolve';
import { computeSingleEliminationStandings } from './standings';

import type { GeneratedStructure, ResolvedStructure } from '../types';

const STAGE = asId<StageId>('stage-1');

const config = (overrides: Partial<SingleEliminationConfig> = {}): SingleEliminationConfig => ({
  kind: 'single_elimination',
  thirdPlaceMatch: false,
  byePlacement: 'seeded',
  matchFormats: { default: { kind: 'bo', games: 3 } },
  ...overrides,
});

/** Seeds participants `p1..pN` into entry slots 1..N. */
function seed(count: number): Map<number, ParticipantId> {
  const map = new Map<number, ParticipantId>();
  for (let i = 1; i <= count; i += 1) map.set(i, asId<ParticipantId>(`p${String(i)}`));
  return map;
}

const outcome = (winner: 'A' | 'B'): MatchOutcome => ({
  winner,
  reason: 'played',
  decidedAt: '2026-01-01T00:00:00.000Z',
});

function structureFor(participants: number, overrides?: Partial<SingleEliminationConfig>) {
  return generateSingleElimination({
    stageId: STAGE,
    config: config(overrides),
    slotCount: participants,
  });
}

function resolve(
  structure: GeneratedStructure,
  participants: number,
  results = new Map<MatchId, MatchOutcome>(),
): ResolvedStructure {
  return resolveSingleElimination({
    structure,
    results,
    seededSlots: seed(participants),
  });
}

/** Plays through the whole bracket, always letting side A win. */
function playAll(structure: GeneratedStructure, participants: number): ResolvedStructure {
  const results = new Map<MatchId, MatchOutcome>();
  let resolved = resolve(structure, participants, results);

  // Repeat until stable: each pass decides the matches that became ready.
  for (let guard = 0; guard < 20; guard += 1) {
    const ready = resolved.matches.filter((m) => m.status === 'ready');
    if (ready.length === 0) break;
    for (const match of ready) results.set(match.id, outcome('A'));
    resolved = resolve(structure, participants, results);
  }
  return resolved;
}

describe('generateSingleElimination', () => {
  it('pads the bracket to a power of two', () => {
    expect(structureFor(8).slotCount).toBe(8);
    expect(structureFor(13).slotCount).toBe(16);
    expect(structureFor(5).slotCount).toBe(8);
  });

  it('creates size-1 structural nodes', () => {
    for (const n of [2, 4, 5, 8, 13, 16, 32]) {
      const structure = structureFor(n);
      expect(structure.matches).toHaveLength(structure.slotCount - 1);
    }
  });

  it('is deterministic: regenerating yields identical identifiers', () => {
    const a = structureFor(13);
    const b = structureFor(13);
    expect(a.matches.map((m) => m.id)).toEqual(b.matches.map((m) => m.id));
  });

  it('seeds the first round so the top seeds are furthest apart', () => {
    const first = structureFor(8).matches.filter((m) => m.position.round === 0);
    const slots = first.map((m) => [m.slotA, m.slotB]);

    expect(slots[0]).toEqual([
      { kind: 'seeded', slotIndex: 1 },
      { kind: 'seeded', slotIndex: 8 },
    ]);
    expect(slots[3]).toEqual([
      { kind: 'seeded', slotIndex: 7 },
      { kind: 'seeded', slotIndex: 2 },
    ]);
  });

  it('wires later rounds to the winners of the two feeding matches', () => {
    const structure = structureFor(8);
    const semifinal = structure.matches.find(
      (m) => m.position.round === 1 && m.position.indexInRound === 0,
    );

    expect(semifinal?.slotA).toEqual({
      kind: 'winner_of',
      matchId: makeMatchId(STAGE, { bracket: 'winner', round: 0, indexInRound: 0 }),
    });
    expect(semifinal?.slotB).toEqual({
      kind: 'winner_of',
      matchId: makeMatchId(STAGE, { bracket: 'winner', round: 0, indexInRound: 1 }),
    });
  });

  it('adds a third place match pairing the semifinal losers', () => {
    const structure = structureFor(8, { thirdPlaceMatch: true });
    const third = structure.matches.find((m) => m.position.bracket === 'third_place');

    expect(third).toBeDefined();
    expect(third?.slotA.kind).toBe('loser_of');
    expect(third?.slotB.kind).toBe('loser_of');
    expect(structure.matches).toHaveLength(8);
  });

  it('omits the third place match when there are no semifinals', () => {
    const structure = structureFor(2, { thirdPlaceMatch: true });
    expect(structure.matches.some((m) => m.position.bracket === 'third_place')).toBe(false);
  });

  it('applies per-round match formats', () => {
    const structure = structureFor(4, {
      matchFormats: { default: { kind: 'bo', games: 1 }, byRound: { 1: { kind: 'bo', games: 5 } } },
    });

    const first = structure.matches.find((m) => m.position.round === 0);
    const final = structure.matches.find((m) => m.position.round === 1);

    expect(first?.format).toEqual({ kind: 'bo', games: 1 });
    expect(final?.format).toEqual({ kind: 'bo', games: 5 });
  });

  it('produces an empty structure for degenerate participant counts', () => {
    expect(structureFor(1).matches).toHaveLength(0);
    expect(structureFor(0).matches).toHaveLength(0);
  });
});

describe('resolveSingleElimination', () => {
  it('places seeded participants into the first round', () => {
    const resolved = resolve(structureFor(8), 8);
    const first = resolved.matches.find((m) => m.position.round === 0);

    expect(first?.slotA).toEqual({ kind: 'participant', participantId: 'p1' });
    expect(first?.slotB).toEqual({ kind: 'participant', participantId: 'p8' });
    expect(first?.status).toBe('ready');
  });

  it('marks matches without both participants as pending', () => {
    const resolved = resolve(structureFor(8), 8);
    const semifinal = resolved.matches.find((m) => m.position.round === 1);

    expect(semifinal?.status).toBe('pending');
    expect(semifinal?.slotA.kind).toBe('tbd');
  });

  it('decides bye matches immediately without a recorded result', () => {
    // 13 participants: seeds 1, 2 and 3 receive byes.
    const resolved = resolve(structureFor(13), 13);
    const byeMatches = resolved.matches.filter((m) => m.isBye);

    expect(byeMatches).toHaveLength(3);
    for (const match of byeMatches) {
      expect(match.status).toBe('walkover');
      expect(match.winnerId).toBeDefined();
      expect(match.outcome?.reason).toBe('bye');
    }
  });

  it('gives byes to the strongest seeds', () => {
    const resolved = resolve(structureFor(13), 13);
    const byeWinners = resolved.matches.filter((m) => m.isBye).map((m) => m.winnerId);

    expect(new Set(byeWinners)).toEqual(new Set(['p1', 'p2', 'p3']));
  });

  it('never pairs two byes against each other', () => {
    // The invariant holds for every count, because the bracket size is the
    // smallest power of two that fits the participants.
    for (let n = 2; n <= 64; n += 1) {
      const resolved = resolve(structureFor(n), n);
      const doubleByes = resolved.matches.filter(
        (m) => m.slotA.kind === 'bye' && m.slotB.kind === 'bye',
      );
      expect(doubleByes, `participant count ${String(n)}`).toHaveLength(0);
    }
  });

  it('advances the winner into the next round', () => {
    const structure = structureFor(4);
    const firstMatch = makeMatchId(STAGE, { bracket: 'winner', round: 0, indexInRound: 0 });
    const results = new Map<MatchId, MatchOutcome>([[firstMatch, outcome('B')]]);

    const resolved = resolve(structure, 4, results);
    const final = resolved.matches.find((m) => m.position.round === 1);

    // Slot A of match 0 is seed 1, slot B is seed 4. B won, so p4 advances.
    expect(final?.slotA).toEqual({ kind: 'participant', participantId: 'p4' });
  });

  it('propagates a corrected result through the whole bracket', () => {
    const structure = structureFor(4);
    const firstMatch = makeMatchId(STAGE, { bracket: 'winner', round: 0, indexInRound: 0 });

    const results = new Map<MatchId, MatchOutcome>([[firstMatch, outcome('A')]]);
    const before = resolve(structure, 4, results);
    expect(before.matches.find((m) => m.position.round === 1)?.slotA).toEqual({
      kind: 'participant',
      participantId: 'p1',
    });

    // Correct the first round result. Nothing else is touched.
    results.set(firstMatch, outcome('B'));
    const after = resolve(structure, 4, results);

    expect(after.matches.find((m) => m.position.round === 1)?.slotA).toEqual({
      kind: 'participant',
      participantId: 'p4',
    });
  });

  it('reports completion only once every playable match is decided', () => {
    const structure = structureFor(8);
    expect(resolve(structure, 8).isComplete).toBe(false);
    expect(playAll(structure, 8).isComplete).toBe(true);
  });

  it('completes a bracket with byes', () => {
    const structure = structureFor(13);
    const resolved = playAll(structure, 13);

    expect(resolved.isComplete).toBe(true);
    // n-1 playable matches, byes on top.
    expect(resolved.matches.filter((m) => !m.isBye)).toHaveLength(12);
  });

  it('leaves the third place match pending while the semifinals are open', () => {
    const structure = structureFor(4, { thirdPlaceMatch: true });
    const resolved = resolve(structure, 4);
    const third = resolved.matches.find((m) => m.position.bracket === 'third_place');

    expect(third?.status).toBe('pending');
  });
});

describe('computeSingleEliminationStandings', () => {
  const standingsFor = (participants: number, overrides?: Partial<SingleEliminationConfig>) => {
    const structure = structureFor(participants, overrides);
    const resolved = playAll(structure, participants);
    return computeSingleEliminationStandings({
      structure: resolved,
      config: config(overrides),
      seededSlots: seed(participants),
    });
  };

  it('ranks the champion first and the runner-up second', () => {
    const standings = standingsFor(8);

    expect(standings[0]?.rank).toBe(1);
    expect(standings[0]?.participantId).toBe('p1'); // side A always wins
    expect(standings[1]?.rank).toBe(2);
  });

  it('gives semifinal losers a shared third rank', () => {
    const standings = standingsFor(8);
    const thirds = standings.filter((s) => s.rank === 3);

    expect(thirds).toHaveLength(2);
  });

  it('splits third and fourth when a third place match is played', () => {
    const standings = standingsFor(8, { thirdPlaceMatch: true });

    expect(standings.filter((s) => s.rank === 3)).toHaveLength(1);
    expect(standings.filter((s) => s.rank === 4)).toHaveLength(1);
  });

  it('gives quarterfinal losers a shared fifth rank', () => {
    const standings = standingsFor(8);
    expect(standings.filter((s) => s.rank === 5)).toHaveLength(4);
  });

  it('includes every participant exactly once', () => {
    for (const n of [4, 8, 13, 16]) {
      const standings = standingsFor(n);
      expect(standings).toHaveLength(n);
      expect(new Set(standings.map((s) => s.participantId)).size).toBe(n);
    }
  });

  it('does not count byes as wins', () => {
    const standings = standingsFor(13);
    const champion = standings[0]!;

    // A bracket of 16 has four rounds, but the champion had a bye in the first.
    expect(champion.wins).toBe(3);
    expect(champion.losses).toBe(0);
  });

  it('gives everyone but the champion exactly one loss', () => {
    const standings = standingsFor(8);
    expect(standings.filter((s) => s.losses === 0)).toHaveLength(1);
    expect(standings.filter((s) => s.losses === 1)).toHaveLength(7);
  });
});

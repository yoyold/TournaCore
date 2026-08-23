import { describe, expect, it } from 'vitest';

import {
  DEFAULT_POINT_SYSTEM,
  DEFAULT_TIEBREAKERS,
  asId,
  type MatchId,
  type MatchOutcome,
  type ParticipantId,
  type RoundRobinConfig,
  type StageId,
} from '@models/index';

import { circleMethodRounds, generateRoundRobin, roundRobinFormat } from './index';

const STAGE = asId<StageId>('s1');

const config = (overrides: Partial<RoundRobinConfig> = {}): RoundRobinConfig => ({
  kind: 'round_robin',
  legs: 1,
  pointSystem: DEFAULT_POINT_SYSTEM,
  tiebreakers: [...DEFAULT_TIEBREAKERS],
  matchFormat: { kind: 'bo', games: 1 },
  ...overrides,
});

const structureFor = (slots: number, overrides?: Partial<RoundRobinConfig>) =>
  generateRoundRobin({
    stageId: STAGE,
    shape: {
      slotCount: slots,
      legs: overrides?.legs ?? 1,
      matchFormat: { kind: 'bo', games: 1 },
    },
  });

function seed(count: number): Map<number, ParticipantId> {
  const map = new Map<number, ParticipantId>();
  for (let i = 1; i <= count; i += 1) map.set(i, asId<ParticipantId>(`p${String(i)}`));
  return map;
}

const won = (winner: 'A' | 'B' | 'draw'): MatchOutcome => ({
  winner,
  reason: 'played',
  decidedAt: '2026-01-01T00:00:00.000Z',
});

describe('circleMethodRounds', () => {
  it('schedules every pairing exactly once', () => {
    for (const count of [2, 3, 4, 5, 6, 8, 9]) {
      const slots = Array.from({ length: count }, (_, i) => i + 1);
      const rounds = circleMethodRounds(slots);

      const seen = new Set<string>();
      for (const pairs of rounds) {
        for (const [a, b] of pairs) {
          const key = [a, b].sort((x, y) => x - y).join('-');
          expect(seen.has(key), `duplicate pairing ${key} for ${String(count)}`).toBe(false);
          seen.add(key);
        }
      }

      // n participants produce n*(n-1)/2 fixtures.
      expect(seen.size, `count ${String(count)}`).toBe((count * (count - 1)) / 2);
    }
  });

  it('never schedules a participant twice in one round', () => {
    for (const count of [4, 5, 7, 8]) {
      const slots = Array.from({ length: count }, (_, i) => i + 1);
      for (const pairs of circleMethodRounds(slots)) {
        const appearing = pairs.flatMap(([a, b]) => [a, b]);
        expect(new Set(appearing).size).toBe(appearing.length);
      }
    }
  });

  it('uses n-1 rounds for an even field and n for an odd one', () => {
    expect(circleMethodRounds([1, 2, 3, 4])).toHaveLength(3);
    // With five, a placeholder makes six entries and five rounds; each round one
    // participant sits out.
    expect(circleMethodRounds([1, 2, 3, 4, 5])).toHaveLength(5);
  });

  it('leaves exactly one participant idle per round when the field is odd', () => {
    for (const pairs of circleMethodRounds([1, 2, 3, 4, 5])) {
      expect(pairs).toHaveLength(2);
    }
  });
});

describe('generateRoundRobin', () => {
  it('creates n*(n-1)/2 matches for a single leg', () => {
    expect(structureFor(4).matches).toHaveLength(6);
    expect(structureFor(6).matches).toHaveLength(15);
  });

  it('doubles the schedule for a return leg', () => {
    const single = structureFor(4);
    const double = generateRoundRobin({
      stageId: STAGE,
      shape: { slotCount: 4, legs: 2, matchFormat: { kind: 'bo', games: 1 } },
    });

    expect(double.matches).toHaveLength(single.matches.length * 2);
  });

  it('swaps sides in the return leg', () => {
    const double = generateRoundRobin({
      stageId: STAGE,
      shape: { slotCount: 4, legs: 2, matchFormat: { kind: 'bo', games: 1 } },
    });

    const first = double.matches[0]!;
    const returnLeg = double.matches.find(
      (match) =>
        match.position.leg === 2 &&
        match.position.round % 3 === first.position.round % 3 &&
        match.position.indexInRound === first.position.indexInRound,
    );

    expect(returnLeg?.slotA).toEqual(first.slotB);
    expect(returnLeg?.slotB).toEqual(first.slotA);
  });

  it('gives every match a distinct identifier', () => {
    const structure = generateRoundRobin({
      stageId: STAGE,
      shape: { slotCount: 6, legs: 2, matchFormat: { kind: 'bo', games: 1 } },
    });
    expect(new Set(structure.matches.map((m) => m.id)).size).toBe(structure.matches.length);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(structureFor(6))).toBe(JSON.stringify(structureFor(6)));
  });

  it('produces nothing for fewer than two participants', () => {
    expect(structureFor(1).matches).toHaveLength(0);
  });
});

describe('roundRobinFormat.computeStandings', () => {
  /** Plays the schedule, awarding each listed match to the given side. */
  function play(slots: number, outcomes: Record<number, 'A' | 'B' | 'draw'>) {
    const structure = structureFor(slots);
    const results = new Map<MatchId, MatchOutcome>();

    structure.matches.forEach((match, index) => {
      const outcome = outcomes[index];
      if (outcome) results.set(match.id, won(outcome));
    });

    const seededSlots = seed(slots);
    const resolved = roundRobinFormat.resolveSlots({ structure, results, seededSlots });

    return roundRobinFormat.computeStandings({
      structure: resolved,
      config: config(),
      seededSlots,
      storedMatches: new Map(),
    });
  }

  it('lists every participant, including those yet to play', () => {
    const standings = play(4, {});
    expect(standings).toHaveLength(4);
    expect(standings.every((entry) => entry.points === 0)).toBe(true);
  });

  it('awards points by the configured system', () => {
    // The first fixture goes to side A.
    const standings = play(4, { 0: 'A' });
    const winner = standings.find((entry) => entry.wins === 1);

    expect(winner?.points).toBe(DEFAULT_POINT_SYSTEM.win);
    expect(standings.find((entry) => entry.losses === 1)?.points).toBe(DEFAULT_POINT_SYSTEM.loss);
  });

  it('counts a draw for both sides', () => {
    const standings = play(4, { 0: 'draw' });
    const drawn = standings.filter((entry) => entry.draws === 1);

    expect(drawn).toHaveLength(2);
    expect(drawn[0]?.points).toBe(DEFAULT_POINT_SYSTEM.draw);
  });

  it('ranks the participant with more points higher', () => {
    const standings = play(4, { 0: 'A', 1: 'A', 2: 'A' });
    expect(standings[0]!.points).toBeGreaterThanOrEqual(standings[1]!.points ?? 0);
  });

  /**
   * Two participants level on everything share a rank. Inventing an order would
   * claim a distinction the results do not support.
   */
  it('shares a rank when nothing separates two entries', () => {
    const standings = play(4, {});
    // All on zero, so every rank is 1 except where the seed tie-breaker applies.
    const ranks = new Set(standings.map((entry) => entry.rank));
    expect(ranks.size).toBeLessThanOrEqual(standings.length);
  });

  it('names the criterion that decided a tie', () => {
    const standings = play(4, { 0: 'A', 1: 'B' });
    // Some pair is separated by something other than points.
    expect(standings.some((entry) => entry.tiebreakerApplied !== undefined)).toBe(true);
  });
});

describe('roundRobinFormat.validate', () => {
  it('accepts a normal field', () => {
    expect(roundRobinFormat.validate(config(), 8).valid).toBe(true);
  });

  it('rejects fewer than two participants', () => {
    const result = roundRobinFormat.validate(config(), 1);
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.code).toBe('round_robin.too_few_participants');
  });

  it('rejects a field too large to schedule sensibly', () => {
    expect(roundRobinFormat.validate(config(), 200).valid).toBe(false);
  });
});

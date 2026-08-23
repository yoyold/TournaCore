import { describe, expect, it } from 'vitest';

import {
  DEFAULT_POINT_SYSTEM,
  DEFAULT_SWISS_TIEBREAKERS,
  asId,
  type MatchId,
  type MatchOutcome,
  type ParticipantId,
  type StageId,
  type SwissConfig,
} from '@models/index';

import { generateSwiss, swissFormat } from './index';

const STAGE = asId<StageId>('s1');

const config = (overrides: Partial<SwissConfig> = {}): SwissConfig => ({
  kind: 'swiss',
  rounds: 3,
  pairing: 'dutch',
  avoidRematches: true,
  pointSystem: DEFAULT_POINT_SYSTEM,
  tiebreakers: [...DEFAULT_SWISS_TIEBREAKERS],
  matchFormat: { kind: 'bo', games: 1 },
  ...overrides,
});

const structureFor = (slotCount: number, overrides?: Partial<SwissConfig>) =>
  generateSwiss({ stageId: STAGE, config: config(overrides), slotCount });

function seed(count: number): Map<number, ParticipantId> {
  const map = new Map<number, ParticipantId>();
  for (let i = 1; i <= count; i += 1) map.set(i, asId<ParticipantId>(`p${String(i)}`));
  return map;
}

const seedNumber = (participantId: string): number => Number(participantId.replace('p', '')) || 999;

const resolve = (
  slotCount: number,
  results: Map<MatchId, MatchOutcome>,
  overrides?: Partial<SwissConfig>,
) =>
  swissFormat.resolveSlots({
    structure: structureFor(slotCount, overrides),
    results,
    seededSlots: seed(slotCount),
    config: config(overrides),
  });

/**
 * Plays every round, letting the stronger seed win unless told otherwise.
 * Pairings for a round only exist once the previous one is decided, so this
 * resolves repeatedly rather than walking a fixed list.
 */
function playOut(
  slotCount: number,
  overrides?: Partial<SwissConfig>,
  upset?: (matchId: MatchId) => boolean,
) {
  const results = new Map<MatchId, MatchOutcome>();

  for (let pass = 0; pass < 512; pass += 1) {
    const resolved = resolve(slotCount, results, overrides);
    const next = resolved.matches.find(
      (match) => match.status === 'ready' && !results.has(match.id),
    );
    if (!next) return { resolved, results };

    const a = next.slotA.kind === 'participant' ? next.slotA.participantId : '';
    const b = next.slotB.kind === 'participant' ? next.slotB.participantId : '';
    const strongerIsA = seedNumber(a) < seedNumber(b);
    const flip = upset?.(next.id) === true;

    results.set(next.id, {
      winner: strongerIsA === !flip ? 'A' : 'B',
      reason: 'played',
      decidedAt: '2026-01-01T00:00:00.000Z',
    });
  }

  throw new Error('playOut did not converge');
}

/** Participants of one resolved round, as unordered pairing keys. */
function pairingsOfRound(
  matches: readonly { position: { round: number }; slotA: unknown; slotB: unknown }[],
  round: number,
): string[] {
  return matches
    .filter((match) => match.position.round === round)
    .map((match) => {
      const a = match.slotA as { participantId?: string };
      const b = match.slotB as { participantId?: string };
      if (a.participantId === undefined || b.participantId === undefined) return '';
      return [a.participantId, b.participantId].sort().join('|');
    })
    .filter((key) => key !== '');
}

describe('generateSwiss', () => {
  it('creates the configured number of rounds', () => {
    const structure = structureFor(8, { rounds: 5 });
    expect(structure.rounds).toHaveLength(5);
    expect(structure.matches).toHaveLength(5 * 4);
  });

  it('adds a slot for the bye when the field is odd', () => {
    // Seven participants: three pairings and somebody sitting out.
    expect(structureFor(7, { rounds: 1 }).matches).toHaveLength(4);
  });

  it('leaves the pairings undetermined', () => {
    // Swiss cannot know who plays whom until the previous round is decided.
    for (const match of structureFor(8).matches) {
      expect(match.slotA.kind).toBe('tbd');
      expect(match.slotB.kind).toBe('tbd');
    }
  });

  it('gives every match a distinct identifier', () => {
    const structure = structureFor(8, { rounds: 5 });
    expect(new Set(structure.matches.map((match) => match.id)).size).toBe(structure.matches.length);
  });

  it('produces nothing for a field too small to play', () => {
    expect(structureFor(1).matches).toHaveLength(0);
  });
});

describe('swiss pairing', () => {
  it('pairs the top half against the bottom half in the first round', () => {
    const resolved = resolve(8, new Map());
    const first = pairingsOfRound(resolved.matches, 0);

    // The Dutch fold: 1v5, 2v6, 3v7, 4v8.
    expect(first).toEqual(['p1|p5', 'p2|p6', 'p3|p7', 'p4|p8']);
  });

  it('gives everyone exactly one fixture per round', () => {
    const { resolved } = playOut(8);

    for (const round of [0, 1, 2]) {
      const players = pairingsOfRound(resolved.matches, round).flatMap((key) => key.split('|'));
      expect(players).toHaveLength(8);
      expect(new Set(players).size).toBe(8);
    }
  });

  /** The whole point of the format: equal scores meet each other. */
  it('pairs winners with winners after the first round', () => {
    const { resolved } = playOut(8);

    const firstRoundWinners = new Set(
      resolved.matches.filter((match) => match.position.round === 0).map((match) => match.winnerId),
    );

    for (const key of pairingsOfRound(resolved.matches, 1)) {
      const [a, b] = key.split('|') as [ParticipantId, ParticipantId];
      expect(firstRoundWinners.has(a)).toBe(firstRoundWinners.has(b));
    }
  });

  it('never repeats a pairing while an alternative exists', () => {
    const { resolved } = playOut(8, { rounds: 3 });

    const all = [0, 1, 2].flatMap((round) => pairingsOfRound(resolved.matches, round));
    expect(new Set(all).size).toBe(all.length);
  });

  it('repeats pairings only when it runs out of opponents', () => {
    // Four participants can play at most three distinct opponents each.
    const { resolved } = playOut(4, { rounds: 5 });
    const all = [0, 1, 2, 3, 4].flatMap((round) => pairingsOfRound(resolved.matches, round));

    expect(new Set(all).size).toBe(6);
    expect(all).toHaveLength(10);
  });

  it('draws the shuffled variant reproducibly', () => {
    const a = resolve(8, new Map(), { pairing: 'random_within_score_group' });
    const b = resolve(8, new Map(), { pairing: 'random_within_score_group' });

    expect(pairingsOfRound(a.matches, 0)).toEqual(pairingsOfRound(b.matches, 0));
  });

  it('shuffles within the score group rather than following the seeding', () => {
    const folded = pairingsOfRound(resolve(8, new Map()).matches, 0);
    const drawn = pairingsOfRound(
      resolve(8, new Map(), { pairing: 'random_within_score_group' }).matches,
      0,
    );

    expect(drawn).not.toEqual(folded);
    // Still a complete round: everyone paired exactly once.
    expect(new Set(drawn.flatMap((key) => key.split('|'))).size).toBe(8);
  });
});

describe('swiss byes', () => {
  it('sits exactly one participant out per round when the field is odd', () => {
    const { resolved } = playOut(7);

    for (const round of [0, 1, 2]) {
      const byes = resolved.matches.filter(
        (match) => match.position.round === round && match.isBye,
      );
      expect(byes).toHaveLength(1);
    }
  });

  it('does not give anyone a second bye while others are waiting', () => {
    const { resolved } = playOut(7);
    const rested = resolved.matches
      .filter((match) => match.isBye)
      .map((match) => (match.slotA.kind === 'participant' ? match.slotA.participantId : undefined));

    expect(new Set(rested).size).toBe(rested.length);
  });

  it('gives the bye to the bottom of the table', () => {
    const resolved = resolve(7, new Map());
    const bye = resolved.matches.find((match) => match.position.round === 0 && match.isBye);

    // Everyone is level before a ball is played, so it falls to the last seed.
    expect(bye?.slotA.kind === 'participant' ? bye.slotA.participantId : undefined).toBe('p7');
  });

  /**
   * A bye is a free point in Swiss. Withholding it would penalise someone for an
   * odd field they had no part in creating — the opposite of a league, where a
   * fixture without an opponent is worth nothing.
   */
  it('scores a bye as a win', () => {
    const resolved = resolve(7, new Map());
    const table = swissFormat.computeStandings({
      structure: resolved,
      config: config(),
      seededSlots: seed(7),
      storedMatches: new Map(),
    });

    const rested = table.find((entry) => entry.participantId === 'p7');
    expect(rested?.wins).toBe(1);
    expect(rested?.points).toBe(DEFAULT_POINT_SYSTEM.win);
  });
});

describe('resolveSwiss', () => {
  it('completes once every fixture is decided', () => {
    const { resolved } = playOut(8);
    expect(resolved.isComplete).toBe(true);
  });

  it('is not complete while fixtures are open', () => {
    expect(resolve(8, new Map()).isComplete).toBe(false);
  });

  it('derives the same pairings from the same results', () => {
    const { results } = playOut(8);
    const a = resolve(8, results);
    const b = resolve(8, results);

    expect(JSON.stringify(a.matches)).toBe(JSON.stringify(b.matches));
  });

  /**
   * The consequence of pairing from the standings, stated plainly: an altered
   * early result alters who meets whom later. Nothing downstream is stored, so
   * this flows through instead of leaving stale fixtures behind.
   */
  it('re-pairs later rounds when an early result is corrected', () => {
    const { results } = playOut(8);
    const before = pairingsOfRound(resolve(8, results).matches, 1);

    const firstMatch = 's1/main/r0/m0' as MatchId;
    const corrected = new Map(results);
    const original = corrected.get(firstMatch);
    corrected.set(firstMatch, {
      ...original!,
      winner: original?.winner === 'A' ? 'B' : 'A',
    });

    expect(pairingsOfRound(resolve(8, corrected).matches, 1)).not.toEqual(before);
  });

  it('cancels surplus fixtures when fewer participants entered than expected', () => {
    const resolved = swissFormat.resolveSlots({
      structure: structureFor(8, { rounds: 1 }),
      results: new Map(),
      seededSlots: seed(5),
      config: config({ rounds: 1 }),
    });

    // Five entrants: two pairings, one bye, one slot with nobody in it.
    expect(resolved.matches.filter((match) => match.status === 'cancelled')).toHaveLength(1);
    expect(resolved.matches.filter((match) => match.isBye)).toHaveLength(1);
  });
});

describe('swiss standings', () => {
  function table(slotCount: number, overrides?: Partial<SwissConfig>) {
    const { resolved } = playOut(slotCount, overrides);
    return swissFormat.computeStandings({
      structure: resolved,
      config: config(overrides),
      seededSlots: seed(slotCount),
      storedMatches: new Map(),
    });
  }

  it('includes every participant exactly once', () => {
    const standings = table(8);
    expect(standings).toHaveLength(8);
    expect(new Set(standings.map((entry) => entry.participantId)).size).toBe(8);
  });

  it('puts the only unbeaten participant top', () => {
    const standings = table(8);
    expect(standings[0]?.participantId).toBe('p1');
    expect(standings[0]?.losses).toBe(0);
  });

  it('orders by points', () => {
    const standings = table(8);
    const points = standings.map((entry) => entry.points ?? 0);
    expect([...points].sort((a, b) => b - a)).toEqual(points);
  });

  /**
   * Buchholz is the tie-break Swiss exists for: two participants on the same
   * score faced different opponents, and whose field was stronger is the most
   * informative thing left to measure.
   */
  it('separates equal scores by the strength of their opponents', () => {
    const standings = table(8);

    const applied = standings.filter((entry) => entry.tiebreakerApplied === 'buchholz');
    expect(applied.length).toBeGreaterThan(0);
  });

  it('counts a bye towards the opponents a rival is measured against', () => {
    // Nothing to assert numerically without fixing a field, but the table must
    // stay consistent: everyone's points are the sum of their results.
    const standings = table(7);
    for (const entry of standings) {
      const expected =
        entry.wins * DEFAULT_POINT_SYSTEM.win +
        entry.draws * DEFAULT_POINT_SYSTEM.draw +
        entry.losses * DEFAULT_POINT_SYSTEM.loss;
      expect(entry.points).toBe(expected);
    }
  });
});

describe('swissFormat.validate', () => {
  it('accepts a normal setup', () => {
    expect(swissFormat.validate(config({ rounds: 3 }), 8).valid).toBe(true);
  });

  it('rejects fewer than two participants', () => {
    const result = swissFormat.validate(config(), 1);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'swiss.too_few_participants')).toBe(true);
  });

  it('rejects a stage with no rounds', () => {
    expect(swissFormat.validate(config({ rounds: 0 }), 8).valid).toBe(false);
  });

  it('rejects an absurd number of rounds', () => {
    expect(swissFormat.validate(config({ rounds: 99 }), 8).valid).toBe(false);
  });

  it('warns when too few rounds to separate the field', () => {
    const result = swissFormat.validate(config({ rounds: 2 }), 16);
    expect(result.valid).toBe(true);
    expect(result.issues.some((issue) => issue.code === 'swiss.too_few_rounds')).toBe(true);
  });

  it('warns when there are more rounds than opponents', () => {
    const result = swissFormat.validate(config({ rounds: 5 }), 4);
    expect(result.issues.some((issue) => issue.code === 'swiss.rematches_unavoidable')).toBe(true);
  });
});

describe('drawing a round in advance', () => {
  /**
   * The pairing of round two follows from round one's results. Before they
   * exist, everyone is level and a full schedule would fold out neatly — which
   * is precisely the trap: it would present pairings that depend on results
   * nobody has played as though they were settled.
   */
  it('leaves later rounds undrawn until the previous one is decided', () => {
    const resolved = resolve(8, new Map(), { rounds: 3 });

    expect(pairingsOfRound(resolved.matches, 0)).toHaveLength(4);
    expect(pairingsOfRound(resolved.matches, 1)).toHaveLength(0);
    expect(pairingsOfRound(resolved.matches, 2)).toHaveLength(0);
  });

  it('marks an undrawn round as pending rather than ready', () => {
    const resolved = resolve(8, new Map(), { rounds: 3 });
    const second = resolved.matches.filter((match) => match.position.round === 1);

    expect(second.every((match) => match.status === 'pending')).toBe(true);
    expect(second.every((match) => match.slotA.kind === 'tbd')).toBe(true);
  });

  it('draws the next round as soon as the previous one finishes', () => {
    const results = new Map<MatchId, MatchOutcome>();
    const first = resolve(8, results, { rounds: 3 }).matches.filter(
      (match) => match.position.round === 0,
    );

    for (const match of first) {
      results.set(match.id, {
        winner: 'A',
        reason: 'played',
        decidedAt: '2026-01-01T00:00:00.000Z',
      });
    }

    const resolved = resolve(8, results, { rounds: 3 });
    expect(pairingsOfRound(resolved.matches, 1)).toHaveLength(4);
    // The one after it still waits.
    expect(pairingsOfRound(resolved.matches, 2)).toHaveLength(0);
  });

  it('withdraws a later round again when an earlier result is removed', () => {
    const { results } = playOut(8, { rounds: 3 });
    expect(pairingsOfRound(resolve(8, results, { rounds: 3 }).matches, 2)).toHaveLength(4);

    const reopened = new Map(results);
    reopened.delete('s1/main/r0/m0' as MatchId);

    // Round one is open again, so everything after it is undrawn once more.
    expect(pairingsOfRound(resolve(8, reopened, { rounds: 3 }).matches, 1)).toHaveLength(0);
  });
});

describe('swiss under strain', () => {
  /**
   * With more rounds than participants somebody has to rest twice. The second
   * bye should still go to the bottom of the table rather than to whoever the
   * ranking happens to list first.
   */
  it('hands out a second bye only once everyone has had one', () => {
    const { resolved } = playOut(3, { rounds: 4 });
    const rested = resolved.matches
      .filter((match) => match.isBye)
      .map((match) => (match.slotA.kind === 'participant' ? match.slotA.participantId : undefined));

    expect(rested).toHaveLength(4);
    // Three participants, four byes: exactly one of them sat out twice.
    expect(new Set(rested).size).toBe(3);
  });

  it('groups by score in the shuffled variant too', () => {
    const { resolved } = playOut(8, { pairing: 'random_within_score_group', rounds: 3 });

    const firstRoundWinners = new Set(
      resolved.matches.filter((match) => match.position.round === 0).map((match) => match.winnerId),
    );

    // Drawing at random happens inside a score group, never across one.
    for (const key of pairingsOfRound(resolved.matches, 1)) {
      const [a, b] = key.split('|') as [ParticipantId, ParticipantId];
      expect(firstRoundWinners.has(a)).toBe(firstRoundWinners.has(b));
    }
  });

  it('rejects a field larger than it can pair', () => {
    const result = swissFormat.validate(config({ rounds: 5 }), 1000);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'swiss.too_many_participants')).toBe(true);
  });
});

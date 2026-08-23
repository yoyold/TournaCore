import { describe, expect, it } from 'vitest';

import { doubleEliminationMatchCount } from '@domain/bracket/bracketMath';
import {
  asId,
  type DoubleEliminationConfig,
  type Match,
  type MatchId,
  type MatchOutcome,
  type ParticipantId,
  type StageId,
} from '@models/index';

import { doubleEliminationFormat, generateDoubleElimination } from './index';

const STAGE = asId<StageId>('s1');

const config = (overrides: Partial<DoubleEliminationConfig> = {}): DoubleEliminationConfig => ({
  kind: 'double_elimination',
  grandFinal: 'single',
  loserBracketSeeding: 'reversed',
  matchFormats: { default: { kind: 'bo', games: 1 } },
  ...overrides,
});

const structureFor = (slotCount: number, overrides?: Partial<DoubleEliminationConfig>) =>
  generateDoubleElimination({ stageId: STAGE, config: config(overrides), slotCount });

function seed(count: number): Map<number, ParticipantId> {
  const map = new Map<number, ParticipantId>();
  for (let i = 1; i <= count; i += 1) map.set(i, asId<ParticipantId>(`p${String(i)}`));
  return map;
}

const seedNumber = (participantId: string): number => Number(participantId.replace('p', '')) || 999;

const resolve = (
  slotCount: number,
  results: Map<MatchId, MatchOutcome>,
  overrides?: Partial<DoubleEliminationConfig>,
) =>
  doubleEliminationFormat.resolveSlots({
    structure: structureFor(slotCount, overrides),
    results,
    seededSlots: seed(slotCount),
    config: config(overrides),
  });

/**
 * Plays the whole tournament with the stronger seed always winning, repeating
 * until nothing new can be decided. Resolution is a pure function of the results
 * so far, so this converges rather than needing a scheduler.
 */
function playOut(
  slotCount: number,
  overrides?: Partial<DoubleEliminationConfig>,
  upset?: (matchId: MatchId) => boolean,
) {
  const results = new Map<MatchId, MatchOutcome>();

  for (let pass = 0; pass < 1024; pass += 1) {
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

describe('generateDoubleElimination', () => {
  it('creates one match per elimination', () => {
    for (const count of [2, 4, 8, 16, 32]) {
      expect(structureFor(count).matches, `${String(count)} participants`).toHaveLength(
        doubleEliminationMatchCount(count),
      );
    }
  });

  it('adds exactly one match for the bracket reset', () => {
    expect(structureFor(8, { grandFinal: 'bracket_reset' }).matches).toHaveLength(
      doubleEliminationMatchCount(8, { bracketReset: true }),
    );
  });

  it('gives the loser bracket twice the winner bracket rounds, less two', () => {
    const rounds = structureFor(16).rounds;
    expect(rounds.filter((round) => round.bracket === 'winner')).toHaveLength(4);
    expect(rounds.filter((round) => round.bracket === 'loser')).toHaveLength(6);
    expect(rounds.filter((round) => round.bracket === 'grand_final')).toHaveLength(1);
  });

  it('halves the loser bracket only on consolidation rounds', () => {
    const counts = structureFor(16)
      .rounds.filter((round) => round.bracket === 'loser')
      .map((round) => round.matchCount);

    // Drop-in rounds keep the field, consolidation rounds halve it.
    expect(counts).toEqual([4, 4, 2, 2, 1, 1]);
  });

  it('gives every match a distinct identifier', () => {
    const structure = structureFor(16, { grandFinal: 'bracket_reset' });
    expect(new Set(structure.matches.map((match) => match.id)).size).toBe(structure.matches.length);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(structureFor(12))).toBe(JSON.stringify(structureFor(12)));
  });

  it('produces nothing for a field too small to play', () => {
    expect(structureFor(1).matches).toHaveLength(0);
  });

  /** Two participants have no loser bracket: the rematch is the grand final. */
  it('sends the loser of the only match straight to the grand final', () => {
    const structure = structureFor(2);
    expect(structure.matches.filter((m) => m.position.bracket === 'loser')).toHaveLength(0);

    const final = structure.matches.find((m) => m.position.bracket === 'grand_final');
    expect(final?.slotB.kind).toBe('loser_of');
  });
});

describe('loser bracket seeding', () => {
  /**
   * The point of reversing the drop order. Paired straight, the player knocked
   * out of winner round 1 can meet someone they beat in round 0, because both
   * come from the same half of the bracket.
   */
  it('keeps a beaten opponent out of the way on the drop-in round', () => {
    const structure = structureFor(8, { loserBracketSeeding: 'reversed' });

    const dropIn = structure.matches.filter(
      (match) => match.position.bracket === 'loser' && match.position.round === 1,
    );

    expect(dropIn).toHaveLength(2);
    // Loser round 0 match i feeds drop-in match i, which must take its winner
    // bracket casualty from the opposite side.
    const first = dropIn[0];
    expect(first?.slotA).toEqual({
      kind: 'winner_of',
      matchId: 's1/loser/r0/m0',
    });
    expect(first?.slotB).toEqual({
      kind: 'loser_of',
      matchId: 's1/winner/r1/m1',
    });
  });

  it('pairs in order when asked to', () => {
    const structure = structureFor(8, { loserBracketSeeding: 'standard' });
    const first = structure.matches.find(
      (match) => match.position.bracket === 'loser' && match.position.round === 1,
    );

    expect(first?.slotB).toEqual({ kind: 'loser_of', matchId: 's1/winner/r1/m0' });
  });

  /**
   * The property the reversal actually buys, and the reason it is the default.
   * Wherever a drop-in round has more than one match there is a choice of
   * opponent, and it must not be spent on a pairing that just happened.
   */
  it.each([8, 16, 32, 64])('avoids a rematch on every drop-in round with a choice (%i)', (size) => {
    const { resolved } = playOut(size, { loserBracketSeeding: 'reversed' });
    const met = meetings(resolved.matches);

    for (const match of resolved.matches) {
      if (match.position.bracket !== 'loser' || match.position.round % 2 !== 1) continue;
      const roundSize = resolved.matches.filter(
        (other) =>
          other.position.bracket === 'loser' && other.position.round === match.position.round,
      ).length;
      if (roundSize < 2) continue;

      expect(firstMeeting(match, met), `loser round ${String(match.position.round)}`).toBe(true);
    }
  });

  it('pairs a beaten opponent straight back together without it', () => {
    const { resolved } = playOut(8, { loserBracketSeeding: 'standard' });
    const dropIn = resolved.matches.find(
      (match) => match.position.bracket === 'loser' && match.position.round === 1,
    );

    // p5 lost to p4 in the opening round and meets it again immediately. This is
    // exactly what `reversed` exists to prevent.
    const players = new Set([
      dropIn?.slotA.kind === 'participant' ? dropIn.slotA.participantId : undefined,
      dropIn?.slotB.kind === 'participant' ? dropIn.slotB.participantId : undefined,
    ]);
    expect(players).toEqual(new Set(['p5', 'p4']));
  });

  /**
   * Repeat meetings are not a defect in general — beating someone into the loser
   * bracket and facing them again at the end is the format working. They must
   * only occur where the structure leaves no alternative.
   */
  it('confines repeat meetings to the last drop-in and the grand final', () => {
    const { resolved } = playOut(8, { loserBracketSeeding: 'reversed' });

    const seen = new Set<string>();
    for (const match of resolved.matches) {
      const key = pairingKey(match);
      if (key === undefined) continue;

      if (seen.has(key)) {
        const isLastDropIn = match.position.bracket === 'loser' && match.position.round === 3;
        const isGrandFinal = match.position.bracket === 'grand_final';
        expect(isLastDropIn || isGrandFinal, `unexpected rematch: ${key}`).toBe(true);
      }
      seen.add(key);
    }
  });
});

function pairingKey(match: { slotA: unknown; slotB: unknown; isBye: boolean }): string | undefined {
  const slotA = match.slotA as { kind: string; participantId?: string };
  const slotB = match.slotB as { kind: string; participantId?: string };
  if (match.isBye) return undefined;
  if (slotA.participantId === undefined || slotB.participantId === undefined) return undefined;
  return [slotA.participantId, slotB.participantId].sort().join('|');
}

/** Every pairing that occurred, in structural order. */
function meetings(
  matches: readonly { slotA: unknown; slotB: unknown; isBye: boolean }[],
): string[] {
  return matches.map((match) => pairingKey(match) ?? '');
}

function firstMeeting(
  match: { slotA: unknown; slotB: unknown; isBye: boolean },
  all: readonly string[],
): boolean {
  const key = pairingKey(match);
  if (key === undefined) return true;
  return all.indexOf(key) === all.lastIndexOf(key);
}

describe('resolveDoubleElimination', () => {
  it('gives the champion two paths and the field two lives', () => {
    const { resolved } = playOut(8);

    expect(resolved.isComplete).toBe(true);
    const final = resolved.matches.find((match) => match.position.bracket === 'grand_final');
    expect(final?.winnerId).toBe('p1');
  });

  /**
   * The defining property of the format: one defeat is survivable. The top seed
   * loses its opening match and still has a route to the title.
   */
  it('lets a beaten participant come back through the loser bracket', () => {
    const openingMatch = 's1/winner/r0/m0' as MatchId;
    const { resolved } = playOut(8, undefined, (id) => id === openingMatch);

    const opening = resolved.byId.get(openingMatch);
    expect(opening?.loserId).toBe('p1');

    // Knocked into the loser bracket, p1 wins its way back and takes the final.
    const final = resolved.matches.find((match) => match.position.bracket === 'grand_final');
    expect(final?.winnerId).toBe('p1');
  });

  it('leaves a match pending while its feeders are undecided', () => {
    const resolved = resolve(8, new Map());
    const loserFinal = resolved.matches.find(
      (match) => match.position.bracket === 'loser' && match.position.round === 3,
    );

    expect(loserFinal?.status).toBe('pending');
    expect(resolved.isComplete).toBe(false);
  });

  /**
   * A field short of a power of two leaves winner bracket byes, which produce no
   * loser. The loser bracket match expecting one must advance rather than wait
   * for a player who is never coming.
   */
  it('does not deadlock on a field that is not a power of two', () => {
    for (const count of [3, 5, 6, 7, 11, 13]) {
      const { resolved } = playOut(count);
      expect(resolved.isComplete, `${String(count)} participants`).toBe(true);
    }
  });

  it('never awards a bye a score or a loser', () => {
    const resolved = resolve(5, new Map());

    for (const match of resolved.matches) {
      if (!match.isBye) continue;
      expect(match.outcome?.reason).toBe('bye');
      expect(match.loserId).toBeUndefined();
    }
  });

  it('cancels the parts of an oversized bracket that nobody can reach', () => {
    // Five participants in a bracket of eight: one loser bracket match has two
    // empty sides and must be reported as cancelled, not left pending.
    const resolved = resolve(5, new Map());
    const empty = resolved.matches.filter(
      (match) => match.slotA.kind === 'bye' && match.slotB.kind === 'bye',
    );

    expect(empty.length).toBeGreaterThan(0);
    for (const match of empty) expect(match.status).toBe('cancelled');
  });
});

describe('bracket reset', () => {
  it('is cancelled when the winner bracket entrant takes the grand final', () => {
    const { resolved } = playOut(8, { grandFinal: 'bracket_reset' });

    const reset = resolved.matches.find(
      (match) => match.position.bracket === 'grand_final' && match.position.round === 1,
    );

    // p1 arrived unbeaten and won, so there is nothing to reset.
    expect(reset?.status).toBe('cancelled');
    expect(resolved.isComplete).toBe(true);
  });

  /**
   * The reset exists precisely so a single defeat in the grand final does not
   * eliminate someone who had not lost before.
   */
  it('has to be played when the loser bracket entrant wins', () => {
    const grandFinal = 's1/grand_final/r0/m0' as MatchId;
    const { resolved, results } = playOut(
      8,
      { grandFinal: 'bracket_reset' },
      (id) => id === grandFinal,
    );

    const reset = resolved.matches.find(
      (match) => match.position.bracket === 'grand_final' && match.position.round === 1,
    );

    expect(reset?.status).not.toBe('cancelled');
    expect(results.has(reset?.id ?? ('' as MatchId))).toBe(true);
    expect(resolved.isComplete).toBe(true);
  });

  it('is the same two participants over again', () => {
    const grandFinal = 's1/grand_final/r0/m0' as MatchId;
    const { resolved } = playOut(8, { grandFinal: 'bracket_reset' }, (id) => id === grandFinal);

    const final = resolved.byId.get(grandFinal);
    const reset = resolved.matches.find(
      (match) => match.position.bracket === 'grand_final' && match.position.round === 1,
    );

    const finalists = new Set([final?.winnerId, final?.loserId]);
    const resetPlayers = new Set([
      reset?.slotA.kind === 'participant' ? reset.slotA.participantId : undefined,
      reset?.slotB.kind === 'participant' ? reset.slotB.participantId : undefined,
    ]);

    expect(resetPlayers).toEqual(finalists);
  });
});

describe('double elimination standings', () => {
  function standings(slotCount: number, overrides?: Partial<DoubleEliminationConfig>) {
    const { resolved } = playOut(slotCount, overrides);
    return doubleEliminationFormat.computeStandings({
      structure: resolved,
      config: config(overrides),
      seededSlots: seed(slotCount),
      storedMatches: new Map(),
    });
  }

  it('ranks the champion first and the grand finalist second', () => {
    const table = standings(8);

    expect(table[0]?.participantId).toBe('p1');
    expect(table[0]?.rank).toBe(1);
    expect(table[1]?.rank).toBe(2);
  });

  it('includes every participant exactly once', () => {
    const table = standings(8);
    expect(table).toHaveLength(8);
    expect(new Set(table.map((entry) => entry.participantId)).size).toBe(8);
  });

  /**
   * Participants knocked out in the same loser round finished level — they never
   * played each other, so splitting them would be invented precision.
   */
  it('shares a rank between participants eliminated in the same round', () => {
    const table = standings(8);
    const counts = new Map<number, number>();
    for (const entry of table) counts.set(entry.rank, (counts.get(entry.rank) ?? 0) + 1);

    expect([...counts.values()].some((count) => count > 1)).toBe(true);
    // Ranks 1 and 2 are always decided outright.
    expect(counts.get(1)).toBe(1);
    expect(counts.get(2)).toBe(1);
  });

  it('counts a loss in the winner bracket without eliminating anyone', () => {
    const table = standings(8);
    const runnerUp = table[1];

    // Reaching the grand final through the loser bracket means arriving with a
    // defeat already recorded.
    expect(runnerUp?.losses).toBeGreaterThanOrEqual(1);
  });

  it('leaves the table provisional while the tournament is running', () => {
    const resolved = resolve(8, new Map());
    const table = doubleEliminationFormat.computeStandings({
      structure: resolved,
      config: config(),
      seededSlots: seed(8),
      storedMatches: new Map(),
    });

    // Nobody is champion yet, so nobody outranks anyone.
    expect(table.every((entry) => entry.rank === 1)).toBe(true);
  });
});

describe('doubleEliminationFormat.validate', () => {
  it('accepts a normal field', () => {
    expect(doubleEliminationFormat.validate(config(), 16).valid).toBe(true);
  });

  it('rejects fewer than two participants', () => {
    const result = doubleEliminationFormat.validate(config(), 1);
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.code).toBe('double_elimination.too_few_participants');
  });

  it('rejects a field too large to draw', () => {
    expect(doubleEliminationFormat.validate(config(), 300).valid).toBe(false);
  });

  it('warns about a sparse bracket without blocking it', () => {
    const result = doubleEliminationFormat.validate(config(), 3);
    expect(result.valid).toBe(true);
    expect(result.issues[0]?.severity).toBe('warning');
  });
});

describe('map counts in the standings', () => {
  /**
   * A bracket ranks by how far a participant got, but the table still reports
   * maps, and those only exist in the stored records — the resolved structure
   * knows who won, not by how much.
   */
  it('takes map counts from the stored matches', () => {
    const { resolved, results } = playOut(4);

    const stored = new Map<MatchId, Match>();
    for (const match of resolved.matches) {
      if (!results.has(match.id)) continue;
      const winnerIsA = results.get(match.id)?.winner === 'A';
      stored.set(match.id, {
        id: match.id,
        tournamentId: asId<Match['tournamentId']>('t1'),
        stageId: STAGE,
        position: match.position,
        slotA: { kind: 'tbd' },
        slotB: { kind: 'tbd' },
        format: match.format,
        games: [
          {
            id: asId<Match['games'][number]['id']>(`${match.id}-g1`),
            index: 1,
            scoreA: winnerIsA ? 13 : 7,
            scoreB: winnerIsA ? 7 : 13,
            winner: winnerIsA ? 'A' : 'B',
          },
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
    }

    const table = doubleEliminationFormat.computeStandings({
      structure: resolved,
      config: config(),
      seededSlots: seed(4),
      storedMatches: stored,
    });

    // The champion won every map it played and dropped none.
    expect(table[0]?.mapsWon).toBeGreaterThan(0);
    expect(table[0]?.mapsLost).toBe(0);
    // Everyone who played lost at least one map on the way out.
    expect(table.slice(1).some((entry) => entry.mapsLost > 0)).toBe(true);
  });
});

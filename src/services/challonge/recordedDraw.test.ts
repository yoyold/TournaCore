import { describe, expect, it } from 'vitest';

import { asId, type ParticipantId } from '@models/index';

import { recordedDraw } from './recordedDraw';

import type { ChallongeMatch } from './challongeSchema';

/** Challonge ids are strings; the participant behind each one is "p<id>". */
const byChallongeId = new Map<string, ParticipantId>(
  Array.from({ length: 40 }, (_, index) => [
    String(index + 1),
    asId<ParticipantId>(`p${String(index + 1)}`),
  ]),
);

function match(round: number, player1: number, player2: number): ChallongeMatch {
  return {
    id: `${String(round)}-${String(player1)}-${String(player2)}`,
    round,
    player1_id: String(player1),
    player2_id: String(player2),
  };
}

const drawOf = (matches: ChallongeMatch[]): string[] | undefined =>
  recordedDraw(matches, byChallongeId);

describe('recordedDraw', () => {
  /**
   * Eight entrants, drawn the ordinary way. The layout of a full bracket is
   * 1v8, 4v5, 2v7, 3v6, so reading it back has to return the entrants in that
   * order of slots.
   */
  it('reads a full bracket back into entry slots', () => {
    const draw = drawOf([
      match(1, 1, 8),
      match(1, 4, 5),
      match(1, 2, 7),
      match(1, 3, 6),
      match(2, 1, 4),
      match(2, 2, 3),
    ]);

    expect(draw).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']);
  });

  /**
   * The case the group stages produce: six entrants, two of them straight into
   * the second round. Challonge numbers those two first and the rest from the
   * top of the draw, so the numbers say 1v2 are the top seeds while the draw
   * says they are in opposite halves — only the draw is right.
   */
  it('places entrants a source numbered after the draw', () => {
    const draw = drawOf([
      match(1, 3, 4),
      match(1, 5, 6),
      match(2, 1, 3),
      match(2, 2, 5),
      match(3, 1, 2),
    ]);

    // Slots 1 and 2 are the byes, and the played pairs fill 4v5 and 3v6.
    expect(draw).toEqual(['p1', 'p2', 'p5', 'p3', 'p4', 'p6']);
  });

  it('reads a two-entrant bracket', () => {
    expect(drawOf([match(1, 1, 2)])).toEqual(['p1', 'p2']);
  });

  /**
   * Deriving a line-up from a draw that is not the shape this generator
   * produces would invent one, so nothing is returned and the caller falls back
   * on the orderings it can compute.
   */
  it('declines a draw whose byes fall elsewhere', () => {
    // Two byes side by side, where the generator puts a played match.
    const draw = drawOf([
      match(1, 5, 6),
      match(1, 7, 8),
      match(2, 1, 2),
      match(2, 5, 7),
      match(3, 1, 5),
    ]);

    expect(draw).toBeUndefined();
  });

  it('declines a bracket whose second round is not fully known', () => {
    const opening = [match(1, 3, 4), match(1, 5, 6)];
    const half: ChallongeMatch = { id: 'x', round: 2, player1_id: '1' };

    expect(recordedDraw([...opening, half, match(2, 2, 5)], byChallongeId)).toBeUndefined();
  });

  it('declines a bracket with no rounds of its own', () => {
    expect(drawOf([])).toBeUndefined();
    // Loser bracket rounds alone say nothing about how the draw was made.
    expect(drawOf([match(-1, 1, 2)])).toBeUndefined();
  });

  it('declines when a participant is not one of the tournament entrants', () => {
    expect(recordedDraw([match(1, 1, 2)], new Map())).toBeUndefined();
  });
});

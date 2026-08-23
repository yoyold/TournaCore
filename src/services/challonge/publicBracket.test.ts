import { describe, expect, it } from 'vitest';

import { parseChallonge } from './challongeSchema';
import { mapChallongeTournaments } from './mapTournament';
import { fromPublicBracket, isPublicBracket, publicBracketSchema } from './publicBracket';

let counter = 0;

/**
 * A public bracket page for four players, in the shape Challonge serves it:
 * participants only inside the matches, rounds keyed by number with the loser
 * bracket counted negatively, and no tournament name anywhere.
 */
const PUBLIC = {
  requested_plotter: 'DoubleEliminationBracketPlotter',
  tournament: {
    id: 16905174,
    state: 'complete',
    tournament_type: 'double elimination',
    grand_finals_modifier: 'single match',
    group_stage_progress_meter: 0,
  },
  matches_by_round: {
    '1': [
      player('1', 1, 'Alpha', '4', 4, 'Delta', [[1, 0]], '1'),
      player('2', 2, 'Beta', '3', 3, 'Gamma', [[0, 1]], '3'),
    ],
    '2': [player('1', 1, 'Alpha', '3', 3, 'Gamma', [[1, 0]], '1')],
    '-1': [player('4', 4, 'Delta', '2', 2, 'Beta', [[0, 1]], '2')],
    '-2': [player('2', 2, 'Beta', '3', 3, 'Gamma', [[1, 0]], '2')],
    '3': [player('1', 1, 'Alpha', '2', 2, 'Beta', [[0, 1]], '2')],
  },
};

function player(
  p1: string,
  s1: number,
  n1: string,
  p2: string,
  s2: number,
  n2: string,
  games: number[][],
  winner: string,
) {
  counter += 1;
  return {
    id: 400000 + counter,
    identifier: counter,
    round: 1,
    state: 'complete',
    games,
    scores: games[0],
    player1: { id: Number(p1), seed: s1, display_name: n1 },
    player2: { id: Number(p2), seed: s2, display_name: n2 },
    winner_id: Number(winner),
    loser_id: Number(winner === p1 ? p2 : p1),
  };
}

describe('isPublicBracket', () => {
  it('recognises a bracket page payload', () => {
    expect(isPublicBracket(PUBLIC)).toBe(true);
  });

  it('does not mistake an API response for one', () => {
    expect(isPublicBracket({ tournament: { id: 1, name: 'x', tournament_type: 'swiss' } })).toBe(
      false,
    );
  });
});

describe('fromPublicBracket', () => {
  const bracket = publicBracketSchema.parse(PUBLIC);

  it('reconstructs the participants from the matches', () => {
    // They appear nowhere else in the payload, and everyone plays at least once.
    const converted = fromPublicBracket(bracket, 'Cup');
    const names = converted.participants.map((entry) => entry.participant.name).sort();

    expect(names).toEqual(['Alpha', 'Beta', 'Delta', 'Gamma']);
  });

  it('keeps the seeds, which decide the draw', () => {
    const converted = fromPublicBracket(bracket, 'Cup');
    const seeds = new Map(
      converted.participants.map((entry) => [entry.participant.name, entry.participant.seed]),
    );

    expect(seeds.get('Alpha')).toBe(1);
    expect(seeds.get('Delta')).toBe(4);
  });

  it('turns the per-game arrays into the score format the mapper reads', () => {
    const converted = fromPublicBracket(bracket, 'Cup');
    expect(converted.matches[0]?.match.scores_csv).toBe('1-0');
  });

  it('falls back to the identifier when no name is given', () => {
    // The payload carries none; only the page title does.
    expect(fromPublicBracket(bracket).name).toContain('16905174');
  });

  it('flattens every round, winner and loser alike', () => {
    // Four participants: three winner bracket matches, two loser, one final.
    expect(fromPublicBracket(bracket, 'Cup').matches).toHaveLength(6);
  });
});

describe('importing a public bracket', () => {
  it('goes through the same conversion as an API response', () => {
    let n = 0;
    const { data, reports } = mapChallongeTournaments(parseChallonge(PUBLIC, 'Public Cup'), {
      existingTeams: [],
      existingGames: [],
      existingSlugs: [],
      timestamp: '2026-01-01T00:00:00.000Z',
      newId: () => `id${String((n += 1))}`,
    });

    expect(reports[0]?.name).toBe('Public Cup');
    expect(reports[0]?.format).toBe('double_elimination');
    expect(reports[0]?.unplaced).toEqual([]);
    expect(data.teams).toHaveLength(4);
    // Four participants in double elimination: 2n-2 matches, all recorded.
    expect(data.matches).toHaveLength(6);
    expect(reports[0]?.open).toBe(0);
  });
});

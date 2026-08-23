import { describe, expect, it } from 'vitest';

import { deriveTournamentState } from '@domain/derive';
import { buildExport, parseImport } from '@services/transfer/transfer';

import { parseChallonge } from './challongeSchema';
import { inferMatchFormat, mapChallongeTournaments, parseScores } from './mapTournament';

import type { MapOptions } from './mapTournament';

/** Counter-based ids, so a conversion is reproducible and readable in failures. */
function options(overrides: Partial<MapOptions> = {}): MapOptions {
  let counter = 0;
  return {
    existingTeams: [],
    existingGames: [],
    existingSlugs: [],
    timestamp: '2026-01-01T00:00:00.000Z',
    newId: () => `id${String((counter += 1))}`,
    ...overrides,
  };
}

interface FixtureMatch {
  id: string;
  player1: string;
  player2: string;
  winner?: string | null;
  scores?: string;
  order: number;
  state?: string;
}

function tournament(input: {
  name?: string;
  type?: string;
  players: string[];
  matches?: FixtureMatch[];
  extra?: Record<string, unknown>;
}) {
  return {
    tournament: {
      id: '900',
      name: input.name ?? 'Autumn Clash',
      url: 'autumn-clash',
      tournament_type: input.type ?? 'single elimination',
      game_name: 'Counter-Strike 2',
      state: 'complete',
      participants: input.players.map((name, index) => ({
        participant: { id: String(index + 1), name, seed: index + 1 },
      })),
      matches: (input.matches ?? []).map((match) => ({
        match: {
          id: match.id,
          state: match.state ?? 'complete',
          player1_id: match.player1,
          player2_id: match.player2,
          winner_id: match.winner === undefined ? match.player1 : match.winner,
          scores_csv: match.scores ?? '1-0',
          suggested_play_order: match.order,
        },
      })),
      ...input.extra,
    },
  };
}

/** Four players, every match decided, with an upset in the final. */
const SINGLE_ELIMINATION = tournament({
  players: ['Nova Collective', 'Iron Meridian', 'Solstice Nine', 'Pale Horizon'],
  matches: [
    { id: '1', player1: '1', player2: '4', winner: '1', scores: '2-0', order: 1 },
    { id: '2', player1: '2', player2: '3', winner: '2', scores: '2-1', order: 2 },
    { id: '3', player1: '1', player2: '2', winner: '2', scores: '1-2', order: 3 },
  ],
});

const convert = (raw: unknown, opts = options()) =>
  mapChallongeTournaments(parseChallonge(raw), opts);

describe('parseScores', () => {
  it('reads a series of game scores', () => {
    expect(parseScores('13-7,10-13,13-9')).toEqual([
      [13, 7],
      [10, 13],
      [13, 9],
    ]);
  });

  it('keeps negative scores intact', () => {
    // Challonge allows them, and the separator is not simply the first minus.
    expect(parseScores('-1-2')).toEqual([[-1, 2]]);
  });

  it('ignores entries it cannot read rather than guessing', () => {
    expect(parseScores('13-7,rubbish,4-2')).toEqual([
      [13, 7],
      [4, 2],
    ]);
    expect(parseScores(undefined)).toEqual([]);
  });
});

describe('inferMatchFormat', () => {
  /**
   * Challonge has no series length, only however many game scores were entered,
   * so the longest series is the only evidence there is. Guessing too short
   * would make a recorded 3-1 impossible under the imported format.
   */
  it('takes the longest series as the format', () => {
    const format = inferMatchFormat([{ id: '1', scores_csv: '13-7,10-13,13-9' }]);
    expect(format).toEqual({ kind: 'bo', games: 3 });
  });

  it('treats a single line as one game', () => {
    expect(inferMatchFormat([{ id: '1', scores_csv: '2-0' }])).toEqual({ kind: 'single_game' });
  });

  it('grows to best of seven', () => {
    expect(inferMatchFormat([{ id: '1', scores_csv: '1-0,1-0,1-0,1-0,0-1,0-1' }])).toEqual({
      kind: 'bo',
      games: 7,
    });
  });
});

describe('mapChallongeTournaments', () => {
  it('places every recorded result on a fixture', () => {
    const { reports } = convert(SINGLE_ELIMINATION);
    const report = reports[0];

    expect(report?.placed).toBe(3);
    expect(report?.unplaced).toEqual([]);
    expect(report?.open).toBe(0);
    expect(report?.fixtures).toBe(3);
  });

  it('creates a team for every participant', () => {
    const { data } = convert(SINGLE_ELIMINATION);

    expect(data.teams.map((team) => team.name)).toEqual([
      'Nova Collective',
      'Iron Meridian',
      'Solstice Nine',
      'Pale Horizon',
    ]);
    expect(data.tournaments[0]?.participants).toHaveLength(4);
  });

  /**
   * The reason a migration is worth doing at all: the same club across several
   * Challonge tournaments has to become one team here, or the statistics and
   * ratings that follow are meaningless.
   */
  it('reuses a team that appears in more than one tournament', () => {
    const second = tournament({
      name: 'Winter Clash',
      players: ['Nova Collective', 'Iron Meridian'],
      matches: [{ id: '1', player1: '1', player2: '2', winner: '1', order: 1 }],
    });

    const { data } = convert([SINGLE_ELIMINATION, second]);

    expect(data.teams).toHaveLength(4);
    expect(data.tournaments).toHaveLength(2);
  });

  it('gives two tournaments of the same name distinct slugs', () => {
    const { data } = convert([SINGLE_ELIMINATION, SINGLE_ELIMINATION]);
    const slugs = data.tournaments.map((entry) => entry.slug);

    expect(new Set(slugs).size).toBe(2);
  });

  /**
   * TournaCore seeds a bracket by its own rules, so Challonge's player1 is not
   * necessarily side A. Copying the scores across without checking would silently
   * reverse results.
   */
  it('turns the scores round when the sides are swapped', () => {
    const { data } = convert(SINGLE_ELIMINATION);
    const state = derive(data);

    const opening = state.stages[0]?.resolved.matches.filter((match) => match.position.round === 0);
    const upset = opening?.find(
      (match) => match.winnerId !== undefined && match.status !== 'walkover',
    );

    expect(upset).toBeDefined();
    // Whoever the structure put on side A, the winner is the one Challonge named.
    for (const match of opening ?? []) {
      const stored = data.matches.find((entry) => entry.id === match.id);
      const scoreA = stored?.games.reduce((sum, game) => sum + (game.winner === 'A' ? 1 : 0), 0);
      const scoreB = stored?.games.reduce((sum, game) => sum + (game.winner === 'B' ? 1 : 0), 0);
      const impliedWinner = (scoreA ?? 0) > (scoreB ?? 0) ? 'A' : 'B';
      expect(stored?.outcome?.winner).toBe(impliedWinner);
    }
  });

  it('carries the final result through to the standings', () => {
    const { data } = convert(SINGLE_ELIMINATION);
    const state = derive(data);

    expect(state.isComplete).toBe(true);

    // Iron Meridian won the final as the lower seed.
    const champion = state.finalStandings[0]?.participantId;
    const participant = data.tournaments[0]?.participants.find((entry) => entry.id === champion);
    const team = data.teams.find((entry) => entry.id === participant?.teamId);

    expect(team?.name).toBe('Iron Meridian');
  });

  it('records when the result was decided, not when it was imported', () => {
    const withDates = tournament({
      players: ['Alpha', 'Beta'],
      matches: [{ id: '1', player1: '1', player2: '2', winner: '1', order: 1 }],
      extra: {},
    });
    const raw = structuredClone(withDates);
    const entry = raw.tournament.matches[0];
    if (entry) Object.assign(entry.match, { completed_at: '2025-06-01T18:30:00.000Z' });

    const { data } = convert(raw);
    expect(data.matches[0]?.outcome?.decidedAt).toBe('2025-06-01T18:30:00.000Z');
  });
});

describe('formats', () => {
  it('converts a round robin', () => {
    const players = ['Alpha', 'Beta', 'Gamma', 'Delta'];
    const pairs: [string, string][] = [
      ['1', '2'],
      ['1', '3'],
      ['1', '4'],
      ['2', '3'],
      ['2', '4'],
      ['3', '4'],
    ];

    const { reports, data } = convert(
      tournament({
        type: 'round robin',
        players,
        matches: pairs.map(([a, b], index) => ({
          id: String(index + 1),
          player1: a,
          player2: b,
          winner: a,
          order: index + 1,
        })),
      }),
    );

    expect(reports[0]?.format).toBe('round_robin');
    expect(reports[0]?.placed).toBe(6);
    expect(reports[0]?.unplaced).toEqual([]);
    expect(derive(data).isComplete).toBe(true);
  });

  it('converts a double elimination bracket', () => {
    const { reports } = convert(DOUBLE_ELIMINATION);

    expect(reports[0]?.format).toBe('double_elimination');
    // Every recorded result found a home in the rebuilt bracket.
    expect(reports[0]?.unplaced).toEqual([]);
    expect(reports[0]?.placed).toBe(6);
  });

  it('honours the grand final modifier', () => {
    const { data } = convert(DOUBLE_ELIMINATION);
    const format = data.stages[0]?.format;

    expect(format).toMatchObject({ kind: 'double_elimination', grandFinal: 'single' });
  });

  it('warns that swiss pairings are recomputed', () => {
    const { reports } = convert(
      tournament({
        type: 'swiss',
        players: ['Alpha', 'Beta', 'Gamma', 'Delta'],
        matches: [
          { id: '1', player1: '1', player2: '3', winner: '1', order: 1 },
          { id: '2', player1: '2', player2: '4', winner: '2', order: 2 },
        ],
        extra: { swiss_rounds: 2 },
      }),
    );

    expect(reports[0]?.format).toBe('swiss');
    // Checked by code rather than wording, so a reworded note does not break it.
    expect(reports[0]?.notes.map((note) => note.code)).toContain('swiss_recomputed');
  });
});

describe('what it refuses', () => {
  /**
   * Half a tournament is worse than none: a group phase that imported only its
   * final bracket would look complete and silently be missing its history.
   */
  it('skips a tournament with group stages instead of importing half of it', () => {
    const { data, reports } = convert(
      tournament({
        players: ['Alpha', 'Beta'],
        extra: { group_stages_enabled: true },
      }),
    );

    expect(reports[0]?.skipped).toBe(true);
    expect(data.tournaments).toHaveLength(0);
  });

  it('skips a format it cannot represent', () => {
    const { reports } = convert(tournament({ type: 'free for all', players: ['Alpha', 'Beta'] }));

    expect(reports[0]?.skipped).toBe(true);
    expect(reports[0]?.notes[0]?.code).toBe('unsupported_type');
    expect(reports[0]?.notes[0]?.values).toEqual({ type: 'free for all' });
  });

  it('skips a tournament nobody entered', () => {
    expect(convert(tournament({ players: ['Alpha'] })).reports[0]?.skipped).toBe(true);
  });

  /**
   * A result that cannot be placed has to be reported rather than dropped. It
   * means the imported tournament is missing part of its history, and that is
   * the user's decision to make, not the importer's.
   */
  it('reports a result it could not place', () => {
    const { reports } = convert(
      tournament({
        players: ['Alpha', 'Beta'],
        matches: [
          { id: '1', player1: '1', player2: '2', winner: '1', order: 1 },
          // A player who never entered.
          { id: '2', player1: '1', player2: '99', winner: '1', order: 2 },
        ],
      }),
    );

    expect(reports[0]?.unplaced).toHaveLength(1);
    expect(reports[0]?.unplaced[0]?.challongeMatchId).toBe('2');
  });

  it('rejects a file that is not a Challonge response', () => {
    expect(() => parseChallonge({ hello: 'world' })).toThrow();
  });
});

describe('a winner that contradicts the scores', () => {
  /**
   * Challonge lets an organiser set a winner directly, so the two can drift
   * apart — most often because the score was typed from the loser's side. The
   * winner is what Challonge itself progresses the bracket on, so that is what
   * is kept, but importing it silently would produce a match displaying 2-1 for
   * the side recorded as losing and look like a defect here.
   */
  it('keeps the recorded winner and reports the disagreement', () => {
    const { data, reports } = convert(
      tournament({
        players: ['Alpha', 'Beta'],
        // Scores say Alpha took it 2-1; Challonge says Beta won.
        matches: [
          { id: '1', player1: '1', player2: '2', winner: '2', scores: '13-7,9-13,13-11', order: 1 },
        ],
      }),
    );

    expect(reports[0]?.contested).toHaveLength(1);
    expect(reports[0]?.contested[0]?.winner).toBe('Beta');

    const state = derive(data);
    const champion = state.finalStandings[0]?.participantId;
    const participant = data.tournaments[0]?.participants.find((entry) => entry.id === champion);
    const team = data.teams.find((entry) => entry.id === participant?.teamId);
    expect(team?.name).toBe('Beta');
  });

  it('says nothing when the two agree', () => {
    const { reports } = convert(SINGLE_ELIMINATION);
    expect(reports[0]?.contested).toEqual([]);
  });

  it('says nothing when the maps are level or absent', () => {
    const { reports } = convert(
      tournament({
        players: ['Alpha', 'Beta', 'Gamma', 'Delta'],
        matches: [
          // One map each: nothing to contradict.
          { id: '1', player1: '1', player2: '4', winner: '1', scores: '13-7,7-13', order: 1 },
          { id: '2', player1: '2', player2: '3', winner: '2', scores: '', order: 2 },
        ],
      }),
    );

    expect(reports[0]?.contested).toEqual([]);
  });
});

describe('the file it produces', () => {
  /**
   * The strongest check available: the output has to survive the application's
   * own import validator, which is what will actually read it.
   */
  it('passes the application’s import validation', () => {
    const { data } = convert(SINGLE_ELIMINATION);
    const file = buildExport(data, '2026-01-01T00:00:00.000Z');

    const parsed = parseImport(JSON.stringify(file));

    expect(parsed.summary).toMatchObject({ tournaments: 1, stages: 1, teams: 4, matches: 3 });
  });

  it('is reproducible', () => {
    const first = convert(SINGLE_ELIMINATION);
    const second = convert(SINGLE_ELIMINATION);

    expect(JSON.stringify(first.data)).toBe(JSON.stringify(second.data));
  });

  it('leaves existing records alone', () => {
    const { data } = convert(SINGLE_ELIMINATION, options());
    const again = mapChallongeTournaments(parseChallonge(SINGLE_ELIMINATION), {
      ...options(),
      existingTeams: data.teams,
    });

    // Nothing new to create: every team was already known.
    expect(again.data.teams).toHaveLength(0);
  });
});

/** Runs the real derivation over the converted records. */
function derive(data: ReturnType<typeof convert>['data']) {
  const tournamentRecord = data.tournaments[0];
  if (!tournamentRecord) throw new Error('no tournament converted');
  return deriveTournamentState({
    tournament: tournamentRecord,
    stages: data.stages,
    matches: data.matches,
  });
}

/**
 * Four players through a full double elimination: two opening matches, a winner
 * bracket final, one loser bracket match and a grand final.
 */
const DOUBLE_ELIMINATION = tournament({
  name: 'Bracket Cup',
  type: 'double elimination',
  players: ['Alpha', 'Beta', 'Gamma', 'Delta'],
  matches: [
    { id: '1', player1: '1', player2: '4', winner: '1', order: 1 },
    { id: '2', player1: '2', player2: '3', winner: '2', order: 2 },
    { id: '3', player1: '1', player2: '2', winner: '1', order: 3 },
    { id: '4', player1: '4', player2: '3', winner: '3', order: 4 },
    { id: '5', player1: '2', player2: '3', winner: '2', order: 5 },
    { id: '6', player1: '1', player2: '2', winner: '1', order: 6 },
  ],
  extra: { grand_finals_modifier: 'single match' },
});

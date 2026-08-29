import { describe, expect, it } from 'vitest';

import { deriveTournamentState } from '@domain/derive';
import { eloLeaderboard } from '@domain/statistics/elo';
import { buildExport, parseImport } from '@services/transfer/transfer';

import { parseChallonge } from './challongeSchema';
import { inferMatchFormat, mapChallongeTournaments, parseScores } from './mapTournament';

import type { MapOptions } from './mapTournament';
import type { Game, Team } from '@models/index';
import type { TransferData } from '@services/transfer/transfer';

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
   * Half a tournament is worse than none. Group stages themselves are supported;
   * what is refused is data that announces them without carrying them, which is
   * what the API returns — importing only the final bracket would look complete
   * and silently be missing the whole first phase.
   */
  it('skips a group tournament whose groups are not in the data', () => {
    const { data, reports } = convert(
      tournament({
        players: ['Alpha', 'Beta'],
        extra: { group_stages_enabled: true },
      }),
    );

    expect(reports[0]?.skipped).toBe(true);
    expect(reports[0]?.notes[0]?.code).toBe('group_stages_missing');
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

/**
 * A group phase and the bracket after it are separate tournaments to Challonge,
 * each numbering its own participants. The same club appears under one id in its
 * group and a different one in the bracket, linked only by name.
 */
const WITH_GROUPS = {
  tournament: {
    id: 3742443,
    name: 'Group Cup',
    url: 'group-cup',
    tournament_type: 'single elimination',
    state: 'complete',
    group_stages_enabled: true,
    // The main bracket, with its own participant identifiers.
    participants: [
      { participant: { id: 901, name: 'Alpha', seed: 1 } },
      { participant: { id: 902, name: 'Gamma', seed: 2 } },
    ],
    matches: [
      {
        match: {
          id: 500,
          state: 'complete',
          player1_id: 901,
          player2_id: 902,
          winner_id: 901,
          scores_csv: '2-1',
          suggested_play_order: 1,
        },
      },
    ],
    groups: [group(1, ['Alpha', 'Beta'], 10), group(2, ['Gamma', 'Delta'], 20)],
  },
};

function group(index: number, names: string[], idBase: number) {
  const ids = names.map((_, i) => idBase + i);
  return {
    name: `Group ${String(index)}`,
    advanceCount: 1,
    participants: names.map((name, i) => ({
      participant: { id: ids[i], name, seed: i + 1 },
    })),
    matches: [
      {
        match: {
          id: idBase * 10,
          state: 'complete',
          player1_id: ids[0],
          player2_id: ids[1],
          winner_id: ids[0],
          scores_csv: '2-0',
          suggested_play_order: index,
        },
      },
    ],
  };
}

describe('group stages', () => {
  it('becomes a group stage feeding a bracket', () => {
    const { data, reports } = convert(WITH_GROUPS);

    expect(reports[0]?.skipped).toBe(false);
    expect(data.stages).toHaveLength(2);
    expect(data.stages[0]?.format.kind).toBe('group_stage');
    expect(data.stages[1]?.format.kind).toBe('single_elimination');
  });

  it('reproduces the groups exactly rather than redrawing them', () => {
    const { data } = convert(WITH_GROUPS);
    const format = data.stages[0]?.format;

    expect(format).toMatchObject({ distribution: 'manual', groupCount: 2 });
    expect((format as { groups?: number[][] }).groups).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  /** Identity across the two phases exists only as a name. */
  it('recognises a team as the same in its group and in the bracket', () => {
    const { data } = convert(WITH_GROUPS);

    expect(data.teams.map((team) => team.name).sort()).toEqual(['Alpha', 'Beta', 'Delta', 'Gamma']);
    expect(data.tournaments[0]?.participants).toHaveLength(4);
  });

  it('links the bracket to the group tables', () => {
    const { data } = convert(WITH_GROUPS);
    const rule = data.stages[1]?.entrySeeding[0];

    expect(rule?.source).toMatchObject({
      kind: 'group_standings',
      stageId: data.stages[0]?.id,
      placeRange: { from: 1, to: 1 },
    });
  });

  it('places both phases of results', () => {
    const { reports, data } = convert(WITH_GROUPS);

    // Two group fixtures and one final.
    expect(reports[0]?.placed).toBe(3);
    expect(reports[0]?.unplaced).toEqual([]);
    expect(data.matches).toHaveLength(3);
  });

  it('reports what it did', () => {
    const { reports } = convert(WITH_GROUPS);
    expect(reports[0]?.notes.map((note) => note.code)).toContain('group_stage_imported');
  });

  /**
   * The API reports that groups exist but does not return them. Importing the
   * bracket alone would look complete and be missing its whole first phase.
   */
  it('refuses data that says it has groups but does not carry them', () => {
    const withoutGroups = structuredClone(WITH_GROUPS);
    withoutGroups.tournament.groups = [];

    const { reports, data } = convert(withoutGroups);

    expect(reports[0]?.skipped).toBe(true);
    expect(reports[0]?.notes[0]?.code).toBe('group_stages_missing');
    expect(data.tournaments).toHaveLength(0);
  });
});

describe('teams that changed their name', () => {
  /**
   * The point of merging two teams: a club renamed itself, and its older
   * tournaments were played under the old name. An import arriving under that
   * name has to find its way to the merged team rather than creating a second.
   */
  it('recognises a team by a name it used to compete under', () => {
    const merged = {
      id: 'merged',
      name: 'Vici Gaming',
      tag: 'VG',
      formerNames: ['Quantic Gaming'],
      socials: [],
      archived: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as unknown as Parameters<typeof mapChallongeTournaments>[1]['existingTeams'][number];

    const { data } = mapChallongeTournaments(
      parseChallonge(
        tournament({
          players: ['Quantic Gaming', 'Beta'],
          matches: [{ id: '1', player1: '1', player2: '2', winner: '1', order: 1 }],
        }),
      ),
      { ...options(), existingTeams: [merged] },
    );

    // Only Beta is new: the old name resolved to the team that already exists.
    expect(data.teams.map((team) => team.name)).toEqual(['Beta']);

    const entrant = data.tournaments[0]?.participants[0];
    expect(entrant?.teamId).toBe('merged');
  });
});

/**
 * Challonge calls this a group stage, but a group is its own little tournament
 * and need not be a round robin. One knockout round with half the field going
 * through is a play-in, and reading it as a round robin builds a table of
 * fixtures that were never played.
 */
const WITH_PLAY_IN = {
  tournament: {
    id: 4248739,
    name: 'Play-in Cup',
    url: 'play-in-cup',
    tournament_type: 'single elimination',
    state: 'complete',
    group_stages_enabled: true,
    // The two survivors, renumbered for the bracket.
    participants: [
      { participant: { id: 901, name: 'Alpha', seed: 1 } },
      { participant: { id: 902, name: 'Gamma', seed: 2 } },
    ],
    matches: [
      {
        match: {
          id: 500,
          state: 'complete',
          player1_id: 901,
          player2_id: 902,
          winner_id: 901,
          scores_csv: '2-1',
          suggested_play_order: 1,
        },
      },
    ],
    groups: [
      {
        name: 'Group A',
        type: 'single elimination',
        advanceCount: 2,
        participants: [
          { participant: { id: 10, name: 'Alpha', seed: 1 } },
          { participant: { id: 11, name: 'Beta', seed: 4 } },
          { participant: { id: 12, name: 'Gamma', seed: 2 } },
          { participant: { id: 13, name: 'Delta', seed: 3 } },
        ],
        matches: [playIn(100, 10, 11, 10, 1), playIn(101, 12, 13, 12, 2)],
      },
    ],
  },
};

function playIn(id: number, p1: number, p2: number, winner: number, order: number) {
  return {
    match: {
      id,
      round: 1,
      state: 'complete',
      player1_id: p1,
      player2_id: p2,
      winner_id: winner,
      loser_id: winner === p1 ? p2 : p1,
      scores_csv: '2-0',
      suggested_play_order: order,
    },
  };
}

describe('a knockout qualifying round', () => {
  it('becomes one group per pairing rather than a round robin', () => {
    const { data } = convert(WITH_PLAY_IN);
    const format = data.stages[0]?.format;

    // Two pairings, so two groups of two — not one table of four.
    expect(format).toMatchObject({ kind: 'group_stage', groupCount: 2, distribution: 'manual' });
    expect((format as { groups?: number[][] }).groups).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('generates only the fixtures that were played', () => {
    const { reports } = convert(WITH_PLAY_IN);

    // Two play-in matches and one final: a round robin would have invented three
    // more that never happened.
    expect(reports[0]?.fixtures).toBe(3);
    expect(reports[0]?.placed).toBe(3);
    expect(reports[0]?.open).toBe(0);
    expect(reports[0]?.unplaced).toEqual([]);
  });

  it('sends exactly one participant on from each pairing', () => {
    const { data } = convert(WITH_PLAY_IN);
    const rule = data.stages[1]?.entrySeeding[0];

    // Either derived from the tables or taken as recorded, but never more than
    // the two who actually won.
    expect(rule?.targetSlots).toEqual({ from: 1, to: 2 });
  });

  /**
   * Where a source re-seeded its qualifiers by hand, no ordering rule
   * reproduces it — the line-up it wrote down is the only truth available.
   */
  it('can keep the line-up the source recorded', () => {
    const { data, reports } = convert(WITH_PLAY_IN);
    const rule = data.stages[1]?.entrySeeding[0];

    const usedRecorded = rule?.source.kind === 'manual';
    const noted = reports[0]?.notes.some((note) => note.code === 'playoff_seeding_recorded');
    expect(usedRecorded).toBe(noted);
  });

  it('refuses a qualifying phase of several rounds rather than flattening it', () => {
    const deeper = structuredClone(WITH_PLAY_IN);
    const extra = structuredClone(deeper.tournament.groups[0]!.matches[0]!);
    extra.match.id = 199;
    extra.match.round = 2;
    deeper.tournament.groups[0]!.matches.push(extra);

    const { reports, data } = convert(deeper);

    expect(reports[0]?.skipped).toBe(true);
    expect(reports[0]?.notes[0]?.code).toBe('qualifying_bracket');
    expect(data.tournaments).toHaveLength(0);
  });
});

/**
 * Elo depends on the order results arrive in, so an archive entered years after
 * the fact must be rated by when it was played rather than by when it was
 * typed. Two tournaments imported in either order have to produce the same
 * table, and the only thing that can make them is the dates on the results.
 */
describe('rating an archive entered out of order', () => {
  const EARLY = tournament({
    name: 'Spring 2019',
    players: ['Nova Collective', 'Iron Meridian', 'Solstice Nine', 'Pale Horizon'],
    matches: [
      { id: '1', player1: '1', player2: '4', winner: '1', scores: '2-0', order: 1 },
      { id: '2', player1: '2', player2: '3', winner: '2', scores: '2-1', order: 2 },
      { id: '3', player1: '1', player2: '2', winner: '2', scores: '1-2', order: 3 },
    ],
  });

  const LATE = tournament({
    name: 'Autumn 2023',
    players: ['Iron Meridian', 'Nova Collective', 'Pale Horizon', 'Solstice Nine'],
    matches: [
      { id: '1', player1: '1', player2: '4', winner: '4', scores: '0-2', order: 1 },
      { id: '2', player1: '2', player2: '3', winner: '2', scores: '2-0', order: 2 },
      { id: '3', player1: '4', player2: '2', winner: '4', scores: '2-1', order: 3 },
    ],
  });

  const importedAs = (order: readonly unknown[], dates: readonly string[]) => {
    const teams: Team[] = [];
    const games: Game[] = [];
    const slugs: string[] = [];
    const data = { tournaments: [], stages: [], matches: [] } as {
      tournaments: TransferData['tournaments'];
      stages: TransferData['stages'];
      matches: TransferData['matches'];
    };

    order.forEach((raw, index) => {
      const result = mapChallongeTournaments(parseChallonge(raw), {
        ...options(),
        existingTeams: teams,
        existingGames: games,
        existingSlugs: slugs,
        // Each import happens later than the last, as it would in real use.
        timestamp: `2026-0${String(index + 1)}-01T00:00:00.000Z`,
        playedAt: dates[index] ?? '2026-01-01T00:00:00.000Z',
      });

      teams.push(...result.data.teams);
      games.push(...result.data.games);
      slugs.push(...result.data.tournaments.map((entry) => entry.slug));
      data.tournaments.push(...result.data.tournaments);
      data.stages.push(...result.data.stages);
      data.matches.push(...result.data.matches);
    });

    const board = eloLeaderboard(data);
    const nameOf = new Map(teams.map((team) => [team.id, team.name]));
    return board.map(
      (entry) => `${nameOf.get(entry.teamId) ?? '?'} ${String(Math.round(entry.rating))}`,
    );
  };

  it('rates the same however the tournaments were entered', () => {
    const chronological = importedAs(
      [EARLY, LATE],
      ['2019-04-01T00:00:00.000Z', '2023-10-01T00:00:00.000Z'],
    );
    const backwards = importedAs(
      [LATE, EARLY],
      ['2023-10-01T00:00:00.000Z', '2019-04-01T00:00:00.000Z'],
    );

    expect(backwards).toEqual(chronological);
  });

  /** And the ratings actually moved, so the comparison above means something. */
  it('produces a table that a single result would change', () => {
    const board = importedAs(
      [EARLY, LATE],
      ['2019-04-01T00:00:00.000Z', '2023-10-01T00:00:00.000Z'],
    );

    expect(board.length).toBeGreaterThan(1);
    expect(new Set(board.map((row) => row.split(' ').at(-1))).size).toBeGreaterThan(1);
  });
});

describe('when the tournament took place', () => {
  /**
   * A public Challonge bracket carries no date whatsoever. Without one every
   * import is dated the moment it ran, and an archive spanning years collapses
   * into a single day — which makes a list ordered by date useless.
   */
  it('uses the supplied date when the source has none', () => {
    const { data } = convert(SINGLE_ELIMINATION, {
      ...options(),
      playedAt: '2019-04-01T00:00:00.000Z',
    });

    expect(data.tournaments[0]?.createdAt).toBe('2019-04-01T00:00:00.000Z');
    expect(data.tournaments[0]?.startsAt).toBe('2019-04-01T00:00:00.000Z');
  });

  it('prefers what the source recorded over the supplied date', () => {
    const dated = structuredClone(SINGLE_ELIMINATION);
    Object.assign(dated.tournament, { created_at: '2020-05-05T00:00:00.000Z' });

    const { data } = convert(dated, { ...options(), playedAt: '2019-04-01T00:00:00.000Z' });
    expect(data.tournaments[0]?.createdAt).toBe('2020-05-05T00:00:00.000Z');
  });

  it('falls back to the moment of import when nothing says otherwise', () => {
    const { data } = convert(SINGLE_ELIMINATION);
    expect(data.tournaments[0]?.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  /**
   * The results need dating too, not just the tournament.
   *
   * Elo folds results in sequence, so stamping them all with the moment of the
   * import made the ratings depend on the order an archive happened to be
   * pasted in — and, within a tournament, on how the identifiers sorted, which
   * put the grand final first.
   */
  describe('and when its results were played', () => {
    it('dates the results from the tournament rather than the import', () => {
      const { data } = convert(SINGLE_ELIMINATION, {
        ...options(),
        playedAt: '2019-04-01T00:00:00.000Z',
      });

      for (const match of data.matches) {
        expect(match.outcome?.decidedAt.slice(0, 10)).toBe('2019-04-01');
      }
    });

    it('gives every result its own moment', () => {
      const { data } = convert(SINGLE_ELIMINATION, {
        ...options(),
        playedAt: '2019-04-01T00:00:00.000Z',
      });

      const stamps = new Set(data.matches.map((match) => match.outcome?.decidedAt));
      expect(stamps.size).toBe(data.matches.length);
    });

    it('dates a later round after the round that feeds it', () => {
      const { data } = convert(SINGLE_ELIMINATION, {
        ...options(),
        playedAt: '2019-04-01T00:00:00.000Z',
      });

      const byRound = new Map<number, string[]>();
      for (const match of data.matches) {
        const round = match.position.round;
        byRound.set(round, [...(byRound.get(round) ?? []), match.outcome?.decidedAt ?? '']);
      }

      const rounds = [...byRound.entries()].sort((a, b) => a[0] - b[0]);
      for (let index = 1; index < rounds.length; index += 1) {
        const earlier = Math.max(...(rounds[index - 1]?.[1] ?? []).map((d) => Date.parse(d)));
        const later = Math.min(...(rounds[index]?.[1] ?? []).map((d) => Date.parse(d)));
        expect(later).toBeGreaterThan(earlier);
      }
    });

    /** A source that does record dates knows better than anything synthetic. */
    it('keeps a date the source recorded', () => {
      const dated = structuredClone(SINGLE_ELIMINATION);
      const first = dated.tournament.matches[0];
      if (first) Object.assign(first.match, { completed_at: '2020-07-07T12:00:00.000Z' });

      const { data } = convert(dated, { ...options(), playedAt: '2019-04-01T00:00:00.000Z' });
      const stamps = data.matches.map((match) => match.outcome?.decidedAt);
      expect(stamps).toContain('2020-07-07T12:00:00.000Z');
    });
  });
});

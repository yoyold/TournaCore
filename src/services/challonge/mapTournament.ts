import { deriveTournamentState } from '@domain/derive';
import {
  DEFAULT_POINT_SYSTEM,
  DEFAULT_SWISS_TIEBREAKERS,
  DEFAULT_TIEBREAKERS,
  asId,
  type FormatConfig,
  type Game,
  type GameId,
  type GameResult,
  type Match,
  type MatchFormat,
  type MatchId,
  type MatchWinner,
  type Participant,
  type ParticipantId,
  type Stage,
  type StageId,
  type Team,
  type Tournament,
  type TournamentId,
} from '@models/index';
import { uniqueSlug } from '@utils/slug';

import type { ChallongeMatch, ChallongeTournament } from './challongeSchema';
import type { StructuralMatch } from '@domain/formats/types';
import type { TransferData } from '@services/transfer/transfer';

export interface MapOptions {
  /** Teams already known, so the same club is not created twice. */
  existingTeams: readonly Team[];
  existingGames: readonly Game[];
  existingSlugs: readonly string[];
  timestamp: string;
  /** Injected so a conversion can be reproduced exactly. */
  newId: () => string;
}

/**
 * A result whose winner and scores tell different stories.
 *
 * Challonge lets an organiser set a winner directly, so the two can drift apart
 * — usually because the score was typed from the loser's side. The winner is the
 * field Challonge itself progresses the bracket on, so it is the one kept, but
 * the disagreement has to be surfaced: silently importing a match that displays
 * 2-1 for the side recorded as losing would look like a bug in TournaCore.
 */
export interface ContestedResult {
  challongeMatchId: string;
  winner: string;
  score: string;
}

/**
 * Something the conversion had to point out.
 *
 * Carries a stable code as well as the wording, following the same convention
 * as a validation issue: the command line prints the message, the interface
 * translates the code. One note, one meaning, two presentations.
 */
export interface ReportNote {
  code: string;
  message: string;
  values?: Record<string, string | number>;
}

/** A Challonge result the structure had no fixture for. */
export interface UnplacedResult {
  challongeMatchId: string;
  player1: string;
  player2: string;
  score: string;
}

export interface TournamentReport {
  source: string;
  name: string;
  /** The TournaCore format it was converted to, or why it was not. */
  format: string;
  participants: number;
  /** Fixtures the format engine generated, byes excluded. */
  fixtures: number;
  /** Challonge results placed on a fixture. */
  placed: number;
  unplaced: UnplacedResult[];
  /** Fixtures left without a result. */
  open: number;
  /** Results whose recorded winner disagrees with the recorded scores. */
  contested: ContestedResult[];
  notes: ReportNote[];
  skipped: boolean;
}

export interface MapResult {
  data: TransferData;
  reports: TournamentReport[];
}

/**
 * Converts Challonge tournaments into TournaCore records.
 *
 * The awkward part is not the field names, it is the identifiers. TournaCore
 * derives a match's id from its structural position, which is what keeps a
 * recorded result attached to its fixture when a bracket is regenerated.
 * Challonge's ids are its own surrogate keys and mean nothing here, so they
 * cannot simply be carried over.
 *
 * So the structure is rebuilt by the real format engine and the results are
 * walked onto it: derive, find the fixtures whose participants are now known,
 * look for a Challonge result between exactly those two, record it, derive
 * again. Progression does the addressing, which means the import never depends
 * on Challonge's round numbering or on matching two implementations of a bracket
 * against each other.
 *
 * Pure. Nothing is fetched, nothing is written; the caller decides both.
 */
export function mapChallongeTournaments(
  sources: readonly ChallongeTournament[],
  options: MapOptions,
): MapResult {
  const teams = new Map<string, Team>(
    options.existingTeams.map((team) => [team.name.toLowerCase(), team]),
  );
  const games = new Map<string, Game>(
    options.existingGames.map((game) => [game.name.toLowerCase(), game]),
  );

  const newTeams: Team[] = [];
  const newGames: Game[] = [];
  const tournaments: Tournament[] = [];
  const stages: Stage[] = [];
  const matches: Match[] = [];
  const reports: TournamentReport[] = [];
  const slugs = [...options.existingSlugs];

  for (const source of sources) {
    const converted = convertOne(source, {
      options,
      teams,
      games,
      newTeams,
      newGames,
      slugs,
    });

    reports.push(converted.report);
    if (converted.skipped) continue;

    tournaments.push(converted.tournament);
    stages.push(...converted.stages);
    matches.push(...converted.matches);
  }

  return {
    data: { games: newGames, teams: newTeams, tournaments, stages, matches },
    reports,
  };
}

interface ConvertContext {
  options: MapOptions;
  teams: Map<string, Team>;
  games: Map<string, Game>;
  newTeams: Team[];
  newGames: Game[];
  slugs: string[];
}

interface Converted {
  skipped: boolean;
  report: TournamentReport;
  tournament: Tournament;
  stages: Stage[];
  matches: Match[];
}

function convertOne(source: ChallongeTournament, context: ConvertContext): Converted {
  const { options } = context;
  const notes: ReportNote[] = [];
  const label = source.url ?? source.id;

  const skip = (reason: ReportNote, format: string): Converted => ({
    skipped: true,
    report: {
      source: label,
      name: source.name,
      format,
      participants: source.participants.length,
      fixtures: 0,
      placed: 0,
      unplaced: [],
      contested: [],
      open: 0,
      notes: [reason],
      skipped: true,
    },
    tournament: undefined as unknown as Tournament,
    stages: [],
    matches: [],
  });

  /*
   * A Challonge group phase gives every participant a second set of identifiers
   * and splits the event into two linked brackets. Converting half of it would
   * produce a tournament that looks complete and is not, so it is refused
   * outright rather than imported partially.
   */
  if (source.group_stages_enabled === true) {
    return skip(
      {
        code: 'group_stages',
        message: 'Group stages are not supported yet; import it manually.',
      },
      'group stages',
    );
  }

  const entrants = [...source.participants.map((entry) => entry.participant)].sort(
    (a, b) => (a.seed ?? Number.MAX_SAFE_INTEGER) - (b.seed ?? Number.MAX_SAFE_INTEGER),
  );

  if (entrants.length < 2) {
    return skip(
      { code: 'too_few_participants', message: 'Fewer than two participants.' },
      source.tournament_type,
    );
  }

  const challongeMatches = source.matches.map((entry) => entry.match);
  const matchFormat = inferMatchFormat(challongeMatches);
  const format = toFormatConfig(source, entrants.length, matchFormat, notes);

  if (!format) {
    return skip(
      {
        code: 'unsupported_type',
        message: `Unsupported Challonge type "${source.tournament_type}".`,
        values: { type: source.tournament_type },
      },
      source.tournament_type,
    );
  }

  // Participants, and the teams behind them.
  const byChallongeId = new Map<string, ParticipantId>();
  const participants: Participant[] = entrants.map((entrant, index) => {
    const name = (entrant.name ?? entrant.display_name ?? `Team ${String(index + 1)}`).trim();
    const key = name.toLowerCase();

    let team = context.teams.get(key);
    if (!team) {
      team = {
        id: asId<Team['id']>(options.newId()),
        name,
        tag: deriveTag(name),
        socials: [],
        archived: false,
        createdAt: options.timestamp,
        updatedAt: options.timestamp,
      };
      context.teams.set(key, team);
      context.newTeams.push(team);
    }

    const participant: Participant = {
      id: asId<ParticipantId>(options.newId()),
      teamId: team.id,
      seed: index + 1,
      status: 'active',
    };
    byChallongeId.set(entrant.id, participant.id);
    return participant;
  });

  const gameId = resolveGame(source.game_name ?? undefined, context);
  const tournamentId = asId<TournamentId>(options.newId());
  const stageId = asId<StageId>(options.newId());
  const slug = uniqueSlug(source.name, context.slugs);
  context.slugs.push(slug);

  const stage: Stage = {
    id: stageId,
    tournamentId,
    name: stageNameFor(format.kind),
    order: 0,
    format,
    entrySeeding: [
      {
        id: asId<Stage['entrySeeding'][number]['id']>(options.newId()),
        source: { kind: 'participants' },
        targetSlots: { from: 1, to: participants.length },
        order: 'as_ranked',
      },
    ],
    createdAt: options.timestamp,
    updatedAt: options.timestamp,
  };

  const tournament: Tournament = {
    id: tournamentId,
    name: source.name,
    slug,
    gameId,
    status: source.state === 'complete' ? 'completed' : 'live',
    participants,
    stageIds: [stageId],
    createdAt: source.created_at ?? options.timestamp,
    updatedAt: options.timestamp,
    ...(source.description ? { description: stripHtml(source.description) } : {}),
    ...(source.started_at ? { startsAt: source.started_at } : {}),
    ...(source.completed_at ? { endsAt: source.completed_at } : {}),
  };

  const attached = attachBestVariant({
    tournament,
    stage,
    byChallongeId,
    challongeMatches,
    entrants: new Map(entrants.map((e) => [e.id, e.name ?? e.display_name ?? e.id])),
    options,
    notes,
  });

  return {
    skipped: false,
    tournament,
    stages: [attached.stage],
    matches: attached.matches,
    report: {
      source: label,
      name: source.name,
      format: format.kind,
      participants: participants.length,
      fixtures: attached.fixtures,
      placed: attached.placed,
      unplaced: attached.unplaced,
      contested: attached.contested,
      open: attached.open,
      notes,
      skipped: false,
    },
  };
}

/**
 * Places results, trying every loser bracket drop order.
 *
 * The drop order decides who meets whom after a defeat, so a bracket drawn
 * under one rule cannot hold results played under another — they would simply
 * have nowhere to go. Rather than assume which rule the source used, and since
 * placement is a pure function, each is tried and whichever accounts for more
 * of the recorded history is kept.
 */
function attachBestVariant(input: {
  tournament: Tournament;
  stage: Stage;
  byChallongeId: Map<string, ParticipantId>;
  challongeMatches: readonly ChallongeMatch[];
  entrants: Map<string, string>;
  options: MapOptions;
  notes: ReportNote[];
}): Attached & { stage: Stage } {
  const { stage, notes } = input;

  if (stage.format.kind !== 'double_elimination') {
    return { ...attachResults({ ...input, stage }), stage };
  }

  const variants = (['balanced', 'alternating', 'reversed', 'standard'] as const).map((seeding) => {
    const candidate: Stage = {
      ...stage,
      format: { ...stage.format, loserBracketSeeding: seeding } as FormatConfig,
    };
    return { seeding, candidate, result: attachResults({ ...input, stage: candidate }) };
  });

  const best = variants.reduce((winner, entry) =>
    entry.result.placed > winner.result.placed ? entry : winner,
  );

  if (best.seeding !== 'balanced') {
    notes.push({
      code: 'loser_bracket_order',
      message:
        `Loser bracket drawn with the "${best.seeding}" drop order to match the source; ` +
        'it allows rematches the default arrangement avoids.',
      values: { order: best.seeding },
    });
  }

  return { ...best.result, stage: best.candidate };
}

interface Attached {
  matches: Match[];
  placed: number;
  unplaced: UnplacedResult[];
  contested: ContestedResult[];
  open: number;
  fixtures: number;
}

function attachResults(input: {
  tournament: Tournament;
  stage: Stage;
  byChallongeId: Map<string, ParticipantId>;
  challongeMatches: readonly ChallongeMatch[];
  entrants: Map<string, string>;
  options: MapOptions;
}): Attached {
  const { tournament, stage, byChallongeId, challongeMatches, entrants, options } = input;

  const unplaced: UnplacedResult[] = [];
  const contested: ContestedResult[] = [];
  const pool = new Map<string, ChallongeMatch[]>();

  const describe = (match: ChallongeMatch): UnplacedResult => ({
    challongeMatchId: match.id,
    player1: entrants.get(match.player1_id ?? '') ?? '?',
    player2: entrants.get(match.player2_id ?? '') ?? '?',
    score: match.scores_csv ?? '',
  });

  for (const match of decidedMatches(challongeMatches)) {
    const a = byChallongeId.get(match.player1_id ?? '');
    const b = byChallongeId.get(match.player2_id ?? '');
    if (a === undefined || b === undefined) {
      unplaced.push(describe(match));
      continue;
    }
    const key = pairKey(a, b);
    const queue = pool.get(key) ?? [];
    queue.push(match);
    pool.set(key, queue);
  }

  const matches: Match[] = [];
  const taken = new Set<MatchId>();
  const passes = challongeMatches.length + 8;

  for (let pass = 0; pass < passes; pass += 1) {
    const state = deriveTournamentState({ tournament, stages: [stage], matches });
    let progressed = false;

    for (const derived of state.stages) {
      const structural = new Map(derived.structure.matches.map((match) => [match.id, match]));

      for (const resolved of derived.resolved.matches) {
        if (taken.has(resolved.id) || resolved.status !== 'ready') continue;

        const a = participantOf(resolved.slotA);
        const b = participantOf(resolved.slotB);
        if (a === undefined || b === undefined) continue;

        const queue = pool.get(pairKey(a, b));
        const challonge = queue?.shift();
        if (!challonge) continue;

        const blueprint = structural.get(resolved.id);
        if (!blueprint) continue;

        if (disagrees(challonge)) {
          contested.push({
            challongeMatchId: challonge.id,
            winner: entrants.get(challonge.winner_id ?? '') ?? '?',
            score: challonge.scores_csv ?? '',
          });
        }

        matches.push(
          buildMatch({
            tournamentId: tournament.id,
            stageId: stage.id,
            blueprint,
            challonge,
            slotAIsPlayer1: byChallongeId.get(challonge.player1_id ?? '') === a,
            options,
          }),
        );
        taken.add(resolved.id);
        progressed = true;
      }
    }

    if (!progressed) break;
  }

  for (const queue of pool.values()) {
    for (const leftover of queue) unplaced.push(describe(leftover));
  }

  const final = deriveTournamentState({ tournament, stages: [stage], matches });
  const playable = final.stages.flatMap((derived) =>
    derived.resolved.matches.filter((match) => !match.isBye && match.status !== 'cancelled'),
  );

  return {
    matches,
    placed: matches.length,
    unplaced,
    contested,
    open: playable.length - matches.length,
    fixtures: playable.length,
  };
}

/**
 * Challonge results worth placing, in the order they were played.
 *
 * Play order matters where the same two participants meet more than once — both
 * legs of a double round robin, or a bracket reset — because the results are
 * consumed pair by pair and would otherwise land on the wrong occasion.
 */
function decidedMatches(matches: readonly ChallongeMatch[]): ChallongeMatch[] {
  return matches
    .filter(
      (match) =>
        (match.state === 'complete' || match.winner_id !== undefined) &&
        match.player1_id !== undefined &&
        match.player2_id !== undefined,
    )
    .sort(
      (a, b) =>
        (a.suggested_play_order ?? Number.MAX_SAFE_INTEGER) -
          (b.suggested_play_order ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id),
    );
}

function buildMatch(input: {
  tournamentId: TournamentId;
  stageId: StageId;
  blueprint: StructuralMatch;
  challonge: ChallongeMatch;
  slotAIsPlayer1: boolean;
  options: MapOptions;
}): Match {
  const { tournamentId, stageId, blueprint, challonge, slotAIsPlayer1, options } = input;

  const games: GameResult[] = parseScores(challonge.scores_csv).map(([left, right], index) => {
    const scoreA = slotAIsPlayer1 ? left : right;
    const scoreB = slotAIsPlayer1 ? right : left;
    const winner: MatchWinner | undefined =
      scoreA > scoreB ? 'A' : scoreB > scoreA ? 'B' : undefined;

    return {
      id: asId<GameResult['id']>(options.newId()),
      index: index + 1,
      scoreA,
      scoreB,
      ...(winner ? { winner } : {}),
    };
  });

  const winnerSide = winnerOf(challonge, slotAIsPlayer1);

  return {
    id: blueprint.id,
    tournamentId,
    stageId,
    position: blueprint.position,
    slotA: blueprint.slotA,
    slotB: blueprint.slotB,
    format: blueprint.format,
    games,
    /*
     * The outcome is recorded explicitly rather than left to follow from the
     * maps. Challonge has no best-of concept, so a series can be stored as a
     * single line that would not decide the match under the inferred format —
     * and the winner Challonge recorded is the fact worth preserving.
     */
    outcome: {
      winner: winnerSide,
      reason: challonge.forfeited === true ? 'forfeit' : 'played',
      decidedAt: challonge.completed_at ?? challonge.updated_at ?? options.timestamp,
    },
    createdAt: options.timestamp,
    updatedAt: options.timestamp,
  };
}

/**
 * Whether the recorded winner contradicts the recorded scores.
 *
 * Only meaningful when both are present and the maps actually separate the two
 * sides; a match stored without scores, or level on maps, says nothing either
 * way.
 */
function disagrees(challonge: ChallongeMatch): boolean {
  if (challonge.winner_id === undefined) return false;

  const games = parseScores(challonge.scores_csv);
  if (games.length === 0) return false;

  let player1 = 0;
  let player2 = 0;
  for (const [left, right] of games) {
    if (left > right) player1 += 1;
    else if (right > left) player2 += 1;
  }
  if (player1 === player2) return false;

  const scoresSayPlayer1 = player1 > player2;
  const winnerIsPlayer1 = challonge.winner_id === challonge.player1_id;
  return scoresSayPlayer1 !== winnerIsPlayer1;
}

function winnerOf(challonge: ChallongeMatch, slotAIsPlayer1: boolean): MatchWinner {
  if (challonge.winner_id === undefined) return 'draw';
  const wonByPlayer1 = challonge.winner_id === challonge.player1_id;
  return wonByPlayer1 === slotAIsPlayer1 ? 'A' : 'B';
}

/** "13-7,10-13" into pairs of numbers. Empty for anything unparseable. */
export function parseScores(csv: string | undefined): [number, number][] {
  if (!csv) return [];

  const games: [number, number][] = [];
  for (const part of csv.split(',')) {
    // Scores may be negative, so the separator is the last minus that has a
    // digit before it rather than simply the first one.
    const match = /^\s*(-?\d+)\s*-\s*(-?\d+)\s*$/.exec(part);
    if (!match) continue;
    const left = Number(match[1]);
    const right = Number(match[2]);
    if (!Number.isFinite(left) || !Number.isFinite(right)) continue;
    games.push([left, right]);
  }
  return games;
}

/**
 * Best-of length implied by the recorded scores.
 *
 * Challonge stores however many game scores were entered and has no notion of a
 * series length, so the longest series in the tournament is the only evidence
 * available. Guessing too short would make a recorded 3-1 look impossible.
 */
export function inferMatchFormat(matches: readonly ChallongeMatch[]): MatchFormat {
  const longest = matches.reduce(
    (max, match) => Math.max(max, parseScores(match.scores_csv).length),
    0,
  );

  if (longest <= 1) return { kind: 'single_game' };
  if (longest <= 3) return { kind: 'bo', games: 3 };
  if (longest <= 5) return { kind: 'bo', games: 5 };
  return { kind: 'bo', games: 7 };
}

function toFormatConfig(
  source: ChallongeTournament,
  participantCount: number,
  matchFormat: MatchFormat,
  notes: ReportNote[],
): FormatConfig | undefined {
  const type = source.tournament_type.toLowerCase();

  if (type.includes('single elimination')) {
    return {
      kind: 'single_elimination',
      thirdPlaceMatch: source.hold_third_place_match === true,
      byePlacement: 'seeded',
      seedArrangement: 'standard',
      matchFormats: { default: matchFormat },
    };
  }

  if (type.includes('double elimination')) {
    const modifier = source.grand_finals_modifier ?? '';
    if (modifier === 'skip') {
      notes.push({
        code: 'grand_final_skipped',
        message: 'Challonge skipped the grand final; imported with a single one.',
      });
    }
    return {
      kind: 'double_elimination',
      grandFinal: modifier === '' ? 'bracket_reset' : 'single',
      seedArrangement: 'standard',
      loserBracketSeeding: 'reversed',
      matchFormats: { default: matchFormat },
    };
  }

  if (type.includes('round robin')) {
    const legs = inferLegs(source, participantCount);
    if (legs === 2) {
      notes.push({ code: 'double_round_robin', message: 'Detected a double round robin.' });
    }
    return {
      kind: 'round_robin',
      legs,
      pointSystem: DEFAULT_POINT_SYSTEM,
      tiebreakers: [...DEFAULT_TIEBREAKERS],
      matchFormat,
    };
  }

  if (type.includes('swiss')) {
    const rounds = source.swiss_rounds ?? inferSwissRounds(source);
    notes.push({
      code: 'swiss_recomputed',
      message: 'Swiss pairings are recomputed here and may differ from Challonge’s.',
    });
    return {
      kind: 'swiss',
      rounds: Math.max(1, rounds),
      pairing: 'dutch',
      avoidRematches: true,
      pointSystem: DEFAULT_POINT_SYSTEM,
      tiebreakers: [...DEFAULT_SWISS_TIEBREAKERS],
      matchFormat,
    };
  }

  return undefined;
}

/** Two legs when a pair appears twice in the schedule. */
function inferLegs(source: ChallongeTournament, participantCount: number): 1 | 2 {
  if (source.rr_iterations === 2) return 2;
  const single = (participantCount * (participantCount - 1)) / 2;
  return source.matches.length > single ? 2 : 1;
}

function inferSwissRounds(source: ChallongeTournament): number {
  return source.matches.reduce((max, entry) => Math.max(max, entry.match.round ?? 0), 0);
}

function resolveGame(name: string | undefined, context: ConvertContext): GameId {
  const trimmed = name?.trim();
  if (!trimmed) return asId<GameId>(context.options.newId());

  const existing = context.games.get(trimmed.toLowerCase());
  if (existing) return existing.id;

  const game: Game = {
    id: asId<GameId>(context.options.newId()),
    name: trimmed,
    shortName: deriveTag(trimmed),
    maps: [],
    defaultMatchFormat: { kind: 'bo', games: 3 },
    createdAt: context.options.timestamp,
    updatedAt: context.options.timestamp,
  };
  context.games.set(trimmed.toLowerCase(), game);
  context.newGames.push(game);
  return game.id;
}

function stageNameFor(kind: FormatConfig['kind']): string {
  switch (kind) {
    case 'round_robin':
      return 'League';
    case 'swiss':
      return 'Swiss';
    case 'group_stage':
      return 'Group Stage';
    case 'single_elimination':
    case 'double_elimination':
      return 'Main Bracket';
  }
}

const participantOf = (slot: {
  kind: string;
  participantId?: ParticipantId;
}): ParticipantId | undefined => (slot.kind === 'participant' ? slot.participantId : undefined);

const pairKey = (a: ParticipantId, b: ParticipantId): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Short tag from a name, matching what the wizard derives. */
function deriveTag(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '???';
  if (words.length === 1) return (words[0] ?? '').slice(0, 4).toUpperCase();
  return words
    .map((word) => word[0] ?? '')
    .join('')
    .slice(0, 4)
    .toUpperCase();
}

/** Challonge descriptions are HTML; the model stores plain text. */
function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

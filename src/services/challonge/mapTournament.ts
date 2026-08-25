import { deriveTournamentState } from '@domain/derive';
import {
  DEFAULT_POINT_SYSTEM,
  DEFAULT_SWISS_TIEBREAKERS,
  DEFAULT_TIEBREAKERS,
  asId,
  type DoubleEliminationConfig,
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
  type SeedingRule,
  type Stage,
  type StageId,
  type Team,
  type Tournament,
  type TournamentId,
} from '@models/index';
import { uniqueSlug } from '@utils/slug';

import { recordedDraw } from './recordedDraw';

import type { ChallongeMatch, ChallongeParticipant, ChallongeTournament } from './challongeSchema';
import type { StructuralMatch } from '@domain/formats/types';
import type { TransferData } from '@services/transfer/transfer';

export interface MapOptions {
  /** Teams already known, so the same club is not created twice. */
  existingTeams: readonly Team[];
  existingGames: readonly Game[];
  existingSlugs: readonly string[];
  timestamp: string;
  /**
   * When the tournament took place, for sources that do not say.
   *
   * A public Challonge bracket carries no date at all, so without this every
   * imported tournament would be dated the moment it was imported — and an
   * archive spanning years would collapse into a single day.
   */
  playedAt?: string | undefined;
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
  /*
   * Teams are found by any name they are known to have used, not just the
   * current one. A club that was renamed still played the older tournaments
   * under the old name, and matching only the current one would create a second
   * team for the same club — exactly what merging them was meant to undo.
   */
  const teams = new Map<string, Team>();
  for (const team of options.existingTeams) {
    for (const former of team.formerNames ?? []) teams.set(former.toLowerCase(), team);
    teams.set(team.name.toLowerCase(), team);
  }
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
   * A group phase arrives as a set of self-contained little tournaments. The
   * public bracket payload carries them; the API reports only that they exist,
   * and importing the bracket alone would produce a tournament that looks
   * complete and is missing its whole first phase.
   */
  if (source.group_stages_enabled === true && source.groups.length === 0) {
    return skip(
      {
        code: 'group_stages_missing',
        message:
          'This tournament has group stages, but the data does not include them. ' +
          'Use the public bracket page (challonge.com/<slug>.json) instead.',
      },
      'group stages',
    );
  }

  /*
   * A group phase and the bracket after it are separate little tournaments to
   * Challonge, each numbering its own participants. The same club therefore
   * appears under one identifier in its group and a different one in the
   * bracket, linked only by name — so names are what identity is built on here.
   */
  const preliminary = readPreliminaryPhase(source);
  if ('unsupported' in preliminary) {
    return skip(preliminary.unsupported, source.tournament_type);
  }

  const groupMembers = preliminary.members;
  const hasGroups = groupMembers.some((members) => members.length > 0);

  const entrants = hasGroups
    ? groupMembers.flat()
    : [...source.participants.map((entry) => entry.participant)].sort(bySeed);

  if (entrants.length < 2) {
    return skip(
      { code: 'too_few_participants', message: 'Fewer than two participants.' },
      source.tournament_type,
    );
  }

  const groupMatches = source.groups.flatMap((group) => group.matches.map((entry) => entry.match));
  const mainMatches = source.matches.map((entry) => entry.match);
  const matchFormat = inferMatchFormat([...groupMatches, ...mainMatches]);

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
  const byName = new Map<string, ParticipantId>();

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
    byName.set(key, participant.id);
    return participant;
  });

  // The bracket after a group phase numbers the same people differently.
  for (const entry of source.participants) {
    const entrant = entry.participant;
    const key = (entrant.name ?? entrant.display_name ?? '').trim().toLowerCase();
    const existing = byName.get(key);
    if (existing !== undefined) byChallongeId.set(entrant.id, existing);
  }

  const gameId = resolveGame(source.game_name ?? undefined, context);
  const tournamentId = asId<TournamentId>(options.newId());
  const slug = uniqueSlug(source.name, context.slugs);
  context.slugs.push(slug);

  const newRule = (rule: Omit<SeedingRule, 'id'>): SeedingRule => ({
    id: asId<SeedingRule['id']>(options.newId()),
    ...rule,
  });

  const stages: Stage[] = [];
  const matchesByStage: ChallongeMatch[][] = [];

  if (hasGroups) {
    const groupStageId = asId<StageId>(options.newId());
    let slot = 0;
    const groups = groupMembers.map((members) => members.map(() => (slot += 1)));
    const advance = preliminary.advance;

    stages.push({
      id: groupStageId,
      tournamentId,
      /*
       * Named for what it is. The fixtures of a play-in are pairings, and the
       * machinery that carries them is the group machinery — but calling the
       * phase a group stage would misdescribe the event.
       */
      name: preliminary.playIn ? 'Qualification' : 'Group Stage',
      order: 0,
      format: {
        kind: 'group_stage',
        groupCount: groups.length,
        // The draw is a fact here, not something to compute: these groups were
        // already played.
        distribution: 'manual',
        groups,
        perGroup: {
          legs: legsWithinGroups(groupMembers, groupMatches.length),
          pointSystem: DEFAULT_POINT_SYSTEM,
          tiebreakers: [...DEFAULT_TIEBREAKERS],
          matchFormat,
        },
      },
      entrySeeding: [
        newRule({
          source: { kind: 'participants' },
          targetSlots: { from: 1, to: participants.length },
          order: 'as_ranked',
        }),
      ],
      createdAt: options.timestamp,
      updatedAt: options.timestamp,
    });
    matchesByStage.push(groupMatches);

    const qualifiers = groups.length * advance;
    stages.push({
      id: asId<StageId>(options.newId()),
      tournamentId,
      name: stageNameFor(format.kind),
      order: 1,
      format,
      entrySeeding: [
        newRule({
          source: {
            kind: 'group_standings',
            stageId: groupStageId,
            placeRange: { from: 1, to: advance },
          },
          targetSlots: { from: 1, to: qualifiers },
          order: 'snake',
        }),
      ],
      createdAt: options.timestamp,
      updatedAt: options.timestamp,
    });
    matchesByStage.push(mainMatches);
  } else {
    stages.push({
      id: asId<StageId>(options.newId()),
      tournamentId,
      name: stageNameFor(format.kind),
      order: 0,
      format,
      entrySeeding: [
        newRule({
          source: { kind: 'participants' },
          targetSlots: { from: 1, to: participants.length },
          order: 'as_ranked',
        }),
      ],
      createdAt: options.timestamp,
      updatedAt: options.timestamp,
    });
    matchesByStage.push(mainMatches);
  }

  const tournament: Tournament = {
    id: tournamentId,
    name: source.name,
    slug,
    gameId,
    status: source.state === 'complete' ? 'completed' : 'live',
    participants,
    stageIds: stages.map((stage) => stage.id),
    createdAt: source.created_at ?? options.playedAt ?? options.timestamp,
    updatedAt: options.timestamp,
    ...(source.description ? { description: stripHtml(source.description) } : {}),
    ...((source.started_at ?? options.playedAt)
      ? { startsAt: source.started_at ?? options.playedAt ?? options.timestamp }
      : {}),
    ...(source.completed_at ? { endsAt: source.completed_at } : {}),
  };

  const allEntrants = new Map<string, string>();
  for (const entrant of [...entrants, ...source.participants.map((e) => e.participant)]) {
    allEntrants.set(entrant.id, entrant.name ?? entrant.display_name ?? entrant.id);
  }

  /*
   * The bracket's own entrants, in the order the source seeded them. Only useful
   * where a phase precedes it: without one, the bracket seeds straight from the
   * entry list and there is nothing to reconstruct.
   */
  const recordedOrder = hasGroups
    ? [...source.participants.map((entry) => entry.participant)]
        .sort(bySeed)
        .map((entrant) => byChallongeId.get(entrant.id))
        .filter((id): id is ParticipantId => id !== undefined)
    : [];

  /*
   * The line-up the finished draw itself implies. Independent of the numbers the
   * source attached to its entrants, and therefore the only reading that
   * survives a source that numbered them after the draw was made.
   */
  const drawLineUp = recordedDraw(mainMatches, byChallongeId);

  const attached = attachBestVariant({
    tournament,
    stages,
    byChallongeId,
    matchesByStage,
    entrants: allEntrants,
    options,
    notes,
    ...(recordedOrder.length > 0 ? { qualifierOrder: recordedOrder } : {}),
    ...(drawLineUp ? { drawLineUp } : {}),
  });

  if (hasGroups) {
    notes.push({
      code: preliminary.playIn ? 'play_in_imported' : 'group_stage_imported',
      message: preliminary.playIn
        ? `Imported as a qualifying round of ${String(groupMembers.length)} pairings feeding a bracket.`
        : `Imported as a group stage of ${String(groupMembers.length)} feeding a bracket.`,
      values: { groups: groupMembers.length },
    });
  }

  return {
    skipped: false,
    tournament,
    stages: attached.stages,
    matches: attached.matches,
    report: {
      source: label,
      name: source.name,
      /*
       * A play-in is reported by the bracket it feeds, with the note saying what
       * preceded it. Calling it a group stage would name the machinery rather
       * than the event.
       */
      format: hasGroups && !preliminary.playIn ? 'group_stage' : format.kind,
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
 * The shape of whatever phase precedes the main bracket.
 *
 * Challonge calls it a group stage, but a group is its own little tournament and
 * need not be a round robin. A knockout group with a single round is not a group
 * at all — it is a play-in: a set of pairings from which the winner goes
 * through. That is the same thing as one group per pairing with one qualifier
 * each, so it converts exactly, using the machinery groups already have.
 *
 * A knockout group over several rounds is a real bracket and is refused rather
 * than flattened into something it is not.
 */
function readPreliminaryPhase(
  source: ChallongeTournament,
):
  | { members: ChallongeParticipant[][]; advance: number; playIn: boolean }
  | { unsupported: ReportNote } {
  if (source.groups.length === 0) return { members: [], advance: 0, playIn: false };

  const knockout = source.groups.some((group) => (group.type ?? '').includes('elimination'));
  if (!knockout) {
    return {
      members: source.groups.map((group) =>
        [...group.participants.map((entry) => entry.participant)].sort(bySeed),
      ),
      advance: source.groups[0]?.advanceCount ?? 2,
      playIn: false,
    };
  }

  const pairs: ChallongeParticipant[][] = [];

  for (const group of source.groups) {
    const byId = new Map(
      group.participants.map((entry) => [entry.participant.id, entry.participant]),
    );
    const rounds = new Set(group.matches.map((entry) => entry.match.round ?? 1));

    if (rounds.size > 1) {
      return {
        unsupported: {
          code: 'qualifying_bracket',
          message:
            'The qualifying phase is a bracket of several rounds, which cannot be ' +
            'represented yet.',
        },
      };
    }

    for (const entry of group.matches) {
      const a = byId.get(entry.match.player1_id ?? '');
      const b = byId.get(entry.match.player2_id ?? '');
      if (a && b) pairs.push([a, b]);
    }
  }

  // Each pairing sends exactly one participant on.
  return { members: pairs, advance: 1, playIn: true };
}

const bySeed = (a: { seed?: number | undefined }, b: { seed?: number | undefined }): number =>
  (a.seed ?? Number.MAX_SAFE_INTEGER) - (b.seed ?? Number.MAX_SAFE_INTEGER);

/**
 * Whether the groups were played once through or twice.
 *
 * A group of n plays n(n-1)/2 fixtures in a single round. Twice that many means
 * home and away, which is a difference the table depends on.
 */
function legsWithinGroups(
  groupMembers: readonly (readonly unknown[])[],
  matchCount: number,
): 1 | 2 {
  const single = groupMembers.reduce(
    (sum, members) => sum + (members.length * (members.length - 1)) / 2,
    0,
  );
  return single > 0 && matchCount >= single * 2 ? 2 : 1;
}

/**
 * Places results, trying every arrangement the source might have used.
 *
 * How a bracket is drawn decides who meets whom, so results played under one
 * arrangement have nowhere to sit in a bracket drawn under another. Rather than
 * assume, and since placement is a pure function, each candidate is tried and
 * whichever accounts for more of the recorded history is kept.
 */
function attachBestVariant(input: {
  tournament: Tournament;
  stages: readonly Stage[];
  byChallongeId: Map<string, ParticipantId>;
  matchesByStage: readonly (readonly ChallongeMatch[])[];
  entrants: Map<string, string>;
  options: MapOptions;
  notes: ReportNote[];
  /** The order the source itself put the qualifiers in, if it recorded one. */
  qualifierOrder?: ParticipantId[];
  /** The line-up read off the recorded draw, if it describes a complete one. */
  drawLineUp?: ParticipantId[];
}): Attached & { stages: Stage[] } {
  const { stages, notes, qualifierOrder, drawLineUp, options } = input;

  const candidates = variantsOf(stages, { qualifierOrder, drawLineUp }, options.newId);
  const attempts = candidates.map((candidate) => ({
    candidate,
    result: attachResults({ ...input, stages: candidate.stages }),
  }));

  const best = attempts.reduce((winner, entry) =>
    entry.result.placed > winner.result.placed ? entry : winner,
  );

  const order = best.candidate.dropOrder;
  if (order !== undefined && order !== 'balanced') {
    notes.push({
      code: 'loser_bracket_order',
      message:
        `Loser bracket drawn with the "${order}" drop order to match the source; ` +
        'it allows rematches the default arrangement avoids.',
      values: { order },
    });
  }

  if (best.candidate.seedingOrder === 'as_ranked') {
    notes.push({
      code: 'playoff_seeding',
      message: 'Qualifiers enter the bracket in ranked order, as the source had them.',
    });
  }

  if (best.candidate.lineUp === 'seeds') {
    notes.push({
      code: 'playoff_seeding_recorded',
      message:
        'The bracket keeps the line-up the source recorded rather than deriving it ' +
        'from the qualifying tables.',
    });
  }

  if (best.candidate.lineUp === 'draw') {
    notes.push({
      code: 'playoff_seeding_drawn',
      message: 'The bracket reproduces the draw the source published, position by position.',
    });
  }

  return { ...best.result, stages: best.candidate.stages };
}

interface Variant {
  stages: Stage[];
  dropOrder?: DoubleEliminationConfig['loserBracketSeeding'];
  seedingOrder?: SeedingRule['order'];
  /** Where a fixed line-up came from: the entrant numbers, or the draw itself. */
  lineUp?: LineUpSource;
}

type LineUpSource = 'seeds' | 'draw';

/**
 * The arrangements worth trying for a given set of stages.
 *
 * Only the choices that actually change which pairing a result belongs to: the
 * loser bracket drop order, and — where a bracket is fed by group tables — the
 * order the qualifiers enter it in.
 */
function variantsOf(
  stages: readonly Stage[],
  lineUps: {
    qualifierOrder?: ParticipantId[] | undefined;
    drawLineUp?: ParticipantId[] | undefined;
  },
  newId: () => string,
): Variant[] {
  const last = stages.at(-1);
  const bracket = last?.format;

  const dropOrders: (DoubleEliminationConfig['loserBracketSeeding'] | undefined)[] =
    bracket?.kind === 'double_elimination'
      ? ['balanced', 'alternating', 'reversed', 'standard']
      : [undefined];

  const fedByGroups =
    last?.entrySeeding.some((rule) => rule.source.kind === 'group_standings') === true;
  const seedingOrders: (SeedingRule['order'] | undefined)[] = fedByGroups
    ? ['snake', 'as_ranked']
    : [undefined];

  const variants: Variant[] = [];

  for (const dropOrder of dropOrders) {
    for (const seedingOrder of seedingOrders) {
      const next = stages.map((stage, index) => {
        if (index !== stages.length - 1) return stage;

        const format =
          dropOrder !== undefined && stage.format.kind === 'double_elimination'
            ? { ...stage.format, loserBracketSeeding: dropOrder }
            : stage.format;

        const entrySeeding =
          seedingOrder === undefined
            ? stage.entrySeeding
            : stage.entrySeeding.map((rule) =>
                rule.source.kind === 'group_standings' ? { ...rule, order: seedingOrder } : rule,
              );

        return { ...stage, format, entrySeeding };
      });

      variants.push({
        stages: next,
        ...(dropOrder !== undefined ? { dropOrder } : {}),
        ...(seedingOrder !== undefined ? { seedingOrder } : {}),
      });
    }
  }

  /*
   * Who entered the bracket in which position can be a recorded fact rather than
   * a derivation. Where a source re-seeded its qualifiers by hand, no ordering
   * rule reproduces it, and the line-up it wrote down is the only truth
   * available.
   *
   * Two readings of "wrote down" are worth trying, because a source that
   * numbers its entrants only after the draw has been made contradicts the
   * first: the numbers themselves, and the positions the published draw put
   * them in.
   */
  const fixed: [LineUpSource, ParticipantId[] | undefined][] = [
    ['seeds', lineUps.qualifierOrder],
    ['draw', lineUps.drawLineUp],
  ];

  const bases = [...variants];

  for (const [lineUp, ids] of fixed) {
    if (ids === undefined || ids.length === 0 || stages.length === 0) continue;

    for (const base of bases) {
      const withManual = base.stages.map((stage, index) =>
        index === base.stages.length - 1
          ? {
              ...stage,
              entrySeeding: [
                {
                  id: asId<SeedingRule['id']>(newId()),
                  source: { kind: 'manual' as const, participantIds: [...ids] },
                  targetSlots: { from: 1, to: ids.length },
                  order: 'as_ranked' as const,
                },
              ],
            }
          : stage,
      );

      variants.push({ ...base, stages: withManual, lineUp });
    }
  }

  return variants;
}

interface Attached {
  matches: Match[];
  placed: number;
  unplaced: UnplacedResult[];
  contested: ContestedResult[];
  open: number;
  fixtures: number;
}

/**
 * Walks the recorded results onto the derived structure.
 *
 * Derive, find the fixtures whose participants are now known, look for a source
 * result between exactly those two, record it, derive again. Progression does
 * the addressing, so the import never depends on the source's own numbering.
 *
 * Results are pooled per stage rather than globally. Two teams can meet in a
 * group and again in the bracket that follows, and a playoff result consumed by
 * a group fixture would put the right score on the wrong occasion.
 */
function attachResults(input: {
  tournament: Tournament;
  stages: readonly Stage[];
  byChallongeId: Map<string, ParticipantId>;
  matchesByStage: readonly (readonly ChallongeMatch[])[];
  entrants: Map<string, string>;
  options: MapOptions;
}): Attached {
  const { tournament, stages, byChallongeId, matchesByStage, entrants, options } = input;

  const unplaced: UnplacedResult[] = [];
  const contested: ContestedResult[] = [];

  const describe = (match: ChallongeMatch): UnplacedResult => ({
    challongeMatchId: match.id,
    player1: entrants.get(match.player1_id ?? '') ?? '?',
    player2: entrants.get(match.player2_id ?? '') ?? '?',
    score: match.scores_csv ?? '',
  });

  const pools = matchesByStage.map((forStage) => {
    const pool = new Map<string, ChallongeMatch[]>();

    for (const match of decidedMatches(forStage)) {
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

    return pool;
  });

  const matches: Match[] = [];
  const taken = new Set<MatchId>();
  const passes = matchesByStage.reduce((sum, forStage) => sum + forStage.length, 0) + 8;

  for (let pass = 0; pass < passes; pass += 1) {
    const state = deriveTournamentState({ tournament, stages: [...stages], matches });
    let progressed = false;

    for (const [stageIndex, derived] of state.stages.entries()) {
      const pool = pools[stageIndex];
      if (!pool) continue;

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
            stageId: derived.stage.id,
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

  for (const pool of pools) {
    for (const queue of pool.values()) {
      for (const leftover of queue) unplaced.push(describe(leftover));
    }
  }

  const final = deriveTournamentState({ tournament, stages: [...stages], matches });
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

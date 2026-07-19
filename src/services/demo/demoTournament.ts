import { makeMatchId } from '@domain/matchId';
import {
  asId,
  now,
  type GameId,
  type Match,
  type MatchId,
  type MatchOutcome,
  type Participant,
  type ParticipantId,
  type SeedingRule,
  type SeedingRuleId,
  type Stage,
  type StageId,
  type Team,
  type TeamId,
  type Tournament,
  type TournamentId,
} from '@models/index';

/**
 * Seed data for trying the application out.
 *
 * All names are invented. No real team, organisation or game title appears here,
 * and no third-party logo ships with the repository — demo content must not
 * borrow someone else's trademarks.
 *
 * Thirteen participants on purpose: that is not a power of two, so the bracket
 * pads to sixteen and the top three seeds receive byes. It exercises the case
 * most bracket software gets wrong.
 */
const TEAM_NAMES: readonly (readonly [string, string, string])[] = [
  ['Nova Collective', 'NOV', 'EU'],
  ['Iron Meridian', 'IRM', 'NA'],
  ['Solstice Nine', 'SN9', 'EU'],
  ['Pale Horizon', 'PHZ', 'APAC'],
  ['Verdant Order', 'VRD', 'EU'],
  ['Cobalt Drift', 'CBD', 'NA'],
  ['Ashen Vanguard', 'ASH', 'SA'],
  ['Quiet Static', 'QST', 'EU'],
  ['Halcyon Rift', 'HAL', 'APAC'],
  ['Umbra Syndicate', 'UMB', 'NA'],
  ['Ferrous Crown', 'FER', 'EU'],
  ['Tidal Reverie', 'TDR', 'APAC'],
  ['Lantern Bearers', 'LTB', 'SA'],
];

const PREFIX = 'demo';

/** Fixed identifiers, so seeding twice replaces the demo rather than duplicating it. */
const DEMO_TOURNAMENT_ID = asId<TournamentId>(`${PREFIX}-tournament`);
const DEMO_STAGE_ID = asId<StageId>(`${PREFIX}-stage-main`);
const DEMO_GAME_ID = asId<GameId>(`${PREFIX}-game`);

export interface DemoData {
  teams: Team[];
  tournament: Tournament;
  stages: Stage[];
  matches: Match[];
}

/**
 * Builds the demo tournament with a partially played bracket.
 *
 * Results stop after the quarterfinals, so the bracket shows every match state
 * at once: decided, ready to play, and still waiting on an opponent.
 */
export function buildDemoTournament(): DemoData {
  const timestamp = now();

  const teams: Team[] = TEAM_NAMES.map(([name, tag, region], i) => ({
    id: asId<TeamId>(`${PREFIX}-team-${String(i + 1)}`),
    name,
    tag,
    region,
    socials: [],
    archived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));

  const participants: Participant[] = teams.map((team, i) => ({
    id: asId<ParticipantId>(`${PREFIX}-participant-${String(i + 1)}`),
    teamId: team.id,
    seed: i + 1,
    status: 'active',
  }));

  const seedingRule: SeedingRule = {
    id: asId<SeedingRuleId>(`${PREFIX}-seeding`),
    source: { kind: 'participants' },
    targetSlots: { from: 1, to: teams.length },
    order: 'as_ranked',
  };

  const stage: Stage = {
    id: DEMO_STAGE_ID,
    tournamentId: DEMO_TOURNAMENT_ID,
    name: 'Main Bracket',
    order: 0,
    format: {
      kind: 'single_elimination',
      thirdPlaceMatch: true,
      byePlacement: 'seeded',
      matchFormats: {
        default: { kind: 'bo', games: 3 },
        // The final deserves a longer series.
        byRound: { 3: { kind: 'bo', games: 5 } },
      },
    },
    entrySeeding: [seedingRule],
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const tournament: Tournament = {
    id: DEMO_TOURNAMENT_ID,
    name: 'Meridian Invitational',
    slug: 'meridian-invitational',
    description:
      'Beispielturnier mit 13 Teams. Die ungerade Teilnehmerzahl erzeugt drei Freilose für die stärksten Seeds.',
    gameId: DEMO_GAME_ID,
    organizer: 'TournaCore',
    status: 'live',
    participants,
    stageIds: [DEMO_STAGE_ID],
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  return { teams, tournament, stages: [stage], matches: buildResults(timestamp) };
}

/**
 * Results for the first two rounds.
 *
 * Only played matches are stored. Byes and everything still open produce no
 * records at all — the bracket for those is derived, not saved.
 */
function buildResults(timestamp: string): Match[] {
  const decided: [round: number, index: number, winner: 'A' | 'B'][] = [
    /*
     * Five real first-round matches. Indices 0, 4 and 7 are byes and therefore
     * carry no result: with 13 of 16 slots filled, the standard seeding order
     * puts the empty slots exactly there.
     */
    [0, 1, 'A'],
    [0, 2, 'B'],
    [0, 3, 'A'],
    [0, 5, 'B'],
    [0, 6, 'A'],
    // Quarterfinals.
    [1, 0, 'A'],
    [1, 1, 'B'],
    [1, 2, 'A'],
    [1, 3, 'A'],
  ];

  return decided.map(([round, indexInRound, winner]) =>
    demoMatch(round, indexInRound, winner, timestamp),
  );
}

function demoMatch(
  round: number,
  indexInRound: number,
  winner: 'A' | 'B',
  timestamp: string,
): Match {
  const position = { bracket: 'winner' as const, round, indexInRound };
  const id: MatchId = makeMatchId(DEMO_STAGE_ID, position);

  const outcome: MatchOutcome = { winner, reason: 'played', decidedAt: timestamp };
  const winsA = winner === 'A' ? 2 : 1;
  const winsB = winner === 'A' ? 1 : 2;

  return {
    id,
    tournamentId: DEMO_TOURNAMENT_ID,
    stageId: DEMO_STAGE_ID,
    position,
    // Structural slots are regenerated on derivation; stored values are not read.
    slotA: { kind: 'tbd' },
    slotB: { kind: 'tbd' },
    format: { kind: 'bo', games: 3 },
    games: buildGames(winsA, winsB),
    outcome,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function buildGames(winsA: number, winsB: number): Match['games'] {
  const games: Match['games'] = [];
  let index = 1;

  for (let i = 0; i < winsA; i += 1) {
    games.push({
      id: asId<Match['games'][number]['id']>(`${PREFIX}-game-${String(index)}-a`),
      index,
      scoreA: 13,
      scoreB: 8,
      winner: 'A',
    });
    index += 1;
  }
  for (let i = 0; i < winsB; i += 1) {
    games.push({
      id: asId<Match['games'][number]['id']>(`${PREFIX}-game-${String(index)}-b`),
      index,
      scoreA: 7,
      scoreB: 13,
      winner: 'B',
    });
    index += 1;
  }

  return games;
}

export { DEMO_TOURNAMENT_ID, DEMO_STAGE_ID };

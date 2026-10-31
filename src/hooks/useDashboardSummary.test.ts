import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_POINT_SYSTEM,
  DEFAULT_TIEBREAKERS,
  asId,
  now,
  type Match,
  type Participant,
  type SeedingRule,
  type Stage,
  type StageId,
  type Team,
  type TeamId,
  type Tournament,
  type TournamentId,
  type TournamentStatus,
} from '@models/index';
import { useDataStore } from '@store/slices/dataSlice';

import { useDashboardSummary } from './useDashboardSummary';

const STAGE = asId<StageId>('s1');

function team(id: string, archived = false): Team {
  return {
    id: asId<TeamId>(id),
    name: id,
    tag: id.toUpperCase(),
    socials: [],
    archived,
    createdAt: now(),
    updatedAt: now(),
  };
}

function tournament(options: { id: string; status: TournamentStatus; entrants: number }): {
  tournament: Tournament;
  stage: Stage;
} {
  const id = asId<TournamentId>(options.id);
  const participants: Participant[] = Array.from({ length: options.entrants }, (_, i) => ({
    id: asId<Participant['id']>(`${options.id}-p${String(i + 1)}`),
    teamId: asId<TeamId>(`t${String(i + 1)}`),
    seed: i + 1,
    status: 'active' as const,
  }));

  const stage: Stage = {
    id: asId<StageId>(`${options.id}-${STAGE}`),
    tournamentId: id,
    name: 'League',
    order: 0,
    format: {
      kind: 'round_robin',
      legs: 1,
      pointSystem: DEFAULT_POINT_SYSTEM,
      tiebreakers: [...DEFAULT_TIEBREAKERS],
      matchFormat: { kind: 'bo', games: 1 },
    },
    entrySeeding: [
      {
        id: asId<SeedingRule['id']>(`${options.id}-rule`),
        source: { kind: 'participants' },
        targetSlots: { from: 1, to: Math.max(options.entrants, 1) },
        order: 'as_ranked',
      },
    ],
    createdAt: now(),
    updatedAt: now(),
  };

  return {
    tournament: {
      id,
      name: options.id,
      slug: options.id,
      gameId: asId<Tournament['gameId']>('g1'),
      status: options.status,
      participants,
      stageIds: [stage.id],
      createdAt: now(),
      updatedAt: now(),
    },
    stage,
  };
}

/** Puts the store in a known state without touching storage. */
function given(input: {
  tournaments?: { tournament: Tournament; stage: Stage }[];
  teams?: Team[];
  matches?: Match[];
}): void {
  act(() => {
    useDataStore.setState({
      hydrated: true,
      teams: Object.fromEntries((input.teams ?? []).map((entry) => [entry.id, entry])),
      tournaments: Object.fromEntries(
        (input.tournaments ?? []).map(({ tournament: entry }) => [entry.id, entry]),
      ),
      stages: Object.fromEntries((input.tournaments ?? []).map(({ stage }) => [stage.id, stage])),
      matches: Object.fromEntries((input.matches ?? []).map((entry) => [entry.id, entry])),
    });
  });
}

const summary = () => renderHook(() => useDashboardSummary()).result.current;

beforeEach(() => {
  useDataStore.setState({ hydrated: false, tournaments: {}, stages: {}, matches: {}, teams: {} });
});

describe('useDashboardSummary', () => {
  it('counts nothing on an empty archive', () => {
    given({});
    expect(summary()).toEqual({
      activeTournaments: 0,
      registeredTeams: 0,
      upcomingMatches: 0,
    });
  });

  it('counts the teams that are still in the archive', () => {
    given({ teams: [team('t1'), team('t2'), team('t3', true)] });
    expect(summary().registeredTeams).toBe(2);
  });

  it('counts tournaments taking entries and tournaments being played', () => {
    given({
      tournaments: [
        tournament({ id: 'a', status: 'live', entrants: 4 }),
        tournament({ id: 'b', status: 'registration', entrants: 0 }),
        tournament({ id: 'c', status: 'completed', entrants: 4 }),
        tournament({ id: 'd', status: 'draft', entrants: 4 }),
      ],
    });

    expect(summary().activeTournaments).toBe(2);
  });

  /**
   * A tournament taking entries has no fixtures yet, and an empty schedule
   * satisfies "every match decided" without anybody playing. It is the clearest
   * case of a figure that would otherwise read zero on a busy archive.
   */
  it('keeps a tournament that has not been drawn among the active ones', () => {
    given({ tournaments: [tournament({ id: 'a', status: 'registration', entrants: 0 })] });

    expect(summary().activeTournaments).toBe(1);
    expect(summary().upcomingMatches).toBe(0);
  });

  it('counts the fixtures that could be played right now', () => {
    given({ tournaments: [tournament({ id: 'a', status: 'live', entrants: 4 })] });

    // Four entrants, single round: six fixtures, none of them played.
    expect(summary().upcomingMatches).toBe(6);
  });

  it('stops counting a fixture once it has a result', () => {
    const entry = tournament({ id: 'a', status: 'live', entrants: 4 });

    given({ tournaments: [entry] });
    const open = summary().upcomingMatches;

    given({
      tournaments: [entry],
      matches: [
        {
          id: asId<Match['id']>(`${entry.stage.id}/main/r0/m0`),
          tournamentId: entry.tournament.id,
          stageId: entry.stage.id,
          position: { round: 0, indexInRound: 0 },
          slotA: { kind: 'tbd' },
          slotB: { kind: 'tbd' },
          format: { kind: 'bo', games: 1 },
          games: [],
          outcome: { winner: 'A', reason: 'played', decidedAt: '2026-01-01T00:00:00.000Z' },
          createdAt: now(),
          updatedAt: now(),
        },
      ],
    });

    expect(summary().upcomingMatches).toBe(open - 1);
  });

  /** Played to the end but never marked so: history, not something going on. */
  it('drops a tournament whose last stage is finished', () => {
    const entry = tournament({ id: 'a', status: 'live', entrants: 2 });
    given({ tournaments: [entry] });
    expect(summary().activeTournaments).toBe(1);

    given({
      tournaments: [entry],
      matches: [
        {
          id: asId<Match['id']>(`${entry.stage.id}/main/r0/m0`),
          tournamentId: entry.tournament.id,
          stageId: entry.stage.id,
          position: { round: 0, indexInRound: 0 },
          slotA: { kind: 'tbd' },
          slotB: { kind: 'tbd' },
          format: { kind: 'bo', games: 1 },
          games: [],
          outcome: { winner: 'A', reason: 'played', decidedAt: '2026-01-01T00:00:00.000Z' },
          createdAt: now(),
          updatedAt: now(),
        },
      ],
    });

    expect(summary().activeTournaments).toBe(0);
  });
});

import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { deriveTournamentState } from '@domain/derive';
import { makeMatchId } from '@domain/matchId';
import {
  newStageId,
  newTeamId,
  newTournamentId,
  now,
  type Match,
  type MatchOutcome,
  type Participant,
  type Stage,
  type Team,
  type Tournament,
  asId,
  type GameId,
  type ParticipantId,
  type SeedingRule,
} from '@models/index';

import { TournaCoreDatabase, setDatabase } from './database';

import { matchRepository, stageRepository, teamRepository, tournamentRepository } from './index';

let database: TournaCoreDatabase;
let counter = 0;

beforeEach(async () => {
  // A fresh database per test, so cases cannot leak state into one another.
  counter += 1;
  database = new TournaCoreDatabase(`tournacore-test-${String(counter)}`);
  setDatabase(database);
  await database.open();
});

afterEach(async () => {
  await database.delete();
  setDatabase(undefined);
});

function team(name: string): Team {
  return {
    id: newTeamId(),
    name,
    tag: name.slice(0, 3).toUpperCase(),
    socials: [],
    archived: false,
    createdAt: now(),
    updatedAt: now(),
  };
}

describe('repositories', () => {
  it('round-trips an entity', async () => {
    const entity = team('Nova Esports');
    await teamRepository.put(entity);

    expect(await teamRepository.getById(entity.id)).toEqual(entity);
  });

  it('returns undefined for an unknown id', async () => {
    expect(await teamRepository.getById(newTeamId())).toBeUndefined();
  });

  it('replaces on put rather than duplicating', async () => {
    const entity = team('Nova Esports');
    await teamRepository.put(entity);
    await teamRepository.put({ ...entity, name: 'Nova' });

    const all = await teamRepository.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.name).toBe('Nova');
  });

  it('stores many at once', async () => {
    await teamRepository.putMany([team('Alpha'), team('Beta'), team('Gamma')]);
    expect(await teamRepository.getAll()).toHaveLength(3);
  });

  it('accepts an empty bulk write', async () => {
    await teamRepository.putMany([]);
    expect(await teamRepository.getAll()).toHaveLength(0);
  });

  it('removes and clears', async () => {
    const entity = team('Alpha');
    await teamRepository.putMany([entity, team('Beta')]);

    await teamRepository.remove(entity.id);
    expect(await teamRepository.getAll()).toHaveLength(1);

    await teamRepository.clear();
    expect(await teamRepository.getAll()).toHaveLength(0);
  });

  it('queries by a declared index', async () => {
    const tournamentId = newTournamentId();
    const stageId = newStageId();

    await stageRepository.putMany([
      stubStage(stageId, tournamentId, 0),
      stubStage(newStageId(), newTournamentId(), 0),
    ]);

    const found = await stageRepository.getBy('tournamentId', tournamentId);
    expect(found).toHaveLength(1);
    expect(found[0]?.id).toBe(stageId);
  });

  it('rejects a duplicate tournament slug', async () => {
    const first = stubTournament(newTournamentId(), []);
    const second = { ...stubTournament(newTournamentId(), []), slug: first.slug };

    await tournamentRepository.put(first);

    // The slug is a unique index: two tournaments sharing one would make the
    // URL ambiguous.
    await expect(tournamentRepository.put(second)).rejects.toThrow();
  });
});

/**
 * The behaviour that matters most: results survive a reload, and the bracket is
 * rebuilt from them rather than restored from storage.
 */
describe('persistence and derivation together', () => {
  it('rebuilds a bracket from stored results after a reload', async () => {
    const tournamentId = newTournamentId();
    const stageId = newStageId();

    const participants: Participant[] = Array.from({ length: 4 }, (_, i) => ({
      id: asId<ParticipantId>(`p${String(i + 1)}`),
      teamId: newTeamId(),
      seed: i + 1,
      status: 'active',
    }));

    const tournament: Tournament = { ...stubTournament(tournamentId, [stageId]), participants };
    const stage = stubStage(stageId, tournamentId, 0);

    const firstRound = makeMatchId(stageId, { bracket: 'winner', round: 0, indexInRound: 0 });
    const played: MatchOutcome = {
      winner: 'B',
      reason: 'played',
      decidedAt: '2026-01-01T00:00:00.000Z',
    };

    await tournamentRepository.put(tournament);
    await stageRepository.put(stage);
    await matchRepository.put(stubMatch(firstRound, tournamentId, stageId, 0, 0, played));

    // Simulate a reload: everything is read back from storage.
    const [storedTournament, storedStages, storedMatches] = await Promise.all([
      tournamentRepository.getById(tournamentId),
      stageRepository.getBy('tournamentId', tournamentId),
      matchRepository.getBy('tournamentId', tournamentId),
    ]);

    expect(storedTournament).toBeDefined();

    const state = deriveTournamentState({
      tournament: storedTournament!,
      stages: storedStages,
      matches: storedMatches,
    });

    // Seeding for four is [1, 4, 3, 2]; side B of the first match is p4, and B won.
    const semifinalWinner = state.byStageId.get(stageId)?.resolved.matches[0]?.winnerId;
    expect(semifinalWinner).toBe('p4');

    // The bracket itself was never stored — only this one result was.
    expect(storedMatches).toHaveLength(1);
    expect(state.byStageId.get(stageId)?.resolved.matches).toHaveLength(3);
  });

  it('reflects a corrected result on the next read', async () => {
    const tournamentId = newTournamentId();
    const stageId = newStageId();
    const participants: Participant[] = Array.from({ length: 4 }, (_, i) => ({
      id: asId<ParticipantId>(`p${String(i + 1)}`),
      teamId: newTeamId(),
      seed: i + 1,
      status: 'active',
    }));

    await tournamentRepository.put({
      ...stubTournament(tournamentId, [stageId]),
      participants,
    });
    await stageRepository.put(stubStage(stageId, tournamentId, 0));

    const matchId = makeMatchId(stageId, { bracket: 'winner', round: 0, indexInRound: 0 });
    const stored = stubMatch(matchId, tournamentId, stageId, 0, 0, {
      winner: 'A',
      reason: 'played',
      decidedAt: '2026-01-01T00:00:00.000Z',
    });
    await matchRepository.put(stored);

    const read = async () => {
      const tournament = await tournamentRepository.getById(tournamentId);
      const stages = await stageRepository.getBy('tournamentId', tournamentId);
      const matches = await matchRepository.getBy('tournamentId', tournamentId);
      return deriveTournamentState({ tournament: tournament!, stages, matches });
    };

    expect((await read()).byStageId.get(stageId)?.resolved.matches[0]?.winnerId).toBe('p1');

    // Correct the result. Nothing else in storage is touched.
    await matchRepository.put({
      ...stored,
      outcome: { winner: 'B', reason: 'manual', decidedAt: '2026-01-02T00:00:00.000Z' },
    });

    const after = await read();
    expect(after.byStageId.get(stageId)?.resolved.matches[0]?.winnerId).toBe('p4');
    // The semifinal that consumes this winner followed along.
    expect(after.byStageId.get(stageId)?.resolved.matches.at(-1)?.slotA).toEqual({
      kind: 'participant',
      participantId: 'p4',
    });
  });
});

// --- fixtures ---------------------------------------------------------------

function stubTournament(id: Tournament['id'], stageIds: Stage['id'][]): Tournament {
  return {
    id,
    name: 'Test Cup',
    slug: `cup-${id}`,
    gameId: asId<GameId>('game-1'),
    status: 'live',
    participants: [],
    stageIds,
    createdAt: now(),
    updatedAt: now(),
  };
}

function stubStage(id: Stage['id'], tournamentId: Tournament['id'], order: number): Stage {
  return {
    id,
    tournamentId,
    name: 'Bracket',
    order,
    format: {
      kind: 'single_elimination',
      thirdPlaceMatch: false,
      byePlacement: 'seeded',
      matchFormats: { default: { kind: 'bo', games: 3 } },
    },
    entrySeeding: [
      {
        id: asId<SeedingRule['id']>('rule-1'),
        source: { kind: 'participants' },
        targetSlots: { from: 1, to: 4 },
        order: 'as_ranked',
      },
    ],
    createdAt: now(),
    updatedAt: now(),
  };
}

function stubMatch(
  id: Match['id'],
  tournamentId: Tournament['id'],
  stageId: Stage['id'],
  round: number,
  indexInRound: number,
  outcome?: MatchOutcome,
): Match {
  return {
    id,
    tournamentId,
    stageId,
    position: { bracket: 'winner', round, indexInRound },
    slotA: { kind: 'tbd' },
    slotB: { kind: 'tbd' },
    format: { kind: 'bo', games: 3 },
    games: [],
    createdAt: now(),
    updatedAt: now(),
    ...(outcome ? { outcome } : {}),
  };
}

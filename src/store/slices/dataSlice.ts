import { create } from 'zustand';

import {
  now,
  type Game,
  type GameId,
  type Match,
  type MatchId,
  type Stage,
  type StageId,
  type Team,
  type TeamId,
  type Tournament,
  type TournamentId,
} from '@models/index';
import {
  gameRepository,
  matchRepository,
  stageRepository,
  teamRepository,
  tournamentRepository,
  PRE_IMPORT_BACKUP_KEY,
  db,
  writeMeta,
} from '@services/db';

import type { AssembledTournament } from '@services/tournament/assembleTournament';
import type { ImportMode, TransferData } from '@services/transfer/transfer';

type ById<TId extends string, TEntity> = Record<TId, TEntity>;

export interface DataState {
  games: ById<GameId, Game>;
  teams: ById<TeamId, Team>;
  tournaments: ById<TournamentId, Tournament>;
  stages: ById<StageId, Stage>;
  matches: ById<MatchId, Match>;

  /** False until the initial load from storage has finished. */
  hydrated: boolean;
  /** Set when loading or persisting failed, so the UI can surface it. */
  error: string | null;

  hydrate: () => Promise<void>;

  saveGame: (game: Game) => Promise<void>;
  saveTeam: (team: Team) => Promise<void>;
  saveTournament: (tournament: Tournament) => Promise<void>;
  saveStage: (stage: Stage) => Promise<void>;
  saveMatch: (match: Match) => Promise<void>;
  saveMatches: (matches: readonly Match[]) => Promise<void>;

  /** Persists a freshly assembled tournament together with its new teams and game. */
  createTournament: (assembled: AssembledTournament) => Promise<void>;

  /** Everything currently held, for export. */
  snapshot: () => TransferData;
  /** Replaces or merges stored data with an imported set. */
  applyImport: (data: TransferData, mode: ImportMode) => Promise<void>;

  removeTournament: (id: TournamentId) => Promise<void>;
  /** Archives rather than deletes, to keep match history intact. */
  archiveTeam: (id: TeamId) => Promise<void>;
}

function index<TId extends string, TEntity extends { id: TId }>(
  entities: readonly TEntity[],
): ById<TId, TEntity> {
  const result = {} as ById<TId, TEntity>;
  for (const entity of entities) result[entity.id] = entity;
  return result;
}

/** Returns a copy without the given keys. Avoids mutating store state in place. */
function omit<TId extends string, TEntity>(
  record: ById<TId, TEntity>,
  ids: readonly TId[],
): ById<TId, TEntity> {
  const drop = new Set<string>(ids);
  return Object.fromEntries(Object.entries(record).filter(([key]) => !drop.has(key))) as ById<
    TId,
    TEntity
  >;
}

/**
 * Normalised store of everything persisted.
 *
 * Holds facts only. Brackets, standings and statistics are not in here and never
 * will be: they are derived from these records on read, which is what keeps a
 * corrected result from leaving stale data behind.
 *
 * Writes go to storage first and update the store afterwards. The opposite order
 * would show the user a saved state that might not have survived a quota error,
 * and with no server-side backup a silently lost write is unrecoverable.
 */
export const useDataStore = create<DataState>()((set, get) => {
  /** Runs a persisting action and records failures instead of throwing at the UI. */
  const guard = async (action: () => Promise<void>): Promise<void> => {
    try {
      await action();
      if (get().error !== null) set({ error: null });
    } catch (cause) {
      set({ error: cause instanceof Error ? cause.message : String(cause) });
      throw cause;
    }
  };

  return {
    games: {},
    teams: {},
    tournaments: {},
    stages: {},
    matches: {},
    hydrated: false,
    error: null,

    hydrate: async () => {
      await guard(async () => {
        const [games, teams, tournaments, stages, matches] = await Promise.all([
          gameRepository.getAll(),
          teamRepository.getAll(),
          tournamentRepository.getAll(),
          stageRepository.getAll(),
          matchRepository.getAll(),
        ]);

        set({
          games: index(games),
          teams: index(teams),
          tournaments: index(tournaments),
          stages: index(stages),
          matches: index(matches),
          hydrated: true,
        });
      });
    },

    saveGame: async (game) => {
      await guard(async () => {
        const next = { ...game, updatedAt: now() };
        await gameRepository.put(next);
        set((state) => ({ games: { ...state.games, [next.id]: next } }));
      });
    },

    saveTeam: async (team) => {
      await guard(async () => {
        const next = { ...team, updatedAt: now() };
        await teamRepository.put(next);
        set((state) => ({ teams: { ...state.teams, [next.id]: next } }));
      });
    },

    saveTournament: async (tournament) => {
      await guard(async () => {
        const next = { ...tournament, updatedAt: now() };
        await tournamentRepository.put(next);
        set((state) => ({ tournaments: { ...state.tournaments, [next.id]: next } }));
      });
    },

    saveStage: async (stage) => {
      await guard(async () => {
        const next = { ...stage, updatedAt: now() };
        await stageRepository.put(next);
        set((state) => ({ stages: { ...state.stages, [next.id]: next } }));
      });
    },

    saveMatch: async (match) => {
      await guard(async () => {
        const next = { ...match, updatedAt: now() };
        await matchRepository.put(next);
        set((state) => ({ matches: { ...state.matches, [next.id]: next } }));
      });
    },

    saveMatches: async (matches) => {
      await guard(async () => {
        const timestamp = now();
        const next = matches.map((match) => ({ ...match, updatedAt: timestamp }));
        await matchRepository.putMany(next);
        set((state) => ({ matches: { ...state.matches, ...index(next) } }));
      });
    },

    createTournament: async (assembled) => {
      await guard(async () => {
        // Order matters: teams and the game are referenced by the tournament,
        // and the stage is referenced by the tournament's stageIds. Dependencies
        // are written before the records that point at them.
        if (assembled.newGame) await gameRepository.put(assembled.newGame);
        if (assembled.newTeams.length > 0) await teamRepository.putMany(assembled.newTeams);
        await tournamentRepository.put(assembled.tournament);
        await stageRepository.put(assembled.stage);

        set((state) => ({
          games: assembled.newGame
            ? { ...state.games, [assembled.newGame.id]: assembled.newGame }
            : state.games,
          teams: { ...state.teams, ...index(assembled.newTeams) },
          tournaments: { ...state.tournaments, [assembled.tournament.id]: assembled.tournament },
          stages: { ...state.stages, [assembled.stage.id]: assembled.stage },
        }));
      });
    },

    snapshot: () => {
      const state = get();
      return {
        games: Object.values(state.games),
        teams: Object.values(state.teams),
        tournaments: Object.values(state.tournaments),
        stages: Object.values(state.stages),
        matches: Object.values(state.matches),
      };
    },

    applyImport: async (data, mode) => {
      await guard(async () => {
        /*
         * Snapshot the current state first. An import cannot otherwise be undone,
         * and with no server-side backup that would make a mistaken import
         * permanent.
         */
        await writeMeta(PRE_IMPORT_BACKUP_KEY, {
          takenAt: now(),
          data: get().snapshot(),
        });

        const database = db();
        await database.transaction(
          'rw',
          [database.games, database.teams, database.tournaments, database.stages, database.matches],
          async () => {
            if (mode === 'replace') {
              await Promise.all([
                database.games.clear(),
                database.teams.clear(),
                database.tournaments.clear(),
                database.stages.clear(),
                database.matches.clear(),
              ]);
            }

            await Promise.all([
              database.games.bulkPut(data.games),
              database.teams.bulkPut(data.teams),
              database.tournaments.bulkPut(data.tournaments),
              database.stages.bulkPut(data.stages),
              database.matches.bulkPut(data.matches),
            ]);
          },
        );

        // Read back rather than merging in memory, so the store always mirrors
        // what storage actually holds after the transaction.
        await get().hydrate();
      });
    },

    removeTournament: async (id) => {
      await guard(async () => {
        const stages = await stageRepository.getBy('tournamentId', id);
        const matches = await matchRepository.getBy('tournamentId', id);

        await Promise.all([
          ...stages.map((stage) => stageRepository.remove(stage.id)),
          ...matches.map((match) => matchRepository.remove(match.id)),
          tournamentRepository.remove(id),
        ]);

        set((state) => ({
          tournaments: omit(state.tournaments, [id]),
          stages: omit(
            state.stages,
            stages.map((stage) => stage.id),
          ),
          matches: omit(
            state.matches,
            matches.map((match) => match.id),
          ),
        }));
      });
    },

    archiveTeam: async (id) => {
      const team = get().teams[id];
      if (!team) return;
      await get().saveTeam({ ...team, archived: true });
    },
  };
});

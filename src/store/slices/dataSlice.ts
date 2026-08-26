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
import { mergeTeams as merge } from '@services/team/mergeTeams';
import { applyField, fieldOf, resizeEntrySlots } from '@services/tournament/registration';

import type { AssembledTournament } from '@services/tournament/assembleTournament';
import type { ParsedParticipant } from '@services/tournament/parseParticipants';
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

  /**
   * Rewrites the field of a tournament that has not been drawn yet.
   *
   * Takes a change to apply rather than the finished list. Adding an entrant is
   * one click among several, and a caller that hands over a whole list has
   * necessarily built it from what it last saw — so two quick clicks would file
   * the second over the first. The update runs against what is stored at the
   * moment it runs, and calls are queued so that moment is well defined.
   *
   * Entries typed rather than picked bring their team into existence, and the
   * stages follow the new size. Everything else about the draw is derived, so
   * there is nothing further to keep in step.
   */
  setField: (
    id: TournamentId,
    update: (current: ParsedParticipant[]) => ParsedParticipant[],
  ) => Promise<void>;

  /** Draws the tournament and opens it for results. */
  startTournament: (id: TournamentId) => Promise<void>;

  /** Everything currently held, for export. */
  snapshot: () => TransferData;
  /** Replaces or merges stored data with an imported set. */
  applyImport: (data: TransferData, mode: ImportMode) => Promise<void>;

  removeTournament: (id: TournamentId) => Promise<void>;
  /** Archives rather than deletes, to keep match history intact. */
  archiveTeam: (id: TeamId) => Promise<void>;
  /**
   * Deletes a team outright.
   *
   * Archiving is the safer option and stays the default in the UI; this exists
   * for teams created by mistake. Tournaments keep their participant entries, so
   * a bracket that referenced the team still renders — with an unknown name
   * rather than a crash.
   */
  removeTeam: (id: TeamId) => Promise<void>;
  /**
   * Folds one team into another, keeping every result.
   *
   * Only which team a tournament entry points at changes, so the merged history
   * appears under one name without a single match being rewritten.
   */
  mergeTeams: (sourceId: TeamId, targetId: TeamId) => Promise<void>;
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
  /*
   * Field edits run one after another. Each reads the stored field when its turn
   * comes, so a burst of clicks composes instead of the last one winning.
   */
  let queue: Promise<void> = Promise.resolve();

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
        await stageRepository.putMany(assembled.stages);

        set((state) => ({
          games: assembled.newGame
            ? { ...state.games, [assembled.newGame.id]: assembled.newGame }
            : state.games,
          teams: { ...state.teams, ...index(assembled.newTeams) },
          tournaments: { ...state.tournaments, [assembled.tournament.id]: assembled.tournament },
          stages: { ...state.stages, ...index(assembled.stages) },
        }));
      });
    },

    setField: async (id, update) => {
      queue = queue.then(async () => {
        await guard(async () => {
          const state = get();
          const tournament = state.tournaments[id];
          if (!tournament) return;

          const current = fieldOf(tournament.participants, (teamId) => state.teams[teamId]);

          const { participants, newTeams } = applyField(
            update(current),
            tournament.participants,
            Object.values(state.teams),
          );

          const stages = tournament.stageIds
            .map((stageId) => state.stages[stageId])
            .filter((stage): stage is Stage => stage !== undefined);

          const timestamp = now();
          const resized = resizeEntrySlots(stages, participants.length)
            // Untouched stages are returned as they were, so comparing by
            // identity keeps a write to one stage from touching every other.
            .filter((stage, position) => stage !== stages[position])
            .map((stage) => ({ ...stage, updatedAt: timestamp }));

          const next = { ...tournament, participants, updatedAt: timestamp };

          if (newTeams.length > 0) await teamRepository.putMany(newTeams);
          await tournamentRepository.put(next);
          if (resized.length > 0) await stageRepository.putMany(resized);

          set((latest) => ({
            teams: { ...latest.teams, ...index(newTeams) },
            tournaments: { ...latest.tournaments, [next.id]: next },
            stages: { ...latest.stages, ...index(resized) },
          }));
        });
      });

      await queue;
    },

    startTournament: async (id) => {
      await guard(async () => {
        const tournament = get().tournaments[id];
        if (!tournament) return;

        const next = { ...tournament, status: 'live' as const, updatedAt: now() };
        await tournamentRepository.put(next);
        set((state) => ({ tournaments: { ...state.tournaments, [next.id]: next } }));
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

    removeTeam: async (id) => {
      await guard(async () => {
        await teamRepository.remove(id);
        set((state) => ({ teams: omit(state.teams, [id]) }));
      });
    },

    mergeTeams: async (sourceId, targetId) => {
      const state = get();
      const source = state.teams[sourceId];
      const target = state.teams[targetId];
      if (!source || !target || sourceId === targetId) return;

      await guard(async () => {
        const result = merge({
          source,
          target,
          tournaments: Object.values(state.tournaments),
          timestamp: now(),
        });

        await teamRepository.put(result.team);
        await tournamentRepository.putMany(result.tournaments);
        // Removed last: until the entries have moved, deleting it would leave
        // them pointing at a team that is no longer there.
        await teamRepository.remove(sourceId);

        set((current) => ({
          teams: omit({ ...current.teams, [result.team.id]: result.team }, [sourceId]),
          tournaments: { ...current.tournaments, ...index(result.tournaments) },
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

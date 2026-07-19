import { db } from './database';
import { DexieRepository } from './dexieRepository';

import type {
  Asset,
  AssetId,
  Game,
  GameId,
  Match,
  MatchId,
  Player,
  PlayerId,
  RosterEntry,
  RosterEntryId,
  Stage,
  StageId,
  Team,
  TeamId,
  Tournament,
  TournamentId,
} from '@models/index';

/*
 * Repository instances.
 *
 * Each takes a getter rather than the table itself, so the database is created
 * on first access instead of at import time. That keeps module loading free of
 * side effects and lets tests swap in an isolated database.
 */

export const gameRepository = new DexieRepository<Game, GameId, 'name'>(() => db().games);

export const teamRepository = new DexieRepository<Team, TeamId, 'name' | 'tag' | 'archived'>(
  () => db().teams,
);

export const playerRepository = new DexieRepository<Player, PlayerId, 'nickname' | 'archived'>(
  () => db().players,
);

export const rosterRepository = new DexieRepository<
  RosterEntry,
  RosterEntryId,
  'teamId' | 'playerId'
>(() => db().rosters);

export const tournamentRepository = new DexieRepository<
  Tournament,
  TournamentId,
  'slug' | 'gameId' | 'status'
>(() => db().tournaments);

export const stageRepository = new DexieRepository<Stage, StageId, 'tournamentId'>(
  () => db().stages,
);

export const matchRepository = new DexieRepository<Match, MatchId, 'tournamentId' | 'stageId'>(
  () => db().matches,
);

export const assetRepository = new DexieRepository<Asset, AssetId, never>(() => db().assets);

export { db, setDatabase, SCHEMA_VERSION, TournaCoreDatabase } from './database';
export { DexieRepository } from './dexieRepository';
export type { Repository, IndexedRepository } from './repository';

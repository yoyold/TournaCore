import Dexie, { type EntityTable } from 'dexie';

import type {
  Asset,
  Game,
  Match,
  Player,
  RosterEntry,
  Stage,
  Team,
  Tournament,
} from '@models/index';

/** Value stored in the key-value `meta` table. */
export interface MetaRecord {
  key: string;
  value: unknown;
}

/**
 * Current storage schema version.
 *
 * Bumping this requires a corresponding `db.version(n).upgrade(...)` below.
 * Users have no server-side backup, so a migration that loses data loses it for
 * good — every version bump needs an explicit upgrade path, never a silent
 * table replacement.
 */
export const SCHEMA_VERSION = 1;

export class TournaCoreDatabase extends Dexie {
  declare games: EntityTable<Game, 'id'>;
  declare teams: EntityTable<Team, 'id'>;
  declare players: EntityTable<Player, 'id'>;
  declare rosters: EntityTable<RosterEntry, 'id'>;
  declare tournaments: EntityTable<Tournament, 'id'>;
  declare stages: EntityTable<Stage, 'id'>;
  declare matches: EntityTable<Match, 'id'>;
  declare assets: EntityTable<Asset, 'id'>;
  declare meta: EntityTable<MetaRecord, 'key'>;

  constructor(name = 'tournacore') {
    super(name);

    /*
     * Indexes are declared for the lookups the application actually performs:
     * matches by stage when rendering a bracket, stages by tournament when
     * deriving, teams by archived flag when listing. Blobs live in their own
     * table so a tournament list never loads image data.
     */
    this.version(SCHEMA_VERSION).stores({
      games: 'id, name',
      teams: 'id, name, tag, archived',
      players: 'id, nickname, archived',
      rosters: 'id, teamId, playerId',
      tournaments: 'id, &slug, gameId, status, startsAt',
      stages: 'id, tournamentId, order',
      matches: 'id, tournamentId, stageId, scheduledAt',
      assets: 'id',
      meta: 'key',
    });
  }
}

let instance: TournaCoreDatabase | undefined;

/** Shared database instance, created on first use. */
export function db(): TournaCoreDatabase {
  instance ??= new TournaCoreDatabase();
  return instance;
}

/**
 * Replaces the shared instance. Intended for tests, which need an isolated
 * database per case.
 */
export function setDatabase(next: TournaCoreDatabase | undefined): void {
  instance = next;
}

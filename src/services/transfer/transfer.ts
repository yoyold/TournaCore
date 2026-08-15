import { now, type Game, type Match, type Stage, type Team, type Tournament } from '@models/index';

import { SCHEMA_VERSION, exportFileSchema } from './schema';

export interface TransferData {
  games: Game[];
  teams: Team[];
  tournaments: Tournament[];
  stages: Stage[];
  matches: Match[];
}

/**
 * What an export file contains.
 *
 * Deliberately expressed in the application's own model types rather than the
 * schema's inferred ones. Writing is not the same job as reading: on the way out
 * the data is already trusted and fully typed, while the schema exists to make
 * sense of a file someone else may have written.
 */
export interface ExportFile {
  schemaVersion: number;
  exportedAt: string;
  appName: 'TournaCore';
  data: TransferData;
}

/** Builds the export payload. Pure: the caller decides how it reaches disk. */
export function buildExport(data: TransferData, timestamp = now()): ExportFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: timestamp,
    appName: 'TournaCore',
    // Assets are not included yet; there is no upload path that creates them.
    data: {
      games: data.games,
      teams: data.teams,
      tournaments: data.tournaments,
      stages: data.stages,
      matches: data.matches,
    },
  };
}

export type ImportMode = 'replace' | 'merge';

export interface ImportSummary {
  games: number;
  teams: number;
  tournaments: number;
  stages: number;
  matches: number;
}

export interface ParsedImport {
  schemaVersion: number;
  exportedAt: string;
  data: TransferData;
  summary: ImportSummary;
  /** Set when the file came from an older schema and was migrated on read. */
  migratedFrom?: number;
}

export class ImportError extends Error {
  override readonly name = 'ImportError';
  constructor(
    message: string,
    /** Stable key so the UI can translate the message. */
    readonly code: string,
  ) {
    super(message);
  }
}

/**
 * Parses and validates an export file.
 *
 * Never `JSON.parse` straight into the store: an import is untrusted input, and
 * a malformed file that lands half-applied is unrecoverable without a
 * server-side backup. Anything that fails validation is rejected whole.
 */
export function parseImport(text: string): ParsedImport {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ImportError('The file is not valid JSON.', 'invalid_json');
  }

  const version = readVersion(raw);
  if (version > SCHEMA_VERSION) {
    throw new ImportError(
      `The file was written by a newer version (schema ${String(version)}).`,
      'future_version',
    );
  }

  const migrated = migrate(raw, version);

  const result = exportFileSchema.safeParse(migrated);
  if (!result.success) {
    throw new ImportError('The file does not match the expected format.', 'schema_mismatch');
  }

  const file = result.data;
  const data: TransferData = {
    games: file.data.games as unknown as Game[],
    teams: file.data.teams as unknown as Team[],
    tournaments: file.data.tournaments as unknown as Tournament[],
    stages: file.data.stages as unknown as Stage[],
    matches: file.data.matches as unknown as Match[],
  };

  return {
    schemaVersion: file.schemaVersion,
    exportedAt: file.exportedAt,
    data,
    summary: {
      games: data.games.length,
      teams: data.teams.length,
      tournaments: data.tournaments.length,
      stages: data.stages.length,
      matches: data.matches.length,
    },
    ...(version < SCHEMA_VERSION ? { migratedFrom: version } : {}),
  };
}

function readVersion(raw: unknown): number {
  if (typeof raw !== 'object' || raw === null) {
    throw new ImportError('The file does not contain an object.', 'not_an_object');
  }
  const version = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new ImportError('The file has no usable schema version.', 'missing_version');
  }
  return version;
}

/**
 * Lifts an older file to the current schema, one version at a time.
 *
 * Empty today because version 1 is the first. The chain exists from the start so
 * the first schema change has somewhere to go: retrofitting migrations after
 * users hold exports of an unversioned format is not possible.
 */
function migrate(raw: unknown, fromVersion: number): unknown {
  let current = raw;
  for (let version = fromVersion; version < SCHEMA_VERSION; version += 1) {
    const step = MIGRATIONS[version];
    if (!step) {
      throw new ImportError(`No migration from schema ${String(version)}.`, 'missing_migration');
    }
    current = step(current);
  }
  return current;
}

/** Keyed by the version being migrated *from*. */
const MIGRATIONS: Record<number, ((raw: unknown) => unknown) | undefined> = {};

/**
 * Merges imported records into existing ones.
 *
 * Imported records win on an id collision: the user chose to import this file,
 * and silently keeping the older copy would make the import look like it did
 * nothing. Records only present locally are untouched, which is what makes merge
 * different from replace.
 */
export function mergeData(existing: TransferData, incoming: TransferData): TransferData {
  return {
    games: mergeById(existing.games, incoming.games),
    teams: mergeById(existing.teams, incoming.teams),
    tournaments: mergeById(existing.tournaments, incoming.tournaments),
    stages: mergeById(existing.stages, incoming.stages),
    matches: mergeById(existing.matches, incoming.matches),
  };
}

function mergeById<T extends { id: string }>(existing: readonly T[], incoming: readonly T[]): T[] {
  const byId = new Map<string, T>(existing.map((entity) => [entity.id, entity]));
  for (const entity of incoming) byId.set(entity.id, entity);
  return [...byId.values()];
}

/** Filename for a download, carrying the date so backups sort naturally. */
export function exportFileName(timestamp = now()): string {
  const date = timestamp.slice(0, 10);
  return `tournacore-${date}.json`;
}

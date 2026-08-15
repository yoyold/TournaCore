import { db } from './database';

/**
 * Key-value access to the `meta` table.
 *
 * Deliberately outside the repository abstraction: meta rows are keyed by
 * `key` rather than `id` and hold loose values, so forcing them through an
 * entity-shaped interface would buy nothing.
 */
export async function readMeta<T>(key: string): Promise<T | undefined> {
  const row = await db().meta.get(key);
  return row?.value as T | undefined;
}

export async function writeMeta(key: string, value: unknown): Promise<void> {
  await db().meta.put({ key, value });
}

/** Snapshot taken automatically before an import, so one can be undone. */
export const PRE_IMPORT_BACKUP_KEY = 'backup.preImport';

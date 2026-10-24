/**
 * Whether the browser has promised to keep this origin's data.
 *
 * - `persisted`: the browser will not discard it on its own.
 * - `best_effort`: it may be discarded at any time, without warning.
 * - `unsupported`: the browser does not offer the promise at all.
 */
export type StorageDurability = 'persisted' | 'best_effort' | 'unsupported';

export interface StorageUsage {
  /** Bytes this origin currently occupies, where the browser will say. */
  bytes?: number;
  durability: StorageDurability;
}

/**
 * Asking the browser to keep what the application stores.
 *
 * Everything this application owns lives in IndexedDB on one origin, and
 * IndexedDB is *best effort* by default: the browser is free to throw it away
 * under storage pressure, and some browsers discard it for any site they do not
 * consider regularly used. There is no server copy to fall back on, so the
 * first a user learns of it is an empty archive.
 *
 * `navigator.storage.persist()` is the one thing that changes that. Browsers
 * decide for themselves whether to grant it — Chromium weighs how engaged the
 * user is with the site, Firefox asks them — so a refusal is normal and must be
 * surfaced rather than swallowed. It is not a permission that can be demanded;
 * it is a request whose answer the user deserves to see.
 */

/**
 * The storage manager, typed as it actually behaves.
 *
 * TypeScript declares `navigator.storage` as always present. It is not: an
 * insecure context has no storage manager at all, and reaching into it there
 * throws rather than returning undefined. Widening the type is what lets the
 * guards below say so.
 */
function storageManager(): StorageManager | undefined {
  return globalThis.navigator.storage;
}

/** What the browser currently promises, without asking for anything. */
export async function storageDurability(): Promise<StorageDurability> {
  const storage = storageManager();
  if (typeof storage?.persisted !== 'function') return 'unsupported';

  try {
    return (await storage.persisted()) ? 'persisted' : 'best_effort';
  } catch {
    // A browser that refuses to answer is one that makes no promise.
    return 'best_effort';
  }
}

/**
 * Asks the browser to keep the data, and reports what it decided.
 *
 * Safe to call when the promise already exists: `persisted()` is checked first,
 * so a granted origin is never asked again. Firefox prompts the user on
 * `persist()`, and prompting somebody who is already covered would be noise.
 */
export async function requestDurableStorage(): Promise<StorageDurability> {
  const storage = storageManager();
  if (typeof storage?.persist !== 'function') return 'unsupported';

  const current = await storageDurability();
  if (current !== 'best_effort') return current;

  try {
    return (await storage.persist()) ? 'persisted' : 'best_effort';
  } catch {
    return 'best_effort';
  }
}

/** How much the origin holds, for showing what is at stake. */
export async function storageUsage(): Promise<StorageUsage> {
  const durability = await storageDurability();
  const storage = storageManager();
  if (typeof storage?.estimate !== 'function') return { durability };

  try {
    const { usage } = await storage.estimate();
    return usage === undefined ? { durability } : { bytes: usage, durability };
  } catch {
    return { durability };
  }
}

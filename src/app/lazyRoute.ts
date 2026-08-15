import { lazy, type ComponentType } from 'react';

/**
 * Marks that a reload has already been attempted, so a genuinely broken build
 * cannot put the tab into a reload loop. Session-scoped: a fresh tab is allowed
 * to try again.
 */
const RELOAD_FLAG = 'tournacore.chunkReload';

/** Query parameter that forces the browser past its cached copy of index.html. */
const CACHE_BUST_PARAM = 'r';

/** True when the failure looks like a missing or unparseable module. */
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(
      error.message,
    ) || error.name === 'ChunkLoadError'
  );
}

/**
 * Lazily loads a route, reloading once if its chunk has gone missing.
 *
 * Every deployment gives the bundles new content hashes and removes the old
 * files. A tab that still holds the previous index.html therefore asks for
 * chunks that no longer exist, and every navigation fails — for as long as the
 * cached HTML lives. Static hosting offers no way to set cache headers, so the
 * page has to notice and recover by itself.
 *
 * A single reload fetches the current index.html and with it the current chunk
 * names. The session flag makes sure that a build which is actually broken
 * surfaces its error rather than reloading forever.
 */
export function lazyRoute<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      const module = await factory();
      // Loading worked, so a later deployment may reload again.
      clearFlag();
      tidyUrl();
      return module;
    } catch (error) {
      if (isChunkLoadError(error) && !hasReloaded()) {
        markReloaded();
        reloadWithFreshHtml();
        // Resolve never: the reload replaces this document.
        return new Promise<{ default: T }>(() => {
          /* intentionally never settles */
        });
      }
      throw error;
    }
  });
}

/**
 * Reloads in a way that actually fetches the current index.html.
 *
 * A plain reload can be served from the HTTP cache, which is precisely where the
 * outdated document lives — the reload would then load the same stale HTML and
 * fail again. A one-off query parameter makes the request unique, so the browser
 * has to go to the network. The hash is preserved, so the user stays on the page
 * they were looking at.
 */
function reloadWithFreshHtml(): void {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set(CACHE_BUST_PARAM, Date.now().toString(36));
    // `replace` rather than `assign`: the failed load does not belong in history.
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}

/**
 * Removes the cache-busting parameter once the page has loaded successfully, so
 * it does not linger in a URL the user might copy or bookmark.
 */
function tidyUrl(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(CACHE_BUST_PARAM)) return;
    url.searchParams.delete(CACHE_BUST_PARAM);
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    /* cosmetic only */
  }
}

function hasReloaded(): boolean {
  try {
    return sessionStorage.getItem(RELOAD_FLAG) !== null;
  } catch {
    // Storage can be unavailable in private modes; without it, skip the reload
    // rather than risk a loop.
    return true;
  }
}

function markReloaded(): void {
  try {
    sessionStorage.setItem(RELOAD_FLAG, '1');
  } catch {
    /* nothing to do; the caller falls back to throwing */
  }
}

function clearFlag(): void {
  try {
    sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    /* nothing to do */
  }
}

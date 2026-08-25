import type { Tournament } from '@models/index';

/**
 * Puts tournaments in the order they are listed in: newest first.
 *
 * A stored map has no order worth relying on, so leaving a list unsorted means
 * it reshuffles whenever the storage layer feels like it. Sorting by creation
 * date gives an archive that reads like one — this year at the top, older
 * seasons below.
 *
 * Same-date tournaments fall back to the name and then the identifier, so the
 * order is total. Without that last step two tournaments created in the same
 * second could swap places between renders.
 */
export function byCreationDate(tournaments: readonly Tournament[]): Tournament[] {
  return [...tournaments].sort(
    (a, b) =>
      b.createdAt.localeCompare(a.createdAt) ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id),
  );
}

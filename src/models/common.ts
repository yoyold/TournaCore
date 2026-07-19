/**
 * Timestamp as a UTC ISO-8601 string, e.g. `2026-07-19T14:30:00.000Z`.
 *
 * Persisted data never holds `Date` objects: they do not survive JSON
 * serialisation, and export/import is the only backup path this application has.
 * Conversion to local time happens at the presentation layer.
 */
export type IsoDateTime = string;

/** Calendar date without a time component, e.g. `2026-07-19`. */
export type IsoDate = string;

/** Competitive region. Free-form on purpose: regional splits differ per game. */
export type Region = string;

export interface SocialLink {
  platform: string;
  url: string;
}

/** Fields every stored entity carries. */
export interface Timestamps {
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** Current time as an ISO-8601 string. */
export function now(): IsoDateTime {
  return new Date().toISOString();
}

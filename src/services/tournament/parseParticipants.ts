import type { TeamId } from '@models/index';

export interface ParsedParticipant {
  name: string;
  /** ISO 3166-1 alpha-2, when a trailing country code was given. */
  countryCode?: string;
  /**
   * The team this entry stands for, when it was picked rather than typed.
   *
   * Matching a typed name against the known teams is a guess that a rename or a
   * second spelling defeats. Where the organiser chose from the list there is
   * nothing to guess, and the identity travels with the entry.
   */
  teamId?: TeamId;
}

const TRAILING_COUNTRY = /^(.*?),\s*([A-Za-z]{2})$/;

/**
 * Parses a block of pasted text into participants, one per line.
 *
 * The bulk field is how an organiser enters a field of teams fastest — paste a
 * list, done. Each line is a team name, optionally followed by ", XX" to set a
 * country. Blank lines are skipped and case-insensitive duplicates are dropped,
 * because pasting from a spreadsheet routinely carries both.
 */
export function parseParticipants(text: string): ParsedParticipant[] {
  const seen = new Set<string>();
  const result: ParsedParticipant[] = [];

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line === '') continue;

    let name = line;
    let countryCode: string | undefined;

    const match = TRAILING_COUNTRY.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      name = match[1].trim();
      countryCode = match[2].toUpperCase();
    }

    if (name === '') continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    result.push({ name, ...(countryCode !== undefined ? { countryCode } : {}) });
  }

  return result;
}

/**
 * Derives a short tag from a team name.
 *
 * Prefers the initials of a multi-word name (Nova Collective → NC), otherwise
 * the first three letters (Fnatic → FNA). A tag is required on a team, and asking
 * the organiser to type one per team during bulk entry would defeat the point of
 * bulk entry.
 */
export function deriveTag(name: string): string {
  const words = name
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z0-9]/g, ''))
    .filter((word) => word.length > 0);

  if (words.length >= 2) {
    return words
      .slice(0, 3)
      .map((word) => word.charAt(0).toUpperCase())
      .join('');
  }

  const single = words[0] ?? name;
  return single.slice(0, 3).toUpperCase() || '—';
}

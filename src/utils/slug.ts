const MAX_LENGTH = 60;

/**
 * Turns arbitrary text into a URL-safe slug.
 *
 * Diacritics are folded rather than dropped, so "Fnatic Größe" becomes
 * "fnatic-groesse"-ish rather than losing the vowel entirely — a slug that still
 * resembles the name is easier to recognise in a URL. Falls back to a constant
 * so an all-symbol name still yields a usable slug.
 */
export function slugify(input: string): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_LENGTH)
    .replace(/-+$/g, '');

  return slug === '' ? 'tournament' : slug;
}

/**
 * Produces a slug not already present in `taken`, appending `-2`, `-3` … when the
 * base is occupied.
 *
 * Uniqueness matters because the slug is a stable, unique index on tournaments:
 * two sharing one would make the URL ambiguous and violate the storage constraint.
 */
export function uniqueSlug(input: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = slugify(input);
  if (!used.has(base)) return base;

  let suffix = 2;
  while (used.has(`${base}-${String(suffix)}`)) suffix += 1;
  return `${base}-${String(suffix)}`;
}

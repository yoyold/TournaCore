import { describe, expect, it } from 'vitest';

import { slugify, uniqueSlug } from './slug';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Summer Cup 2026')).toBe('summer-cup-2026');
  });

  it('folds diacritics', () => {
    expect(slugify('Café Crème')).toBe('cafe-creme');
  });

  it('collapses runs of separators', () => {
    expect(slugify('  a  --  b  ')).toBe('a-b');
  });

  it('drops leading and trailing separators', () => {
    expect(slugify('!!!Grand Final!!!')).toBe('grand-final');
  });

  it('caps the length without a trailing hyphen', () => {
    const slug = slugify('x'.repeat(80));
    expect(slug).toHaveLength(60);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('falls back for an all-symbol name', () => {
    expect(slugify('***')).toBe('tournament');
    expect(slugify('')).toBe('tournament');
  });
});

describe('uniqueSlug', () => {
  it('keeps the base slug when free', () => {
    expect(uniqueSlug('Open Cup', [])).toBe('open-cup');
  });

  it('appends a counter when the base is taken', () => {
    expect(uniqueSlug('Open Cup', ['open-cup'])).toBe('open-cup-2');
  });

  it('skips over occupied counters', () => {
    expect(uniqueSlug('Open Cup', ['open-cup', 'open-cup-2', 'open-cup-3'])).toBe('open-cup-4');
  });
});

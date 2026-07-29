import { describe, expect, it } from 'vitest';

import { deriveTag, parseParticipants } from './parseParticipants';

describe('parseParticipants', () => {
  it('takes one participant per line', () => {
    const result = parseParticipants('Nova Collective\nIron Meridian\nSolstice Nine');
    expect(result.map((p) => p.name)).toEqual([
      'Nova Collective',
      'Iron Meridian',
      'Solstice Nine',
    ]);
  });

  it('trims whitespace and skips blank lines', () => {
    const result = parseParticipants('  Alpha  \n\n   \n Beta ');
    expect(result.map((p) => p.name)).toEqual(['Alpha', 'Beta']);
  });

  it('reads a trailing country code', () => {
    const result = parseParticipants('Nova Collective, de\nIron Meridian, US');
    expect(result).toEqual([
      { name: 'Nova Collective', countryCode: 'DE' },
      { name: 'Iron Meridian', countryCode: 'US' },
    ]);
  });

  it('keeps a comma that is not a country code', () => {
    const result = parseParticipants('Alpha, Beta and Friends');
    expect(result).toEqual([{ name: 'Alpha, Beta and Friends' }]);
  });

  it('drops case-insensitive duplicates', () => {
    const result = parseParticipants('Nova\nnova\nNOVA\nIron');
    expect(result.map((p) => p.name)).toEqual(['Nova', 'Iron']);
  });

  it('returns nothing for empty input', () => {
    expect(parseParticipants('')).toEqual([]);
    expect(parseParticipants('\n  \n')).toEqual([]);
  });
});

describe('deriveTag', () => {
  it('uses initials of a multi-word name', () => {
    expect(deriveTag('Nova Collective')).toBe('NC');
    expect(deriveTag('Pale Blue Horizon Nine')).toBe('PBH');
  });

  it('uses the first three letters of a single word', () => {
    expect(deriveTag('Fnatic')).toBe('FNA');
    expect(deriveTag('G2')).toBe('G2');
  });

  it('ignores punctuation', () => {
    expect(deriveTag('Team-Liquid')).toBe('TEA');
    expect(deriveTag('[A] Squad')).toBe('AS');
  });
});

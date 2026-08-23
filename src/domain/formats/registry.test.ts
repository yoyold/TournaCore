import { describe, expect, it } from 'vitest';

import { InvariantError } from '@utils/invariant';

import { availableFormats, findFormat, requireFormat } from './registry';
import { singleEliminationFormat } from './singleElimination';

import type { FormatKind } from '@models/index';

describe('format registry', () => {
  it('resolves a registered format', () => {
    expect(findFormat('single_elimination')).toBe(singleEliminationFormat);
  });

  it('returns undefined for a format it does not know', () => {
    expect(findFormat('pyramid' as FormatKind)).toBeUndefined();
  });

  it('lists every implemented format', () => {
    // Each of these is a format an organiser can actually pick; the wizard reads
    // this list rather than keeping its own.
    expect(availableFormats().sort()).toEqual([
      'double_elimination',
      'group_stage',
      'round_robin',
      'single_elimination',
      'swiss',
    ]);
  });

  it('throws when a required format is missing', () => {
    // A stored stage referencing an unknown format means corrupt data or a
    // downgrade. Failing loudly beats rendering an empty bracket.
    expect(() => requireFormat('pyramid' as FormatKind)).toThrow(InvariantError);
  });

  it('returns the handler when the required format exists', () => {
    expect(requireFormat('single_elimination').kind).toBe('single_elimination');
  });
});

describe('singleElimination.validate', () => {
  const config = singleEliminationFormat;
  const cfg = {
    kind: 'single_elimination',
    thirdPlaceMatch: false,
    byePlacement: 'seeded',
    matchFormats: { default: { kind: 'bo', games: 3 } },
  } as const;

  it('accepts a normal bracket', () => {
    expect(config.validate(cfg, 16).valid).toBe(true);
  });

  it('rejects fewer than two participants', () => {
    const result = config.validate(cfg, 1);
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.code).toBe('single_elimination.too_few_participants');
  });

  it('rejects more participants than the layout supports', () => {
    const result = config.validate(cfg, 512);
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.code).toBe('single_elimination.too_many_participants');
  });

  it('accepts the boundary values', () => {
    expect(config.validate(cfg, 2).valid).toBe(true);
    expect(config.validate(cfg, 256).valid).toBe(true);
  });
});

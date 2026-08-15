import { describe, expect, it } from 'vitest';

import { now, type Game, type Match, type Stage, type Team, type Tournament } from '@models/index';

import { SCHEMA_VERSION } from './schema';
import {
  ImportError,
  buildExport,
  exportFileName,
  mergeData,
  parseImport,
  type TransferData,
} from './transfer';

const team = (id: string, name: string): Team => ({
  id: id as Team['id'],
  name,
  tag: name.slice(0, 3).toUpperCase(),
  socials: [],
  archived: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const tournament = (id: string, name: string): Tournament => ({
  id: id as Tournament['id'],
  name,
  slug: name.toLowerCase().replace(/\s+/g, '-'),
  gameId: 'g1' as Tournament['gameId'],
  status: 'live',
  participants: [],
  stageIds: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const empty: TransferData = { games: [], teams: [], tournaments: [], stages: [], matches: [] };

const sample: TransferData = {
  ...empty,
  teams: [team('t1', 'Nova Collective'), team('t2', 'Iron Meridian')],
  tournaments: [tournament('tour1', 'Summer Cup')],
};

/** Round-trips a payload the way the UI does: serialise, then read back. */
const roundTrip = (data: TransferData) => parseImport(JSON.stringify(buildExport(data)));

describe('buildExport', () => {
  it('stamps the current schema version', () => {
    expect(buildExport(empty).schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('identifies the application that wrote it', () => {
    expect(buildExport(empty).appName).toBe('TournaCore');
  });

  it('carries every entity collection', () => {
    const file = buildExport(sample);
    expect(file.data.teams).toHaveLength(2);
    expect(file.data.tournaments).toHaveLength(1);
  });
});

describe('parseImport', () => {
  it('round-trips an export without loss', () => {
    const parsed = roundTrip(sample);

    expect(parsed.summary).toEqual({
      games: 0,
      teams: 2,
      tournaments: 1,
      stages: 0,
      matches: 0,
    });
    expect(parsed.data.teams[0]?.name).toBe('Nova Collective');
  });

  it('rejects text that is not JSON', () => {
    expect(() => parseImport('not json at all')).toThrow(ImportError);
    try {
      parseImport('{');
    } catch (error) {
      expect((error as ImportError).code).toBe('invalid_json');
    }
  });

  it('rejects a file without a schema version', () => {
    try {
      parseImport(JSON.stringify({ data: {} }));
    } catch (error) {
      expect((error as ImportError).code).toBe('missing_version');
    }
  });

  /**
   * A file from a newer version may use fields this build cannot interpret.
   * Importing it anyway would silently drop them.
   */
  it('refuses a file from a newer schema', () => {
    const future = { ...buildExport(sample), schemaVersion: SCHEMA_VERSION + 1 };
    try {
      parseImport(JSON.stringify(future));
    } catch (error) {
      expect((error as ImportError).code).toBe('future_version');
    }
  });

  it('rejects a structurally wrong file whole, rather than partially', () => {
    const broken = buildExport(sample) as unknown as { data: { teams: unknown } };
    broken.data.teams = [{ id: 't1' }]; // missing required fields

    try {
      parseImport(JSON.stringify(broken));
    } catch (error) {
      expect((error as ImportError).code).toBe('schema_mismatch');
    }
  });

  it('rejects a non-object payload', () => {
    try {
      parseImport('42');
    } catch (error) {
      expect((error as ImportError).code).toBe('not_an_object');
    }
  });

  it('does not report a migration for a current-version file', () => {
    expect(roundTrip(sample).migratedFrom).toBeUndefined();
  });
});

describe('mergeData', () => {
  it('keeps records that exist only locally', () => {
    const merged = mergeData(sample, { ...empty, teams: [team('t3', 'Solstice Nine')] });
    expect(merged.teams).toHaveLength(3);
  });

  it('lets the imported record win a collision', () => {
    const merged = mergeData(sample, { ...empty, teams: [team('t1', 'Renamed Collective')] });

    expect(merged.teams).toHaveLength(2);
    expect(merged.teams.find((entry) => entry.id === 't1')?.name).toBe('Renamed Collective');
  });

  it('leaves the existing set untouched when importing nothing', () => {
    expect(mergeData(sample, empty).teams).toHaveLength(2);
  });
});

describe('exportFileName', () => {
  it('carries the date so backups sort naturally', () => {
    expect(exportFileName('2026-03-14T12:00:00.000Z')).toBe('tournacore-2026-03-14.json');
  });

  it('falls back to the current date', () => {
    expect(exportFileName()).toMatch(/^tournacore-\d{4}-\d{2}-\d{2}\.json$/);
  });
});

describe('round trip with realistic content', () => {
  it('preserves a tournament with stages and matches', () => {
    const stage: Stage = {
      id: 's1' as Stage['id'],
      tournamentId: 'tour1' as Stage['tournamentId'],
      name: 'Main Bracket',
      order: 0,
      format: {
        kind: 'single_elimination',
        thirdPlaceMatch: true,
        byePlacement: 'seeded',
        matchFormats: { default: { kind: 'bo', games: 3 } },
      },
      entrySeeding: [
        {
          id: 'rule1' as never,
          source: { kind: 'participants' },
          targetSlots: { from: 1, to: 4 },
          order: 'as_ranked',
        },
      ],
      createdAt: now(),
      updatedAt: now(),
    };

    const match: Match = {
      id: 's1/winner/r0/m0' as Match['id'],
      tournamentId: 'tour1' as Match['tournamentId'],
      stageId: 's1' as Match['stageId'],
      position: { bracket: 'winner', round: 0, indexInRound: 0 },
      slotA: { kind: 'seeded', slotIndex: 1 },
      slotB: { kind: 'seeded', slotIndex: 4 },
      format: { kind: 'bo', games: 3 },
      games: [
        { id: 'g1' as never, index: 1, scoreA: 13, scoreB: 7, winner: 'A' },
        { id: 'g2' as never, index: 2, scoreA: 13, scoreB: 9, winner: 'A' },
      ],
      outcome: { winner: 'A', reason: 'played', decidedAt: now() },
      notes: 'Delayed by a technical pause',
      createdAt: now(),
      updatedAt: now(),
    };

    const game: Game = {
      id: 'g1' as Game['id'],
      name: 'Example Shooter',
      shortName: 'EXS',
      maps: [{ id: 'm1' as never, name: 'Harbour', active: true }],
      defaultMatchFormat: { kind: 'bo', games: 3 },
      createdAt: now(),
      updatedAt: now(),
    };

    const parsed = roundTrip({ ...sample, games: [game], stages: [stage], matches: [match] });

    expect(parsed.data.stages[0]?.format).toEqual(stage.format);
    expect(parsed.data.matches[0]?.games).toHaveLength(2);
    expect(parsed.data.matches[0]?.outcome?.winner).toBe('A');
    expect(parsed.data.matches[0]?.notes).toBe('Delayed by a technical pause');
    expect(parsed.data.games[0]?.maps).toHaveLength(1);
  });
});

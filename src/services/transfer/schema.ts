import { z } from 'zod';

/**
 * Current export schema version.
 *
 * Bumping this requires a migration step in `migrations.ts`. Users have no
 * server-side backup, so an export that a later version cannot read is data
 * lost for good — the version is what makes that recoverable.
 */
export const SCHEMA_VERSION = 1;

/**
 * Validation of imported files.
 *
 * Deliberately permissive about fields the app does not read and strict about
 * the ones it does. An import is untrusted input: a hand-edited file or one from
 * a future version must fail loudly rather than land half-parsed in the store,
 * where it would surface much later as an unexplainable bracket.
 */

const isoString = z.string();

const socialLink = z.object({ platform: z.string(), url: z.string() });

const teamSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  tag: z.string(),
  logoAssetId: z.string().optional(),
  bannerAssetId: z.string().optional(),
  region: z.string().optional(),
  countryCode: z.string().optional(),
  description: z.string().optional(),
  foundedAt: z.string().optional(),
  socials: z.array(socialLink).default([]),
  archived: z.boolean().default(false),
  createdAt: isoString,
  updatedAt: isoString,
});

const mapDefinition = z.object({
  id: z.string(),
  name: z.string(),
  imageAssetId: z.string().optional(),
  active: z.boolean().default(true),
});

const matchFormat = z.union([
  z.object({
    kind: z.literal('bo'),
    games: z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(7)]),
  }),
  z.object({ kind: z.literal('single_game') }),
]);

const gameSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  shortName: z.string(),
  iconAssetId: z.string().optional(),
  maps: z.array(mapDefinition).default([]),
  defaultMatchFormat: matchFormat,
  createdAt: isoString,
  updatedAt: isoString,
});

const participantSchema = z.object({
  id: z.string().min(1),
  teamId: z.string().min(1),
  seed: z.number().int().positive(),
  status: z.enum(['active', 'withdrawn', 'disqualified']),
  note: z.string().optional(),
});

const tournamentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  gameId: z.string(),
  organizer: z.string().optional(),
  logoAssetId: z.string().optional(),
  bannerAssetId: z.string().optional(),
  startsAt: isoString.optional(),
  endsAt: isoString.optional(),
  status: z.enum(['draft', 'registration', 'live', 'completed', 'cancelled']),
  participants: z.array(participantSchema).default([]),
  stageIds: z.array(z.string()).default([]),
  createdAt: isoString,
  updatedAt: isoString,
});

/*
 * Formats and seeding rules are passed through with light checking: the engine
 * validates a configuration before it generates anything, and duplicating its
 * rules here would mean two places to update whenever a format is added.
 */
const stageSchema = z.object({
  id: z.string().min(1),
  tournamentId: z.string().min(1),
  name: z.string(),
  order: z.number().int().nonnegative(),
  format: z.looseObject({ kind: z.string() }),
  entrySeeding: z.array(z.looseObject({ id: z.string() })).default([]),
  createdAt: isoString,
  updatedAt: isoString,
});

const gameResultSchema = z.object({
  id: z.string(),
  index: z.number().int().positive(),
  mapId: z.string().optional(),
  scoreA: z.number(),
  scoreB: z.number(),
  winner: z.enum(['A', 'B', 'draw']).optional(),
  pickedBy: z.enum(['A', 'B', 'decider']).optional(),
  sideA: z.string().optional(),
  notes: z.string().optional(),
});

const matchSchema = z.object({
  id: z.string().min(1),
  tournamentId: z.string().min(1),
  stageId: z.string().min(1),
  position: z.looseObject({ round: z.number().int().nonnegative() }),
  slotA: z.looseObject({ kind: z.string() }),
  slotB: z.looseObject({ kind: z.string() }),
  format: matchFormat,
  scheduledAt: isoString.optional(),
  games: z.array(gameResultSchema).default([]),
  outcome: z
    .object({
      winner: z.enum(['A', 'B', 'draw']),
      reason: z.enum(['played', 'bye', 'walkover', 'forfeit', 'disqualification', 'manual']),
      decidedAt: isoString,
    })
    .optional(),
  streamUrl: z.string().optional(),
  vodUrl: z.string().optional(),
  notes: z.string().optional(),
  createdAt: isoString,
  updatedAt: isoString,
});

export const exportFileSchema = z.object({
  schemaVersion: z.number().int().positive(),
  exportedAt: isoString,
  appName: z.literal('TournaCore'),
  data: z.object({
    games: z.array(gameSchema).default([]),
    teams: z.array(teamSchema).default([]),
    tournaments: z.array(tournamentSchema).default([]),
    stages: z.array(stageSchema).default([]),
    matches: z.array(matchSchema).default([]),
  }),
});

export type ExportFile = z.infer<typeof exportFileSchema>;

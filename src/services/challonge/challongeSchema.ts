import { z } from 'zod';

import { fromPublicBracket, isPublicBracket, publicBracketSchema } from './publicBracket';

/**
 * Shape of a Challonge API v1 tournament payload.
 *
 * Validated rather than trusted, for the same reason the transfer import is: this
 * is data from outside the application, and a field that silently arrives as the
 * wrong type would surface much later as a bracket nobody can explain.
 *
 * Deliberately permissive about everything not read. Challonge returns dozens of
 * fields that mean nothing here, and rejecting a payload because one of them
 * changed shape would break the importer for no benefit.
 */

const numeric = z.union([z.number(), z.string()]).transform((value) => Number(value));
const nullableId = z
  .union([z.number(), z.string(), z.null()])
  .transform((value) => (value === null ? undefined : String(value)));

export const challongeParticipantSchema = z.looseObject({
  id: z.union([z.number(), z.string()]).transform((value) => String(value)),
  name: z.string().optional(),
  display_name: z.string().optional(),
  seed: numeric.optional(),
  /**
   * Ids a participant is known by inside a preliminary group phase. Their
   * presence is what marks a payload as having group stages.
   */
  group_player_ids: z.array(z.union([z.number(), z.string()])).optional(),
});

export const challongeMatchSchema = z.looseObject({
  id: z.union([z.number(), z.string()]).transform((value) => String(value)),
  round: numeric.optional(),
  state: z.string().optional(),
  player1_id: nullableId.optional(),
  player2_id: nullableId.optional(),
  winner_id: nullableId.optional(),
  loser_id: nullableId.optional(),
  /** Per-game scores as "13-7,10-13,13-9", always player1 first. */
  scores_csv: z.string().optional(),
  forfeited: z.boolean().nullable().optional(),
  suggested_play_order: numeric.nullable().optional(),
  group_id: nullableId.optional(),
  completed_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
});

/**
 * One group of a preliminary phase, already normalised.
 *
 * Challonge serves a group as a self-contained little tournament with its own
 * participant identifiers — the same club appears under one id in its group and
 * a different one in the bracket that follows, linked only by name. Normalising
 * it into this shape keeps that awkwardness in one place.
 */
export const challongeGroupSchema = z.looseObject({
  name: z.string().optional(),
  /** A group is its own little tournament, and not always a round robin. */
  type: z.string().optional(),
  /** Places that carry over from this group into the main bracket. */
  advanceCount: numeric.optional(),
  participants: z.array(z.looseObject({ participant: challongeParticipantSchema })).default([]),
  matches: z.array(z.looseObject({ match: challongeMatchSchema })).default([]),
});

export const challongeTournamentSchema = z.looseObject({
  id: z.union([z.number(), z.string()]).transform((value) => String(value)),
  name: z.string(),
  url: z.string().optional(),
  description: z.string().nullable().optional(),
  tournament_type: z.string(),
  game_name: z.string().nullable().optional(),
  started_at: z.string().nullable().optional(),
  completed_at: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  state: z.string().optional(),
  hold_third_place_match: z.boolean().nullable().optional(),
  /** null means Challonge's default, which allows a bracket reset. */
  grand_finals_modifier: z.string().nullable().optional(),
  swiss_rounds: numeric.nullable().optional(),
  rr_iterations: numeric.nullable().optional(),
  group_stages_enabled: z.boolean().nullable().optional(),
  participants: z.array(z.looseObject({ participant: challongeParticipantSchema })).default([]),
  matches: z.array(z.looseObject({ match: challongeMatchSchema })).default([]),
  /** Preliminary groups, when the event has them. */
  groups: z.array(challongeGroupSchema).default([]),
});

/** A single tournament as the API returns it, wrapped in its envelope. */
export const challongeEnvelopeSchema = z.looseObject({ tournament: challongeTournamentSchema });

/**
 * What the importer accepts as input: one envelope, or a list of them.
 *
 * The list form is what a saved dump of several tournaments looks like, and
 * accepting both means the user can inspect exactly what they downloaded before
 * converting it.
 */
export const challongeInputSchema = z.union([
  challongeEnvelopeSchema.transform((value) => [value.tournament]),
  z.array(challongeEnvelopeSchema).transform((value) => value.map((entry) => entry.tournament)),
  z.array(challongeTournamentSchema),
  challongeTournamentSchema.transform((value) => [value]),
]);

export type ChallongeParticipant = z.infer<typeof challongeParticipantSchema>;
export type ChallongeMatch = z.infer<typeof challongeMatchSchema>;
export type ChallongeGroup = z.infer<typeof challongeGroupSchema>;
export type ChallongeTournament = z.infer<typeof challongeTournamentSchema>;

export class ChallongeFormatError extends Error {
  override readonly name = 'ChallongeFormatError';
}

/**
 * Parses raw JSON into tournaments, rejecting anything that does not fit.
 *
 * Accepts both what Challonge's API returns and what a public bracket page
 * serves, because the two are different shapes and only the first needs a key.
 * `name` applies to public brackets, whose payload does not carry one.
 */
export function parseChallonge(raw: unknown, name?: string): ChallongeTournament[] {
  const entries = Array.isArray(raw) ? raw : [raw];

  if (entries.some((entry) => isPublicBracket(entry))) {
    return entries.map((entry) => {
      const bracket = publicBracketSchema.safeParse(entry);
      if (!bracket.success) {
        throw new ChallongeFormatError('The file looks like a public bracket but is incomplete.');
      }
      return fromPublicBracket(bracket.data, name);
    });
  }

  const result = challongeInputSchema.safeParse(raw);
  if (!result.success) {
    throw new ChallongeFormatError('The file does not look like a Challonge response.');
  }
  return result.data;
}

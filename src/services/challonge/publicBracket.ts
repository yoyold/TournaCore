import { z } from 'zod';

import { challongeTournamentSchema, type ChallongeTournament } from './challongeSchema';

/**
 * The payload behind a public Challonge bracket page.
 *
 * Appending `.json` to a tournament URL returns the data the bracket drawing is
 * built from. It needs no API key, which matters: the v1 API authenticates every
 * request, so without this a migration would require the organiser to create a
 * key for tournaments that are already public.
 *
 * It is a different shape from the API, not a subset of it — participants exist
 * only inside the matches, rounds are keyed by number with the loser bracket
 * counted negatively, and the tournament's own name is not in the payload at
 * all. This module translates it into the API shape so there is one conversion
 * downstream rather than two.
 */

const id = z.union([z.number(), z.string()]).transform((value) => String(value));
const optionalId = z
  .union([z.number(), z.string(), z.null()])
  .transform((value) => (value === null ? undefined : String(value)));

const playerSchema = z.looseObject({
  id: optionalId.optional(),
  seed: z.number().optional(),
  display_name: z.string().nullable().optional(),
});

const matchSchema = z.looseObject({
  id,
  identifier: z.union([z.number(), z.string()]).optional(),
  round: z.number().optional(),
  state: z.string().optional(),
  /** Per-game scores as [[13, 7], [10, 13]]. */
  games: z.array(z.array(z.number())).optional(),
  scores: z.array(z.number()).optional(),
  player1: playerSchema.nullable().optional(),
  player2: playerSchema.nullable().optional(),
  winner_id: optionalId.optional(),
  loser_id: optionalId.optional(),
  forfeited: z.boolean().nullable().optional(),
});

const groupSchema = z.looseObject({
  name: z.string().nullable().optional(),
  tournament: z
    .looseObject({
      tournament_type: z.string().optional(),
      participant_count_to_advance: z.number().nullable().optional(),
    })
    .optional(),
  matches_by_round: z.record(z.string(), z.array(matchSchema)).optional(),
});

export const publicBracketSchema = z.looseObject({
  tournament: z.looseObject({
    id,
    state: z.string().optional(),
    tournament_type: z.string(),
    grand_finals_modifier: z.string().nullable().optional(),
    group_stage_progress_meter: z.number().nullable().optional(),
  }),
  matches_by_round: z.record(z.string(), z.array(matchSchema)),
  /** Each group is itself a little bracket payload. */
  groups: z.array(groupSchema).default([]),
});

export type PublicBracket = z.infer<typeof publicBracketSchema>;

/** Whether a payload looks like a public bracket rather than an API response. */
export function isPublicBracket(raw: unknown): boolean {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    'matches_by_round' in raw &&
    typeof (raw as { matches_by_round?: unknown }).matches_by_round === 'object'
  );
}

/**
 * Translates a public bracket into the API shape.
 *
 * `name` has to be supplied because the payload does not carry one — the page
 * title holds it, and this module never sees the page.
 */
export function fromPublicBracket(bracket: PublicBracket, name?: string): ChallongeTournament {
  const matches = Object.values(bracket.matches_by_round).flat();

  const groups = bracket.groups.map((group) => {
    const groupMatches = Object.values(group.matches_by_round ?? {}).flat();
    return {
      ...(group.name ? { name: group.name } : {}),
      ...(group.tournament?.tournament_type ? { type: group.tournament.tournament_type } : {}),
      ...(group.tournament?.participant_count_to_advance != null
        ? { advanceCount: group.tournament.participant_count_to_advance }
        : {}),
      participants: participantsOf(groupMatches).map((participant) => ({ participant })),
      matches: groupMatches.map((match) => ({ match: toApiMatch(match) })),
    };
  });

  const source = {
    id: bracket.tournament.id,
    name: name ?? `Challonge ${bracket.tournament.id}`,
    tournament_type: bracket.tournament.tournament_type,
    state: bracket.tournament.state,
    grand_finals_modifier: bracket.tournament.grand_finals_modifier,
    // A preliminary group phase reports its own progress; anything above zero
    // means the event has one.
    group_stages_enabled: (bracket.tournament.group_stage_progress_meter ?? 0) > 0,
    participants: participantsOf(matches).map((participant) => ({ participant })),
    matches: matches.map((match) => ({ match: toApiMatch(match) })),
    groups,
  };

  return challongeTournamentSchema.parse(source);
}

/**
 * Participants of a set of matches.
 *
 * They appear nowhere else in the payload, and everyone plays at least one
 * match, so nobody is lost by reading them off the fixtures.
 */
function participantsOf(
  matches: readonly z.infer<typeof matchSchema>[],
): { id: string; name: string; seed?: number }[] {
  const participants = new Map<string, { id: string; name: string; seed?: number }>();

  for (const match of matches) {
    for (const player of [match.player1, match.player2]) {
      if (!player?.id || participants.has(player.id)) continue;
      participants.set(player.id, {
        id: player.id,
        name: player.display_name ?? player.id,
        ...(player.seed !== undefined ? { seed: player.seed } : {}),
      });
    }
  }

  return [...participants.values()];
}

function toApiMatch(match: z.infer<typeof matchSchema>) {
  return {
    id: match.id,
    round: match.round,
    state: match.state,
    player1_id: match.player1?.id,
    player2_id: match.player2?.id,
    winner_id: match.winner_id,
    loser_id: match.loser_id,
    scores_csv: toScoresCsv(match.games, match.scores),
    forfeited: match.forfeited,
    // The identifier is Challonge's own play order, which is what keeps repeated
    // pairings on the right occasion.
    suggested_play_order: typeof match.identifier === 'number' ? match.identifier : undefined,
  };
}

/** [[13, 7], [10, 13]] into "13-7,10-13". */
function toScoresCsv(
  games: readonly (readonly number[])[] | undefined,
  scores: readonly number[] | undefined,
): string | undefined {
  const rows = games && games.length > 0 ? games : scores ? [scores] : [];
  const parts = rows
    .filter((row) => row.length >= 2)
    .map((row) => `${String(row[0])}-${String(row[1])}`);
  return parts.length > 0 ? parts.join(',') : undefined;
}

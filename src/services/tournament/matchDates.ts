import { playOrder } from '@domain/playOrder';

import type { Match, Stage, Tournament, TournamentId } from '@models/index';

/**
 * Repairing results that were all stamped at the same moment.
 *
 * A public Challonge bracket carries no dates, so every result of an imported
 * tournament used to be stamped with the moment of the import. That is harmless
 * for a table but not for Elo, which folds results in sequence: an archive
 * imported over an afternoon was rated in the order it happened to be pasted,
 * and within each tournament in the order the identifiers sorted — which put
 * the grand final first.
 *
 * The importer no longer does this. What it cannot fix is what is already
 * stored, which is what this is for.
 */

/** Matches a day apart by this much, matching what the importer now writes. */
const RESULT_SPACING_MS = 60_000;

export interface RepairedTournament {
  tournamentId: TournamentId;
  name: string;
  /** The date the results are moved onto. */
  playedAt: string;
  /** The matches whose stamp changes, already updated. */
  matches: Match[];
}

/**
 * Finds tournaments whose results were stamped in bulk and re-dates them.
 *
 * Only `outcome.decidedAt` changes. No result, participant or fixture is
 * touched, so nothing about who won what can move.
 */
export function repairMatchDates(input: {
  tournaments: readonly Tournament[];
  stages: readonly Stage[];
  matches: readonly Match[];
}): RepairedTournament[] {
  const { tournaments, stages, matches } = input;

  const orderOfStage = new Map(stages.map((stage) => [stage.id, stage.order]));
  const byTournament = new Map<TournamentId, Match[]>();

  for (const match of matches) {
    if (match.outcome === undefined) continue;
    const group = byTournament.get(match.tournamentId);
    if (group) group.push(match);
    else byTournament.set(match.tournamentId, [match]);
  }

  const repaired: RepairedTournament[] = [];

  for (const tournament of tournaments) {
    const played = byTournament.get(tournament.id) ?? [];
    if (!stampedInBulk(played)) continue;

    const playedAt = tournament.startsAt ?? tournament.createdAt;
    const start = Date.parse(playedAt);
    if (Number.isNaN(start)) continue;

    /*
     * Stages run one after another, and within a stage the matches run in
     * dependency order. Sorting the whole tournament at once would interleave a
     * playoff with the group stage that decides who plays in it.
     */
    const ordered = [...played]
      .sort((a, b) => (orderOfStage.get(a.stageId) ?? 0) - (orderOfStage.get(b.stageId) ?? 0))
      .reduce<Match[][]>((stagesOfMatches, match) => {
        const last = stagesOfMatches.at(-1);
        if (last && last[0]?.stageId === match.stageId) last.push(match);
        else stagesOfMatches.push([match]);
        return stagesOfMatches;
      }, [])
      .flatMap((forStage) => playOrder(forStage));

    const changed: Match[] = [];
    ordered.forEach((match, sequence) => {
      const decidedAt = new Date(start + sequence * RESULT_SPACING_MS).toISOString();
      if (match.outcome === undefined || match.outcome.decidedAt === decidedAt) return;
      changed.push({ ...match, outcome: { ...match.outcome, decidedAt } });
    });

    if (changed.length > 0) {
      repaired.push({
        tournamentId: tournament.id,
        name: tournament.name,
        playedAt,
        matches: changed,
      });
    }
  }

  return repaired;
}

/**
 * Whether a tournament's results were written all at once.
 *
 * Two results decided in the very same millisecond do not happen by hand, so a
 * repeated stamp is the fingerprint of a bulk write. Nothing else identifies an
 * import after the fact, and guessing from the value itself — comparing it
 * against the tournament date, say — would also re-date tournaments that were
 * genuinely played on the day they were entered.
 */
function stampedInBulk(played: readonly Match[]): boolean {
  const seen = new Set<string>();

  for (const match of played) {
    const decidedAt = match.outcome?.decidedAt;
    if (decidedAt === undefined || decidedAt === '') continue;
    if (seen.has(decidedAt)) return true;
    seen.add(decidedAt);
  }

  return false;
}

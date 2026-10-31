import { gamesFromSeries, looksLikeSeriesInOneMap } from '@domain/seriesScore';
import { newGameResultId, outcomeFromGames, type Match, type TournamentId } from '@models/index';

/**
 * Repairing series scores that were typed into the first map.
 *
 * The result panel used to offer map-by-map entry and nothing else, so a
 * best-of-three finishing 2:1 was written on the only row there was. The engine
 * counts map wins, read that as one map, and left the match open — the result
 * was stored, and every table, rating and bracket ignored it.
 *
 * The panel now takes a series score outright. What it cannot fix is what is
 * already stored, which is what this is for.
 */

export interface RepairedSeries {
  tournamentId: TournamentId;
  name: string;
  /** The matches whose maps change, already rewritten. */
  matches: Match[];
}

/**
 * Finds results that read as a series score on a single map and expands them.
 *
 * Only the maps and the outcome that follows from them change. Which two teams
 * met, and which of them the stored row says won, are left exactly as they
 * were — the repair gives the recorded winner the series they already had.
 */
export function repairSeriesScores(input: {
  tournaments: readonly { id: TournamentId; name: string }[];
  matches: readonly Match[];
}): RepairedSeries[] {
  const { tournaments, matches } = input;

  const byTournament = new Map<TournamentId, Match[]>();

  for (const match of matches) {
    // An explicitly recorded outcome is somebody's decision, not a misreading.
    if (match.outcome !== undefined) continue;

    const score = looksLikeSeriesInOneMap(match.games, match.format);
    if (!score) continue;

    const games = gamesFromSeries({ score, newId: newGameResultId });
    const repaired: Match = {
      ...match,
      games,
      /*
       * Dated from the record rather than the clock. These are finished events
       * being corrected, and stamping them with the moment of the repair would
       * reorder the Elo table the same way the bulk import once did.
       */
      ...(() => {
        const outcome = outcomeFromGames(games, match.format, match.updatedAt);
        return outcome ? { outcome } : {};
      })(),
    };

    const group = byTournament.get(match.tournamentId);
    if (group) group.push(repaired);
    else byTournament.set(match.tournamentId, [repaired]);
  }

  return tournaments.flatMap((tournament) => {
    const repaired = byTournament.get(tournament.id);
    return repaired === undefined || repaired.length === 0
      ? []
      : [{ tournamentId: tournament.id, name: tournament.name, matches: repaired }];
  });
}

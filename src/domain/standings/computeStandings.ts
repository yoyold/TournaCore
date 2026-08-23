import type { ResolvedMatch, Standing } from '../formats/types';
import type { Match, MatchId, ParticipantId, PointSystem, Tiebreaker } from '@models/index';

export interface StandingsInput {
  /** Participants that belong in the table, even if they have not played. */
  participants: readonly ParticipantId[];
  matches: readonly ResolvedMatch[];
  /** Stored records, for the per-map scores. */
  storedMatches: ReadonlyMap<MatchId, Match>;
  pointSystem: PointSystem;
  tiebreakers: readonly Tiebreaker[];
  /** Entry seed per participant, used as the final tie-breaker. */
  seedOf: (participantId: ParticipantId) => number;
}

interface Row {
  participantId: ParticipantId;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  mapsWon: number;
  mapsLost: number;
  /** Rounds within maps, e.g. 13:7 — the finest-grained margin available. */
  roundsWon: number;
  roundsLost: number;
  seed: number;
}

/**
 * Builds a league table from played matches.
 *
 * Shared by round robin and by each group of a group stage: a group *is* a round
 * robin, so giving them separate ranking code would mean two places to fix
 * whenever a tie-breaker changes.
 *
 * Participants who have not played yet still appear, on zero. Leaving them out
 * would make a table look wrong at the start of a stage, when it is consulted
 * most.
 */
export function computeStandings(input: StandingsInput): Standing[] {
  const { participants, matches, storedMatches, pointSystem, tiebreakers, seedOf } = input;

  const rows = new Map<ParticipantId, Row>();
  for (const participantId of participants) {
    rows.set(participantId, {
      participantId,
      points: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      mapsWon: 0,
      mapsLost: 0,
      roundsWon: 0,
      roundsLost: 0,
      seed: seedOf(participantId),
    });
  }

  const ensure = (participantId: ParticipantId): Row => {
    let row = rows.get(participantId);
    if (!row) {
      row = {
        participantId,
        points: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        mapsWon: 0,
        mapsLost: 0,
        roundsWon: 0,
        roundsLost: 0,
        seed: seedOf(participantId),
      };
      rows.set(participantId, row);
    }
    return row;
  };

  /** Who beat whom, for the head-to-head tie-breaker. */
  const headToHead = new Map<string, number>();

  for (const match of matches) {
    if (match.isBye || match.outcome === undefined) continue;

    const a = slotParticipant(match, 'A');
    const b = slotParticipant(match, 'B');
    if (a === undefined || b === undefined) continue;

    const rowA = ensure(a);
    const rowB = ensure(b);

    const stored = storedMatches.get(match.id);
    const maps = mapTally(stored);
    rowA.mapsWon += maps.a;
    rowA.mapsLost += maps.b;
    rowB.mapsWon += maps.b;
    rowB.mapsLost += maps.a;

    const rounds = roundTally(stored);
    rowA.roundsWon += rounds.a;
    rowA.roundsLost += rounds.b;
    rowB.roundsWon += rounds.b;
    rowB.roundsLost += rounds.a;

    const forfeited =
      match.outcome.reason === 'forfeit' || match.outcome.reason === 'disqualification';

    if (match.outcome.winner === 'draw') {
      rowA.draws += 1;
      rowB.draws += 1;
      rowA.points += pointSystem.draw;
      rowB.points += pointSystem.draw;
      continue;
    }

    const winner = match.outcome.winner === 'A' ? rowA : rowB;
    const loser = match.outcome.winner === 'A' ? rowB : rowA;

    winner.wins += 1;
    winner.points += pointSystem.win;
    loser.losses += 1;
    // A forfeit can carry its own point value, typically zero or a deduction.
    loser.points += forfeited ? pointSystem.forfeit : pointSystem.loss;

    bumpHeadToHead(headToHead, winner.participantId, loser.participantId);
  }

  const ordered = [...rows.values()].sort((a, b) => compare(a, b, tiebreakers, headToHead));

  return assignRanks(ordered, tiebreakers, headToHead);
}

/**
 * Compares two rows through the configured chain, stopping at the first
 * criterion that separates them.
 */
function compare(
  a: Row,
  b: Row,
  tiebreakers: readonly Tiebreaker[],
  headToHead: Map<string, number>,
): number {
  for (const tiebreaker of tiebreakers) {
    const result = applyTiebreaker(tiebreaker, a, b, headToHead);
    if (result !== 0) return result;
  }
  // Nothing separated them; keep the order stable rather than arbitrary.
  return a.participantId.localeCompare(b.participantId);
}

function applyTiebreaker(
  tiebreaker: Tiebreaker,
  a: Row,
  b: Row,
  headToHead: Map<string, number>,
): number {
  switch (tiebreaker) {
    case 'points':
      return b.points - a.points;

    case 'head_to_head': {
      /*
       * Only meaningful between two participants. With three or more level on
       * points, a cycle is possible (A beat B, B beat C, C beat A), and no
       * ordering of the pair comparison is defensible — so the chain moves on to
       * the next criterion instead of inventing one.
       */
      const aOverB = headToHead.get(pairKey(a.participantId, b.participantId)) ?? 0;
      const bOverA = headToHead.get(pairKey(b.participantId, a.participantId)) ?? 0;
      return bOverA - aOverB;
    }

    case 'map_difference':
      return b.mapsWon - b.mapsLost - (a.mapsWon - a.mapsLost);

    case 'maps_won':
      return b.mapsWon - a.mapsWon;

    case 'round_difference':
      return b.roundsWon - b.roundsLost - (a.roundsWon - a.roundsLost);

    case 'seed':
      // Lower seed number is stronger.
      return a.seed - b.seed;

    case 'buchholz':
    case 'median_buchholz':
      // Swiss-specific; not applicable to a round robin where everyone plays
      // everyone. Treated as no-op rather than throwing, so a shared default
      // chain can list them.
      return 0;

    case 'manual':
      // Reserved for an administrator override; nothing to compare yet.
      return 0;

    default:
      return 0;
  }
}

/**
 * Assigns ranks, giving equal rank to rows that no criterion separated, and
 * naming the criterion that did separate them for the UI to explain.
 */
function assignRanks(
  ordered: readonly Row[],
  tiebreakers: readonly Tiebreaker[],
  headToHead: Map<string, number>,
): Standing[] {
  const standings: Standing[] = [];
  let rank = 0;
  let sharedFrom = 0;

  ordered.forEach((row, index) => {
    const previous = index === 0 ? undefined : ordered[index - 1];
    const separator =
      previous === undefined
        ? undefined
        : decidingTiebreaker(previous, row, tiebreakers, headToHead);

    if (previous === undefined || separator !== undefined) {
      // Standard competition ranking: a shared rank consumes the places below it.
      rank = index + 1;
      sharedFrom = rank;
    } else {
      rank = sharedFrom;
    }

    standings.push({
      participantId: row.participantId,
      rank,
      points: row.points,
      wins: row.wins,
      losses: row.losses,
      draws: row.draws,
      mapsWon: row.mapsWon,
      mapsLost: row.mapsLost,
      ...(separator !== undefined && separator !== 'points'
        ? { tiebreakerApplied: separator }
        : {}),
    });
  });

  return standings;
}

function decidingTiebreaker(
  a: Row,
  b: Row,
  tiebreakers: readonly Tiebreaker[],
  headToHead: Map<string, number>,
): Tiebreaker | undefined {
  for (const tiebreaker of tiebreakers) {
    if (applyTiebreaker(tiebreaker, a, b, headToHead) !== 0) return tiebreaker;
  }
  return undefined;
}

function slotParticipant(match: ResolvedMatch, side: 'A' | 'B'): ParticipantId | undefined {
  const slot = side === 'A' ? match.slotA : match.slotB;
  return slot.kind === 'participant' ? slot.participantId : undefined;
}

function mapTally(match: Match | undefined): { a: number; b: number } {
  if (!match) return { a: 0, b: 0 };
  let a = 0;
  let b = 0;
  for (const game of match.games) {
    if (game.winner === 'A') a += 1;
    else if (game.winner === 'B') b += 1;
  }
  return { a, b };
}

function roundTally(match: Match | undefined): { a: number; b: number } {
  if (!match) return { a: 0, b: 0 };
  let a = 0;
  let b = 0;
  for (const game of match.games) {
    a += game.scoreA;
    b += game.scoreB;
  }
  return { a, b };
}

const pairKey = (winner: ParticipantId, loser: ParticipantId): string => `${winner}>${loser}`;

function bumpHeadToHead(
  table: Map<string, number>,
  winner: ParticipantId,
  loser: ParticipantId,
): void {
  const key = pairKey(winner, loser);
  table.set(key, (table.get(key) ?? 0) + 1);
}

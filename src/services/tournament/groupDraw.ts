import { drawGroups } from '@domain/formats/groupStage/draw';

import type { Participant, Team, TeamId } from '@models/index';

/**
 * Draws the groups of a field, keeping regions apart as far as possible.
 *
 * The draw itself knows nothing about teams: it separates entries carrying the
 * same label. Deciding that the label is the team's region is an application
 * question, and it lives here rather than in the engine so that the engine never
 * needs the team database to derive a tournament.
 *
 * The result is meant to be stored on the stage. A draw is an event, not a rule
 * — recomputing it on every read would let a correction to a team's region
 * rearrange the groups of a tournament that has already been played, and since a
 * stored result names a position rather than a pairing, the tables would change
 * hands without a single match being touched.
 */
export function drawRegionalGroups(input: {
  participants: readonly Participant[];
  teamOf: (id: TeamId) => Team | undefined;
  groupCount: number;
  /** Stable seed. The stage id makes each draw its own without being random. */
  seed: string;
}): number[][] {
  const { participants, teamOf, groupCount, seed } = input;

  return drawGroups({
    slotCount: participants.length,
    groupCount,
    seed,
    // Entry slots are filled from the entry list in order, so slot n holds the
    // nth participant.
    labelOf: (slot) => {
      const participant = participants[slot - 1];
      return participant === undefined ? undefined : teamOf(participant.teamId)?.region;
    },
  });
}

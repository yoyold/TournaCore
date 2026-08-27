import {
  newParticipantId,
  newTeamId,
  now,
  type Participant,
  type Stage,
  type Team,
  type TeamId,
} from '@models/index';

import { deriveTag, type ParsedParticipant } from './parseParticipants';

/**
 * Keeping a tournament editable while its field is still being assembled.
 *
 * An organiser rarely knows the whole field on the day they announce the event,
 * so a tournament exists before it starts: entrants are added over time and the
 * draw is made once, when it is started. Nothing about the bracket is stored in
 * the meantime — it is derived — so the only thing that has to follow the
 * growing field is how many entry slots the first stage declares.
 */

/** Below this no format can be drawn, so no tournament can be started. */
export const MINIMUM_FIELD = 2;

/**
 * Restates the entry slots of the stages that read from the entry list.
 *
 * A stage says how many participants it takes; every format then pads, rounds
 * and groups from that number alone. Later stages are fed by the ones before
 * them and are left untouched, which is what lets a group stage keep the
 * groups and the advancing places the organiser chose.
 */
export function resizeEntrySlots(stages: readonly Stage[], participantCount: number): Stage[] {
  // A stage with no slots at all is not representable, and a tournament with an
  // empty field has to remain openable.
  const slots = Math.max(participantCount, 1);

  return stages.map((stage) => {
    const entrySeeding = stage.entrySeeding.map((rule) =>
      rule.source.kind === 'participants' && rule.targetSlots.to !== slots
        ? { ...rule, targetSlots: { ...rule.targetSlots, to: slots } }
        : rule,
    );

    // Stages that already declared the right size are returned as they were, so
    // a caller can tell what actually changed by identity.
    const untouched = entrySeeding.every((rule, index) => rule === stage.entrySeeding[index]);
    return untouched ? stage : { ...stage, entrySeeding };
  });
}

/**
 * The field as it currently stands, in the form it is edited in.
 *
 * Participants point at teams; editing a field is about names and identities.
 * Reading one out of the other in a single place keeps the panel and the store
 * agreeing on what "the current field" means.
 */
export function fieldOf(
  participants: readonly Participant[],
  teamOf: (id: TeamId) => Team | undefined,
): ParsedParticipant[] {
  return participants.map((participant) => {
    const team = teamOf(participant.teamId);
    return {
      // A team deleted out from under a participant leaves the entry nameless
      // rather than inventing one. Naming it is the caller's business, and this
      // layer has no language to name it in.
      name: team?.name ?? '',
      teamId: participant.teamId,
      ...(team?.countryCode !== undefined ? { countryCode: team.countryCode } : {}),
    };
  });
}

export interface FieldUpdate {
  participants: Participant[];
  /** Teams that had to be created for entries typed rather than picked. */
  newTeams: Team[];
}

/**
 * Turns an edited field of entrants into participants, creating teams as needed.
 *
 * Seeds follow the order the entries are in, so reordering the list is how an
 * organiser seeds the draw. Participants that were already in the tournament
 * keep their identity, so an entry that merely moved does not lose whatever is
 * recorded against it.
 */
export function applyField(
  entries: readonly ParsedParticipant[],
  existing: readonly Participant[],
  knownTeams: readonly Team[],
): FieldUpdate {
  const timestamp = now();
  const byId = new Map(knownTeams.map((team) => [team.id, team]));
  const byName = new Map(knownTeams.map((team) => [team.name.toLowerCase(), team]));
  const previous = new Map(existing.map((participant) => [participant.teamId, participant]));
  const newTeams: Team[] = [];

  const participants = entries.map((entry, index): Participant => {
    const known =
      (entry.teamId === undefined ? undefined : byId.get(entry.teamId)) ??
      byName.get(entry.name.trim().toLowerCase());

    /*
     * An entry naming a team that no longer exists keeps pointing at it. The
     * alternative is to mint a replacement, which resurrects a deleted team
     * under whatever placeholder the entry was carrying.
     */
    if (!known && entry.teamId !== undefined) {
      const carried = previous.get(entry.teamId);
      return {
        id: carried?.id ?? newParticipantId(),
        teamId: entry.teamId,
        seed: index + 1,
        status: carried?.status ?? 'active',
        ...(carried?.note !== undefined ? { note: carried.note } : {}),
      };
    }

    let team = known;
    if (!team) {
      team = {
        id: newTeamId(),
        name: entry.name.trim(),
        tag: deriveTag(entry.name),
        socials: [],
        archived: false,
        createdAt: timestamp,
        updatedAt: timestamp,
        ...(entry.countryCode !== undefined ? { countryCode: entry.countryCode } : {}),
      };
      newTeams.push(team);
      byName.set(team.name.toLowerCase(), team);
      byId.set(team.id, team);
    }

    const carried = previous.get(team.id);
    return {
      id: carried?.id ?? newParticipantId(),
      teamId: team.id,
      seed: index + 1,
      status: carried?.status ?? 'active',
      ...(carried?.note !== undefined ? { note: carried.note } : {}),
    };
  });

  return { participants, newTeams };
}

/**
 * The field an organiser has assembled from both ways of entering one.
 *
 * Picked teams come first and typed ones after, so a list pasted from a
 * spreadsheet extends the field rather than reordering it. A typed line naming
 * a team that was already picked is dropped: entering the same club twice is a
 * slip, not an intention.
 */
export function composeField(
  pickedTeamIds: readonly TeamId[],
  teamsById: (id: TeamId) => Team | undefined,
  typed: readonly ParsedParticipant[],
): ParsedParticipant[] {
  const field: ParsedParticipant[] = [];
  const seen = new Set<string>();

  for (const teamId of pickedTeamIds) {
    const team = teamsById(teamId);
    if (!team || seen.has(team.name.toLowerCase())) continue;
    seen.add(team.name.toLowerCase());
    field.push({
      name: team.name,
      teamId: team.id,
      ...(team.countryCode !== undefined ? { countryCode: team.countryCode } : {}),
    });
  }

  for (const entry of typed) {
    const key = entry.name.trim().toLowerCase();
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    field.push(entry);
  }

  return field;
}

import {
  outcomeFromGames,
  stageSlotCount,
  type Match,
  type MatchId,
  type MatchOutcome,
  type ParticipantId,
  type Stage,
  type StageId,
  type Tournament,
  type TournamentId,
} from '@models/index';

import { requireFormat } from './formats/registry';
import { resolveSeeding, type SeedingSourceStage } from './seeding/resolveSeeding';

import type { GeneratedStructure, ResolvedStructure, Standing } from './formats/types';

export interface DerivedStage {
  stage: Stage;
  structure: GeneratedStructure;
  resolved: ResolvedStructure;
  standings: Standing[];
  /** Entry slots this stage was populated with, 1-based. */
  seededSlots: ReadonlyMap<number, ParticipantId>;
  /** True once every playable match in the stage has a result. */
  isComplete: boolean;
}

export interface DerivedTournamentState {
  tournamentId: TournamentId;
  stages: DerivedStage[];
  byStageId: ReadonlyMap<StageId, DerivedStage>;
  /** True once the final stage is complete. */
  isComplete: boolean;
  /** Final ranking, taken from the last stage. Empty while it is unfinished. */
  finalStandings: Standing[];
}

export interface DeriveInput {
  tournament: Tournament;
  stages: readonly Stage[];
  matches: readonly Match[];
}

/**
 * Derives the complete state of a tournament from its stored facts.
 *
 * This is the single most important function in the application, and the reason
 * brackets are never persisted. Everything visible — who plays whom, who
 * advanced, standings, final placements — is recomputed here from the
 * tournament configuration, the participant list and the recorded results.
 *
 * The practical consequence is that correcting a result in an early round
 * propagates through every later round and every later stage automatically.
 * There is no invalidation logic anywhere, because there is no stored state that
 * could go stale.
 *
 * Pure: same input, same output. No clock, no I/O, no randomness that is not
 * seeded from the input.
 */
export function deriveTournamentState(input: DeriveInput): DerivedTournamentState {
  const { tournament, stages, matches } = input;

  const ordered = [...stages]
    .filter((stage) => stage.tournamentId === tournament.id)
    .sort((a, b) => a.order - b.order);

  const outcomes = collectOutcomes(matches);
  const derived: DerivedStage[] = [];
  const byStageId = new Map<StageId, DerivedStage>();
  const sourceStages = new Map<StageId, SeedingSourceStage>();

  for (const stage of ordered) {
    const format = requireFormat(stage.format.kind);

    // Stages are processed in order, so every stage a seeding rule points back
    // to has already been derived. That is what makes multi-phase tournaments
    // work without any format knowing about the others.
    const seededSlots = resolveSeeding({
      rules: stage.entrySeeding,
      participants: tournament.participants,
      previousStages: sourceStages,
      drawSeed: stage.id,
    });

    const slotCount = Math.max(stageSlotCount(stage.entrySeeding), seededSlots.size);

    const structure = format.generateStructure({
      stageId: stage.id,
      config: stage.format as never,
      slotCount,
    });

    const resolved = format.resolveSlots({ structure, results: outcomes, seededSlots });

    const standings = format.computeStandings({
      structure: resolved,
      config: stage.format as never,
      seededSlots,
    });

    const entry: DerivedStage = {
      stage,
      structure,
      resolved,
      standings,
      seededSlots,
      isComplete: resolved.isComplete,
    };

    derived.push(entry);
    byStageId.set(stage.id, entry);
    sourceStages.set(stage.id, {
      stageId: stage.id,
      standings,
      resolved,
      isComplete: resolved.isComplete,
    });
  }

  const last = derived.at(-1);

  return {
    tournamentId: tournament.id,
    stages: derived,
    byStageId,
    isComplete: last?.isComplete ?? false,
    finalStandings: last?.isComplete === true ? last.standings : [],
  };
}

/**
 * Builds the outcome lookup the formats resolve against.
 *
 * An explicitly recorded outcome wins over the map results, because that is how
 * walkovers, forfeits and administrative corrections are expressed. Otherwise
 * the outcome follows from the maps played, so entering scores decides the match
 * without a separate confirmation step.
 */
function collectOutcomes(matches: readonly Match[]): Map<MatchId, MatchOutcome> {
  const outcomes = new Map<MatchId, MatchOutcome>();

  for (const match of matches) {
    if (match.outcome) {
      outcomes.set(match.id, match.outcome);
      continue;
    }
    const fromGames = outcomeFromGames(match.games, match.format, match.updatedAt);
    if (fromGames) outcomes.set(match.id, fromGames);
  }

  return outcomes;
}

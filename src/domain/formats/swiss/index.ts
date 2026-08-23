import { makeMatchId } from '@domain/matchId';
import { computeStandings } from '@domain/standings/computeStandings';

import { VALID } from '../types';

import { meetingKey, pairRound } from './pairing';

import type {
  GeneratedStructure,
  ResolveInput,
  ResolvedMatch,
  ResolvedSlot,
  ResolvedStructure,
  RoundInfo,
  Standing,
  StandingsInput,
  StructuralMatch,
  TournamentFormat,
  ValidationResult,
} from '../types';
import type {
  MatchId,
  MatchOutcome,
  MatchPosition,
  MatchStatus,
  ParticipantId,
  StageId,
  SwissConfig,
} from '@models/index';

const MAX_SLOTS = 512;
const MAX_ROUNDS = 32;

/**
 * Builds the Swiss skeleton.
 *
 * Only the shape is fixed here — a set number of rounds, each holding half the
 * field. Who plays whom cannot be decided in advance: Swiss pairs round n from
 * the results of round n-1, so the slots stay undetermined and the pairing is
 * worked out during resolution instead.
 */
export function generateSwiss(input: {
  stageId: StageId;
  config: SwissConfig;
  slotCount: number;
}): GeneratedStructure {
  const { stageId, config, slotCount } = input;

  const matches: StructuralMatch[] = [];
  const rounds: RoundInfo[] = [];

  if (slotCount < 2 || config.rounds < 1) {
    return { stageId, slotCount, matches, rounds };
  }

  // An odd field needs one more match than there are pairs, to hold the bye.
  const perRound = Math.ceil(slotCount / 2);

  for (let round = 0; round < config.rounds; round += 1) {
    for (let index = 0; index < perRound; index += 1) {
      const position: MatchPosition = { round, indexInRound: index };
      matches.push({
        id: makeMatchId(stageId, position),
        position,
        slotA: { kind: 'tbd' },
        slotB: { kind: 'tbd' },
        format: config.matchFormat,
      });
    }
    rounds.push({ round, matchCount: perRound });
  }

  return { stageId, slotCount, matches, rounds };
}

/**
 * Resolves a Swiss stage, pairing each round as it goes.
 *
 * This is the only format whose fixtures are not fixed by the structure, and it
 * is worth being explicit about the consequence: correcting a result in round
 * two changes who meets whom in round three. That is not a defect in the
 * derivation, it is what Swiss is — the pairing is a function of the standings,
 * so an altered standing alters it. Because nothing downstream is stored, that
 * correction simply flows through instead of leaving a bracket inconsistent.
 *
 * Rounds are paired on points and entry seed alone rather than the full
 * tie-breaking chain. Buchholz and its relatives depend on opponents' final
 * scores, which are still moving while the stage runs, so feeding them back into
 * the pairing would make earlier rounds depend on later ones.
 */
export function resolveSwiss(input: ResolveInput<SwissConfig>): ResolvedStructure {
  const { structure, results, seededSlots, config } = input;

  const seedOf = new Map<ParticipantId, number>();
  for (const [slotIndex, participantId] of [...seededSlots.entries()].sort((a, b) => a[0] - b[0])) {
    if (!seedOf.has(participantId)) seedOf.set(participantId, slotIndex);
  }
  const field = [...seedOf.keys()];

  const points = new Map<ParticipantId, number>(field.map((id) => [id, 0]));
  const played = new Set<string>();
  const byes = new Set<ParticipantId>();

  const resolved = new Map<MatchId, ResolvedMatch>();
  const ordered: ResolvedMatch[] = [];

  const roundNumbers = [...new Set(structure.matches.map((match) => match.position.round))].sort(
    (a, b) => a - b,
  );

  let previousRoundDecided = true;

  for (const round of roundNumbers) {
    const inRound = structure.matches
      .filter((match) => match.position.round === round)
      .sort((a, b) => a.position.indexInRound - b.position.indexInRound);

    /*
     * A round is drawn only once the one before it has finished.
     *
     * Pairing it earlier would be easy — everyone still level would fold neatly
     * into a full schedule — and it would be a lie. Those pairings depend on
     * results that do not exist yet, and publishing them would tell an organiser
     * that round three is settled when it is not. Undrawn rounds stay visibly
     * undrawn.
     */
    if (!previousRoundDecided) {
      for (const match of inRound) {
        const entry: ResolvedMatch = {
          id: match.id,
          position: match.position,
          format: match.format,
          slotA: { kind: 'tbd', source: { kind: 'tbd' } },
          slotB: { kind: 'tbd', source: { kind: 'tbd' } },
          status: 'pending',
          isBye: false,
        };
        resolved.set(match.id, entry);
        ordered.push(entry);
      }
      continue;
    }

    const ranked = [...field].sort(
      (a, b) =>
        (points.get(b) ?? 0) - (points.get(a) ?? 0) || (seedOf.get(a) ?? 0) - (seedOf.get(b) ?? 0),
    );

    const pairing =
      field.length >= 2
        ? pairRound({
            ranked,
            pointsOf: (participantId) => points.get(participantId) ?? 0,
            played,
            byes,
            mode: config.pairing,
            avoidRematches: config.avoidRematches,
            drawSeed: `${structure.stageId}:${String(round)}`,
          })
        : { pairs: [] };

    inRound.forEach((match, index) => {
      const pair = pairing.pairs[index];
      const isByeSlot =
        pair === undefined && pairing.bye !== undefined && index === inRound.length - 1;

      const slotA: ResolvedSlot = pair
        ? { kind: 'participant', participantId: pair[0] }
        : isByeSlot && pairing.bye !== undefined
          ? { kind: 'participant', participantId: pairing.bye }
          : { kind: 'bye' };
      const slotB: ResolvedSlot = pair
        ? { kind: 'participant', participantId: pair[1] }
        : { kind: 'bye' };

      const isBye = slotA.kind === 'participant' && slotB.kind === 'bye';
      const isEmpty = slotA.kind === 'bye' && slotB.kind === 'bye';

      const recorded = results.get(match.id);
      let outcome: MatchOutcome | undefined = recorded;
      let status: MatchStatus;

      if (isEmpty) {
        // More slots than participants: nothing to play here.
        outcome = undefined;
        status = 'cancelled';
      } else if (isBye) {
        outcome = { winner: 'A', reason: 'bye', decidedAt: '' };
        status = 'walkover';
      } else if (recorded) {
        status =
          recorded.reason === 'played' || recorded.reason === 'manual' ? 'completed' : 'walkover';
      } else {
        status = 'ready';
      }

      const participantA = slotA.kind === 'participant' ? slotA.participantId : undefined;
      const participantB = slotB.kind === 'participant' ? slotB.participantId : undefined;

      const winnerId =
        outcome && outcome.winner !== 'draw'
          ? outcome.winner === 'A'
            ? participantA
            : participantB
          : undefined;
      const loserId =
        outcome && outcome.winner !== 'draw'
          ? outcome.winner === 'A'
            ? participantB
            : participantA
          : undefined;

      const entry: ResolvedMatch = {
        id: match.id,
        position: match.position,
        format: match.format,
        slotA,
        slotB,
        status,
        isBye,
        ...(outcome ? { outcome } : {}),
        ...(winnerId !== undefined ? { winnerId } : {}),
        ...(loserId !== undefined ? { loserId } : {}),
      };

      resolved.set(match.id, entry);
      ordered.push(entry);
    });

    // Fold this round in before pairing the next one.
    if (pairing.bye !== undefined) {
      byes.add(pairing.bye);
      points.set(pairing.bye, (points.get(pairing.bye) ?? 0) + config.pointSystem.win);
    }

    for (const [a, b] of pairing.pairs) {
      played.add(meetingKey(a, b));
    }

    for (const match of inRound) {
      const entry = resolved.get(match.id);
      if (!entry?.outcome || entry.isBye) continue;

      const a = entry.slotA.kind === 'participant' ? entry.slotA.participantId : undefined;
      const b = entry.slotB.kind === 'participant' ? entry.slotB.participantId : undefined;
      if (a === undefined || b === undefined) continue;

      if (entry.outcome.winner === 'draw') {
        points.set(a, (points.get(a) ?? 0) + config.pointSystem.draw);
        points.set(b, (points.get(b) ?? 0) + config.pointSystem.draw);
        continue;
      }

      const forfeited =
        entry.outcome.reason === 'forfeit' || entry.outcome.reason === 'disqualification';
      const winner = entry.outcome.winner === 'A' ? a : b;
      const loser = entry.outcome.winner === 'A' ? b : a;

      points.set(winner, (points.get(winner) ?? 0) + config.pointSystem.win);
      points.set(
        loser,
        (points.get(loser) ?? 0) +
          (forfeited ? config.pointSystem.forfeit : config.pointSystem.loss),
      );
    }

    previousRoundDecided = inRound.every((match) => {
      const entry = resolved.get(match.id);
      return entry === undefined || entry.isBye || entry.status === 'cancelled' || !!entry.outcome;
    });
  }

  const isComplete = ordered.every(
    (match) => match.isBye || match.status === 'cancelled' || match.outcome !== undefined,
  );

  return { stageId: structure.stageId, matches: ordered, byId: resolved, isComplete };
}

function standings(input: StandingsInput<SwissConfig>): Standing[] {
  const { structure, config, seededSlots, storedMatches } = input;

  const seedOf = new Map<ParticipantId, number>();
  for (const [slotIndex, participantId] of [...seededSlots.entries()].sort((a, b) => a[0] - b[0])) {
    if (!seedOf.has(participantId)) seedOf.set(participantId, slotIndex);
  }

  // A bye is a free win in Swiss, so it has to reach the table — the shared
  // engine skips bye matches, which is right for a league and wrong here.
  const byes = new Map<ParticipantId, number>();
  for (const match of structure.matches) {
    // The resolver always seats the resting participant on side A, so there is
    // only one side to look at.
    if (!match.isBye || match.slotA.kind !== 'participant') continue;
    const participantId = match.slotA.participantId;
    byes.set(participantId, (byes.get(participantId) ?? 0) + 1);
  }

  return computeStandings({
    participants: [...seedOf.keys()],
    matches: structure.matches,
    storedMatches: storedMatches ?? new Map(),
    pointSystem: config.pointSystem,
    tiebreakers: config.tiebreakers,
    seedOf: (participantId) => seedOf.get(participantId) ?? Number.MAX_SAFE_INTEGER,
    byes,
  });
}

function validate(config: SwissConfig, slotCount: number): ValidationResult {
  const issues = [];

  if (slotCount < 2) {
    issues.push({
      code: 'swiss.too_few_participants',
      severity: 'error' as const,
      message: 'A Swiss stage needs at least two participants.',
    });
  }

  if (slotCount > MAX_SLOTS) {
    issues.push({
      code: 'swiss.too_many_participants',
      severity: 'error' as const,
      message: `A Swiss stage supports at most ${String(MAX_SLOTS)} participants.`,
    });
  }

  if (config.rounds < 1) {
    issues.push({
      code: 'swiss.no_rounds',
      severity: 'error' as const,
      message: 'A Swiss stage needs at least one round.',
    });
  }

  if (config.rounds > MAX_ROUNDS) {
    issues.push({
      code: 'swiss.too_many_rounds',
      severity: 'error' as const,
      message: `A Swiss stage supports at most ${String(MAX_ROUNDS)} rounds.`,
    });
  }

  /*
   * Below log2(n) rounds the field cannot separate: there are more participants
   * still capable of a perfect score than there are places at the top.
   */
  if (slotCount >= 2 && config.rounds > 0 && config.rounds < Math.ceil(Math.log2(slotCount))) {
    issues.push({
      code: 'swiss.too_few_rounds',
      severity: 'warning' as const,
      message: `${String(Math.ceil(Math.log2(slotCount)))} rounds are needed to separate this field.`,
    });
  }

  // Everyone can play everyone else exactly once; beyond that a rematch is
  // arithmetic rather than bad luck.
  if (config.avoidRematches && config.rounds > slotCount - 1) {
    issues.push({
      code: 'swiss.rematches_unavoidable',
      severity: 'warning' as const,
      message: 'More rounds than opponents: some pairings will have to repeat.',
    });
  }

  const blocking = issues.some((issue) => issue.severity === 'error');
  return issues.length === 0 ? VALID : { valid: !blocking, issues };
}

export const swissFormat: TournamentFormat<SwissConfig> = {
  kind: 'swiss',
  generateStructure: generateSwiss,
  resolveSlots: resolveSwiss,
  computeStandings: standings,
  validate,
};

export { pairRound, meetingKey } from './pairing';

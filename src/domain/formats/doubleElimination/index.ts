import { VALID } from '../types';

import { generateDoubleElimination } from './generate';
import { resolveDoubleElimination } from './resolve';
import { computeDoubleEliminationStandings } from './standings';

import type { TournamentFormat, ValidationResult } from '../types';
import type { DoubleEliminationConfig } from '@models/index';

/**
 * Upper bound on participants.
 *
 * Half the single elimination limit: a double elimination bracket of the same
 * field has roughly twice the matches and a loser bracket twice as many rounds
 * wide, and past this point the drawing becomes unreadable rather than merely
 * large.
 */
const MAX_SLOTS = 128;

function validate(_config: DoubleEliminationConfig, slotCount: number): ValidationResult {
  const issues = [];

  if (slotCount < 2) {
    issues.push({
      code: 'double_elimination.too_few_participants',
      severity: 'error' as const,
      message: 'A double elimination bracket needs at least two participants.',
    });
  }

  if (slotCount > MAX_SLOTS) {
    issues.push({
      code: 'double_elimination.too_many_participants',
      severity: 'error' as const,
      message: `A double elimination bracket supports at most ${String(MAX_SLOTS)} participants.`,
    });
  }

  /*
   * With three participants the bracket is mostly empty: one first-round match,
   * a loser bracket that never fills, and a grand final. It works, but the
   * result is closer to a play-off than to double elimination, so the organiser
   * is warned rather than blocked.
   */
  if (slotCount === 3) {
    issues.push({
      code: 'double_elimination.sparse_bracket',
      severity: 'warning' as const,
      message: 'Three participants leave large parts of the bracket empty.',
    });
  }

  const blocking = issues.some((issue) => issue.severity === 'error');
  return issues.length === 0 ? VALID : { valid: !blocking, issues };
}

export const doubleEliminationFormat: TournamentFormat<DoubleEliminationConfig> = {
  kind: 'double_elimination',
  generateStructure: generateDoubleElimination,
  resolveSlots: resolveDoubleElimination,
  computeStandings: computeDoubleEliminationStandings,
  validate,
};

export { generateDoubleElimination, resolveDoubleElimination, computeDoubleEliminationStandings };
export { loserRoundMatchCount } from './generate';

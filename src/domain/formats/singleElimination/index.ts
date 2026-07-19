import { VALID } from '../types';

import { generateSingleElimination } from './generate';
import { resolveSingleElimination } from './resolve';
import { computeSingleEliminationStandings } from './standings';

import type { TournamentFormat, ValidationResult } from '../types';
import type { SingleEliminationConfig } from '@models/index';

/** Upper bound on participants, matching the bracket layout budget. */
const MAX_SLOTS = 256;

function validate(_config: SingleEliminationConfig, slotCount: number): ValidationResult {
  const issues = [];

  if (slotCount < 2) {
    issues.push({
      code: 'single_elimination.too_few_participants',
      severity: 'error' as const,
      message: 'A single elimination bracket needs at least two participants.',
    });
  }

  if (slotCount > MAX_SLOTS) {
    issues.push({
      code: 'single_elimination.too_many_participants',
      severity: 'error' as const,
      message: `A single elimination bracket supports at most ${String(MAX_SLOTS)} participants.`,
    });
  }

  return issues.length === 0 ? VALID : { valid: false, issues };
}

export const singleEliminationFormat: TournamentFormat<SingleEliminationConfig> = {
  kind: 'single_elimination',
  generateStructure: generateSingleElimination,
  resolveSlots: resolveSingleElimination,
  computeStandings: computeSingleEliminationStandings,
  validate,
};

export { generateSingleElimination, resolveSingleElimination, computeSingleEliminationStandings };

import { InvariantError } from '@utils/invariant';

import { doubleEliminationFormat } from './doubleElimination';
import { groupStageFormat } from './groupStage';
import { roundRobinFormat } from './roundRobin';
import { singleEliminationFormat } from './singleElimination';
import { swissFormat } from './swiss';

import type { TournamentFormat } from './types';
import type { FormatConfig, FormatKind } from '@models/index';

/**
 * Registry of available tournament formats.
 *
 * Adding a format means writing one file and registering it here — the engine
 * itself never changes. That is the open/closed principle applied where it
 * actually pays off: the set of formats is the part of this application most
 * certain to keep growing.
 */
const registry = new Map<FormatKind, TournamentFormat<never>>();

function register<TConfig extends FormatConfig>(format: TournamentFormat<TConfig>): void {
  registry.set(format.kind, format as unknown as TournamentFormat<never>);
}

register(singleEliminationFormat);
register(doubleEliminationFormat);
register(roundRobinFormat);
register(groupStageFormat);
register(swissFormat);

/** Returns the format handler, or undefined when the kind is not implemented yet. */
export function findFormat(kind: FormatKind): TournamentFormat<never> | undefined {
  return registry.get(kind);
}

/**
 * Returns the format handler or throws.
 *
 * Use when a stage is already persisted: a stored configuration whose format is
 * unknown means corrupted data or a downgrade, and failing loudly beats
 * rendering an empty bracket.
 */
export function requireFormat(kind: FormatKind): TournamentFormat<never> {
  const format = registry.get(kind);
  if (!format) throw new InvariantError(`No handler registered for format "${kind}"`);
  return format;
}

/** Format kinds that are currently implemented. */
export function availableFormats(): FormatKind[] {
  return [...registry.keys()];
}

/**
 * Whether a format is drawn as a bracket rather than as a table of fixtures.
 *
 * A presentation question, but one that has to be answered identically by the
 * tournament page and by the wizard preview — a preview that shows a fixture
 * list for something the live page draws as a bracket would be worse than no
 * preview at all.
 */
export function isBracketFormat(kind: FormatKind): boolean {
  return kind === 'single_elimination' || kind === 'double_elimination';
}

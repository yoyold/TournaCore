import { InvariantError } from '@utils/invariant';

import { singleEliminationFormat } from './singleElimination';

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

/**
 * Error for violated invariants: states the data model rules out.
 * A dedicated class so the error boundary can tell them apart from expected failures.
 */
export class InvariantError extends Error {
  override readonly name = 'InvariantError';

  constructor(message: string) {
    super(`Invariant violated: ${message}`);
  }
}

/**
 * Throws if the condition does not hold, narrowing the type along the way.
 *
 * Intended for assertions that follow from the data model but cannot be
 * expressed in the type system, such as a resolved match slot no longer being
 * undecided after derivation succeeded. Triggering one always means a
 * programming error, never invalid user input. Schema validation covers the latter.
 */
export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new InvariantError(message);
}

/**
 * Exhaustiveness check for discriminated unions.
 *
 * Used in the default branch of switch statements over format configurations,
 * match slots and seeding sources. If someone adds a variant without updating
 * every site that handles them, the compiler flags it instead of the error
 * surfacing at runtime in a live tournament.
 */
export function assertNever(value: never, context = 'unhandled variant'): never {
  throw new InvariantError(`${context}: ${JSON.stringify(value)}`);
}

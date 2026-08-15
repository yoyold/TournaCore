import { beforeEach, describe, expect, it } from 'vitest';

import { isChunkLoadError } from './lazyRoute';

describe('isChunkLoadError', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  /**
   * These are the messages browsers actually produce when a hashed chunk is gone
   * after a deployment. Recognising them is what separates "reload and recover"
   * from "show the user a dead end".
   */
  it('recognises the failures a stale deployment produces', () => {
    const messages = [
      'Failed to fetch dynamically imported module: https://example.invalid/assets/Page-abc.js',
      'error loading dynamically imported module',
      'Importing a module script failed.',
      'Failed to fetch',
    ];

    for (const message of messages) {
      expect(isChunkLoadError(new Error(message)), message).toBe(true);
    }
  });

  it('recognises a named ChunkLoadError', () => {
    const error = new Error('boom');
    error.name = 'ChunkLoadError';
    expect(isChunkLoadError(error)).toBe(true);
  });

  /**
   * A reload cannot fix a genuine bug, so misclassifying one would hide it
   * behind a page refresh — and lose the stack trace with it.
   */
  it('does not treat ordinary errors as a stale chunk', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkLoadError(new TypeError('x is not a function'))).toBe(false);
  });

  it('ignores values that are not errors', () => {
    expect(isChunkLoadError('Failed to fetch')).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});

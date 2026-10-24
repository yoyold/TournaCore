import { afterEach, describe, expect, it, vi } from 'vitest';

import { requestDurableStorage, storageDurability, storageUsage } from './persistence';

type FakeStorage = Partial<{
  persisted: () => Promise<boolean>;
  persist: () => Promise<boolean>;
  estimate: () => Promise<{ usage?: number }>;
}>;

const original = Object.getOwnPropertyDescriptor(globalThis.navigator, 'storage');

/** Replaces the storage manager, including removing it altogether. */
function withStorage(storage: FakeStorage | undefined): void {
  Object.defineProperty(globalThis.navigator, 'storage', {
    value: storage,
    configurable: true,
  });
}

afterEach(() => {
  if (original) Object.defineProperty(globalThis.navigator, 'storage', original);
});

describe('storageDurability', () => {
  it('reports a promise the browser has made', async () => {
    withStorage({ persisted: () => Promise.resolve(true) });
    await expect(storageDurability()).resolves.toBe('persisted');
  });

  it('reports the absence of one', async () => {
    withStorage({ persisted: () => Promise.resolve(false) });
    await expect(storageDurability()).resolves.toBe('best_effort');
  });

  /**
   * An insecure context has no storage manager at all, and TypeScript insists
   * it is always there — so the guard has to survive it actually being missing.
   */
  it('copes with a browser that has no storage manager', async () => {
    withStorage(undefined);
    await expect(storageDurability()).resolves.toBe('unsupported');
  });

  it('copes with a storage manager that cannot be asked', async () => {
    withStorage({});
    await expect(storageDurability()).resolves.toBe('unsupported');
  });

  /** A browser that refuses to answer is one that makes no promise. */
  it('treats a thrown answer as no promise', async () => {
    withStorage({ persisted: () => Promise.reject(new Error('denied')) });
    await expect(storageDurability()).resolves.toBe('best_effort');
  });
});

describe('requestDurableStorage', () => {
  it('asks, and reports that the browser agreed', async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    withStorage({ persisted: () => Promise.resolve(false), persist });

    await expect(requestDurableStorage()).resolves.toBe('persisted');
    expect(persist).toHaveBeenCalledOnce();
  });

  it('reports a refusal rather than swallowing it', async () => {
    withStorage({ persisted: () => Promise.resolve(false), persist: () => Promise.resolve(false) });
    await expect(requestDurableStorage()).resolves.toBe('best_effort');
  });

  /**
   * Firefox prompts the user on `persist()`. Prompting somebody who is already
   * covered would be noise, so a granted origin is never asked again.
   */
  it('does not ask again once the promise exists', async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    withStorage({ persisted: () => Promise.resolve(true), persist });

    await expect(requestDurableStorage()).resolves.toBe('persisted');
    expect(persist).not.toHaveBeenCalled();
  });

  it('treats a thrown request as a refusal', async () => {
    withStorage({
      persisted: () => Promise.resolve(false),
      persist: () => Promise.reject(new Error('blocked')),
    });

    await expect(requestDurableStorage()).resolves.toBe('best_effort');
  });

  it('says nothing can be asked of a browser without the feature', async () => {
    withStorage({ persisted: () => Promise.resolve(false) });
    await expect(requestDurableStorage()).resolves.toBe('unsupported');
  });
});

describe('storageUsage', () => {
  it('reports what the origin holds, alongside the promise', async () => {
    withStorage({
      persisted: () => Promise.resolve(true),
      estimate: () => Promise.resolve({ usage: 2048 }),
    });

    await expect(storageUsage()).resolves.toEqual({ bytes: 2048, durability: 'persisted' });
  });

  /** A figure the browser withholds is left out rather than reported as zero. */
  it('omits the size when the browser will not give one', async () => {
    withStorage({ persisted: () => Promise.resolve(false), estimate: () => Promise.resolve({}) });
    await expect(storageUsage()).resolves.toEqual({ durability: 'best_effort' });
  });

  it('still reports the promise when the estimate throws', async () => {
    withStorage({
      persisted: () => Promise.resolve(true),
      estimate: () => Promise.reject(new Error('nope')),
    });

    await expect(storageUsage()).resolves.toEqual({ durability: 'persisted' });
  });
});

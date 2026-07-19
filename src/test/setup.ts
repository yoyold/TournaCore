import '@testing-library/jest-dom/vitest';
/*
 * Initialise i18n for component tests. Without it `useTranslation` returns the
 * key instead of the string, so assertions would silently verify key names
 * rather than what a user actually reads.
 */
import '@/i18n/config';

import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

/**
 * jsdom does not implement matchMedia. Theme resolution and the sidebar collapse
 * both depend on it, so it is stubbed globally with `matches: false`, which in
 * our logic means "dark theme, wide window". Individual tests can override it.
 */
beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

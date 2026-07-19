import { useCallback, useEffect, useState } from 'react';

import {
  useSettingsStore,
  type ResolvedTheme,
  type ThemePreference,
} from '@store/slices/settingsSlice';

const MEDIA_QUERY = '(prefers-color-scheme: light)';

function readSystemTheme(): ResolvedTheme {
  // Fall back to dark when there is no window (test environment).
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia(MEDIA_QUERY).matches ? 'light' : 'dark';
}

function resolve(preference: ThemePreference, systemTheme: ResolvedTheme): ResolvedTheme {
  return preference === 'system' ? systemTheme : preference;
}

export interface UseThemeResult {
  /** What the user picked, possibly `system`. */
  preference: ThemePreference;
  /** What is actually applied, never `system`. */
  resolved: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
  /** Switches between light and dark based on what is currently visible. */
  toggle: () => void;
}

/**
 * Connects the theme preference to the `data-theme` attribute on the root element.
 *
 * The initial value is already applied by the inline script in index.html; this
 * hook takes over afterwards and keeps the attribute in sync, including when the
 * user changes their system theme while `system` is selected.
 */
export function useTheme(): UseThemeResult {
  const preference = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(readSystemTheme);

  useEffect(() => {
    const mql = window.matchMedia(MEDIA_QUERY);
    const onChange = (event: MediaQueryListEvent): void => {
      setSystemTheme(event.matches ? 'light' : 'dark');
    };
    mql.addEventListener('change', onChange);
    return () => {
      mql.removeEventListener('change', onChange);
    };
  }, []);

  const resolved = resolve(preference, systemTheme);

  useEffect(() => {
    document.documentElement.dataset['theme'] = resolved;
  }, [resolved]);

  const toggle = useCallback(() => {
    setTheme(resolved === 'dark' ? 'light' : 'dark');
  }, [resolved, setTheme]);

  return { preference, resolved, setTheme, toggle };
}

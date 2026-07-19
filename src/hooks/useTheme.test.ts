import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useSettingsStore } from '@store/slices/settingsSlice';

import { useTheme } from './useTheme';

describe('useTheme', () => {
  beforeEach(() => {
    useSettingsStore.setState({ theme: 'system' });
    delete document.documentElement.dataset['theme'];
  });

  it('resolves `system` to a concrete theme', () => {
    // The test setup stubs matchMedia to report `matches: false` for
    // "(prefers-color-scheme: light)", which means dark.
    const { result } = renderHook(() => useTheme());

    expect(result.current.preference).toBe('system');
    expect(result.current.resolved).toBe('dark');
  });

  it('writes the resolved theme to the root element', () => {
    renderHook(() => useTheme());
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('switches to the opposite theme when toggled', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.toggle();
    });

    expect(result.current.preference).toBe('light');
    expect(result.current.resolved).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
  });

  it('applies an explicit selection', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('light');
    });
    expect(result.current.resolved).toBe('light');

    act(() => {
      result.current.setTheme('dark');
    });
    expect(result.current.resolved).toBe('dark');
  });

  it('persists the selection under the key index.html reads', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('light');
    });

    // The inline script in index.html reads exactly this path. If this test
    // breaks, the wrong theme flashes on load.
    const raw = localStorage.getItem('tournacore.settings');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toMatchObject({ state: { theme: 'light' } });
  });
});

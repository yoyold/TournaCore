import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Theme selectable by the user. `system` follows the operating system setting. */
export type ThemePreference = 'light' | 'dark' | 'system';

/** Theme actually applied, with `system` already resolved. */
export type ResolvedTheme = 'light' | 'dark';

export type LanguagePreference = 'de' | 'en';

export interface SettingsState {
  theme: ThemePreference;
  language: LanguagePreference;
  /** Debounced persistence after every mutation. */
  autosave: boolean;
  hasSeenWelcome: boolean;

  setTheme: (theme: ThemePreference) => void;
  setLanguage: (language: LanguagePreference) => void;
  setAutosave: (enabled: boolean) => void;
  markWelcomeSeen: () => void;
}

/**
 * Storage key. Must match the inline script in index.html that applies the theme
 * before first paint to avoid a flash of the wrong theme.
 */
export const SETTINGS_STORAGE_KEY = 'tournacore.settings';

/**
 * UI preferences live in LocalStorage rather than IndexedDB: they are needed
 * synchronously at startup by the inline script, and they are tiny. Domain data
 * goes to IndexedDB instead, which handles blobs and has no practical size limit.
 */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      language: 'de',
      autosave: true,
      hasSeenWelcome: false,

      setTheme: (theme) => {
        set({ theme });
      },
      setLanguage: (language) => {
        set({ language });
      },
      setAutosave: (autosave) => {
        set({ autosave });
      },
      markWelcomeSeen: () => {
        set({ hasSeenWelcome: true });
      },
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      version: 1,
      partialize: (state) => ({
        theme: state.theme,
        language: state.language,
        autosave: state.autosave,
        hasSeenWelcome: state.hasSeenWelcome,
      }),
    },
  ),
);

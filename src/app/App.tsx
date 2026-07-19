import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { RouterProvider } from 'react-router-dom';

import { useDataStore } from '@store/slices/dataSlice';
import { useSettingsStore } from '@store/slices/settingsSlice';

import { ErrorBoundary } from './ErrorBoundary';
import { router } from './router';

export function App() {
  const { i18n } = useTranslation();
  const language = useSettingsStore((s) => s.language);
  const hydrate = useDataStore((s) => s.hydrate);

  // Load persisted data once. Everything the UI shows is derived from it.
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  /**
   * Apply the persisted language and keep the `lang` attribute in sync. The
   * attribute is not a formality: screen readers pick their pronunciation from
   * it, and browsers use it for hyphenation.
   */
  useEffect(() => {
    if (i18n.language !== language) {
      void i18n.changeLanguage(language);
    }
    document.documentElement.lang = language;
  }, [i18n, language]);

  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
}

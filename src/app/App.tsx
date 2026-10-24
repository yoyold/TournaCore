import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { RouterProvider } from 'react-router-dom';

import { useDataStore } from '@store/slices/dataSlice';
import { useSettingsStore } from '@store/slices/settingsSlice';
import { useStorageStore } from '@store/slices/storageSlice';

import { ErrorBoundary } from './ErrorBoundary';
import { router } from './router';

export function App() {
  const { i18n } = useTranslation();
  const language = useSettingsStore((s) => s.language);
  const hydrate = useDataStore((s) => s.hydrate);
  const ensureDurable = useStorageStore((s) => s.ensureDurable);

  // Load persisted data once. Everything the UI shows is derived from it.
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  /*
   * Ask the browser to keep that data rather than treat it as disposable.
   * IndexedDB is best effort by default, and this application has no server to
   * recover from — an evicted database is an archive gone for good.
   */
  useEffect(() => {
    void ensureDurable();
  }, [ensureDurable]);

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

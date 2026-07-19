import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { RouterProvider } from 'react-router-dom';

import { useSettingsStore } from '@store/slices/settingsSlice';

import { ErrorBoundary } from './ErrorBoundary';
import { router } from './router';

export function App() {
  const { i18n } = useTranslation();
  const language = useSettingsStore((s) => s.language);

  /**
   * Sprache aus dem persistierten Store übernehmen und das `lang`-Attribut
   * mitführen. Letzteres ist keine Formalie: Screenreader wählen ihre
   * Aussprache danach, und Browser richten Silbentrennung daran aus.
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

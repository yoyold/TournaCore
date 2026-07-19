import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import deCommon from './locales/de/common.json';
import enCommon from './locales/en/common.json';

/**
 * i18n is wired up from the start even though translations are still limited.
 *
 * Extracting hardcoded strings after the fact is one of the most expensive and
 * error-prone refactors there is, so the discipline has to hold from the first
 * component onwards.
 *
 * Resources are bundled statically for now: with two languages and a few
 * kilobytes, lazy loading would be premature. Splitting by namespace keeps that
 * option open.
 */
export const SUPPORTED_LANGUAGES = ['de', 'en'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: SupportedLanguage = 'de';

void i18n.use(initReactI18next).init({
  resources: {
    de: { common: deCommon },
    en: { common: enCommon },
  },
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  defaultNS: 'common',
  interpolation: {
    // React escapes already; escaping twice would mangle non-ASCII characters.
    escapeValue: false,
  },
  returnNull: false,
});

export default i18n;

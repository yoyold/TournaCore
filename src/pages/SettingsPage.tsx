import { useTranslation } from 'react-i18next';

import { Card, CardBody, CardHeader, CardTitle } from '@components/ui/Card';
import { PageHeader } from '@components/ui/PageHeader';
import { useTheme } from '@hooks/useTheme';
import {
  useSettingsStore,
  type LanguagePreference,
  type ThemePreference,
} from '@store/slices/settingsSlice';
import { cn } from '@utils/cn';

const THEME_OPTIONS: ThemePreference[] = ['light', 'dark', 'system'];
const LANGUAGE_OPTIONS: LanguagePreference[] = ['de', 'en'];

/**
 * Settings page. Theme, language and autosave are the preferences that currently
 * have an effect; backup, storage management and data deletion follow with the
 * data layer.
 */
export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { preference, setTheme } = useTheme();
  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const autosave = useSettingsStore((s) => s.autosave);
  const setAutosave = useSettingsStore((s) => s.setAutosave);

  const handleLanguage = (next: LanguagePreference): void => {
    setLanguage(next);
    void i18n.changeLanguage(next);
  };

  return (
    <>
      <PageHeader title={t('pages.settings.title')} subtitle={t('pages.settings.subtitle')} />

      <div className="grid max-w-2xl gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.appearance')}</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-5">
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-fg">{t('settings.theme')}</legend>
              <div className="flex gap-2">
                {THEME_OPTIONS.map((option) => (
                  <label
                    key={option}
                    className={cn(
                      'cursor-pointer rounded-[var(--radius-control)] border px-4 py-2 text-sm transition-colors',
                      preference === option
                        ? 'border-accent bg-accent-subtle text-accent'
                        : 'border-line text-fg-secondary hover:bg-hover hover:text-fg',
                    )}
                  >
                    <input
                      type="radio"
                      name="theme"
                      value={option}
                      checked={preference === option}
                      onChange={() => {
                        setTheme(option);
                      }}
                      className="sr-only-focusable"
                    />
                    {t(`theme.${option}`)}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-2 text-sm font-medium text-fg">{t('settings.language')}</legend>
              <div className="flex gap-2">
                {LANGUAGE_OPTIONS.map((option) => (
                  <label
                    key={option}
                    className={cn(
                      'cursor-pointer rounded-[var(--radius-control)] border px-4 py-2 text-sm uppercase transition-colors',
                      language === option
                        ? 'border-accent bg-accent-subtle text-accent'
                        : 'border-line text-fg-secondary hover:bg-hover hover:text-fg',
                    )}
                  >
                    <input
                      type="radio"
                      name="language"
                      value={option}
                      checked={language === option}
                      onChange={() => {
                        handleLanguage(option);
                      }}
                      className="sr-only-focusable"
                    />
                    {option}
                  </label>
                ))}
              </div>
            </fieldset>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('settings.data')}</CardTitle>
          </CardHeader>
          <CardBody>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={autosave}
                onChange={(event) => {
                  setAutosave(event.target.checked);
                }}
                className="mt-0.5 h-4 w-4 accent-[var(--tc-accent)]"
              />
              <span>
                <span className="block text-sm font-medium text-fg">{t('settings.autosave')}</span>
                <span className="block text-xs text-fg-secondary">
                  {t('settings.autosaveHint')}
                </span>
              </span>
            </label>
          </CardBody>
        </Card>
      </div>
    </>
  );
}

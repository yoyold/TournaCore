import { Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@hooks/useTheme';

import { Button } from './Button';

/**
 * Switches between light and dark theme.
 *
 * The icon shows the TARGET of the click rather than the current state, which is
 * how users read toggle buttons. The aria-label names the action explicitly so
 * the state is not conveyed by the icon alone.
 */
export function ThemeToggle() {
  const { t } = useTranslation();
  const { resolved, toggle } = useTheme();
  const goingToLight = resolved === 'dark';

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={t(goingToLight ? 'theme.switchToLight' : 'theme.switchToDark')}
      title={t('theme.toggle')}
      icon={goingToLight ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
    />
  );
}

import { HardDrive, PanelLeft, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Button } from '@components/ui/Button';
import { ThemeToggle } from '@components/ui/ThemeToggle';

export interface TopBarProps {
  onToggleSidebar: () => void;
}

export function TopBar({ onToggleSidebar }: TopBarProps) {
  const { t } = useTranslation();

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleSidebar}
        aria-label={t('nav.toggleSidebar')}
        icon={<PanelLeft size={18} aria-hidden />}
      />

      <Link to="/" className="flex items-center gap-2 rounded-[var(--radius-control)]">
        <span
          aria-hidden
          className="grid h-7 w-7 place-items-center rounded-[var(--radius-control)] bg-accent text-sm font-bold text-fg-on-accent"
        >
          T
        </span>
        <span className="text-sm font-semibold tracking-tight text-fg">{t('app.name')}</span>
      </Link>

      {/* Deliberately disabled: there is nothing to search yet. A non-functional
          but active field would mislead more than a visibly inactive one. This
          becomes the command palette later. */}
      <button
        type="button"
        disabled
        className="ml-4 hidden h-9 w-72 items-center gap-2 rounded-[var(--radius-control)] border border-line bg-inset px-3 text-sm text-fg-muted md:flex"
      >
        <Search size={15} aria-hidden />
        <span>{t('common.search')}</span>
        <kbd className="tabular ml-auto rounded border border-line px-1.5 py-0.5 text-2xs">⌘K</kbd>
      </button>

      <div className="ml-auto flex items-center gap-1">
        {/* Wired up to navigator.storage.estimate() once data storage exists. */}
        <span
          className="hidden items-center gap-1.5 rounded-[var(--radius-control)] px-2 py-1 text-xs text-fg-muted sm:flex"
          title={t('privacy.localOnlyHint')}
        >
          <HardDrive size={14} aria-hidden />
          {t('privacy.localOnly')}
        </span>
        <ThemeToggle />
      </div>
    </header>
  );
}

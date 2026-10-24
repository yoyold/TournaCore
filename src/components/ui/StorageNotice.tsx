import { ShieldAlert, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { useDataStore } from '@store/slices/dataSlice';
import { useStorageStore } from '@store/slices/storageSlice';

/**
 * Warns that the browser may discard the archive, while that is true.
 *
 * Shown only once there is something to lose. A warning on an empty application
 * teaches people to ignore warnings, and the first thing a new user should see
 * is not a risk they do not yet carry.
 *
 * Dismissible for the visit but not for good: the state it reports can change
 * between sessions, and a permanently silenced warning about data that can
 * vanish without notice is worse than none.
 */
export function StorageNotice() {
  const { t } = useTranslation();

  const durability = useStorageStore((s) => s.durability);
  const dismissed = useStorageStore((s) => s.noticeDismissed);
  const dismiss = useStorageStore((s) => s.dismissNotice);

  const hydrated = useDataStore((s) => s.hydrated);
  const tournaments = useDataStore((s) => s.tournaments);

  const atRisk = durability === 'best_effort';
  const hasSomethingToLose = hydrated && Object.keys(tournaments).length > 0;

  if (dismissed || !atRisk || !hasSomethingToLose) return null;

  return (
    <div
      role="status"
      className="border-b border-warning/30 bg-warning/10 px-6 py-2 text-sm text-fg"
    >
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-3 gap-y-1">
        <ShieldAlert size={16} aria-hidden className="shrink-0 text-warning" />
        <span className="min-w-0">{t('settings.storageWarning')}</span>

        <span className="ml-auto flex shrink-0 items-center gap-3">
          <Link to="/transfer" className="font-medium text-accent hover:underline">
            {t('settings.storageExport')}
          </Link>
          <Link to="/settings" className="text-fg-secondary hover:text-fg">
            {t('settings.storageDetails')}
          </Link>
          <button
            type="button"
            aria-label={t('common.dismiss')}
            onClick={dismiss}
            className="grid h-6 w-6 place-items-center rounded-[var(--radius-control)] text-fg-muted hover:bg-hover hover:text-fg"
          >
            <X size={14} aria-hidden />
          </button>
        </span>
      </div>
    </div>
  );
}

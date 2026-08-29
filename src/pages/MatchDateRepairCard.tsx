import { CalendarClock, Check } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@components/ui/Card';
import { useDataStore } from '@store/slices/dataSlice';

/**
 * Moves results that were stamped in bulk onto the date they were played.
 *
 * A public Challonge bracket carries no dates, so every result of an import used
 * to be stamped with the moment of the import. Elo folds results in sequence, so
 * an archive imported in one sitting was rated in the order it happened to be
 * pasted — and within each tournament in the order the identifiers sorted, which
 * put the grand final first.
 *
 * Offered rather than applied on load. It rewrites stored data, and the last
 * time this application changed stored data without being asked it took a
 * fortnight of tournaments with it.
 */
export function MatchDateRepairCard() {
  const { t } = useTranslation();
  const hydrated = useDataStore((s) => s.hydrated);
  const matches = useDataStore((s) => s.matches);
  const pendingMatchDates = useDataStore((s) => s.pendingMatchDates);
  const applyMatchDates = useDataStore((s) => s.applyMatchDates);

  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | undefined>(undefined);

  // Recomputed whenever the stored matches change, which is what makes the card
  // disappear once the repair has run.
  const pending = useMemo(
    () => (hydrated ? pendingMatchDates() : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `matches` is the input
    [hydrated, matches, pendingMatchDates],
  );

  if (!hydrated || (pending.length === 0 && done === undefined)) return null;

  const affected = pending.reduce((sum, entry) => sum + entry.matches.length, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.matchDates')}</CardTitle>
      </CardHeader>
      <CardBody className="grid gap-4">
        {pending.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-success">
            <Check size={16} aria-hidden />
            {t('settings.matchDatesDone', { count: done ?? 0 })}
          </p>
        ) : (
          <>
            <p className="text-sm text-fg-secondary">{t('settings.matchDatesHint')}</p>

            <ul className="grid gap-1 text-sm">
              {pending.map((entry) => (
                <li
                  key={entry.tournamentId}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 rounded-[var(--radius-control)] bg-inset px-2 py-1"
                >
                  <span className="text-fg">{entry.name}</span>
                  <span className="text-xs text-fg-muted">
                    {t('settings.matchDatesEntry', {
                      count: entry.matches.length,
                      date: entry.playedAt.slice(0, 10),
                    })}
                  </span>
                </li>
              ))}
            </ul>

            <div className="grid gap-2">
              <Button
                variant="primary"
                disabled={busy}
                icon={<CalendarClock size={16} aria-hidden />}
                onClick={() => {
                  setBusy(true);
                  void applyMatchDates()
                    .then(setDone)
                    .finally(() => {
                      setBusy(false);
                    });
                }}
              >
                {t('settings.matchDatesApply', { count: affected })}
              </Button>
              <p className="text-xs text-fg-secondary">{t('settings.matchDatesSafety')}</p>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

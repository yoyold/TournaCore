import { Check, ListOrdered } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@components/ui/Card';
import { useDataStore } from '@store/slices/dataSlice';

/**
 * Expands a series score that was written on the first map.
 *
 * The result panel used to offer map-by-map entry and nothing else, so a
 * best-of-three finishing 2:1 was typed on the only row there was. The engine
 * counts map wins and read that as one map — one win out of the two needed — so
 * the match stayed open and every table, rating and bracket ignored a result
 * that was sitting right there in the database.
 *
 * Offered rather than applied on load, like the date repair: it rewrites stored
 * results, and that is not something to do to somebody's archive unasked.
 */
export function SeriesScoreRepairCard() {
  const { t } = useTranslation();
  const hydrated = useDataStore((s) => s.hydrated);
  const matches = useDataStore((s) => s.matches);
  const pendingSeriesScores = useDataStore((s) => s.pendingSeriesScores);
  const applySeriesScores = useDataStore((s) => s.applySeriesScores);

  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | undefined>(undefined);

  // Recomputed whenever the stored matches change, which is what makes the card
  // disappear once the repair has run.
  const pending = useMemo(
    () => (hydrated ? pendingSeriesScores() : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `matches` is the input
    [hydrated, matches, pendingSeriesScores],
  );

  if (!hydrated || (pending.length === 0 && done === undefined)) return null;

  const affected = pending.reduce((sum, entry) => sum + entry.matches.length, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.seriesScores')}</CardTitle>
      </CardHeader>
      <CardBody className="grid gap-4">
        {pending.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-success">
            <Check size={16} aria-hidden />
            {t('settings.seriesScoresDone', { count: done ?? 0 })}
          </p>
        ) : (
          <>
            <p className="text-sm text-fg-secondary">{t('settings.seriesScoresHint')}</p>

            <ul className="grid gap-1 text-sm">
              {pending.map((entry) => (
                <li
                  key={entry.tournamentId}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 rounded-[var(--radius-control)] bg-inset px-2 py-1"
                >
                  <span className="text-fg">{entry.name}</span>
                  <span className="text-xs text-fg-muted">
                    {t('settings.seriesScoresEntry', { count: entry.matches.length })}
                  </span>
                </li>
              ))}
            </ul>

            <div className="grid gap-2">
              <Button
                variant="primary"
                disabled={busy}
                icon={<ListOrdered size={16} aria-hidden />}
                onClick={() => {
                  setBusy(true);
                  void applySeriesScores()
                    .then(setDone)
                    .finally(() => {
                      setBusy(false);
                    });
                }}
              >
                {t('settings.seriesScoresApply', { count: affected })}
              </Button>
              <p className="text-xs text-fg-secondary">{t('settings.seriesScoresSafety')}</p>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

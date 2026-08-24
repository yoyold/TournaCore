import { Merge } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@components/ui/Card';
import { ConfirmDialog } from '@components/ui/ConfirmDialog';
import { asId, type Team, type TeamId } from '@models/index';
import { countEntries } from '@services/team/mergeTeams';
import { useDataStore } from '@store/slices/dataSlice';

/**
 * Folds another team into this one.
 *
 * Over years the same club turns up in the record under several names, and the
 * point of a cross-tournament team database is that its history adds up. Merging
 * moves the tournament entries across and keeps every result: nothing is
 * rewritten, so statistics and ratings simply reappear under one name.
 *
 * The team whose page this is survives. Saying which of the two disappears is
 * the one thing a merge must not leave ambiguous.
 */
export function TeamMergeCard({ team }: { team: Team }) {
  const { t } = useTranslation();
  const teams = useDataStore((s) => s.teams);
  const tournaments = useDataStore((s) => s.tournaments);
  const mergeTeams = useDataStore((s) => s.mergeTeams);

  const [sourceId, setSourceId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [merged, setMerged] = useState<string | undefined>(undefined);

  const candidates = useMemo(
    () =>
      Object.values(teams)
        .filter((other) => other.id !== team.id)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [teams, team.id],
  );

  const source = candidates.find((other) => other.id === sourceId);

  const movingEntries = useMemo(
    () => (source ? countEntries(source.id, Object.values(tournaments)) : 0),
    [source, tournaments],
  );

  const onMerge = async (): Promise<void> => {
    if (!source) return;
    setBusy(true);
    try {
      await mergeTeams(asId<TeamId>(source.id), team.id);
      setMerged(source.name);
      setSourceId('');
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  if (candidates.length === 0) return null;

  return (
    <Card className="mt-4 max-w-2xl">
      <CardHeader>
        <CardTitle>{t('teams.merge.title')}</CardTitle>
      </CardHeader>
      <CardBody className="grid gap-3">
        <p className="text-sm text-fg-secondary">{t('teams.merge.hint', { name: team.name })}</p>

        <label className="grid gap-1.5">
          <span className="text-sm font-medium text-fg">{t('teams.merge.pick')}</span>
          <select
            value={sourceId}
            onChange={(event) => {
              setSourceId(event.target.value);
              setMerged(undefined);
            }}
            className="h-10 rounded-[var(--radius-control)] border border-line bg-inset px-3 text-sm text-fg outline-none focus-visible:border-accent"
          >
            <option value="">{t('teams.merge.none')}</option>
            {candidates.map((other) => (
              <option key={other.id} value={other.id}>
                {other.name}
              </option>
            ))}
          </select>
        </label>

        {source && (
          <p className="text-xs text-fg-secondary">
            {t('teams.merge.preview', {
              source: source.name,
              target: team.name,
              count: movingEntries,
            })}
          </p>
        )}

        {merged !== undefined && (
          <p role="status" className="text-sm text-success">
            {t('teams.merge.done', { source: merged, target: team.name })}
          </p>
        )}

        <span>
          <Button
            variant="secondary"
            icon={<Merge size={16} aria-hidden />}
            disabled={!source || busy}
            onClick={() => {
              setConfirming(true);
            }}
          >
            {t('teams.merge.action')}
          </Button>
        </span>
      </CardBody>

      {confirming && source && (
        <ConfirmDialog
          title={t('teams.merge.confirmTitle')}
          message={t('teams.merge.confirmMessage', { source: source.name, target: team.name })}
          detail={t('teams.merge.confirmDetail', { count: movingEntries })}
          confirmLabel={t('teams.merge.confirmAction')}
          requireText={source.name}
          onCancel={() => {
            setConfirming(false);
          }}
          onConfirm={() => {
            void onMerge();
          }}
        />
      )}
    </Card>
  );
}

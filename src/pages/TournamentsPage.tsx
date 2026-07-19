import { Sparkles, Trophy } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Button } from '@components/ui/Button';
import { Card, CardBody } from '@components/ui/Card';
import { PageHeader } from '@components/ui/PageHeader';
import { buildDemoTournament, DEMO_TOURNAMENT_ID } from '@services/demo/demoTournament';
import { useDataStore } from '@store/slices/dataSlice';

export function TournamentsPage() {
  const { t } = useTranslation();
  const tournaments = useDataStore((s) => s.tournaments);
  const hydrated = useDataStore((s) => s.hydrated);
  const saveTeam = useDataStore((s) => s.saveTeam);
  const saveTournament = useDataStore((s) => s.saveTournament);
  const saveStage = useDataStore((s) => s.saveStage);
  const saveMatches = useDataStore((s) => s.saveMatches);
  const removeTournament = useDataStore((s) => s.removeTournament);
  const [seeding, setSeeding] = useState(false);

  const list = Object.values(tournaments);

  const createDemo = async (): Promise<void> => {
    setSeeding(true);
    try {
      /*
       * Remove any previous demo first. The identifiers are fixed, so writing
       * over it would replace the tournament and its stage but leave matches
       * behind that the new bracket no longer contains.
       */
      if (tournaments[DEMO_TOURNAMENT_ID]) await removeTournament(DEMO_TOURNAMENT_ID);

      const demo = buildDemoTournament();
      // Teams first: the tournament references them.
      for (const team of demo.teams) await saveTeam(team);
      await saveTournament(demo.tournament);
      for (const stage of demo.stages) await saveStage(stage);
      await saveMatches(demo.matches);
    } finally {
      setSeeding(false);
    }
  };

  return (
    <>
      <PageHeader
        title={t('pages.tournaments.title')}
        subtitle={t('pages.tournaments.subtitle')}
        actions={
          <Button
            variant="secondary"
            icon={<Sparkles size={16} aria-hidden />}
            disabled={seeding}
            onClick={() => {
              void createDemo();
            }}
          >
            {t('tournaments.createDemo')}
          </Button>
        }
      />

      {!hydrated && <p className="text-sm text-fg-muted">{t('common.loading')}</p>}

      {hydrated && list.length === 0 && (
        <Card>
          <CardBody className="flex flex-col items-center gap-3 py-14 text-center">
            <Trophy size={28} className="text-fg-muted" aria-hidden />
            <p className="text-sm font-medium text-fg">{t('tournaments.emptyTitle')}</p>
            <p className="max-w-md text-sm text-fg-secondary">{t('tournaments.emptyHint')}</p>
          </CardBody>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((tournament) => (
          <Link key={tournament.id} to={`/tournaments/${tournament.id}`} className="block">
            <Card interactive className="h-full">
              <CardBody className="flex flex-col gap-3">
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-control)] bg-accent-subtle text-accent"
                  >
                    <Trophy size={17} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-fg">
                      {tournament.name}
                    </span>
                    <span className="block text-xs text-fg-muted">
                      {t(`tournaments.status.${tournament.status}`)}
                    </span>
                  </span>
                </span>
                <span className="text-xs text-fg-secondary">
                  {t('tournaments.participantCount', { count: tournament.participants.length })}
                </span>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}

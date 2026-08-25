import { Plus, Search, Sparkles, Trophy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@components/ui/Button';
import { Card, CardBody } from '@components/ui/Card';
import { PageHeader } from '@components/ui/PageHeader';
import { buildDemoTournament, DEMO_TOURNAMENT_ID } from '@services/demo/demoTournament';
import { byCreationDate } from '@services/tournament/order';
import { searchTournaments } from '@services/tournament/search';
import { useDataStore } from '@store/slices/dataSlice';

export function TournamentsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const tournaments = useDataStore((s) => s.tournaments);
  const hydrated = useDataStore((s) => s.hydrated);
  const saveTeam = useDataStore((s) => s.saveTeam);
  const teams = useDataStore((s) => s.teams);
  const saveTournament = useDataStore((s) => s.saveTournament);
  const saveStage = useDataStore((s) => s.saveStage);
  const saveMatches = useDataStore((s) => s.saveMatches);
  const removeTournament = useDataStore((s) => s.removeTournament);
  const [seeding, setSeeding] = useState(false);

  const [query, setQuery] = useState('');

  const total = Object.keys(tournaments).length;

  const list = useMemo(
    () => byCreationDate(searchTournaments(Object.values(tournaments), query, teams)),
    [tournaments, query, teams],
  );

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
          <>
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
            <Button
              variant="primary"
              icon={<Plus size={16} aria-hidden />}
              onClick={() => {
                void navigate('/tournaments/new');
              }}
            >
              {t('nav.newTournament')}
            </Button>
          </>
        }
      />

      {hydrated && total > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <label className="relative flex-1 sm:max-w-xs">
            <span className="sr-only-focusable">{t('common.search')}</span>
            <Search
              size={15}
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted"
            />
            <input
              type="search"
              value={query}
              placeholder={t('tournaments.searchPlaceholder')}
              aria-label={t('common.search')}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              className="h-9 w-full rounded-[var(--radius-control)] border border-line bg-inset pr-3 pl-9 text-sm text-fg outline-none focus-visible:border-accent"
            />
          </label>
          {query.trim() !== '' && (
            <span className="text-xs text-fg-muted">
              {t('tournaments.searchCount', { count: list.length, total })}
            </span>
          )}
        </div>
      )}

      {!hydrated && <p className="text-sm text-fg-muted">{t('common.loading')}</p>}

      {hydrated && list.length === 0 && (
        <Card>
          <CardBody className="flex flex-col items-center gap-3 py-14 text-center">
            <Trophy size={28} className="text-fg-muted" aria-hidden />
            {/* Nothing here at all is a different problem from nothing found. */}
            <p className="text-sm font-medium text-fg">
              {total === 0 ? t('tournaments.emptyTitle') : t('tournaments.noMatches')}
            </p>
            <p className="max-w-md text-sm text-fg-secondary">
              {total === 0 ? t('tournaments.emptyHint') : t('tournaments.noMatchesHint')}
            </p>
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

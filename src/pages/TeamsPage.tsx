import { Archive, Plus, Search, Shield } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@components/ui/Button';
import { Card, CardBody } from '@components/ui/Card';
import { FlagIcon } from '@components/ui/FlagIcon';
import { PageHeader } from '@components/ui/PageHeader';
import { useAllTeamStatistics } from '@hooks/useTeamStatistics';
import { RegionFilterSelect } from '@pages/RegionFilterSelect';
import { groupByRegion, passesRegion, type RegionFilter } from '@services/team/regions';
import { useDataStore } from '@store/slices/dataSlice';
import { cn } from '@utils/cn';

export function TeamsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const teams = useDataStore((s) => s.teams);
  const hydrated = useDataStore((s) => s.hydrated);
  const statistics = useAllTeamStatistics();

  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [region, setRegion] = useState<RegionFilter>('all');

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return Object.values(teams)
      .filter((team) => showArchived || !team.archived)
      .filter((team) => passesRegion(team, region))
      .filter(
        (team) =>
          needle === '' ||
          team.name.toLowerCase().includes(needle) ||
          team.tag.toLowerCase().includes(needle),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [teams, query, showArchived, region]);

  /*
   * Grouped rather than one long alphabetical run: a region is how an archive
   * is actually read, and the headings turn scrolling into looking something up.
   */
  const groups = useMemo(() => groupByRegion(visible, (team) => team), [visible]);

  const allTeams = useMemo(() => Object.values(teams), [teams]);

  /** Nothing to show and nothing asked for: the archive really is empty. */
  const unfiltered = query.trim() === '' && region === 'all';

  const archivedCount = useMemo(
    () => Object.values(teams).filter((team) => team.archived).length,
    [teams],
  );

  return (
    <>
      <PageHeader
        title={t('pages.teams.title')}
        subtitle={t('pages.teams.subtitle')}
        actions={
          <Button
            variant="primary"
            icon={<Plus size={16} aria-hidden />}
            onClick={() => {
              void navigate('/teams/new');
            }}
          >
            {t('teams.create')}
          </Button>
        }
      />

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
            placeholder={t('teams.searchPlaceholder')}
            aria-label={t('common.search')}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            className="h-9 w-full rounded-[var(--radius-control)] border border-line bg-inset pr-3 pl-9 text-sm text-fg outline-none focus-visible:border-accent"
          />
        </label>

        <RegionFilterSelect teams={allTeams} value={region} onChange={setRegion} />

        {archivedCount > 0 && (
          <label className="flex items-center gap-2 text-xs text-fg-secondary">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => {
                setShowArchived(event.target.checked);
              }}
              className="h-4 w-4 accent-[var(--tc-accent)]"
            />
            {t('teams.showArchived', { count: archivedCount })}
          </label>
        )}
      </div>

      {!hydrated && <p className="text-sm text-fg-muted">{t('common.loading')}</p>}

      {hydrated && visible.length === 0 && (
        <Card>
          <CardBody className="flex flex-col items-center gap-3 py-14 text-center">
            <Shield size={28} className="text-fg-muted" aria-hidden />
            <p className="text-sm font-medium text-fg">
              {unfiltered ? t('teams.emptyTitle') : t('teams.noMatches')}
            </p>
            <p className="max-w-md text-sm text-fg-secondary">
              {unfiltered ? t('teams.emptyHint') : t('teams.noMatchesHint')}
            </p>
          </CardBody>
        </Card>
      )}

      <div className="grid gap-6">
        {groups.map((group) => (
          <section key={group.key} className="grid gap-3">
            {groups.length > 1 && (
              <h2 className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
                {group.label ?? t('teams.regionNone')}
              </h2>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((team) => {
                const stats = statistics.get(team.id);
                const played = stats?.matchesPlayed ?? 0;

                return (
                  <Link key={team.id} to={`/teams/${team.id}`} className="block">
                    <Card interactive className={cn('h-full', team.archived && 'opacity-60')}>
                      <CardBody className="flex flex-col gap-3">
                        <span className="flex items-center gap-2">
                          {team.countryCode !== undefined ? (
                            <FlagIcon countryCode={team.countryCode} width={20} />
                          ) : (
                            <span
                              aria-hidden
                              className="grid h-5 w-7 shrink-0 place-items-center rounded-[3px] bg-hover text-[9px] font-semibold text-fg-muted"
                            >
                              {team.tag}
                            </span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-fg">
                              {team.name}
                            </span>
                            <span className="block text-xs text-fg-muted">
                              {team.tag}
                              {team.region !== undefined && ` · ${team.region}`}
                            </span>
                          </span>
                          {team.archived && (
                            <Archive size={14} aria-hidden className="shrink-0 text-fg-muted" />
                          )}
                        </span>

                        <span className="flex gap-4 text-xs text-fg-secondary">
                          <span>
                            <span className="tabular font-medium text-fg">
                              {played === 0
                                ? '—'
                                : `${String(Math.round((stats?.winRate ?? 0) * 100))}%`}
                            </span>{' '}
                            {t('teams.winRate')}
                          </span>
                          <span>
                            <span className="tabular font-medium text-fg">
                              {String(stats?.wins ?? 0)}–{String(stats?.losses ?? 0)}
                            </span>{' '}
                            {t('teams.record')}
                          </span>
                        </span>
                      </CardBody>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

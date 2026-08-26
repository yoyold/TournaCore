import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Card, CardBody } from '@components/ui/Card';
import { FlagIcon } from '@components/ui/FlagIcon';
import { PageHeader } from '@components/ui/PageHeader';
import { ELO_START, PROVISIONAL_BELOW } from '@domain/statistics/elo';
import { useEloLeaderboard } from '@hooks/useEloRatings';
import { useAllTeamStatistics } from '@hooks/useTeamStatistics';
import { RegionFilterSelect } from '@pages/RegionFilterSelect';
import { passesRegion, type RegionFilter } from '@services/team/regions';
import { useDataStore } from '@store/slices/dataSlice';
import { cn } from '@utils/cn';

type Tab = 'overview' | 'elo';

export function StatisticsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <>
      <PageHeader title={t('pages.statistics.title')} subtitle={t('pages.statistics.subtitle')} />

      <div role="tablist" className="mb-5 flex gap-1 border-b border-line">
        <TabButton current={tab} value="overview" onSelect={setTab}>
          {t('statistics.tab.overview')}
        </TabButton>
        <TabButton current={tab} value="elo" onSelect={setTab}>
          {t('statistics.tab.elo')}
        </TabButton>
      </div>

      {tab === 'overview' ? <OverviewTab /> : <EloTab />}
    </>
  );
}

function TabButton({
  current,
  value,
  onSelect,
  children,
}: {
  current: Tab;
  value: Tab;
  onSelect: (tab: Tab) => void;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => {
        onSelect(value);
      }}
      className={cn(
        '-mb-px border-b-2 px-4 py-2 text-sm transition-colors',
        active ? 'border-accent text-accent' : 'border-transparent text-fg-secondary hover:text-fg',
      )}
    >
      {children}
    </button>
  );
}

function OverviewTab() {
  const { t } = useTranslation();
  const teams = useDataStore((s) => s.teams);
  const tournaments = useDataStore((s) => s.tournaments);
  const statistics = useAllTeamStatistics();

  const played = [...statistics.values()].reduce((sum, entry) => sum + entry.matchesPlayed, 0) / 2;
  const activeTeams = Object.values(teams).filter((team) => !team.archived).length;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Metric label={t('nav.tournaments')} value={String(Object.keys(tournaments).length)} />
      <Metric label={t('pages.dashboard.registeredTeams')} value={String(activeTeams)} />
      <Metric label={t('statistics.matchesPlayed')} value={String(Math.round(played))} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardBody>
        <span className="tabular block text-2xl font-semibold text-fg">{value}</span>
        <span className="block text-xs text-fg-secondary">{label}</span>
      </CardBody>
    </Card>
  );
}

/**
 * Elo leaderboard.
 *
 * Ratings are derived from played matches like everything else, so they follow a
 * corrected result without a recalculation step. Provisional entries are marked
 * rather than hidden — a team missing from its own leaderboard is more confusing
 * than one carrying a caveat.
 */
function EloTab() {
  const { t } = useTranslation();
  const teams = useDataStore((s) => s.teams);
  const hydrated = useDataStore((s) => s.hydrated);
  const leaderboard = useEloLeaderboard();
  const [region, setRegion] = useState<RegionFilter>('all');

  /*
   * Rated teams only. A region nobody on the board plays in would be a filter
   * that can only ever empty the table.
   */
  const rated = useMemo(
    () =>
      leaderboard
        .map((entry) => teams[entry.teamId])
        .filter((team): team is NonNullable<typeof team> => team !== undefined),
    [leaderboard, teams],
  );

  /*
   * Ranks are those of the whole board, not of the filtered view: a team is
   * eleventh overall whether or not the other ten are on screen.
   */
  const ranked = useMemo(
    () =>
      leaderboard
        .map((entry, position) => ({ entry, rank: position + 1 }))
        .filter((row) => passesRegion(teams[row.entry.teamId], region)),
    [leaderboard, teams, region],
  );

  if (!hydrated) return <p className="text-sm text-fg-muted">{t('common.loading')}</p>;

  if (leaderboard.length === 0) {
    return (
      <Card>
        <CardBody className="flex flex-col items-center gap-2 py-14 text-center">
          <p className="text-sm font-medium text-fg">{t('statistics.eloEmpty')}</p>
          <p className="max-w-md text-sm text-fg-secondary">{t('statistics.eloEmptyHint')}</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-fg-secondary">
          {t('statistics.eloExplainer', { start: ELO_START, provisional: PROVISIONAL_BELOW })}
        </p>
        <RegionFilterSelect teams={rated} value={region} onChange={setRegion} />
      </div>

      <Card>
        <CardBody className="p-0">
          <table className="w-full text-sm">
            <caption className="sr-only-focusable">{t('statistics.tab.elo')}</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs text-fg-muted">
                <th scope="col" className="px-4 py-2 font-medium">
                  #
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t('statistics.column.team')}
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  {t('statistics.column.rating')}
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  {t('statistics.column.change')}
                </th>
                <th scope="col" className="hidden px-4 py-2 text-right font-medium sm:table-cell">
                  {t('statistics.column.peak')}
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  {t('statistics.column.record')}
                </th>
              </tr>
            </thead>
            <tbody>
              {ranked.map(({ entry, rank }) => {
                const team = teams[entry.teamId];
                return (
                  <tr key={entry.teamId} className="border-b border-line last:border-b-0">
                    <td className="tabular px-4 py-2 text-fg-muted">{rank}</td>
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-2">
                        {team?.countryCode !== undefined && (
                          <FlagIcon countryCode={team.countryCode} width={16} />
                        )}
                        <span className="min-w-0 truncate text-fg">
                          {team ? (
                            <Link to={`/teams/${team.id}`} className="hover:text-accent">
                              {team.name}
                            </Link>
                          ) : (
                            t('bracket.unknownTeam')
                          )}
                        </span>
                        {entry.provisional && (
                          <span
                            className="shrink-0 rounded-full bg-hover px-1.5 py-0.5 text-2xs text-fg-muted"
                            title={t('statistics.provisionalHint', { count: PROVISIONAL_BELOW })}
                          >
                            {t('statistics.provisional')}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="tabular px-4 py-2 text-right font-semibold text-fg">
                      {Math.round(entry.rating)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Change value={entry.lastChange} />
                    </td>
                    <td className="tabular hidden px-4 py-2 text-right text-fg-secondary sm:table-cell">
                      {Math.round(entry.peak)}
                    </td>
                    <td className="tabular px-4 py-2 text-right text-fg-secondary">
                      {entry.wins}–{entry.losses}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </>
  );
}

/** Last rating change, never carried by colour alone. */
function Change({ value }: { value: number }) {
  const rounded = Math.round(value);

  if (rounded === 0) {
    return (
      <span className="tabular inline-flex items-center gap-1 text-fg-muted">
        <Minus size={12} aria-hidden />0
      </span>
    );
  }

  const up = rounded > 0;
  const Icon = up ? TrendingUp : TrendingDown;

  return (
    <span
      className={cn('tabular inline-flex items-center gap-1', up ? 'text-success' : 'text-danger')}
    >
      <Icon size={12} aria-hidden />
      {up ? '+' : ''}
      {rounded}
    </span>
  );
}

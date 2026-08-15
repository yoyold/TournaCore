import { Archive, Pencil, Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { Button } from '@components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@components/ui/Card';
import { FlagIcon } from '@components/ui/FlagIcon';
import { PageHeader } from '@components/ui/PageHeader';
import { useTeamStatistics } from '@hooks/useTeamStatistics';
import { asId, type TeamId } from '@models/index';
import { useDataStore } from '@store/slices/dataSlice';
import { cn } from '@utils/cn';

export function TeamDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const teamId = params.id === undefined ? undefined : asId<TeamId>(params.id);

  const team = useDataStore((s) => (teamId === undefined ? undefined : s.teams[teamId]));
  const teams = useDataStore((s) => s.teams);
  const hydrated = useDataStore((s) => s.hydrated);
  const stats = useTeamStatistics(teamId);

  if (!hydrated) return <p className="text-sm text-fg-muted">{t('common.loading')}</p>;

  if (!team) {
    return (
      <Card>
        <CardBody className="py-14 text-center text-sm text-fg-muted">
          {t('teams.notFound')}
        </CardBody>
      </Card>
    );
  }

  const played = stats.matchesPlayed;

  return (
    <>
      <PageHeader
        title={team.name}
        subtitle={[team.tag, team.region].filter(Boolean).join(' · ')}
        actions={
          <Button
            variant="secondary"
            icon={<Pencil size={16} aria-hidden />}
            onClick={() => {
              void navigate(`/teams/${team.id}/edit`);
            }}
          >
            {t('common.edit')}
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        {team.countryCode !== undefined && <FlagIcon countryCode={team.countryCode} width={26} />}
        {team.archived && (
          <span className="flex items-center gap-1.5 rounded-full bg-hover px-2 py-0.5 text-xs text-fg-muted">
            <Archive size={12} aria-hidden />
            {t('teams.archived')}
          </span>
        )}
        {team.description !== undefined && (
          <p className="w-full text-sm text-fg-secondary">{team.description}</p>
        )}
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t('teams.winRate')}
          value={played === 0 ? '—' : `${String(Math.round(stats.winRate * 100))}%`}
        />
        <Stat label={t('teams.record')} value={`${String(stats.wins)}–${String(stats.losses)}`} />
        <Stat
          label={t('teams.maps')}
          value={`${String(stats.mapsWon)}–${String(stats.mapsLost)}`}
        />
        <Stat
          label={t('teams.tournaments')}
          value={`${String(stats.tournamentsWon)} / ${String(stats.tournamentsEntered)}`}
          hint={t('teams.tournamentsHint')}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t('teams.history')}</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            {stats.history.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-fg-muted">{t('teams.noHistory')}</p>
            ) : (
              <ul>
                {stats.history.map((entry) => {
                  const opponent =
                    entry.opponentTeamId === undefined ? undefined : teams[entry.opponentTeamId];
                  return (
                    <li
                      key={entry.matchId}
                      className="flex items-center gap-3 border-b border-line px-5 py-2.5 last:border-b-0"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'grid h-6 w-6 shrink-0 place-items-center rounded-[var(--radius-control)] text-[10px] font-bold',
                          entry.won ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger',
                        )}
                      >
                        {entry.won ? t('teams.winShort') : t('teams.lossShort')}
                      </span>

                      {opponent?.countryCode !== undefined && (
                        <FlagIcon countryCode={opponent.countryCode} width={16} />
                      )}

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-fg">
                          {opponent ? (
                            <Link to={`/teams/${opponent.id}`} className="hover:text-accent">
                              {opponent.name}
                            </Link>
                          ) : (
                            t('bracket.unknownTeam')
                          )}
                        </span>
                        <span className="block truncate text-xs text-fg-muted">
                          <Link
                            to={`/tournaments/${entry.tournamentId}`}
                            className="hover:text-accent"
                          >
                            {entry.tournamentName}
                          </Link>
                          {entry.walkover && ` · ${t('bracket.status.walkover')}`}
                        </span>
                      </span>

                      <span className="tabular shrink-0 text-sm text-fg-secondary">
                        {String(entry.mapsWon)}:{String(entry.mapsLost)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('teams.opponents')}</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            {stats.opponents.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-fg-muted">
                {t('teams.noOpponents')}
              </p>
            ) : (
              <ul>
                {stats.opponents.map((record) => {
                  const opponent = teams[record.teamId];
                  return (
                    <li
                      key={record.teamId}
                      className="flex items-center gap-2 border-b border-line px-5 py-2.5 last:border-b-0"
                    >
                      {opponent?.countryCode !== undefined && (
                        <FlagIcon countryCode={opponent.countryCode} width={16} />
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm text-fg">
                        {opponent ? (
                          <Link to={`/teams/${opponent.id}`} className="hover:text-accent">
                            {opponent.name}
                          </Link>
                        ) : (
                          t('bracket.unknownTeam')
                        )}
                      </span>
                      <span className="tabular shrink-0 text-sm">
                        <span className="text-success">{record.wins}</span>
                        <span className="text-fg-muted">–</span>
                        <span className="text-danger">{record.losses}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardBody className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-control)] bg-accent-subtle text-accent"
        >
          <Trophy size={16} />
        </span>
        <span className="min-w-0">
          <span className="tabular block text-lg font-semibold text-fg">{value}</span>
          <span className="block truncate text-xs text-fg-secondary" title={hint}>
            {label}
          </span>
        </span>
      </CardBody>
    </Card>
  );
}

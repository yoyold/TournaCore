import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { FlagIcon } from '@components/ui/FlagIcon';
import { cn } from '@utils/cn';

import type { Standing } from '@domain/formats/types';
import type { Team } from '@models/index';

export interface StandingsTableProps {
  standings: readonly Standing[];
  teamOf: (participantId: string) => Team | undefined;
  /** Places that advance to the next stage, highlighted. */
  qualifyingPlaces?: number;
  caption?: string;
}

/**
 * League table for a round robin or one group.
 *
 * Qualifying places are marked with a border and a label rather than colour
 * alone, so the distinction survives a projector and colour blindness. The
 * tie-break column explains *why* two entries level on points are ordered as
 * they are — without it the table looks arbitrary at exactly the moment it
 * matters most.
 */
export function StandingsTable({
  standings,
  teamOf,
  qualifyingPlaces = 0,
  caption,
}: StandingsTableProps) {
  const { t } = useTranslation();

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-sm">
        {caption !== undefined && (
          <caption className="px-4 pt-3 pb-2 text-left text-sm font-semibold text-fg">
            {caption}
          </caption>
        )}
        <thead>
          <tr className="border-b border-line text-left text-xs text-fg-muted">
            <th scope="col" className="px-3 py-2 font-medium">
              #
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              {t('standings.team')}
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              {t('standings.played')}
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              {t('standings.record')}
            </th>
            <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">
              {t('standings.maps')}
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              {t('standings.points')}
            </th>
          </tr>
        </thead>
        <tbody>
          {standings.map((entry) => {
            const team = teamOf(entry.participantId);
            const qualifies = qualifyingPlaces > 0 && entry.rank <= qualifyingPlaces;
            const played = entry.wins + entry.losses + entry.draws;

            return (
              <tr
                key={entry.participantId}
                className={cn('border-b border-line last:border-b-0', qualifies && 'bg-success/5')}
              >
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={cn(
                        'h-4 w-0.5 shrink-0 rounded-full',
                        qualifies ? 'bg-success' : 'bg-transparent',
                      )}
                    />
                    <span className="tabular text-fg-muted">{entry.rank}</span>
                  </span>
                </td>

                <td className="px-3 py-2">
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
                    {qualifies && (
                      <span className="shrink-0 rounded-full bg-success/15 px-1.5 py-0.5 text-2xs font-medium text-success">
                        {t('standings.qualified')}
                      </span>
                    )}
                    {entry.tiebreakerApplied !== undefined && (
                      <span
                        className="shrink-0 text-2xs text-fg-muted"
                        title={t('standings.decidedBy', {
                          criterion: t(`standings.tiebreaker.${entry.tiebreakerApplied}`, {
                            defaultValue: entry.tiebreakerApplied,
                          }),
                        })}
                      >
                        {t(`standings.tiebreakerShort.${entry.tiebreakerApplied}`, {
                          defaultValue: '',
                        })}
                      </span>
                    )}
                  </span>
                </td>

                <td className="tabular px-3 py-2 text-right text-fg-secondary">{played}</td>
                <td className="tabular px-3 py-2 text-right text-fg-secondary">
                  {entry.wins}
                  {entry.draws > 0 ? `–${String(entry.draws)}` : ''}–{entry.losses}
                </td>
                <td className="tabular hidden px-3 py-2 text-right text-fg-secondary sm:table-cell">
                  {entry.mapsWon}:{entry.mapsLost}
                </td>
                <td className="tabular px-3 py-2 text-right font-semibold text-fg">
                  {entry.points ?? 0}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

import { Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { cn } from '@utils/cn';

import type { Placement } from '@domain/statistics/teamStats';

/**
 * Medal colours, from the palette rather than from here.
 *
 * Gold, silver and bronze mean the same in either theme, but they cannot keep
 * the same lightness in both and stay legible on the ground behind them — which
 * is exactly what the token layer is for.
 *
 * Colour is never the only signal. Three metals cannot be far apart in
 * lightness and all legible against one background at once, so each trophy also
 * says in words which place it was and where.
 */
const METAL: Record<number, { icon: string; ring: string }> = {
  1: { icon: 'text-medal-gold', ring: 'bg-medal-gold/12 ring-medal-gold/40' },
  2: { icon: 'text-medal-silver', ring: 'bg-medal-silver/12 ring-medal-silver/40' },
  3: { icon: 'text-medal-bronze', ring: 'bg-medal-bronze/12 ring-medal-bronze/40' },
};

/**
 * A team's trophy cabinet: every top-three finish, best first.
 *
 * A world championship is drawn larger than the rest. There is no tier on a
 * tournament to read that from, only the name — so the distinction is a naming
 * convention, and renaming an event changes the size of its trophy.
 */
export function PlacementTrophies({ placements }: { placements: readonly Placement[] }) {
  const { t } = useTranslation();

  if (placements.length === 0) return null;

  return (
    <ul aria-label={t('teams.trophies')} className="flex flex-wrap items-center gap-2">
      {placements.map((placement) => {
        const metal = METAL[placement.rank] ?? METAL[3];
        const label = t('teams.trophyLabel', {
          rank: placement.rank,
          tournament: placement.tournamentName,
        });

        return (
          <li key={`${placement.tournamentId}-${String(placement.rank)}`}>
            <Link
              to={`/tournaments/${placement.tournamentId}`}
              title={label}
              className={cn(
                'grid place-items-center rounded-full ring-1 transition-transform hover:scale-110',
                metal?.ring,
                // A world championship is the one result worth spotting from
                // across the page.
                placement.major ? 'h-11 w-11' : 'h-7 w-7',
              )}
            >
              <Trophy
                size={placement.major ? 22 : 14}
                aria-hidden
                className={cn('shrink-0', metal?.icon)}
              />
              <span className="sr-only">{label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

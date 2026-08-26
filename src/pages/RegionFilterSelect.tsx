import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { regionFilters, regionLabelOf, type RegionFilter } from '@services/team/regions';

import type { Team } from '@models/index';

/**
 * Narrows a list to one region.
 *
 * The options come from the teams on hand rather than a fixed list, so the
 * filter never offers a region that would return nothing — and disappears
 * entirely while every team shares one region, where it could only ever be a
 * no-op.
 */
export function RegionFilterSelect({
  teams,
  value,
  onChange,
}: {
  teams: readonly Team[];
  value: RegionFilter;
  onChange: (value: RegionFilter) => void;
}) {
  const { t } = useTranslation();
  const options = useMemo(() => regionFilters(teams), [teams]);

  if (options.length < 3) return null;

  return (
    <label className="flex items-center gap-2 text-xs text-fg-secondary">
      {t('teams.region')}
      <select
        value={value}
        aria-label={t('teams.region')}
        onChange={(event) => {
          onChange(event.target.value as RegionFilter);
        }}
        className="h-9 rounded-[var(--radius-control)] border border-line bg-inset px-2 text-sm text-fg outline-none focus-visible:border-accent"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option === 'all'
              ? t('teams.regionAll')
              : option === 'none'
                ? t('teams.regionNone')
                : (regionLabelOf(teams, option) ?? option)}
          </option>
        ))}
      </select>
    </label>
  );
}

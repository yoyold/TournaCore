import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { FlagIcon } from '@components/ui/FlagIcon';
import { groupByRegion } from '@services/team/regions';
import { useDataStore } from '@store/slices/dataSlice';
import { cn } from '@utils/cn';

import type { Team, TeamId } from '@models/index';

interface TeamSelectionListProps {
  selected: readonly TeamId[];
  onToggle: (teamId: TeamId) => void;
  /**
   * Teams already in the field by another route, shown as taken rather than
   * hidden — a team vanishing from the list looks like it was never known.
   */
  takenIds?: readonly TeamId[];
}

/**
 * Picks entrants from the teams already on record.
 *
 * Typing a name that already exists is how duplicates are born: a stray space or
 * a rebranded club and the archive grows a second entry for one team. Choosing
 * from the list names the team outright, so the entry carries its identity
 * rather than a spelling to be matched later.
 *
 * Grouped by region because that is how an organiser thinks about a field —
 * whom to invite is a question asked one region at a time.
 */
export function TeamSelectionList({ selected, onToggle, takenIds = [] }: TeamSelectionListProps) {
  const { t } = useTranslation();
  const teams = useDataStore((s) => s.teams);
  const [query, setQuery] = useState('');

  const chosen = useMemo(() => new Set<string>(selected), [selected]);
  const taken = useMemo(() => new Set<string>(takenIds), [takenIds]);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matching = Object.values(teams)
      .filter((team) => !team.archived)
      .filter(
        (team) =>
          needle === '' ||
          team.name.toLowerCase().includes(needle) ||
          team.tag.toLowerCase().includes(needle) ||
          (team.formerNames ?? []).some((name) => name.toLowerCase().includes(needle)),
      )
      .sort((a, b) => a.name.localeCompare(b.name));

    return groupByRegion(matching, (team: Team) => team);
  }, [teams, query]);

  const known = Object.values(teams).filter((team) => !team.archived).length;

  if (known === 0) {
    return <p className="text-sm text-fg-muted">{t('wizard.noKnownTeams')}</p>;
  }

  return (
    <div className="grid gap-3">
      <label className="relative">
        <span className="sr-only-focusable">{t('wizard.searchTeams')}</span>
        <Search
          size={15}
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted"
        />
        <input
          type="search"
          value={query}
          aria-label={t('wizard.searchTeams')}
          placeholder={t('teams.searchPlaceholder')}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          className="h-9 w-full rounded-[var(--radius-control)] border border-line bg-inset pr-3 pl-9 text-sm text-fg outline-none focus-visible:border-accent"
        />
      </label>

      {groups.length === 0 ? (
        <p className="text-sm text-fg-muted">{t('teams.noMatches')}</p>
      ) : (
        <div className="max-h-80 overflow-y-auto rounded-[var(--radius-control)] border border-line">
          {groups.map((group) => (
            <section key={group.key}>
              <h3 className="sticky top-0 border-b border-line bg-inset px-3 py-1.5 text-2xs font-semibold tracking-wide text-fg-muted uppercase">
                {group.label ?? t('teams.regionNone')}
              </h3>
              <ul>
                {group.items.map((team) => {
                  const isTaken = taken.has(team.id);
                  return (
                    <li key={team.id}>
                      <label
                        className={cn(
                          'flex cursor-pointer items-center gap-2 border-b border-line px-3 py-2 text-sm last:border-b-0',
                          isTaken ? 'cursor-default opacity-50' : 'hover:bg-hover',
                        )}
                      >
                        <input
                          type="checkbox"
                          // The row carries a tag and a flag beside the name, so
                          // the label alone names the control ambiguously.
                          aria-label={team.name}
                          checked={isTaken || chosen.has(team.id)}
                          disabled={isTaken}
                          onChange={() => {
                            onToggle(team.id);
                          }}
                          className="h-4 w-4 shrink-0 accent-[var(--tc-accent)]"
                        />
                        {team.countryCode !== undefined && (
                          <FlagIcon countryCode={team.countryCode} width={16} />
                        )}
                        <span className="min-w-0 flex-1 truncate text-fg">{team.name}</span>
                        <span className="shrink-0 text-xs text-fg-muted">{team.tag}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

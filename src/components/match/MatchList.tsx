import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { FlagIcon } from '@components/ui/FlagIcon';
import { matchScore, type Match, type MatchId, type Team } from '@models/index';
import { cn } from '@utils/cn';

import type { ResolvedMatch, ResolvedSlot } from '@domain/formats/types';

export interface MatchListProps {
  matches: readonly ResolvedMatch[];
  storedMatches: ReadonlyMap<MatchId, Match>;
  teamOf: (participantId: string) => Team | undefined;
  onSelectMatch?: ((match: ResolvedMatch) => void) | undefined;
  selectedMatchId?: MatchId | undefined;
}

/**
 * Fixtures grouped by round.
 *
 * A round robin has no bracket to click through — every pairing is fixed from
 * the start — so the schedule itself is the way in to entering results.
 */
export function MatchList({
  matches,
  storedMatches,
  teamOf,
  onSelectMatch,
  selectedMatchId,
}: MatchListProps) {
  const { t } = useTranslation();

  const rounds = useMemo(() => {
    const byRound = new Map<number, ResolvedMatch[]>();
    for (const match of matches) {
      if (match.isBye) continue;
      const list = byRound.get(match.position.round) ?? [];
      list.push(match);
      byRound.set(match.position.round, list);
    }
    return [...byRound.entries()]
      .sort(([a], [b]) => a - b)
      .map(([round, list]) => ({
        round,
        matches: list.sort((a, b) => a.position.indexInRound - b.position.indexInRound),
      }));
  }, [matches]);

  if (rounds.length === 0) {
    return (
      <p className="rounded-[var(--radius-card)] border border-line bg-surface p-8 text-center text-sm text-fg-muted">
        {t('bracket.empty')}
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      {rounds.map(({ round, matches: list }) => (
        <section key={round}>
          <h3 className="mb-2 text-xs font-medium tracking-wide text-fg-muted uppercase">
            {t('standings.round', { round: round + 1 })}
          </h3>
          <ul className="grid gap-1.5">
            {list.map((match) => {
              const stored = storedMatches.get(match.id);
              const score = stored ? matchScore(stored.games) : undefined;
              const decided = match.outcome !== undefined;
              const interactive = onSelectMatch !== undefined;

              return (
                <li key={match.id}>
                  <div
                    className={cn(
                      'flex items-center gap-2 rounded-[var(--radius-control)] border bg-surface px-3 py-2',
                      'transition-colors',
                      selectedMatchId === match.id ? 'border-accent' : 'border-line',
                      interactive && 'cursor-pointer hover:border-line-strong',
                    )}
                    {...(interactive
                      ? {
                          role: 'button',
                          tabIndex: 0,
                          'aria-label': accessibleName(match, teamOf, t),
                          onClick: () => {
                            onSelectMatch(match);
                          },
                          onKeyDown: (event: React.KeyboardEvent) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              onSelectMatch(match);
                            }
                          },
                        }
                      : {})}
                  >
                    <Side
                      slot={match.slotA}
                      teamOf={teamOf}
                      score={score?.a}
                      won={decided && match.outcome?.winner === 'A'}
                      dimmed={decided && match.outcome?.winner === 'B'}
                      align="right"
                    />

                    <span className="shrink-0 text-2xs text-fg-muted">
                      {decided ? '–' : t('standings.vs')}
                    </span>

                    <Side
                      slot={match.slotB}
                      teamOf={teamOf}
                      score={score?.b}
                      won={decided && match.outcome?.winner === 'B'}
                      dimmed={decided && match.outcome?.winner === 'A'}
                      align="left"
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Side({
  slot,
  teamOf,
  score,
  won,
  dimmed,
  align,
}: {
  slot: ResolvedSlot;
  teamOf: (participantId: string) => Team | undefined;
  score: number | undefined;
  won: boolean;
  dimmed: boolean;
  align: 'left' | 'right';
}) {
  const { t } = useTranslation();
  const team = slot.kind === 'participant' ? teamOf(slot.participantId) : undefined;
  const name =
    slot.kind === 'bye'
      ? t('bracket.bye')
      : slot.kind === 'tbd'
        ? t('bracket.tbd')
        : (team?.name ?? t('bracket.unknownTeam'));

  return (
    <span
      className={cn(
        'flex min-w-0 flex-1 items-center gap-2 text-sm',
        align === 'right' && 'flex-row-reverse',
        dimmed && 'opacity-55',
      )}
    >
      <span
        className={cn(
          'tabular w-4 shrink-0 text-center',
          won ? 'font-semibold text-fg' : 'text-fg-muted',
        )}
      >
        {score ?? ''}
      </span>
      <span className={cn('min-w-0 truncate', won ? 'font-semibold text-fg' : 'text-fg-secondary')}>
        {name}
      </span>
      {team?.countryCode !== undefined && <FlagIcon countryCode={team.countryCode} width={14} />}
    </span>
  );
}

function accessibleName(
  match: ResolvedMatch,
  teamOf: (participantId: string) => Team | undefined,
  t: (key: string) => string,
): string {
  const nameOf = (slot: ResolvedSlot): string => {
    if (slot.kind === 'bye') return t('bracket.bye');
    if (slot.kind === 'tbd') return t('bracket.tbd');
    return teamOf(slot.participantId)?.name ?? t('bracket.unknownTeam');
  };
  return `${nameOf(match.slotA)} ${t('bracket.versus')} ${nameOf(match.slotB)}`;
}

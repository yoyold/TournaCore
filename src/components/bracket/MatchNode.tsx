import { useTranslation } from 'react-i18next';

import { FlagIcon } from '@components/ui/FlagIcon';
import { cn } from '@utils/cn';

import type { ResolvedMatch, ResolvedSlot } from '@domain/formats/types';
import type { Team } from '@models/index';

export interface MatchNodeProps {
  match: ResolvedMatch;
  /** Map score per side, derived from the stored maps. */
  score?: { a: number; b: number } | undefined;
  teamOf: (participantId: string) => Team | undefined;
  onSelect?: ((match: ResolvedMatch) => void) | undefined;
  selected?: boolean | undefined;
}

/**
 * One match in the bracket.
 *
 * Status is never carried by colour alone: a decided side is highlighted and
 * bold, a live match has a label as well as a pulse, and a bye says so in words.
 * That keeps the bracket readable for colour-blind users and, just as
 * importantly, on a projector.
 */
export function MatchNode({ match, score, teamOf, onSelect, selected = false }: MatchNodeProps) {
  const { t } = useTranslation();

  /*
   * A bye is decided by the bracket structure, not by play. Any stored result on
   * such a match is stale — from an edited participant list, say — and must not
   * be shown as though maps had been played.
   */
  const visibleScore = match.isBye ? undefined : score;
  const isLive = match.status === 'live';
  const isDecided = match.outcome !== undefined;
  const interactive = onSelect !== undefined && !match.isBye;

  const label = match.isBye
    ? t('bracket.bye')
    : `${formatOf(match)} · ${t(`bracket.status.${match.status}`)}`;

  return (
    <div
      className={cn(
        'flex h-full w-full flex-col overflow-hidden rounded-[var(--radius-control)] border bg-surface',
        'transition-[border-color,box-shadow,transform] duration-150',
        match.isBye ? 'border-dashed border-line opacity-55' : 'border-line',
        isLive && 'border-live shadow-[0_0_0_1px_var(--tc-live)]',
        selected && 'border-accent shadow-[0_0_0_1px_var(--tc-accent)]',
        interactive &&
          'cursor-pointer hover:-translate-y-px hover:border-line-strong hover:shadow-md',
      )}
      {...(interactive
        ? {
            role: 'button',
            tabIndex: 0,
            onClick: () => {
              onSelect(match);
            },
            onKeyDown: (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect(match);
              }
            },
          }
        : {})}
    >
      <SlotRow
        slot={match.slotA}
        team={teamOf(participantOf(match.slotA) ?? '')}
        score={visibleScore?.a}
        isWinner={isDecided && match.outcome?.winner === 'A'}
        isDecided={isDecided}
      />
      <div className="h-px bg-line" />
      <SlotRow
        slot={match.slotB}
        team={teamOf(participantOf(match.slotB) ?? '')}
        score={visibleScore?.b}
        isWinner={isDecided && match.outcome?.winner === 'B'}
        isDecided={isDecided}
      />

      <div className="flex items-center gap-1.5 border-t border-line bg-inset px-2 py-1 text-2xs text-fg-muted">
        {isLive && (
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-live" />
        )}
        <span className="truncate">{label}</span>
      </div>
    </div>
  );
}

interface SlotRowProps {
  slot: ResolvedSlot;
  team: Team | undefined;
  score: number | undefined;
  isWinner: boolean;
  isDecided: boolean;
}

function SlotRow({ slot, team, score, isWinner, isDecided }: SlotRowProps) {
  const { t } = useTranslation();

  const name =
    slot.kind === 'bye'
      ? t('bracket.bye')
      : slot.kind === 'tbd'
        ? t('bracket.tbd')
        : (team?.name ?? t('bracket.unknownTeam'));

  return (
    <div
      className={cn(
        'flex min-w-0 flex-1 items-center gap-2 px-2',
        isWinner && 'bg-success/10',
        // A decided loser is dimmed, so the eye follows the winning path.
        isDecided && !isWinner && 'opacity-55',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'h-4 w-0.5 shrink-0 rounded-full',
          isWinner ? 'bg-success' : 'bg-transparent',
        )}
      />
      {/*
        Flag where the team has a country, tag badge otherwise. The two occupy
        the same slot rather than sitting side by side: at 232px a node has room
        for one identifier plus the name, and crowding both would truncate the
        name that actually matters.
      */}
      {team?.countryCode !== undefined ? (
        <FlagIcon countryCode={team.countryCode} width={16} />
      ) : (
        <span
          aria-hidden
          className="grid h-4 w-6 shrink-0 place-items-center rounded-[3px] bg-hover text-[9px] font-semibold text-fg-muted"
        >
          {team?.tag ?? '—'}
        </span>
      )}
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-xs',
          isWinner ? 'font-semibold text-fg' : 'text-fg-secondary',
          slot.kind !== 'participant' && 'italic text-fg-muted',
        )}
      >
        {name}
      </span>
      <span className={cn('tabular text-xs', isWinner ? 'font-semibold text-fg' : 'text-fg-muted')}>
        {score ?? ''}
      </span>
    </div>
  );
}

function participantOf(slot: ResolvedSlot): string | undefined {
  return slot.kind === 'participant' ? slot.participantId : undefined;
}

function formatOf(match: ResolvedMatch): string {
  return match.format.kind === 'single_game' ? 'BO1' : `BO${String(match.format.games)}`;
}

import { Plus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@components/ui/Button';
import { FlagIcon } from '@components/ui/FlagIcon';
import { applyMatchResult, clearMatchResult } from '@domain/matchFactory';
import {
  gamesToWin,
  newGameResultId,
  now,
  type GameResult,
  type Match,
  type MatchOutcome,
  type StageId,
  type Team,
  type TournamentId,
} from '@models/index';
import { cn } from '@utils/cn';

import type { ResolvedMatch, ResolvedSlot, StructuralMatch } from '@domain/formats/types';

export interface MatchResultSheetProps {
  match: ResolvedMatch;
  structural: StructuralMatch;
  stored: Match | undefined;
  tournamentId: TournamentId;
  stageId: StageId;
  teamOf: (participantId: string) => Team | undefined;
  onSave: (match: Match) => Promise<void>;
  onClose: () => void;
}

/** Draft row: scores are strings so a field can be empty while being typed. */
interface DraftGame {
  key: string;
  scoreA: string;
  scoreB: string;
}

/**
 * Side panel for entering a match result.
 *
 * A side sheet rather than a modal, so the bracket stays visible: the point of
 * entering a result is watching the winner advance, and a dialog covering the
 * thing that changes hides the feedback.
 *
 * Deliberately keyboard-first. Entering results is what a tournament admin does
 * dozens of times under time pressure, so every field is reachable by Tab and
 * Enter saves from anywhere in the form.
 */
export function MatchResultSheet({
  match,
  structural,
  stored,
  tournamentId,
  stageId,
  teamOf,
  onSave,
  onClose,
}: MatchResultSheetProps) {
  const { t } = useTranslation();
  const firstField = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);

  /*
   * The draft is seeded once on mount. Selecting a different match remounts this
   * component via its key rather than syncing state through an effect, which is
   * both simpler and avoids overwriting half-typed input on an unrelated update.
   */
  const [games, setGames] = useState<DraftGame[]>(() => toDraft(stored?.games ?? []));

  useEffect(() => {
    firstField.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const teamA = teamOf(participantOf(match.slotA) ?? '');
  const teamB = teamOf(participantOf(match.slotB) ?? '');
  const bothKnown = match.slotA.kind === 'participant' && match.slotB.kind === 'participant';

  const parsed = useMemo(() => toGameResults(games), [games]);
  const tally = useMemo(() => countWins(parsed), [parsed]);
  const needed = gamesToWin(match.format);
  const maxGames = match.format.kind === 'single_game' ? 1 : match.format.games;

  const leader = tally.a > tally.b ? 'A' : tally.b > tally.a ? 'B' : undefined;
  const decided = (tally.a >= needed || tally.b >= needed) && leader !== undefined;

  const persist = async (outcome?: MatchOutcome, clear = false): Promise<void> => {
    setSaving(true);
    try {
      const timestamp = now();
      const next =
        clear && stored
          ? clearMatchResult(stored, timestamp)
          : applyMatchResult({
              existing: stored,
              structural,
              tournamentId,
              stageId,
              games: parsed,
              outcome,
              timestamp,
            });
      await onSave(next);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const walkover = (winner: 'A' | 'B'): void => {
    void persist({ winner, reason: 'walkover', decidedAt: now() });
  };

  return (
    <aside
      role="dialog"
      aria-labelledby="result-sheet-title"
      className="flex h-full w-full flex-col border-l border-line bg-surface"
    >
      <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 id="result-sheet-title" className="text-sm font-semibold text-fg">
            {t('result.title')}
          </h2>
          <p className="mt-0.5 text-xs text-fg-muted">
            {t('result.roundLabel', { round: match.position.round + 1 })} ·{' '}
            {match.format.kind === 'single_game' ? 'BO1' : `BO${String(match.format.games)}`}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={t('result.close')}
          onClick={onClose}
          icon={<X size={16} aria-hidden />}
        />
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="mb-5 flex flex-col gap-2">
          <SideLine team={teamA} slot={match.slotA} wins={tally.a} leading={leader === 'A'} />
          <SideLine team={teamB} slot={match.slotB} wins={tally.b} leading={leader === 'B'} />
        </div>

        {!bothKnown && (
          <p className="mb-4 rounded-[var(--radius-control)] border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
            {t('result.participantsUnknown')}
          </p>
        )}

        <fieldset disabled={!bothKnown || saving} className="disabled:opacity-60">
          <legend className="mb-2 text-xs font-medium text-fg-secondary">{t('result.maps')}</legend>

          <div className="flex flex-col gap-2">
            {games.map((row, index) => (
              <div key={row.key} className="flex items-center gap-2">
                <span className="tabular w-5 shrink-0 text-xs text-fg-muted">{index + 1}</span>
                <ScoreInput
                  ref={index === 0 ? firstField : undefined}
                  value={row.scoreA}
                  label={t('result.scoreFor', { team: teamA?.name ?? 'A', map: index + 1 })}
                  onChange={(value) => {
                    setGames((current) => patch(current, index, { scoreA: value }));
                  }}
                  onSubmit={() => {
                    void persist();
                  }}
                />
                <span aria-hidden className="text-xs text-fg-muted">
                  :
                </span>
                <ScoreInput
                  value={row.scoreB}
                  label={t('result.scoreFor', { team: teamB?.name ?? 'B', map: index + 1 })}
                  onChange={(value) => {
                    setGames((current) => patch(current, index, { scoreB: value }));
                  }}
                  onSubmit={() => {
                    void persist();
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto h-8 w-8"
                  aria-label={t('result.removeMap', { map: index + 1 })}
                  onClick={() => {
                    setGames((current) => current.filter((_, i) => i !== index));
                  }}
                  icon={<Trash2 size={14} aria-hidden />}
                />
              </div>
            ))}
          </div>

          {games.length < maxGames && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              icon={<Plus size={14} aria-hidden />}
              onClick={() => {
                setGames((current) => [...current, emptyRow()]);
              }}
            >
              {t('result.addMap')}
            </Button>
          )}
        </fieldset>

        <p className="mt-4 text-xs text-fg-secondary" aria-live="polite">
          {decided
            ? t('result.decided', {
                team: (leader === 'A' ? teamA?.name : teamB?.name) ?? '',
                score: `${String(tally.a)}:${String(tally.b)}`,
              })
            : t('result.open', { needed })}
        </p>

        {bothKnown && (
          <div className="mt-5 border-t border-line pt-4">
            <p className="mb-2 text-xs font-medium text-fg-secondary">{t('result.noShow')}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={saving}
                onClick={() => {
                  walkover('A');
                }}
              >
                {t('result.walkoverFor', { team: teamA?.name ?? 'A' })}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={saving}
                onClick={() => {
                  walkover('B');
                }}
              >
                {t('result.walkoverFor', { team: teamB?.name ?? 'B' })}
              </Button>
            </div>
          </div>
        )}
      </div>

      <footer className="flex items-center gap-2 border-t border-line px-5 py-4">
        {stored?.outcome !== undefined && (
          <Button
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={() => {
              void persist(undefined, true);
            }}
          >
            {t('result.clear')}
          </Button>
        )}
        <Button variant="ghost" size="sm" className="ml-auto" onClick={onClose} disabled={saving}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={!bothKnown || saving}
          onClick={() => {
            void persist();
          }}
        >
          {t('common.save')}
        </Button>
      </footer>
    </aside>
  );
}

interface SideLineProps {
  team: Team | undefined;
  slot: ResolvedSlot;
  wins: number;
  leading: boolean;
}

function SideLine({ team, slot, wins, leading }: SideLineProps) {
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
        'flex items-center gap-2 rounded-[var(--radius-control)] border px-3 py-2',
        leading ? 'border-success/40 bg-success/10' : 'border-line bg-inset',
      )}
    >
      {team?.countryCode !== undefined && <FlagIcon countryCode={team.countryCode} width={16} />}
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-sm',
          leading ? 'font-semibold text-fg' : 'text-fg-secondary',
        )}
      >
        {name}
      </span>
      <span className={cn('tabular text-sm', leading ? 'font-semibold text-fg' : 'text-fg-muted')}>
        {wins}
      </span>
    </div>
  );
}

interface ScoreInputProps {
  value: string;
  label: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  ref?: React.Ref<HTMLInputElement> | undefined;
}

function ScoreInput({ value, label, onChange, onSubmit, ref }: ScoreInputProps) {
  return (
    <input
      ref={ref}
      type="number"
      min={0}
      inputMode="numeric"
      value={value}
      aria-label={label}
      onChange={(event) => {
        onChange(event.target.value);
      }}
      onKeyDown={(event) => {
        // Enter saves from any field: entering a result should not require
        // reaching for the mouse.
        if (event.key === 'Enter') {
          event.preventDefault();
          onSubmit();
        }
      }}
      className="tabular h-8 w-14 rounded-[var(--radius-control)] border border-line bg-inset px-2 text-center text-sm text-fg"
    />
  );
}

// --- draft helpers ----------------------------------------------------------

let rowCounter = 0;

function emptyRow(): DraftGame {
  rowCounter += 1;
  return { key: `row-${String(rowCounter)}`, scoreA: '', scoreB: '' };
}

function toDraft(games: readonly GameResult[]): DraftGame[] {
  if (games.length === 0) return [emptyRow()];
  return games.map((game) => ({
    key: game.id,
    scoreA: String(game.scoreA),
    scoreB: String(game.scoreB),
  }));
}

function patch(rows: DraftGame[], index: number, changes: Partial<DraftGame>): DraftGame[] {
  return rows.map((row, i) => (i === index ? { ...row, ...changes } : row));
}

/**
 * Converts draft rows into results, dropping rows that are still empty.
 *
 * A row where both fields are blank is a row the user has not filled in yet, not
 * a nil-all draw — treating it as a played map would decide series early.
 */
function toGameResults(rows: readonly DraftGame[]): GameResult[] {
  const results: GameResult[] = [];

  rows.forEach((row) => {
    if (row.scoreA.trim() === '' && row.scoreB.trim() === '') return;

    const scoreA = Number(row.scoreA) || 0;
    const scoreB = Number(row.scoreB) || 0;

    results.push({
      id: row.key.startsWith('row-') ? newGameResultId() : (row.key as GameResult['id']),
      index: results.length + 1,
      scoreA,
      scoreB,
      ...(scoreA === scoreB ? {} : { winner: scoreA > scoreB ? ('A' as const) : ('B' as const) }),
    });
  });

  return results;
}

function countWins(games: readonly GameResult[]): { a: number; b: number } {
  let a = 0;
  let b = 0;
  for (const game of games) {
    if (game.winner === 'A') a += 1;
    else if (game.winner === 'B') b += 1;
  }
  return { a, b };
}

function participantOf(slot: ResolvedSlot): string | undefined {
  return slot.kind === 'participant' ? slot.participantId : undefined;
}

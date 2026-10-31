import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@components/ui/Button';
import {
  DEFAULT_SWISS_TIEBREAKERS,
  DEFAULT_TIEBREAKERS,
  isPinnedTiebreaker,
  moveTiebreaker,
  type Stage,
  type Tiebreaker,
} from '@models/index';
import { useDataStore } from '@store/slices/dataSlice';
import { cn } from '@utils/cn';

const ARROW =
  'flex h-5 w-5 items-center justify-center rounded-[var(--radius-control)] text-fg-muted ' +
  'transition-colors hover:bg-hover hover:text-fg disabled:pointer-events-none disabled:opacity-30';

/**
 * Lets an organiser decide what settles a tie in a table.
 *
 * Two teams level on points are not level in every sense, and which of the
 * remaining measures counts first is a rule rather than a fact: some
 * competitions give it to whoever won the match between them, others to the
 * better map difference across the whole group. Both are ordinary, neither can
 * be read off the results, and the difference routinely decides who qualifies.
 *
 * So it is configured per stage rather than fixed. Standings are derived, so a
 * change reorders every table in the stage immediately and is fully reversible.
 */
export function TiebreakerControl({ stage }: { stage: Stage }) {
  const { t } = useTranslation();
  const saveStage = useDataStore((s) => s.saveStage);
  const labelId = useId();

  const format = stage.format;
  if (format.kind !== 'round_robin' && format.kind !== 'group_stage' && format.kind !== 'swiss') {
    return null;
  }

  // A group stage keeps its chain one level down, on the round robin each group
  // is played as.
  const chain = format.kind === 'group_stage' ? format.perGroup.tiebreakers : format.tiebreakers;
  const fallback = format.kind === 'swiss' ? DEFAULT_SWISS_TIEBREAKERS : DEFAULT_TIEBREAKERS;

  /*
   * Written per branch rather than through one generic patch: the formats are a
   * discriminated union, and spreading a partial over all of them widens `kind`
   * back to the union, which is no longer a valid configuration.
   */
  const save = (next: Tiebreaker[]): void => {
    if (format.kind === 'group_stage') {
      void saveStage({
        ...stage,
        format: { ...format, perGroup: { ...format.perGroup, tiebreakers: next } },
      });
    } else if (format.kind === 'round_robin') {
      void saveStage({ ...stage, format: { ...format, tiebreakers: next } });
    } else {
      void saveStage({ ...stage, format: { ...format, tiebreakers: next } });
    }
  };

  const movable = chain.filter((entry) => !isPinnedTiebreaker(entry));
  const isDefault = chain.length === fallback.length && chain.every((e, i) => e === fallback[i]);

  const label = (criterion: Tiebreaker): string =>
    t(`standings.tiebreaker.${criterion}`, { defaultValue: criterion });

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--radius-control)] border border-line bg-inset px-3 py-2">
      <span id={labelId} className="text-xs font-medium text-fg-secondary">
        {t('standings.tiebreakerOrder')}
      </span>

      {/* Named by the caption beside it, so the chain is one findable list. */}
      <ol aria-labelledby={labelId} className="flex flex-wrap items-center gap-1.5">
        {chain.map((criterion, index) => {
          const pinned = isPinnedTiebreaker(criterion);
          const at = movable.indexOf(criterion);

          return (
            <li
              key={criterion}
              className={cn(
                'flex items-center gap-1 rounded-[var(--radius-control)] border border-line py-0.5 pl-2 text-xs',
                pinned ? 'bg-inset text-fg-muted pr-2' : 'bg-surface text-fg pr-0.5',
              )}
            >
              <span className="tabular text-fg-muted">{index + 1}.</span>
              <span>{label(criterion)}</span>

              {!pinned && (
                <span className="flex items-center">
                  <button
                    type="button"
                    className={ARROW}
                    disabled={at <= 0}
                    aria-label={t('standings.tiebreakerEarlier', { criterion: label(criterion) })}
                    onClick={() => {
                      save(moveTiebreaker(chain, criterion, -1));
                    }}
                  >
                    <ChevronLeft size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className={ARROW}
                    disabled={at < 0 || at >= movable.length - 1}
                    aria-label={t('standings.tiebreakerLater', { criterion: label(criterion) })}
                    onClick={() => {
                      save(moveTiebreaker(chain, criterion, 1));
                    }}
                  >
                    <ChevronRight size={14} aria-hidden />
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {!isDefault && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            save([...fallback]);
          }}
        >
          {t('standings.tiebreakerReset')}
        </Button>
      )}

      <p className="w-full text-xs text-fg-muted">{t('standings.tiebreakerHint')}</p>
    </div>
  );
}

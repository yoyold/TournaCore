import { useTranslation } from 'react-i18next';

import {
  LEGACY_SEED_ARRANGEMENT,
  type DoubleEliminationConfig,
  type SeedArrangement,
  type Stage,
} from '@models/index';
import { useDataStore } from '@store/slices/dataSlice';

const ARRANGEMENTS: SeedArrangement[] = ['standard', 'mirrored'];

const DROP_ORDERS: DoubleEliminationConfig['loserBracketSeeding'][] = [
  'balanced',
  'alternating',
  'reversed',
  'standard',
];

/**
 * Lets an organiser change how a bracket is drawn.
 *
 * This exists because the drawing cannot be inferred. A stored result names a
 * position — "round 0, match 2, side A won" — and which participant stands in
 * that position comes from the arrangement. Two brackets with the same pairings
 * but a different order of matches are both internally consistent, so nothing in
 * the data says which one a stage was drawn with.
 *
 * Where that matters: a bracket imported from elsewhere was drawn by whatever
 * drew it, and a stage created before this became configurable recorded no
 * choice at all. Changing the setting re-derives everything immediately and is
 * fully reversible, so the fastest way to find the right one is to look.
 */
export function BracketArrangementControl({ stage }: { stage: Stage }) {
  const { t } = useTranslation();
  const saveStage = useDataStore((s) => s.saveStage);

  const format = stage.format;
  if (format.kind !== 'single_elimination' && format.kind !== 'double_elimination') return null;

  /*
   * Written per branch rather than through one generic patch: the two formats
   * are a discriminated union, and spreading a partial over both widens `kind`
   * back to the union, which is no longer a valid configuration.
   */
  const setArrangement = (value: SeedArrangement): void => {
    void saveStage(
      format.kind === 'single_elimination'
        ? { ...stage, format: { ...format, seedArrangement: value } }
        : { ...stage, format: { ...format, seedArrangement: value } },
    );
  };

  const setDropOrder = (value: DoubleEliminationConfig['loserBracketSeeding']): void => {
    if (format.kind !== 'double_elimination') return;
    void saveStage({ ...stage, format: { ...format, loserBracketSeeding: value } });
  };

  return (
    <div className="flex flex-wrap items-end gap-4 rounded-[var(--radius-control)] border border-line bg-inset px-3 py-2">
      <label className="grid gap-1">
        <span className="text-xs font-medium text-fg-secondary">{t('bracket.arrangement')}</span>
        <select
          value={format.seedArrangement ?? LEGACY_SEED_ARRANGEMENT}
          onChange={(event) => {
            setArrangement(event.target.value as SeedArrangement);
          }}
          className="h-8 rounded-[var(--radius-control)] border border-line bg-surface px-2 text-sm text-fg outline-none focus-visible:border-accent"
        >
          {ARRANGEMENTS.map((option) => (
            <option key={option} value={option}>
              {t(`bracket.arrangementOption.${option}`)}
            </option>
          ))}
        </select>
      </label>

      {format.kind === 'double_elimination' && (
        <label className="grid gap-1">
          <span className="text-xs font-medium text-fg-secondary">{t('bracket.dropOrder')}</span>
          <select
            value={format.loserBracketSeeding}
            onChange={(event) => {
              setDropOrder(event.target.value as DoubleEliminationConfig['loserBracketSeeding']);
            }}
            className="h-8 rounded-[var(--radius-control)] border border-line bg-surface px-2 text-sm text-fg outline-none focus-visible:border-accent"
          >
            {DROP_ORDERS.map((option) => (
              <option key={option} value={option}>
                {t(`bracket.dropOrderOption.${option}`)}
              </option>
            ))}
          </select>
        </label>
      )}

      <p className="max-w-md text-xs text-fg-muted">{t('bracket.arrangementHint')}</p>
    </div>
  );
}

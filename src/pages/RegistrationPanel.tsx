import { ChevronDown, ChevronUp, Play, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@components/ui/Button';
import { Card, CardBody } from '@components/ui/Card';
import { FlagIcon } from '@components/ui/FlagIcon';
import { TeamSelectionList } from '@pages/TeamSelectionList';
import { parseParticipants, type ParsedParticipant } from '@services/tournament/parseParticipants';
import { fieldOf } from '@services/tournament/registration';
import { useDataStore } from '@store/slices/dataSlice';
import { cn } from '@utils/cn';

import type { TeamId, Tournament } from '@models/index';

/** Below this no format can be drawn, so no tournament can be started. */
const MINIMUM_FIELD = 2;

/**
 * A tournament between being announced and being played.
 *
 * The field is rarely settled when an event is created, so the tournament
 * exists first and fills up afterwards. Nothing is drawn in the meantime: the
 * bracket is derived from the field, so it costs nothing to leave it until the
 * organiser says the field is complete, and a great deal to draw it early and
 * have entrants arrive afterwards.
 *
 * Every change is written straight away. There is no draft of a draft, and an
 * organiser adding teams over weeks should never have to wonder whether the
 * last one was saved.
 */
export function RegistrationPanel({ tournament }: { tournament: Tournament }) {
  const { t } = useTranslation();
  const teams = useDataStore((s) => s.teams);
  const setField = useDataStore((s) => s.setField);
  const startTournament = useDataStore((s) => s.startTournament);

  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  const field = useMemo(
    () => fieldOf(tournament.participants, (teamId) => teams[teamId]),
    [tournament.participants, teams],
  );

  const selectedIds = useMemo(
    () => tournament.participants.map((participant) => participant.teamId),
    [tournament.participants],
  );

  /*
   * Changes are expressed against whatever is stored when they run, not against
   * what this render saw. Two quick clicks then compose instead of the second
   * one filing over the first.
   */
  const commit = (change: (current: ParsedParticipant[]) => ParsedParticipant[]): void => {
    setBusy(true);
    void setField(tournament.id, change).finally(() => {
      setBusy(false);
    });
  };

  const toggle = (teamId: TeamId): void => {
    const team = teams[teamId];
    if (!team) return;

    commit((current) => {
      const without = current.filter((entry) => entry.teamId !== teamId);
      if (without.length < current.length) return without;

      return [
        ...current,
        {
          name: team.name,
          teamId,
          ...(team.countryCode !== undefined ? { countryCode: team.countryCode } : {}),
        },
      ];
    });
  };

  const addTyped = (): void => {
    const entered = parseParticipants(typed);
    setTyped('');
    if (entered.length === 0) return;

    commit((current) => {
      const known = new Set(current.map((entry) => entry.name.toLowerCase()));
      return [...current, ...entered.filter((entry) => !known.has(entry.name.toLowerCase()))];
    });
  };

  /** Moves an entry one place, which is how the field is seeded. */
  const move = (teamId: TeamId | undefined, by: -1 | 1): void => {
    commit((current) => {
      const index = current.findIndex((entry) => entry.teamId === teamId);
      const next = [...current];
      const moved = next[index];
      const displaced = next[index + by];
      if (moved === undefined || displaced === undefined) return current;
      next[index] = displaced;
      next[index + by] = moved;
      return next;
    });
  };

  const label = (entry: ParsedParticipant): string =>
    entry.name === '' ? t('bracket.unknownTeam') : entry.name;

  const ready = field.length >= MINIMUM_FIELD;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="grid gap-4">
        <Card>
          <CardBody className="grid gap-2">
            <span className="text-sm font-medium text-fg">{t('wizard.field.knownTeams')}</span>
            <p className="text-xs text-fg-secondary">{t('wizard.knownTeamsHint')}</p>
            <TeamSelectionList selected={selectedIds} onToggle={toggle} />
          </CardBody>
        </Card>

        <Card>
          <CardBody className="grid gap-2">
            <label htmlFor="new-entrant" className="text-sm font-medium text-fg">
              {t('registration.addNew')}
            </label>
            <p className="text-xs text-fg-secondary">{t('registration.addNewHint')}</p>
            <div className="flex gap-2">
              <input
                id="new-entrant"
                type="text"
                value={typed}
                placeholder="Nova Collective, DE"
                onChange={(event) => {
                  setTyped(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  addTyped();
                }}
                className="h-10 min-w-0 flex-1 rounded-[var(--radius-control)] border border-line bg-inset px-3 text-sm text-fg outline-none focus-visible:border-accent"
              />
              <Button
                variant="secondary"
                disabled={typed.trim() === ''}
                icon={<Plus size={16} aria-hidden />}
                onClick={addTyped}
              >
                {t('common.create')}
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody className="grid gap-3">
          <span className="text-sm font-medium text-fg">
            {t('tournaments.participantCount', { count: field.length })}
          </span>

          {field.length === 0 ? (
            <p className="text-sm text-fg-muted">{t('wizard.noParticipants')}</p>
          ) : (
            <ol aria-label={t('registration.field')} className="grid gap-1">
              {field.map((entry, index) => (
                <li
                  key={entry.teamId ?? entry.name}
                  className="flex items-center gap-2 rounded-[var(--radius-control)] bg-inset px-2 py-1 text-sm"
                >
                  <span className="tabular w-5 shrink-0 text-xs text-fg-muted">{index + 1}</span>
                  {entry.countryCode !== undefined && (
                    <FlagIcon countryCode={entry.countryCode} width={16} />
                  )}
                  <span className="min-w-0 flex-1 truncate text-fg">
                    {entry.name === '' ? t('bracket.unknownTeam') : entry.name}
                  </span>
                  <IconButton
                    label={t('registration.moveUp', { name: label(entry) })}
                    disabled={index === 0}
                    onClick={() => {
                      move(entry.teamId, -1);
                    }}
                  >
                    <ChevronUp size={14} aria-hidden />
                  </IconButton>
                  <IconButton
                    label={t('registration.moveDown', { name: label(entry) })}
                    disabled={index === field.length - 1}
                    onClick={() => {
                      move(entry.teamId, 1);
                    }}
                  >
                    <ChevronDown size={14} aria-hidden />
                  </IconButton>
                  <IconButton
                    label={t('registration.remove', { name: label(entry) })}
                    onClick={() => {
                      commit((current) => current.filter((other) => other.teamId !== entry.teamId));
                    }}
                  >
                    <X size={14} aria-hidden />
                  </IconButton>
                </li>
              ))}
            </ol>
          )}

          <div className="mt-2 grid gap-2 border-t border-line pt-3">
            <Button
              variant="primary"
              disabled={!ready || busy}
              icon={<Play size={16} aria-hidden />}
              onClick={() => {
                setBusy(true);
                void startTournament(tournament.id).finally(() => {
                  setBusy(false);
                });
              }}
            >
              {t('registration.start')}
            </Button>
            <p className="text-xs text-fg-secondary">
              {ready
                ? t('registration.startHint')
                : t('registration.needMore', { count: MINIMUM_FIELD - field.length })}
            </p>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function IconButton({
  label,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'grid h-6 w-6 shrink-0 place-items-center rounded-[var(--radius-control)] text-fg-muted',
        disabled ? 'opacity-30' : 'hover:bg-hover hover:text-fg',
      )}
    >
      {children}
    </button>
  );
}

import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { BracketCanvas } from '@components/bracket/BracketCanvas';
import { Button } from '@components/ui/Button';
import { Card, CardBody } from '@components/ui/Card';
import { FlagIcon } from '@components/ui/FlagIcon';
import { PageHeader } from '@components/ui/PageHeader';
import { deriveTournamentState } from '@domain/derive';
import {
  assembleTournament,
  type BestOf,
  type TournamentDraft,
} from '@services/tournament/assembleTournament';
import { parseParticipants } from '@services/tournament/parseParticipants';
import { useDataStore } from '@store/slices/dataSlice';
import { cn } from '@utils/cn';

import type { MatchId, Team } from '@models/index';

const BEST_OF_OPTIONS: BestOf[] = [1, 3, 5, 7];
const STEP_COUNT = 4;

interface DraftState {
  name: string;
  gameName: string;
  organizer: string;
  startsAt: string;
  description: string;
  participantsText: string;
  thirdPlaceMatch: boolean;
  defaultBestOf: BestOf;
  finalBestOf: BestOf;
}

const INITIAL: DraftState = {
  name: '',
  gameName: '',
  organizer: '',
  startsAt: '',
  description: '',
  participantsText: '',
  thirdPlaceMatch: false,
  defaultBestOf: 3,
  finalBestOf: 5,
};

/**
 * Four-step wizard for creating a tournament.
 *
 * The complexity of a tournament format is staged rather than hidden: basics
 * first, then the field of teams, then the format, and only then a preview.
 *
 * The preview is the same derivation and the same bracket component the live
 * tournament uses, run against the not-yet-saved entities. What the organiser
 * sees is exactly what gets stored — there is no separate preview code path to
 * drift from reality.
 */
export function TournamentWizardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const teams = useDataStore((s) => s.teams);
  const games = useDataStore((s) => s.games);
  const tournaments = useDataStore((s) => s.tournaments);
  const createTournament = useDataStore((s) => s.createTournament);

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<DraftState>(INITIAL);
  const [creating, setCreating] = useState(false);

  const set = <K extends keyof DraftState>(key: K, value: DraftState[K]): void => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const participants = useMemo(
    () => parseParticipants(draft.participantsText),
    [draft.participantsText],
  );

  const assembled = useMemo(() => {
    if (draft.name.trim() === '' || participants.length < 2) return undefined;

    const startsAt = draft.startsAt ? new Date(draft.startsAt).toISOString() : undefined;
    const input: TournamentDraft = {
      name: draft.name,
      participants,
      format: {
        thirdPlaceMatch: draft.thirdPlaceMatch,
        defaultBestOf: draft.defaultBestOf,
        finalBestOf: draft.finalBestOf,
      },
      ...(draft.description.trim() ? { description: draft.description } : {}),
      ...(draft.organizer.trim() ? { organizer: draft.organizer } : {}),
      ...(draft.gameName.trim() ? { gameName: draft.gameName } : {}),
      ...(startsAt ? { startsAt } : {}),
    };

    return assembleTournament(input, {
      existingTeams: Object.values(teams),
      existingGames: Object.values(games),
      existingSlugs: Object.values(tournaments).map((tournament) => tournament.slug),
    });
  }, [draft, participants, teams, games, tournaments]);

  const preview = useMemo(() => {
    if (!assembled) return undefined;
    return deriveTournamentState({
      tournament: assembled.tournament,
      stages: [assembled.stage],
      matches: [],
    });
  }, [assembled]);

  const previewStage = preview?.stages[0];

  const previewTeamOf = useMemo(() => {
    const byTeamId = new Map<string, Team>();
    for (const team of [...Object.values(teams), ...(assembled?.newTeams ?? [])]) {
      byTeamId.set(team.id, team);
    }
    const byParticipant = new Map<string, string>();
    for (const participant of assembled?.tournament.participants ?? []) {
      byParticipant.set(participant.id, participant.teamId);
    }
    return (participantId: string): Team | undefined => {
      const teamId = byParticipant.get(participantId);
      return teamId === undefined ? undefined : byTeamId.get(teamId);
    };
  }, [teams, assembled]);

  const canAdvance =
    step === 0 ? draft.name.trim() !== '' : step === 1 ? participants.length >= 2 : true;

  const onCreate = async (): Promise<void> => {
    if (!assembled) return;
    setCreating(true);
    try {
      await createTournament(assembled);
      void navigate(`/tournaments/${assembled.tournament.id}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <PageHeader title={t('wizard.title')} subtitle={t('wizard.subtitle')} />

      <Stepper current={step} />

      <div className="mt-6">
        {step === 0 && <BasicsStep draft={draft} set={set} />}
        {step === 1 && (
          <ParticipantsStep
            value={draft.participantsText}
            onChange={(value) => {
              set('participantsText', value);
            }}
            participants={participants}
          />
        )}
        {step === 2 && <FormatStep draft={draft} set={set} />}
        {step === 3 && previewStage && (
          <PreviewStep
            structure={previewStage.structure}
            matches={previewStage.resolved.matches}
            teamOf={previewTeamOf}
            summary={{
              name: draft.name.trim(),
              participants: participants.length,
              thirdPlace: draft.thirdPlaceMatch,
              defaultBestOf: draft.defaultBestOf,
              finalBestOf: draft.finalBestOf,
            }}
          />
        )}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <Button
          variant="ghost"
          disabled={step === 0 || creating}
          icon={<ArrowLeft size={16} aria-hidden />}
          onClick={() => {
            setStep((s) => Math.max(0, s - 1));
          }}
        >
          {t('common.back')}
        </Button>

        {step < STEP_COUNT - 1 ? (
          <Button
            variant="primary"
            disabled={!canAdvance}
            onClick={() => {
              setStep((s) => Math.min(STEP_COUNT - 1, s + 1));
            }}
          >
            {t('common.next')}
            <ArrowRight size={16} aria-hidden />
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={!assembled || creating}
            icon={<Check size={16} aria-hidden />}
            onClick={() => {
              void onCreate();
            }}
          >
            {t('wizard.create')}
          </Button>
        )}
      </div>
    </>
  );
}

function Stepper({ current }: { current: number }) {
  const { t } = useTranslation();
  const labels = [
    t('wizard.step.basics'),
    t('wizard.step.participants'),
    t('wizard.step.format'),
    t('wizard.step.preview'),
  ];

  return (
    <ol className="flex flex-wrap gap-2">
      {labels.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                'grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold',
                active && 'bg-accent text-fg-on-accent',
                done && 'bg-success text-fg-on-accent',
                !active && !done && 'bg-hover text-fg-muted',
              )}
            >
              {done ? <Check size={13} aria-hidden /> : index + 1}
            </span>
            <span className={cn('text-sm', active ? 'font-medium text-fg' : 'text-fg-muted')}>
              {label}
            </span>
            {index < labels.length - 1 && (
              <span aria-hidden className="mx-1 text-fg-muted">
                ·
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

interface StepProps {
  draft: DraftState;
  set: <K extends keyof DraftState>(key: K, value: DraftState[K]) => void;
}

function BasicsStep({ draft, set }: StepProps) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardBody className="grid max-w-2xl gap-4">
        <Field label={t('wizard.field.name')} required>
          <input
            type="text"
            value={draft.name}
            onChange={(e) => {
              set('name', e.target.value);
            }}
            className={inputClass}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('wizard.field.game')}>
            <input
              type="text"
              value={draft.gameName}
              onChange={(e) => {
                set('gameName', e.target.value);
              }}
              className={inputClass}
            />
          </Field>
          <Field label={t('wizard.field.organizer')}>
            <input
              type="text"
              value={draft.organizer}
              onChange={(e) => {
                set('organizer', e.target.value);
              }}
              className={inputClass}
            />
          </Field>
        </div>
        <Field label={t('wizard.field.startsAt')}>
          <input
            type="datetime-local"
            value={draft.startsAt}
            onChange={(e) => {
              set('startsAt', e.target.value);
            }}
            className={inputClass}
          />
        </Field>
        <Field label={t('wizard.field.description')}>
          <textarea
            value={draft.description}
            rows={3}
            onChange={(e) => {
              set('description', e.target.value);
            }}
            className={cn(inputClass, 'resize-y')}
          />
        </Field>
      </CardBody>
    </Card>
  );
}

function ParticipantsStep({
  value,
  onChange,
  participants,
}: {
  value: string;
  onChange: (value: string) => void;
  participants: ReturnType<typeof parseParticipants>;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardBody className="grid gap-2">
          <label htmlFor="participants" className="text-sm font-medium text-fg">
            {t('wizard.field.participants')}
          </label>
          <p className="text-xs text-fg-secondary">{t('wizard.participantsHint')}</p>
          <textarea
            id="participants"
            value={value}
            rows={12}
            placeholder={'Nova Collective, DE\nIron Meridian, US\nSolstice Nine'}
            onChange={(e) => {
              onChange(e.target.value);
            }}
            className={cn(inputClass, 'resize-y font-mono text-xs')}
          />
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <p className="mb-3 text-sm font-medium text-fg">
            {t('wizard.participantCount', { count: participants.length })}
          </p>
          {participants.length === 0 ? (
            <p className="text-sm text-fg-muted">{t('wizard.noParticipants')}</p>
          ) : (
            <ol className="grid gap-1">
              {participants.map((participant, index) => (
                <li
                  key={`${participant.name}-${String(index)}`}
                  className="flex items-center gap-2 rounded-[var(--radius-control)] bg-inset px-2 py-1 text-sm"
                >
                  <span className="tabular w-5 shrink-0 text-xs text-fg-muted">{index + 1}</span>
                  {participant.countryCode !== undefined && (
                    <FlagIcon countryCode={participant.countryCode} width={16} />
                  )}
                  <span className="truncate text-fg">{participant.name}</span>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function FormatStep({ draft, set }: StepProps) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardBody className="grid max-w-xl gap-5">
        <p className="text-sm text-fg-secondary">{t('wizard.formatHint')}</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('wizard.field.defaultBestOf')}>
            <BestOfSelect
              value={draft.defaultBestOf}
              onChange={(value) => {
                set('defaultBestOf', value);
              }}
            />
          </Field>
          <Field label={t('wizard.field.finalBestOf')}>
            <BestOfSelect
              value={draft.finalBestOf}
              onChange={(value) => {
                set('finalBestOf', value);
              }}
            />
          </Field>
        </div>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={draft.thirdPlaceMatch}
            onChange={(e) => {
              set('thirdPlaceMatch', e.target.checked);
            }}
            className="mt-0.5 h-4 w-4 accent-[var(--tc-accent)]"
          />
          <span>
            <span className="block text-sm font-medium text-fg">
              {t('wizard.field.thirdPlace')}
            </span>
            <span className="block text-xs text-fg-secondary">{t('wizard.thirdPlaceHint')}</span>
          </span>
        </label>
      </CardBody>
    </Card>
  );
}

function PreviewStep({
  structure,
  matches,
  teamOf,
  summary,
}: {
  structure: Parameters<typeof BracketCanvas>[0]['structure'];
  matches: Parameters<typeof BracketCanvas>[0]['matches'];
  teamOf: (participantId: string) => Team | undefined;
  summary: {
    name: string;
    participants: number;
    thirdPlace: boolean;
    defaultBestOf: BestOf;
    finalBestOf: BestOf;
  };
}) {
  const { t } = useTranslation();
  const noMatches = useMemo(() => new Map<MatchId, never>(), []);

  return (
    <div className="grid gap-4">
      <Card>
        <CardBody className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Summary label={t('wizard.field.name')} value={summary.name} />
          <Summary label={t('wizard.step.participants')} value={String(summary.participants)} />
          <Summary
            label={t('wizard.field.defaultBestOf')}
            value={summary.defaultBestOf === 1 ? 'BO1' : `BO${String(summary.defaultBestOf)}`}
          />
          <Summary
            label={t('wizard.field.finalBestOf')}
            value={summary.finalBestOf === 1 ? 'BO1' : `BO${String(summary.finalBestOf)}`}
          />
          <Summary
            label={t('wizard.field.thirdPlace')}
            value={summary.thirdPlace ? t('common.yes') : t('common.no')}
          />
        </CardBody>
      </Card>

      <BracketCanvas
        structure={structure}
        matches={matches}
        storedMatches={noMatches}
        teamOf={teamOf}
      />
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col">
      <span className="text-xs text-fg-muted">{label}</span>
      <span className="font-medium text-fg">{value}</span>
    </span>
  );
}

function BestOfSelect({ value, onChange }: { value: BestOf; onChange: (value: BestOf) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => {
        onChange(Number(e.target.value) as BestOf);
      }}
      className={inputClass}
    >
      {BEST_OF_OPTIONS.map((option) => (
        <option key={option} value={option}>
          {option === 1 ? 'Best of 1' : `Best of ${String(option)}`}
        </option>
      ))}
    </select>
  );
}

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-medium text-fg">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  'h-10 rounded-[var(--radius-control)] border border-line bg-inset px-3 text-sm text-fg outline-none focus-visible:border-accent';

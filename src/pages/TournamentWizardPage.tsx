import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { BracketCanvas } from '@components/bracket/BracketCanvas';
import { MatchList } from '@components/match/MatchList';
import { Button } from '@components/ui/Button';
import { Card, CardBody } from '@components/ui/Card';
import { FlagIcon } from '@components/ui/FlagIcon';
import { PageHeader } from '@components/ui/PageHeader';
import { deriveTournamentState, type DerivedStage } from '@domain/derive';
import { isBracketFormat } from '@domain/formats/registry';
import { TeamSelectionList } from '@pages/TeamSelectionList';
import {
  assembleTournament,
  type BestOf,
  type FormatChoice,
  type TournamentDraft,
} from '@services/tournament/assembleTournament';
import { parseParticipants } from '@services/tournament/parseParticipants';
import { composeField } from '@services/tournament/registration';
import { useDataStore } from '@store/slices/dataSlice';
import { cn } from '@utils/cn';

import type { Match, MatchId, Team, TeamId } from '@models/index';
import type { TFunction } from 'i18next';

const BEST_OF_OPTIONS: BestOf[] = [1, 3, 5, 7];
const STEP_COUNT = 4;

type FormatKind =
  'single_elimination' | 'double_elimination' | 'swiss' | 'round_robin' | 'group_stage';

interface DraftState {
  name: string;
  gameName: string;
  organizer: string;
  startsAt: string;
  description: string;
  /** Entrants chosen from the teams already on record, in the order picked. */
  pickedTeamIds: TeamId[];
  /** Entrants typed rather than picked. Only these bring a new team into being. */
  participantsText: string;
  formatKind: FormatKind;
  thirdPlaceMatch: boolean;
  defaultBestOf: BestOf;
  finalBestOf: BestOf;
  /** Round robin and group stage: one round or home and away. */
  legs: 1 | 2;
  groupCount: number;
  /** Places per group that advance. Zero means the groups are the whole event. */
  advancePerGroup: number;
  /** Which bracket the qualifiers of a group stage play. */
  playoffFormat: 'single_elimination' | 'double_elimination';
  /** Double elimination: whether the grand final can go to a second match. */
  grandFinal: 'single' | 'bracket_reset';
  /** Swiss: how many rounds are played. */
  swissRounds: number;
}

const INITIAL: DraftState = {
  name: '',
  gameName: '',
  organizer: '',
  startsAt: '',
  description: '',
  pickedTeamIds: [],
  participantsText: '',
  formatKind: 'single_elimination',
  thirdPlaceMatch: false,
  defaultBestOf: 3,
  finalBestOf: 5,
  legs: 1,
  groupCount: 4,
  advancePerGroup: 2,
  playoffFormat: 'single_elimination',
  grandFinal: 'bracket_reset',
  swissRounds: 5,
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

  const typed = useMemo(() => parseParticipants(draft.participantsText), [draft.participantsText]);

  const participants = useMemo(
    () => composeField(draft.pickedTeamIds, (id) => teams[id], typed),
    [draft.pickedTeamIds, teams, typed],
  );

  const assembled = useMemo(() => {
    if (draft.name.trim() === '') return undefined;

    const startsAt = draft.startsAt ? new Date(draft.startsAt).toISOString() : undefined;
    const input: TournamentDraft = {
      name: draft.name,
      participants,
      format: toFormatChoice(draft),
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
      stages: assembled.stages,
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

  const canAdvance = step === 0 ? draft.name.trim() !== '' : true;

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
            pickedTeamIds={draft.pickedTeamIds}
            onTogglePicked={(teamId) => {
              set(
                'pickedTeamIds',
                draft.pickedTeamIds.includes(teamId)
                  ? draft.pickedTeamIds.filter((entry) => entry !== teamId)
                  : [...draft.pickedTeamIds, teamId],
              );
            }}
            participants={participants}
          />
        )}
        {step === 2 && (
          <FormatStep draft={draft} set={set} participantCount={participants.length} />
        )}
        {step === 3 && participants.length < 2 && <RegistrationStep count={participants.length} />}
        {step === 3 && participants.length >= 2 && previewStage && (
          <PreviewStep
            stage={previewStage}
            teamOf={previewTeamOf}
            summary={{
              name: draft.name.trim(),
              participants: participants.length,
              format: t(`wizard.format.${draft.formatKind}`),
              detail: summariseFormat(draft, assembled?.stages.length ?? 1, t),
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

interface FormatStepProps extends StepProps {
  participantCount: number;
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
  pickedTeamIds,
  onTogglePicked,
  participants,
}: {
  value: string;
  onChange: (value: string) => void;
  pickedTeamIds: readonly TeamId[];
  onTogglePicked: (teamId: TeamId) => void;
  participants: ReturnType<typeof parseParticipants>;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/*
        Two ways into the field, and the order says which is preferred: pick a
        club that already exists, and type only what does not. A name typed
        almost right is what fills an archive with near-duplicates.
      */}
      <div className="grid gap-4">
        <Card>
          <CardBody className="grid gap-2">
            <span className="text-sm font-medium text-fg">{t('wizard.field.knownTeams')}</span>
            <p className="text-xs text-fg-secondary">{t('wizard.knownTeamsHint')}</p>
            <TeamSelectionList selected={pickedTeamIds} onToggle={onTogglePicked} />
          </CardBody>
        </Card>
        <Card>
          <CardBody className="grid gap-2">
            <label htmlFor="participants" className="text-sm font-medium text-fg">
              {t('wizard.field.participants')}
            </label>
            <p className="text-xs text-fg-secondary">{t('wizard.participantsHint')}</p>
            <textarea
              id="participants"
              value={value}
              rows={8}
              placeholder={'Nova Collective, DE\nIron Meridian, US\nSolstice Nine'}
              onChange={(e) => {
                onChange(e.target.value);
              }}
              className={cn(inputClass, 'resize-y font-mono text-xs')}
            />
          </CardBody>
        </Card>
      </div>

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

/**
 * What the last step says when the field is not drawable yet.
 *
 * There is no bracket to preview, and an empty one would read as something
 * having gone wrong. The tournament is created open for entries instead, and
 * saying so here makes that an intention rather than a surprise.
 */
function RegistrationStep({ count }: { count: number }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardBody className="grid gap-2 py-10 text-center">
        <p className="text-sm font-medium text-fg">{t('wizard.registrationTitle')}</p>
        <p className="mx-auto max-w-md text-sm text-fg-secondary">
          {t('wizard.registrationHint', { count })}
        </p>
      </CardBody>
    </Card>
  );
}

function FormatStep({ draft, set, participantCount }: FormatStepProps) {
  const { t } = useTranslation();
  const kinds: FormatKind[] = [
    'single_elimination',
    'double_elimination',
    'swiss',
    'round_robin',
    'group_stage',
  ];
  // Below this a Swiss field cannot separate: more participants can still be
  // unbeaten than there are places at the top.
  const recommendedRounds = Math.max(1, Math.ceil(Math.log2(Math.max(participantCount, 2))));

  return (
    <Card>
      <CardBody className="grid max-w-xl gap-5">
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium text-fg">{t('wizard.formatLegend')}</legend>
          {kinds.map((kind) => (
            <label
              key={kind}
              className={cn(
                'flex cursor-pointer items-start gap-2 rounded-[var(--radius-control)] border p-3',
                draft.formatKind === kind ? 'border-accent bg-accent-subtle' : 'border-line',
              )}
            >
              <input
                type="radio"
                name="format-kind"
                value={kind}
                checked={draft.formatKind === kind}
                onChange={() => {
                  set('formatKind', kind);
                }}
                className="mt-0.5 h-4 w-4 accent-[var(--tc-accent)]"
              />
              <span>
                <span className="block text-sm font-medium text-fg">
                  {t(`wizard.format.${kind}`)}
                </span>
                <span className="block text-xs text-fg-secondary">
                  {t(`wizard.formatHintFor.${kind}`)}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        {draft.formatKind === 'group_stage' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('wizard.field.groupCount')}>
              <input
                type="number"
                min={1}
                max={16}
                value={draft.groupCount}
                onChange={(e) => {
                  set('groupCount', Math.max(1, Number(e.target.value) || 1));
                }}
                className={inputClass}
              />
            </Field>
            <Field label={t('wizard.field.advancePerGroup')}>
              <input
                type="number"
                min={0}
                max={8}
                value={draft.advancePerGroup}
                onChange={(e) => {
                  set('advancePerGroup', Math.max(0, Number(e.target.value) || 0));
                }}
                className={inputClass}
              />
            </Field>
          </div>
        )}

        {draft.formatKind === 'swiss' && (
          <Field
            label={t('wizard.field.swissRounds')}
            hint={t('wizard.swissRoundsHint', { rounds: recommendedRounds })}
          >
            <input
              type="number"
              min={1}
              max={32}
              value={draft.swissRounds}
              onChange={(e) => {
                set('swissRounds', Math.max(1, Number(e.target.value) || 1));
              }}
              className={inputClass}
            />
          </Field>
        )}

        {draft.formatKind === 'group_stage' && draft.advancePerGroup > 0 && (
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium text-fg">
              {t('wizard.field.playoffFormat')}
            </legend>
            <p className="mb-1 text-xs text-fg-secondary">{t('wizard.playoffFormatHint')}</p>
            <div className="flex flex-wrap gap-2">
              {(['single_elimination', 'double_elimination'] as const).map((option) => (
                <label
                  key={option}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border px-4 py-2 text-sm transition-colors',
                    draft.playoffFormat === option
                      ? 'border-accent bg-accent-subtle text-accent'
                      : 'border-line text-fg-secondary hover:bg-hover hover:text-fg',
                  )}
                >
                  <input
                    type="radio"
                    name="playoff-format"
                    value={option}
                    checked={draft.playoffFormat === option}
                    onChange={() => {
                      set('playoffFormat', option);
                    }}
                    className="h-4 w-4 accent-[var(--tc-accent)]"
                  />
                  {t(`wizard.format.${option}`)}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {(draft.formatKind === 'double_elimination' ||
          (draft.formatKind === 'group_stage' &&
            draft.advancePerGroup > 0 &&
            draft.playoffFormat === 'double_elimination')) && (
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={draft.grandFinal === 'bracket_reset'}
              onChange={(e) => {
                set('grandFinal', e.target.checked ? 'bracket_reset' : 'single');
              }}
              className="mt-0.5 h-4 w-4 accent-[var(--tc-accent)]"
            />
            <span>
              <span className="block text-sm font-medium text-fg">
                {t('wizard.field.bracketReset')}
              </span>
              <span className="block text-xs text-fg-secondary">
                {t('wizard.bracketResetHint')}
              </span>
            </span>
          </label>
        )}

        {(draft.formatKind === 'round_robin' || draft.formatKind === 'group_stage') && (
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium text-fg">{t('wizard.field.legs')}</legend>
            <div className="flex gap-2">
              {([1, 2] as const).map((option) => (
                <label
                  key={option}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border px-4 py-2 text-sm transition-colors',
                    draft.legs === option
                      ? 'border-accent bg-accent-subtle text-accent'
                      : 'border-line text-fg-secondary hover:bg-hover hover:text-fg',
                  )}
                >
                  <input
                    type="radio"
                    name="legs"
                    value={option}
                    checked={draft.legs === option}
                    onChange={() => {
                      set('legs', option);
                    }}
                    className="h-4 w-4 accent-[var(--tc-accent)]"
                  />
                  {t(`wizard.legs.${String(option)}`)}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('wizard.field.defaultBestOf')}>
            <BestOfSelect
              value={draft.defaultBestOf}
              onChange={(value) => {
                set('defaultBestOf', value);
              }}
            />
          </Field>
          {(draft.formatKind === 'single_elimination' ||
            draft.formatKind === 'double_elimination' ||
            (draft.formatKind === 'group_stage' && draft.advancePerGroup > 0)) && (
            <Field label={t('wizard.field.finalBestOf')}>
              <BestOfSelect
                value={draft.finalBestOf}
                onChange={(value) => {
                  set('finalBestOf', value);
                }}
              />
            </Field>
          )}
        </div>

        {draft.formatKind === 'single_elimination' && (
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
        )}
      </CardBody>
    </Card>
  );
}

/** One line describing what the chosen format will produce. */
function summariseFormat(draft: DraftState, stageCount: number, t: TFunction): string {
  if (draft.formatKind === 'round_robin') {
    return t(`wizard.legs.${String(draft.legs)}`);
  }
  if (draft.formatKind === 'swiss') {
    return t('wizard.previewSwiss', { rounds: draft.swissRounds });
  }
  if (draft.formatKind === 'double_elimination') {
    return draft.grandFinal === 'bracket_reset'
      ? t('wizard.field.bracketReset')
      : t('wizard.previewSingleGrandFinal');
  }
  if (draft.formatKind === 'group_stage') {
    if (draft.advancePerGroup === 0) {
      return t('wizard.previewGroupsOnly', { groups: draft.groupCount });
    }
    return t('wizard.previewGroupsWithPlayoffs', {
      groups: draft.groupCount,
      advance: draft.advancePerGroup,
      stages: stageCount,
      playoff: t(`wizard.format.${draft.playoffFormat}`),
    });
  }
  return draft.thirdPlaceMatch ? t('wizard.field.thirdPlace') : t('common.no');
}

/** Maps the wizard's flat state onto the format the assembler expects. */
function toFormatChoice(draft: DraftState): FormatChoice {
  switch (draft.formatKind) {
    case 'round_robin':
      return { kind: 'round_robin', legs: draft.legs, defaultBestOf: draft.defaultBestOf };

    case 'double_elimination':
      return {
        kind: 'double_elimination',
        grandFinal: draft.grandFinal,
        defaultBestOf: draft.defaultBestOf,
        finalBestOf: draft.finalBestOf,
      };

    case 'swiss':
      return { kind: 'swiss', rounds: draft.swissRounds, defaultBestOf: draft.defaultBestOf };

    case 'group_stage':
      return {
        kind: 'group_stage',
        groupCount: draft.groupCount,
        legs: draft.legs,
        defaultBestOf: draft.defaultBestOf,
        advancePerGroup: draft.advancePerGroup,
        playoffBestOf: draft.defaultBestOf,
        playoffFinalBestOf: draft.finalBestOf,
        playoffFormat: draft.playoffFormat,
        playoffGrandFinal: draft.grandFinal,
      };

    case 'single_elimination':
    default:
      return {
        kind: 'single_elimination',
        thirdPlaceMatch: draft.thirdPlaceMatch,
        defaultBestOf: draft.defaultBestOf,
        finalBestOf: draft.finalBestOf,
      };
  }
}

function PreviewStep({
  stage,
  teamOf,
  summary,
}: {
  stage: DerivedStage;
  teamOf: (participantId: string) => Team | undefined;
  summary: { name: string; participants: number; format: string; detail: string };
}) {
  const { t } = useTranslation();
  const noMatches = useMemo(() => new Map<MatchId, Match>(), []);

  return (
    <div className="grid gap-4">
      <Card>
        <CardBody className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Summary label={t('wizard.field.name')} value={summary.name} />
          <Summary label={t('wizard.step.participants')} value={String(summary.participants)} />
          <Summary label={t('wizard.formatLegend')} value={summary.format} />
          <Summary label={t('wizard.previewDetail')} value={summary.detail} />
        </CardBody>
      </Card>

      {/*
        The preview uses the same components the live tournament does, so a
        league previews as a fixture list rather than as an empty bracket.
      */}
      {isBracketFormat(stage.stage.format.kind) ? (
        <BracketCanvas
          structure={stage.structure}
          matches={stage.resolved.matches}
          storedMatches={noMatches}
          teamOf={teamOf}
        />
      ) : (
        <MatchList matches={stage.resolved.matches} storedMatches={noMatches} teamOf={teamOf} />
      )}
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
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string | undefined;
  children: React.ReactNode;
}) {
  /*
   * The hint sits outside the label deliberately. Nested inside it, it becomes
   * part of the control's accessible name: the field announces itself as
   * "Rounds at least five rounds are recommended for this field" rather than
   * "Rounds". Outside, it stays adjacent in the reading order without swallowing
   * the name.
   */
  return (
    <div className="grid gap-1.5">
      <label className="grid gap-1.5">
        <span className="text-sm font-medium text-fg">
          {label}
          {required && <span className="text-danger"> *</span>}
        </span>
        {children}
      </label>
      {hint !== undefined && <span className="text-xs text-fg-secondary">{hint}</span>}
    </div>
  );
}

const inputClass =
  'h-10 rounded-[var(--radius-control)] border border-line bg-inset px-3 text-sm text-fg outline-none focus-visible:border-accent';

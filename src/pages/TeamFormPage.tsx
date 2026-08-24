import { Archive, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import { Button } from '@components/ui/Button';
import { Card, CardBody } from '@components/ui/Card';
import { ConfirmDialog } from '@components/ui/ConfirmDialog';
import { FlagIcon } from '@components/ui/FlagIcon';
import { PageHeader } from '@components/ui/PageHeader';
import { asId, newTeamId, now, type Team, type TeamId } from '@models/index';
import { TeamMergeCard } from '@pages/TeamMergeCard';
import { deriveTag } from '@services/tournament/parseParticipants';
import { useDataStore } from '@store/slices/dataSlice';
import { cn } from '@utils/cn';

interface FormState {
  name: string;
  tag: string;
  countryCode: string;
  region: string;
  description: string;
  foundedAt: string;
}

/**
 * Creates or edits a team.
 *
 * Splits loading from the form on purpose. The form seeds its fields from the
 * team once, on mount; rendering it before the store has hydrated would seed it
 * from nothing and then silently ignore the data that arrives a moment later.
 */
export function TeamFormPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();

  const teamId = params.id === undefined ? undefined : asId<TeamId>(params.id);
  const existing = useDataStore((s) => (teamId === undefined ? undefined : s.teams[teamId]));
  const hydrated = useDataStore((s) => s.hydrated);

  if (!hydrated) return <p className="text-sm text-fg-muted">{t('common.loading')}</p>;

  if (teamId !== undefined && !existing) {
    return (
      <Card>
        <CardBody className="py-14 text-center text-sm text-fg-muted">
          {t('teams.notFound')}
        </CardBody>
      </Card>
    );
  }

  return <TeamForm existing={existing} />;
}

function TeamForm({ existing }: { existing: Team | undefined }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const saveTeam = useDataStore((s) => s.saveTeam);
  const archiveTeam = useDataStore((s) => s.archiveTeam);
  const removeTeam = useDataStore((s) => s.removeTeam);
  const tournaments = useDataStore((s) => s.tournaments);

  const [form, setForm] = useState<FormState>(() => toForm(existing));
  const [saving, setSaving] = useState(false);
  // An existing tag was chosen deliberately and must not be overwritten while
  // the name is edited.
  const [tagTouched, setTagTouched] = useState(existing !== undefined);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  /*
   * How many tournaments still reference this team. Deleting does not rewrite
   * them, so the user should know what will be left showing an unknown name.
   */
  const referencedIn = existing
    ? Object.values(tournaments).filter((tournament) =>
        tournament.participants.some((participant) => participant.teamId === existing.id),
      ).length
    : 0;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const nameValid = form.name.trim() !== '';

  const onSave = async (): Promise<void> => {
    if (!nameValid) return;
    setSaving(true);
    try {
      const timestamp = now();
      const team: Team = {
        id: existing?.id ?? newTeamId(),
        name: form.name.trim(),
        // Fall back to a derived tag so the required field is never empty.
        tag: form.tag.trim() || deriveTag(form.name),
        socials: existing?.socials ?? [],
        archived: existing?.archived ?? false,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
        ...(form.countryCode.trim() ? { countryCode: form.countryCode.trim().toUpperCase() } : {}),
        ...(form.region.trim() ? { region: form.region.trim() } : {}),
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
        ...(form.foundedAt ? { foundedAt: form.foundedAt } : {}),
      };

      await saveTeam(team);
      void navigate(`/teams/${team.id}`);
    } finally {
      setSaving(false);
    }
  };

  const onArchive = async (): Promise<void> => {
    if (!existing) return;
    await archiveTeam(existing.id);
    void navigate('/teams');
  };

  const onDelete = async (): Promise<void> => {
    if (!existing) return;
    await removeTeam(existing.id);
    void navigate('/teams');
  };

  return (
    <>
      <PageHeader
        title={existing ? t('teams.editTitle') : t('teams.createTitle')}
        subtitle={existing ? existing.name : t('teams.createSubtitle')}
      />

      <Card className="max-w-2xl">
        <CardBody className="grid gap-4">
          <Field label={t('teams.field.name')} required>
            <input
              type="text"
              value={form.name}
              onChange={(event) => {
                const value = event.target.value;
                set('name', value);
                // Keep the tag in step until the user takes it over, so bulk
                // entry stays fast without overwriting a deliberate choice.
                if (!tagTouched) set('tag', deriveTag(value));
              }}
              className={inputClass}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('teams.field.tag')}>
              <input
                type="text"
                value={form.tag}
                maxLength={5}
                onChange={(event) => {
                  setTagTouched(true);
                  set('tag', event.target.value.toUpperCase());
                }}
                className={cn(inputClass, 'uppercase')}
              />
            </Field>

            <Field label={t('teams.field.countryCode')}>
              <span className="flex items-center gap-2">
                <input
                  type="text"
                  value={form.countryCode}
                  maxLength={2}
                  placeholder="DE"
                  onChange={(event) => {
                    set('countryCode', event.target.value.toUpperCase());
                  }}
                  className={cn(inputClass, 'w-20 uppercase')}
                />
                <FlagIcon countryCode={form.countryCode} width={22} />
              </span>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('teams.field.region')}>
              <input
                type="text"
                value={form.region}
                placeholder="EU"
                onChange={(event) => {
                  set('region', event.target.value);
                }}
                className={inputClass}
              />
            </Field>

            <Field label={t('teams.field.foundedAt')}>
              <input
                type="date"
                value={form.foundedAt}
                onChange={(event) => {
                  set('foundedAt', event.target.value);
                }}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label={t('teams.field.description')}>
            <textarea
              value={form.description}
              rows={3}
              onChange={(event) => {
                set('description', event.target.value);
              }}
              className={cn(inputClass, 'h-auto resize-y py-2')}
            />
          </Field>
        </CardBody>
      </Card>

      {existing && <TeamMergeCard team={existing} />}

      {confirmingDelete && existing && (
        <ConfirmDialog
          title={t('teams.deleteTitle')}
          message={t('teams.deleteMessage', { name: existing.name })}
          detail={referencedIn > 0 ? t('teams.deleteDetail', { count: referencedIn }) : undefined}
          confirmLabel={t('teams.deleteConfirm')}
          requireText={existing.name}
          onCancel={() => {
            setConfirmingDelete(false);
          }}
          onConfirm={() => {
            void onDelete();
          }}
        />
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {existing && !existing.archived && (
          <Button
            variant="ghost"
            icon={<Archive size={16} aria-hidden />}
            disabled={saving}
            onClick={() => {
              void onArchive();
            }}
          >
            {t('teams.archive')}
          </Button>
        )}

        {existing && (
          <Button
            variant="ghost"
            icon={<Trash2 size={16} aria-hidden />}
            disabled={saving}
            onClick={() => {
              setConfirmingDelete(true);
            }}
          >
            {t('common.delete')}
          </Button>
        )}

        <Button
          variant="ghost"
          className="ml-auto"
          disabled={saving}
          onClick={() => {
            void navigate(-1);
          }}
        >
          {t('common.cancel')}
        </Button>

        <Button
          variant="primary"
          icon={<Save size={16} aria-hidden />}
          disabled={!nameValid || saving}
          onClick={() => {
            void onSave();
          }}
        >
          {t('common.save')}
        </Button>
      </div>
    </>
  );
}

function toForm(team: Team | undefined): FormState {
  return {
    name: team?.name ?? '',
    tag: team?.tag ?? '',
    countryCode: team?.countryCode ?? '',
    region: team?.region ?? '',
    description: team?.description ?? '',
    foundedAt: team?.foundedAt ?? '',
  };
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

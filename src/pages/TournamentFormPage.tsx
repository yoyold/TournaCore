import { Save } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import { Button } from '@components/ui/Button';
import { Card, CardBody } from '@components/ui/Card';
import { PageHeader } from '@components/ui/PageHeader';
import { asId, now, type Tournament, type TournamentId } from '@models/index';
import { useDataStore } from '@store/slices/dataSlice';
import { cn } from '@utils/cn';

const STATUSES: Tournament['status'][] = [
  'draft',
  'registration',
  'live',
  'completed',
  'cancelled',
];

interface FormState {
  name: string;
  date: string;
  organizer: string;
  description: string;
  status: Tournament['status'];
}

/**
 * Edits a tournament's own description.
 *
 * Deliberately limited to what a tournament *says about itself* — its name, when
 * it happened, who ran it. Its format, participants and results are not editable
 * here: those are the structure everything else is derived from, and changing
 * them is a different job with different consequences.
 */
export function TournamentFormPage() {
  const params = useParams<{ id: string }>();
  const tournamentId = params.id ? asId<TournamentId>(params.id) : undefined;

  const tournament = useDataStore((s) => (tournamentId ? s.tournaments[tournamentId] : undefined));
  const hydrated = useDataStore((s) => s.hydrated);
  const { t } = useTranslation();

  if (!hydrated) return <p className="text-sm text-fg-muted">{t('common.loading')}</p>;

  if (!tournament) {
    return (
      <Card>
        <CardBody className="py-14 text-center text-sm text-fg-muted">
          {t('tournaments.notFound')}
        </CardBody>
      </Card>
    );
  }

  // Keyed by id so the form re-seeds when a different tournament is opened.
  return <TournamentForm key={tournament.id} tournament={tournament} />;
}

function TournamentForm({ tournament }: { tournament: Tournament }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const saveTournament = useDataStore((s) => s.saveTournament);

  const [form, setForm] = useState<FormState>(() => ({
    name: tournament.name,
    date: toDateInput(tournament.startsAt ?? tournament.createdAt),
    organizer: tournament.organizer ?? '',
    description: tournament.description ?? '',
    status: tournament.status,
  }));
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const onSubmit = async (): Promise<void> => {
    if (form.name.trim() === '') return;
    setSaving(true);

    try {
      /*
       * One date field, written to both. `startsAt` is when the tournament ran
       * and `createdAt` is what the list is ordered by — for an event that
       * happened years ago and was entered last week, the date the organiser
       * means is the same for both, and keeping them apart would put the
       * tournament in the wrong place in its own archive.
       */
      const stamp = form.date === '' ? undefined : new Date(form.date).toISOString();

      const next: Tournament = {
        ...tournament,
        name: form.name.trim(),
        status: form.status,
        updatedAt: now(),
        ...(stamp !== undefined ? { startsAt: stamp, createdAt: stamp } : {}),
        ...(form.organizer.trim() ? { organizer: form.organizer.trim() } : {}),
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
      };

      await saveTournament(next);
      void navigate(`/tournaments/${tournament.id}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title={t('tournaments.editTitle')} subtitle={tournament.name} />

      <Card className="max-w-2xl">
        <CardBody className="grid gap-4">
          <Field label={t('wizard.field.name')} required>
            <input
              type="text"
              value={form.name}
              onChange={(event) => {
                set('name', event.target.value);
              }}
              className={inputClass}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('tournaments.field.date')}>
              <input
                type="date"
                value={form.date}
                onChange={(event) => {
                  set('date', event.target.value);
                }}
                className={inputClass}
              />
            </Field>

            <Field label={t('tournaments.field.status')}>
              <select
                value={form.status}
                onChange={(event) => {
                  set('status', event.target.value as Tournament['status']);
                }}
                className={inputClass}
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {t(`tournaments.status.${status}`)}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <p className="text-xs text-fg-secondary">{t('tournaments.field.dateHint')}</p>

          <Field label={t('wizard.field.organizer')}>
            <input
              type="text"
              value={form.organizer}
              onChange={(event) => {
                set('organizer', event.target.value);
              }}
              className={inputClass}
            />
          </Field>

          <Field label={t('wizard.field.description')}>
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

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          icon={<Save size={16} aria-hidden />}
          disabled={saving || form.name.trim() === ''}
          onClick={() => {
            void onSubmit();
          }}
        >
          {t('common.save')}
        </Button>
        <Button
          variant="ghost"
          disabled={saving}
          onClick={() => {
            void navigate(`/tournaments/${tournament.id}`);
          }}
        >
          {t('common.cancel')}
        </Button>
      </div>
    </>
  );
}

/** An ISO timestamp as the `YYYY-MM-DD` a date input expects. */
function toDateInput(iso: string | undefined): string {
  if (iso === undefined) return '';
  return iso.slice(0, 10);
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

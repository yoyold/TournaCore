import { ClipboardPaste } from 'lucide-react';
import { nanoid } from 'nanoid';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@components/ui/Card';
import { now } from '@models/index';
import { ChallongeFormatError, parseChallonge } from '@services/challonge/challongeSchema';
import {
  mapChallongeTournaments,
  type ReportNote,
  type TournamentReport,
} from '@services/challonge/mapTournament';
import { mergeData, type TransferData } from '@services/transfer/transfer';
import { useDataStore } from '@store/slices/dataSlice';

interface Preview {
  data: TransferData;
  reports: TournamentReport[];
  unplaced: number;
}

/**
 * Brings a Challonge tournament in by pasting its data.
 *
 * Deliberately paste rather than a URL field. The application makes no outbound
 * requests — its content security policy forbids them and a test enforces it —
 * and even without that rule Challonge sends no cross-origin headers and sits
 * behind bot protection, so a fetch from here could not succeed anyway. Pasting
 * leaves the fetching where it already works: a browser tab the user opened.
 *
 * The conversion is the same pure code the command line script uses, so there is
 * one implementation and one set of tests behind both.
 */
export function ChallongeImportCard() {
  const { t } = useTranslation();
  const snapshot = useDataStore((s) => s.snapshot);
  const applyImport = useDataStore((s) => s.applyImport);
  const hydrated = useDataStore((s) => s.hydrated);

  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [preview, setPreview] = useState<Preview | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [acknowledged, setAcknowledged] = useState(false);
  const [imported, setImported] = useState<number | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const reset = (): void => {
    setPreview(undefined);
    setError(undefined);
    setAcknowledged(false);
  };

  const onCheck = (): void => {
    reset();
    setImported(undefined);

    let raw: unknown;
    try {
      raw = JSON.parse(text) as unknown;
    } catch {
      setError(t('transfer.challonge.notJson'));
      return;
    }

    try {
      const existing = snapshot();
      const trimmed = name.trim();
      const sources = parseChallonge(raw, trimmed === '' ? undefined : trimmed);

      const result = mapChallongeTournaments(sources, {
        // Teams already here are reused rather than duplicated, which is the
        // whole point of importing into a database that is not empty.
        existingTeams: existing.teams,
        existingGames: existing.games,
        existingSlugs: existing.tournaments.map((tournament) => tournament.slug),
        timestamp: now(),
        newId: () => nanoid(),
      });

      setPreview({
        data: result.data,
        reports: result.reports,
        unplaced: result.reports.reduce((sum, report) => sum + report.unplaced.length, 0),
      });
    } catch (cause) {
      setError(
        cause instanceof ChallongeFormatError ? cause.message : t('transfer.challonge.unreadable'),
      );
    }
  };

  const onImport = async (): Promise<void> => {
    if (!preview) return;
    setBusy(true);
    try {
      // Always a merge: data from elsewhere adds to what is here rather than
      // replacing it.
      await applyImport(mergeData(snapshot(), preview.data), 'merge');
      setImported(preview.data.tournaments.length);
      setText('');
      setName('');
      reset();
    } finally {
      setBusy(false);
    }
  };

  const blocked = preview !== undefined && preview.unplaced > 0 && !acknowledged;
  const nothingToImport = preview?.data.tournaments.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('transfer.challonge.title')}</CardTitle>
      </CardHeader>
      <CardBody className="grid gap-3">
        <p className="text-sm text-fg-secondary">{t('transfer.challonge.hint')}</p>

        <ol className="grid list-decimal gap-1 pl-5 text-xs text-fg-muted">
          <li>{t('transfer.challonge.step1')}</li>
          <li>{t('transfer.challonge.step2')}</li>
          <li>{t('transfer.challonge.step3')}</li>
        </ol>

        <label className="grid gap-1.5">
          <span className="text-sm font-medium text-fg">{t('transfer.challonge.data')}</span>
          <textarea
            value={text}
            rows={5}
            spellCheck={false}
            placeholder={t('transfer.challonge.placeholder')}
            onChange={(event) => {
              setText(event.target.value);
              reset();
            }}
            className="rounded-[var(--radius-control)] border border-line bg-inset px-3 py-2 font-mono text-xs text-fg outline-none focus-visible:border-accent"
          />
        </label>

        <div className="grid gap-1.5">
          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-fg">{t('transfer.challonge.name')}</span>
            <input
              type="text"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                reset();
              }}
              className="h-10 rounded-[var(--radius-control)] border border-line bg-inset px-3 text-sm text-fg outline-none focus-visible:border-accent"
            />
          </label>
          <span className="text-xs text-fg-secondary">{t('transfer.challonge.nameHint')}</span>
        </div>

        <span>
          <Button
            variant="secondary"
            icon={<ClipboardPaste size={16} aria-hidden />}
            disabled={!hydrated || text.trim() === ''}
            onClick={onCheck}
          >
            {t('transfer.challonge.check')}
          </Button>
        </span>

        {error !== undefined && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        {imported !== undefined && (
          <p role="status" className="text-sm text-success">
            {t('transfer.challonge.imported', { count: imported })}
          </p>
        )}

        {preview && (
          <div className="grid gap-3 rounded-[var(--radius-control)] border border-line bg-inset p-3">
            {preview.reports.map((report) => (
              <ReportView key={`${report.source}:${report.name}`} report={report} />
            ))}

            {preview.unplaced > 0 && (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => {
                    setAcknowledged(event.target.checked);
                  }}
                  className="mt-0.5 h-4 w-4 accent-[var(--tc-accent)]"
                />
                <span className="text-fg-secondary">
                  {t('transfer.challonge.acceptPartial', { count: preview.unplaced })}
                </span>
              </label>
            )}

            {!nothingToImport && (
              <span>
                <Button
                  variant="primary"
                  disabled={busy || blocked}
                  onClick={() => {
                    void onImport();
                  }}
                >
                  {t('transfer.challonge.import')}
                </Button>
              </span>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function ReportView({ report }: { report: TournamentReport }) {
  const { t } = useTranslation();

  if (report.skipped) {
    return (
      <div className="grid gap-1">
        <p className="text-sm font-medium text-fg">{report.name}</p>
        <p className="text-sm text-warning">{t('transfer.challonge.skipped')}</p>
        {report.notes.map((note) => (
          <Note key={note.code} note={note} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-1">
      <p className="text-sm font-medium text-fg">{report.name}</p>
      <p className="text-xs text-fg-secondary">
        {t('transfer.challonge.summary', {
          format: t(`wizard.format.${report.format}`, { defaultValue: report.format }),
          participants: report.participants,
          placed: report.placed,
          fixtures: report.fixtures,
        })}
      </p>

      {report.notes.map((note) => (
        <Note key={note.code} note={note} />
      ))}

      {report.contested.length > 0 && (
        <p className="text-xs text-warning">
          {t('transfer.challonge.contested', { count: report.contested.length })}
        </p>
      )}

      {report.unplaced.length > 0 && (
        <p className="text-xs text-warning">
          {t('transfer.challonge.unplaced', { count: report.unplaced.length })}
        </p>
      )}
    </div>
  );
}

/**
 * One note from the conversion.
 *
 * Translated by its stable code, falling back to the wording the conversion
 * produced — so a note added there stays readable here even before it has a
 * translation.
 */
function Note({ note }: { note: ReportNote }) {
  const { t } = useTranslation();

  return (
    <p className="text-xs text-fg-secondary">
      {t(`transfer.challonge.note.${note.code}`, {
        ...note.values,
        defaultValue: note.message,
      })}
    </p>
  );
}

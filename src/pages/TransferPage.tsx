import { AlertTriangle, Download, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@components/ui/Card';
import { PageHeader } from '@components/ui/PageHeader';
import { ChallongeImportCard } from '@pages/ChallongeImportCard';
import { SCHEMA_VERSION } from '@services/transfer/schema';
import {
  ImportError,
  buildExport,
  exportFileName,
  mergeData,
  parseImport,
  type ImportMode,
  type ParsedImport,
} from '@services/transfer/transfer';
import { useDataStore } from '@store/slices/dataSlice';
import { cn } from '@utils/cn';

export function TransferPage() {
  const { t } = useTranslation();
  const snapshot = useDataStore((s) => s.snapshot);
  const applyImport = useDataStore((s) => s.applyImport);
  const hydrated = useDataStore((s) => s.hydrated);

  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<ParsedImport | undefined>(undefined);
  const [mode, setMode] = useState<ImportMode>('merge');
  const [error, setError] = useState<string | undefined>(undefined);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  /**
   * Downloads the export as a local blob.
   *
   * No network is involved: the file is built in memory and handed to the
   * browser through an object URL, which keeps the no-external-requests
   * guarantee intact.
   */
  const onExport = (): void => {
    const file = buildExport(snapshot());
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = exportFileName();
    link.click();

    // Revoke on the next tick; revoking immediately can cancel the download.
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);
  };

  const onFile = async (file: File): Promise<void> => {
    setError(undefined);
    setDone(false);
    try {
      setPending(parseImport(await file.text()));
    } catch (cause) {
      setPending(undefined);
      setError(
        cause instanceof ImportError
          ? t(`transfer.error.${cause.code}`, { defaultValue: cause.message })
          : String(cause),
      );
    }
  };

  const onConfirm = async (): Promise<void> => {
    if (!pending) return;
    setBusy(true);
    try {
      const data = mode === 'merge' ? mergeData(snapshot(), pending.data) : pending.data;
      await applyImport(data, mode);
      setPending(undefined);
      setDone(true);
      if (fileInput.current) fileInput.current.value = '';
    } finally {
      setBusy(false);
    }
  };

  const counts = snapshot();

  return (
    <>
      <PageHeader title={t('pages.transfer.title')} subtitle={t('pages.transfer.subtitle')} />

      <div className="grid max-w-3xl gap-4">
        <Card>
          <CardHeader>
            <CardTitle>{t('transfer.exportTitle')}</CardTitle>
          </CardHeader>
          <CardBody className="grid gap-3">
            <p className="text-sm text-fg-secondary">{t('transfer.exportHint')}</p>
            <p className="text-xs text-fg-muted">
              {t('transfer.contains', {
                tournaments: counts.tournaments.length,
                teams: counts.teams.length,
                matches: counts.matches.length,
              })}
            </p>
            <span>
              <Button
                variant="primary"
                icon={<Download size={16} aria-hidden />}
                disabled={!hydrated}
                onClick={onExport}
              >
                {t('transfer.export')}
              </Button>
            </span>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('transfer.importTitle')}</CardTitle>
          </CardHeader>
          <CardBody className="grid gap-3">
            <p className="text-sm text-fg-secondary">{t('transfer.importHint')}</p>

            <label className="grid gap-1.5">
              <span className="text-sm font-medium text-fg">{t('transfer.chooseFile')}</span>
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void onFile(file);
                }}
                className="text-sm text-fg-secondary file:mr-3 file:rounded-[var(--radius-control)] file:border file:border-line file:bg-elevated file:px-3 file:py-1.5 file:text-sm file:text-fg"
              />
            </label>

            {error !== undefined && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-[var(--radius-control)] border border-danger/40 bg-danger/10 p-3 text-xs text-danger"
              >
                <AlertTriangle size={14} aria-hidden className="mt-0.5 shrink-0" />
                {error}
              </p>
            )}

            {done && (
              <p
                role="status"
                className="rounded-[var(--radius-control)] border border-success/40 bg-success/10 p-3 text-xs text-success"
              >
                {t('transfer.imported')}
              </p>
            )}

            {pending && (
              <div className="grid gap-3 rounded-[var(--radius-control)] border border-line bg-inset p-4">
                <p className="text-sm font-medium text-fg">{t('transfer.previewTitle')}</p>
                <ul className="grid gap-0.5 text-xs text-fg-secondary">
                  <li>
                    {t('transfer.previewTournaments', { count: pending.summary.tournaments })}
                  </li>
                  <li>{t('transfer.previewTeams', { count: pending.summary.teams })}</li>
                  <li>{t('transfer.previewMatches', { count: pending.summary.matches })}</li>
                </ul>

                {pending.migratedFrom !== undefined && (
                  <p className="text-xs text-warning">
                    {t('transfer.migrated', {
                      from: pending.migratedFrom,
                      to: SCHEMA_VERSION,
                    })}
                  </p>
                )}

                <fieldset className="grid gap-2">
                  <legend className="mb-1 text-xs font-medium text-fg-secondary">
                    {t('transfer.modeLegend')}
                  </legend>
                  {(['merge', 'replace'] as const).map((option) => (
                    <label
                      key={option}
                      className={cn(
                        'flex cursor-pointer items-start gap-2 rounded-[var(--radius-control)] border p-2',
                        mode === option ? 'border-accent bg-accent-subtle' : 'border-line',
                      )}
                    >
                      <input
                        type="radio"
                        name="import-mode"
                        value={option}
                        checked={mode === option}
                        onChange={() => {
                          setMode(option);
                        }}
                        className="mt-0.5 h-4 w-4 accent-[var(--tc-accent)]"
                      />
                      <span>
                        <span className="block text-sm text-fg">
                          {t(`transfer.mode.${option}`)}
                        </span>
                        <span className="block text-xs text-fg-secondary">
                          {t(`transfer.modeHint.${option}`)}
                        </span>
                      </span>
                    </label>
                  ))}
                </fieldset>

                <p className="text-xs text-fg-muted">{t('transfer.backupNote')}</p>

                <span className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setPending(undefined);
                      if (fileInput.current) fileInput.current.value = '';
                    }}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Upload size={15} aria-hidden />}
                    disabled={busy}
                    onClick={() => {
                      void onConfirm();
                    }}
                  >
                    {t('transfer.confirmImport')}
                  </Button>
                </span>
              </div>
            )}
          </CardBody>
        </Card>
        <ChallongeImportCard />
      </div>
    </>
  );
}

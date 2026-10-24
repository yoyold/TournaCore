import { HardDriveDownload, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Button } from '@components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@components/ui/Card';
import { useStorageStore } from '@store/slices/storageSlice';
import { cn } from '@utils/cn';

/** Bytes rendered as something a person reads, not as a number of bytes. */
function readableSize(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  const units = ['kB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit] ?? 'kB'}`;
}

/**
 * What the browser promises about the stored data, and what to do about it.
 *
 * This application has no server. If the browser discards the database, the
 * archive is gone with no way back, and that has happened — so the state is
 * stated plainly here rather than assumed, with the one action that protects
 * against it either way: an export.
 */
export function StorageCard() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const durability = useStorageStore((s) => s.durability);
  const bytes = useStorageStore((s) => s.bytes);
  const ensureDurable = useStorageStore((s) => s.ensureDurable);
  const refresh = useStorageStore((s) => s.refresh);

  const [asking, setAsking] = useState(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const state = durability ?? 'unknown';
  const tone = {
    persisted: { icon: ShieldCheck, className: 'text-success' },
    best_effort: { icon: ShieldAlert, className: 'text-warning' },
    unsupported: { icon: ShieldQuestion, className: 'text-fg-muted' },
    unknown: { icon: ShieldQuestion, className: 'text-fg-muted' },
  }[state];

  const Icon = tone.icon;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.storage')}</CardTitle>
      </CardHeader>
      <CardBody className="grid gap-4">
        <div className="flex items-start gap-3">
          <Icon size={18} aria-hidden className={cn('mt-0.5 shrink-0', tone.className)} />
          <div className="grid gap-1">
            <span className={cn('text-sm font-medium', tone.className)}>
              {t(`settings.storageState.${state}`)}
            </span>
            <span className="text-xs text-fg-secondary">{t(`settings.storageHint.${state}`)}</span>
            {bytes !== undefined && (
              <span className="text-xs text-fg-muted">
                {t('settings.storageUsed', { size: readableSize(bytes) })}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {state === 'best_effort' && (
            <Button
              variant="secondary"
              disabled={asking}
              onClick={() => {
                setAsking(true);
                void ensureDurable().finally(() => {
                  setAsking(false);
                });
              }}
            >
              {t('settings.storageRequest')}
            </Button>
          )}

          {/*
            Offered whatever the browser says. A promise is not a backup: it
            survives eviction, not a cleared profile or a new machine.
          */}
          <Button
            variant={state === 'persisted' ? 'secondary' : 'primary'}
            icon={<HardDriveDownload size={16} aria-hidden />}
            onClick={() => {
              void navigate('/transfer');
            }}
          >
            {t('settings.storageExport')}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

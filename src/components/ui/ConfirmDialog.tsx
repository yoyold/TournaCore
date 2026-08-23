import { AlertTriangle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@components/ui/Button';

export interface ConfirmDialogProps {
  title: string;
  /** What will happen, stated plainly. */
  message: string;
  /** Extra consequence worth spelling out, e.g. how much data is affected. */
  detail?: string | undefined;
  confirmLabel: string;
  /**
   * When set, the user must type this exact text before confirming.
   *
   * Reserved for deletions that cannot be undone: a click is easy to make by
   * accident, typing a name is not.
   */
  requireText?: string | undefined;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Modal confirmation for a destructive action.
 *
 * A modal is right here, unlike the result sheet: the point is to interrupt.
 * Focus moves into the dialog, Escape cancels, and the confirm button starts
 * disabled when a name has to be typed.
 */
export function ConfirmDialog({
  title,
  message,
  detail,
  confirmLabel,
  requireText,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState('');
  const cancelButton = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus the safe option, or the field that must be filled in.
    if (requireText !== undefined) input.current?.focus();
    else cancelButton.current?.focus();
  }, [requireText]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onCancel]);

  const canConfirm = requireText === undefined || typed.trim() === requireText;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        className="w-full max-w-md rounded-[var(--radius-dialog)] border border-line bg-elevated p-6 shadow-lg"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-danger/15 text-danger"
          >
            <AlertTriangle size={18} />
          </span>
          <div className="min-w-0">
            <h2 id="confirm-title" className="text-base font-semibold text-fg">
              {title}
            </h2>
            <p id="confirm-message" className="mt-1 text-sm text-fg-secondary">
              {message}
            </p>
            {detail !== undefined && <p className="mt-2 text-xs text-warning">{detail}</p>}
          </div>
        </div>

        {requireText !== undefined && (
          <label className="mt-4 grid gap-1.5">
            <span className="text-xs text-fg-secondary">
              {t('confirm.typeToConfirm', { text: requireText })}
            </span>
            <input
              ref={input}
              type="text"
              value={typed}
              autoComplete="off"
              onChange={(event) => {
                setTyped(event.target.value);
              }}
              className="h-10 rounded-[var(--radius-control)] border border-line bg-inset px-3 text-sm text-fg outline-none focus-visible:border-accent"
            />
          </label>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button ref={cancelButton} variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" disabled={!canConfirm} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

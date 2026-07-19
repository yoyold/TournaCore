import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last line of defence for render errors.
 *
 * The reassurance that stored data is unaffected is not a pleasantry: without a
 * server-side backup, a user's first worry after a crash is rightly data loss.
 * Since all data lives in IndexedDB and a render error does not touch it, the
 * statement is accurate, which is exactly why it belongs here.
 *
 * A class component by necessity: React still offers no hook equivalent for
 * error boundaries.
 *
 * Deliberate exception to the rule that all strings go through i18n: this
 * component does not call useTranslation. If the failure originates in i18n
 * initialisation itself, the translation call would drag down the very component
 * meant to catch it. Strings are German, matching the default locale.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // No external error reporting: that would be a network egress and break
    // the guarantee that nothing leaves the user's device.
    console.error('[TournaCore] Unhandled render error:', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="grid min-h-dvh place-items-center bg-base p-6">
        <div className="w-full max-w-lg rounded-[var(--radius-card)] border border-line bg-surface p-6">
          <h1 className="text-lg font-semibold text-fg">Etwas ist schiefgelaufen</h1>
          <p className="mt-2 text-sm text-fg-secondary">
            Deine gespeicherten Daten sind davon nicht betroffen.
          </p>

          <button
            type="button"
            onClick={() => {
              window.location.reload();
            }}
            className="mt-5 rounded-[var(--radius-control)] bg-accent px-4 py-2 text-sm font-medium text-fg-on-accent transition-colors hover:bg-accent-hover"
          >
            Seite neu laden
          </button>

          <details className="mt-5">
            <summary className="cursor-pointer text-xs text-fg-muted">Technische Details</summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded-[var(--radius-control)] bg-inset p-3 text-xs text-fg-secondary">
              {error.stack ?? error.message}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}

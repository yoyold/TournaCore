import { Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet } from 'react-router-dom';

import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

const COLLAPSE_BREAKPOINT = 1024;

/**
 * Application frame: top bar, sidebar, content area and footer.
 *
 * The sidebar collapses to icons below 1024px but stays manually controllable
 * afterwards. Deliberately not forced by matchMedia on every render: someone who
 * expands the sidebar in a narrow window wants it to stay expanded until they
 * resize again.
 */
export function AppShell() {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < COLLAPSE_BREAKPOINT,
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${String(COLLAPSE_BREAKPOINT - 1)}px)`);
    const onChange = (event: MediaQueryListEvent): void => {
      setCollapsed(event.matches);
    };
    mql.addEventListener('change', onChange);
    return () => {
      mql.removeEventListener('change', onChange);
    };
  }, []);

  return (
    <div className="flex h-dvh flex-col bg-base">
      {/* Skip link: first focus stop for keyboard and screen reader users. */}
      <a
        href="#main"
        className="sr-only-focusable absolute top-2 left-2 z-50 rounded-[var(--radius-control)] bg-accent px-4 py-2 text-sm font-medium text-fg-on-accent"
      >
        {t('common.skipToContent')}
      </a>

      <TopBar
        onToggleSidebar={() => {
          setCollapsed((value) => !value);
        }}
      />

      <div className="flex min-h-0 flex-1">
        <Sidebar collapsed={collapsed} />

        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          <main id="main" className="mx-auto w-full max-w-[1440px] flex-1 px-6 py-8">
            {/* Routes are lazy loaded; this fallback becomes card-shaped
                skeletons once pages carry real content. */}
            <Suspense fallback={<p className="text-sm text-fg-muted">{t('common.loading')}</p>}>
              <Outlet />
            </Suspense>
          </main>

          <footer className="border-t border-line px-6 py-4">
            <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-5 gap-y-2 text-xs text-fg-muted">
              <span>{t('privacy.localOnlyHint')}</span>
              <span className="ml-auto flex gap-4">
                <Link to="/legal/imprint" className="hover:text-fg">
                  {t('legal.imprint')}
                </Link>
                <Link to="/legal/privacy" className="hover:text-fg">
                  {t('legal.privacy')}
                </Link>
              </span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

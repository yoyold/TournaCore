import { lazy } from 'react';
import { createHashRouter, Navigate } from 'react-router-dom';

import { AppShell } from '@layouts/AppShell';
import { NotFoundPage } from '@pages/NotFoundPage';

/**
 * Routing.
 *
 * Uses createHashRouter rather than a history router on purpose: GitHub Pages
 * serves a 404 for unknown paths and has no SPA rewrite, so every deep link that
 * is opened directly or reloaded would break. The common 404.html redirect trick
 * works but causes a visible double load and pollutes browser history. The hash
 * is the more honest compromise.
 *
 * Every page except the shell and the 404 view is lazy loaded to keep the
 * initial chunk within the bundle budget enforced in CI.
 */

const DashboardPage = lazy(() =>
  import('@pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const TournamentsPage = lazy(() =>
  import('@pages/TournamentsPage').then((m) => ({ default: m.TournamentsPage })),
);
const TeamsPage = lazy(() => import('@pages/TeamsPage').then((m) => ({ default: m.TeamsPage })));
const GamesPage = lazy(() => import('@pages/GamesPage').then((m) => ({ default: m.GamesPage })));
const StatisticsPage = lazy(() =>
  import('@pages/StatisticsPage').then((m) => ({ default: m.StatisticsPage })),
);
const TransferPage = lazy(() =>
  import('@pages/TransferPage').then((m) => ({ default: m.TransferPage })),
);
const SettingsPage = lazy(() =>
  import('@pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const ImprintPage = lazy(() =>
  import('@pages/legal/ImprintPage').then((m) => ({ default: m.ImprintPage })),
);
const PrivacyPage = lazy(() =>
  import('@pages/legal/PrivacyPage').then((m) => ({ default: m.PrivacyPage })),
);

export const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: <NotFoundPage />,
    children: [
      { index: true, element: <DashboardPage /> },

      { path: 'tournaments', element: <TournamentsPage /> },
      // Detail routes (wizard, tournament overview, stage view, match list and
      // match detail) are added alongside the features behind them.

      { path: 'teams', element: <TeamsPage /> },
      { path: 'games', element: <GamesPage /> },
      { path: 'statistics', element: <StatisticsPage /> },
      { path: 'transfer', element: <TransferPage /> },
      { path: 'settings', element: <SettingsPage /> },

      { path: 'legal/imprint', element: <ImprintPage /> },
      { path: 'legal/privacy', element: <PrivacyPage /> },
      // Häufig geratene Adressen auf die kanonischen Pfade umleiten.
      { path: 'impressum', element: <Navigate to="/legal/imprint" replace /> },
      { path: 'datenschutz', element: <Navigate to="/legal/privacy" replace /> },

      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

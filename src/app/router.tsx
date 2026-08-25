import { createHashRouter, Navigate } from 'react-router-dom';

import { AppShell } from '@layouts/AppShell';
import { NotFoundPage } from '@pages/NotFoundPage';

import { lazyRoute } from './lazyRoute';
import { RouteError } from './RouteError';

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

const DashboardPage = lazyRoute(() =>
  import('@pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const TournamentsPage = lazyRoute(() =>
  import('@pages/TournamentsPage').then((m) => ({ default: m.TournamentsPage })),
);
const TournamentWizardPage = lazyRoute(() =>
  import('@pages/TournamentWizardPage').then((m) => ({ default: m.TournamentWizardPage })),
);
const TournamentDetailPage = lazyRoute(() =>
  import('@pages/TournamentDetailPage').then((m) => ({ default: m.TournamentDetailPage })),
);
const TournamentFormPage = lazyRoute(() =>
  import('@pages/TournamentFormPage').then((m) => ({ default: m.TournamentFormPage })),
);
const TeamsPage = lazyRoute(() =>
  import('@pages/TeamsPage').then((m) => ({ default: m.TeamsPage })),
);
const TeamDetailPage = lazyRoute(() =>
  import('@pages/TeamDetailPage').then((m) => ({ default: m.TeamDetailPage })),
);
const TeamFormPage = lazyRoute(() =>
  import('@pages/TeamFormPage').then((m) => ({ default: m.TeamFormPage })),
);
const GamesPage = lazyRoute(() =>
  import('@pages/GamesPage').then((m) => ({ default: m.GamesPage })),
);
const StatisticsPage = lazyRoute(() =>
  import('@pages/StatisticsPage').then((m) => ({ default: m.StatisticsPage })),
);
const TransferPage = lazyRoute(() =>
  import('@pages/TransferPage').then((m) => ({ default: m.TransferPage })),
);
const SettingsPage = lazyRoute(() =>
  import('@pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const ImprintPage = lazyRoute(() =>
  import('@pages/legal/ImprintPage').then((m) => ({ default: m.ImprintPage })),
);
const PrivacyPage = lazyRoute(() =>
  import('@pages/legal/PrivacyPage').then((m) => ({ default: m.PrivacyPage })),
);

export const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <DashboardPage /> },

      { path: 'tournaments', element: <TournamentsPage /> },
      { path: 'tournaments/new', element: <TournamentWizardPage /> },
      { path: 'tournaments/:id', element: <TournamentDetailPage /> },
      { path: 'tournaments/:id/edit', element: <TournamentFormPage /> },
      // Detail routes (wizard, tournament overview, stage view, match list and
      // match detail) are added alongside the features behind them.

      { path: 'teams', element: <TeamsPage /> },
      // Static before dynamic, so "new" is not read as a team id.
      { path: 'teams/new', element: <TeamFormPage /> },
      { path: 'teams/:id', element: <TeamDetailPage /> },
      { path: 'teams/:id/edit', element: <TeamFormPage /> },
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

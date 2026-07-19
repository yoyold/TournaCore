import { CalendarClock, Shield, Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Card, CardBody } from '@components/ui/Card';
import { DevelopmentNotice } from '@components/ui/DevelopmentNotice';
import { PageHeader } from '@components/ui/PageHeader';

export function DashboardPage() {
  const { t } = useTranslation();

  // Values are static until the data layer is wired up.
  const stats = [
    { icon: Trophy, label: t('pages.dashboard.activeTournaments'), value: '0' },
    { icon: Shield, label: t('pages.dashboard.registeredTeams'), value: '0' },
    { icon: CalendarClock, label: t('pages.dashboard.upcomingMatches'), value: '0' },
  ];

  return (
    <>
      <PageHeader title={t('pages.dashboard.title')} subtitle={t('pages.dashboard.subtitle')} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map(({ icon: Icon, label, value }) => (
          <Card key={label}>
            <CardBody className="flex items-center gap-4">
              <span
                aria-hidden
                className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-control)] bg-accent-subtle text-accent"
              >
                <Icon size={20} />
              </span>
              <span className="min-w-0">
                <span className="tabular block text-xl font-semibold text-fg">{value}</span>
                <span className="block truncate text-xs text-fg-secondary">{label}</span>
              </span>
            </CardBody>
          </Card>
        ))}
      </div>

      <DevelopmentNotice scope="Aktive Turniere, nächste Matches, letzte Ergebnisse und Schnellaktionen." />
    </>
  );
}

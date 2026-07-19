import { useTranslation } from 'react-i18next';

import { DevelopmentNotice } from '@components/ui/DevelopmentNotice';
import { PageHeader } from '@components/ui/PageHeader';

export function TournamentsPage() {
  const { t } = useTranslation();

  return (
    <>
      <PageHeader title={t('pages.tournaments.title')} subtitle={t('pages.tournaments.subtitle')} />
      <DevelopmentNotice scope="Turnierliste als Kartenraster mit Filtern nach Spiel, Status und Zeitraum sowie der Turnier-Assistent." />
    </>
  );
}

import { useTranslation } from 'react-i18next';

import { DevelopmentNotice } from '@components/ui/DevelopmentNotice';
import { PageHeader } from '@components/ui/PageHeader';

export function StatisticsPage() {
  const { t } = useTranslation();

  return (
    <>
      <PageHeader title={t('pages.statistics.title')} subtitle={t('pages.statistics.subtitle')} />
      <DevelopmentNotice scope="Auswertungen über alle Turniere: Winrates, Map-Statistiken und Gegnerhistorien." />
    </>
  );
}

import { useTranslation } from 'react-i18next';

import { DevelopmentNotice } from '@components/ui/DevelopmentNotice';
import { PageHeader } from '@components/ui/PageHeader';

export function TeamsPage() {
  const { t } = useTranslation();

  return (
    <>
      <PageHeader title={t('pages.teams.title')} subtitle={t('pages.teams.subtitle')} />
      <DevelopmentNotice scope="Turnierübergreifende Teamdatenbank mit Logo-Upload, Suche und Region-Filter." />
    </>
  );
}

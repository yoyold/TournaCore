import { useTranslation } from 'react-i18next';

import { DevelopmentNotice } from '@components/ui/DevelopmentNotice';
import { PageHeader } from '@components/ui/PageHeader';

export function GamesPage() {
  const { t } = useTranslation();

  return (
    <>
      <PageHeader title={t('pages.games.title')} subtitle={t('pages.games.subtitle')} />
      <DevelopmentNotice scope="Verwaltung von Spieltiteln und ihren Map-Pools — Grundlage für Map-Picks und Map-Statistiken." />
    </>
  );
}

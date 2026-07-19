import { useTranslation } from 'react-i18next';

import { DevelopmentNotice } from '@components/ui/DevelopmentNotice';
import { PageHeader } from '@components/ui/PageHeader';

export function TransferPage() {
  const { t } = useTranslation();

  return (
    <>
      <PageHeader title={t('pages.transfer.title')} subtitle={t('pages.transfer.subtitle')} />
      <DevelopmentNotice scope="JSON-Export und -Import mit Schema-Versionierung, Vorschau und Konfliktauflösung." />
    </>
  );
}

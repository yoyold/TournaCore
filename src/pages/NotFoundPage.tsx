import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Card, CardBody } from '@components/ui/Card';

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <Card className="mx-auto max-w-md">
      <CardBody className="flex flex-col items-center gap-3 py-14 text-center">
        <span className="tabular text-3xl font-semibold text-fg-muted">404</span>
        <h1 className="text-lg font-semibold text-fg">{t('pages.notFound.title')}</h1>
        <p className="text-sm text-fg-secondary">{t('pages.notFound.subtitle')}</p>
        <Link
          to="/"
          className="mt-2 rounded-[var(--radius-control)] bg-accent px-4 py-2 text-sm font-medium text-fg-on-accent transition-colors hover:bg-accent-hover"
        >
          {t('pages.notFound.backHome')}
        </Link>
      </CardBody>
    </Card>
  );
}

import { useTranslation } from 'react-i18next';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';

import { Button } from '@components/ui/Button';
import { Card, CardBody } from '@components/ui/Card';
import { NotFoundPage } from '@pages/NotFoundPage';

import { isChunkLoadError } from './lazyRoute';

/**
 * Error boundary for a route.
 *
 * Distinguishes a genuinely unknown address from a page that exists but could
 * not be fetched. Reporting the latter as "page not found" is actively
 * misleading — it sends the user looking for a wrong link when the real cause is
 * a stale tab after a deployment.
 */
export function RouteError() {
  const { t } = useTranslation();
  const error = useRouteError();

  // A 404 response, or no route matched at all.
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;

  const chunkMissing = isChunkLoadError(error);

  return (
    <Card className="mx-auto max-w-md">
      <CardBody className="flex flex-col items-center gap-3 py-14 text-center">
        <h1 className="text-lg font-semibold text-fg">
          {chunkMissing ? t('routeError.staleTitle') : t('error.boundaryTitle')}
        </h1>
        <p className="text-sm text-fg-secondary">
          {chunkMissing ? t('routeError.staleHint') : t('error.boundaryHint')}
        </p>

        <Button
          variant="primary"
          className="mt-2"
          onClick={() => {
            window.location.reload();
          }}
        >
          {t('error.reload')}
        </Button>

        {!chunkMissing && error instanceof Error && (
          <details className="mt-3 w-full text-left">
            <summary className="cursor-pointer text-xs text-fg-muted">{t('error.details')}</summary>
            <pre className="mt-2 max-h-48 overflow-auto rounded-[var(--radius-control)] bg-inset p-3 text-xs text-fg-secondary">
              {error.stack ?? error.message}
            </pre>
          </details>
        )}
      </CardBody>
    </Card>
  );
}

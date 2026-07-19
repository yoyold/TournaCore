import { Construction } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Card, CardBody } from './Card';

export interface DevelopmentNoticeProps {
  /** What this view will offer once it is built. */
  scope: string;
}

/**
 * Placeholder for routes that do not have content yet.
 *
 * States concretely what will appear here rather than a generic "coming soon".
 * The routes exist from the start so navigation and layout are fully testable
 * before the features behind them land.
 */
export function DevelopmentNotice({ scope }: DevelopmentNoticeProps) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardBody className="flex flex-col items-center gap-3 py-14 text-center">
        <Construction size={28} className="text-fg-muted" aria-hidden />
        <p className="text-sm font-medium text-fg">{t('placeholder.inDevelopment')}</p>
        <p className="max-w-md text-sm text-fg-secondary">{scope}</p>
      </CardBody>
    </Card>
  );
}

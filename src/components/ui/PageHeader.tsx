import type { ReactNode } from 'react';

export interface PageHeaderProps {
  title: string;
  subtitle?: string | undefined;
  /** Primary actions, right-aligned next to the title. */
  actions?: ReactNode | undefined;
}

/** Shared page header so spacing and hierarchy stay consistent across pages. */
export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-fg">{title}</h1>
        {subtitle !== undefined && <p className="mt-1 text-sm text-fg-secondary">{subtitle}</p>}
      </div>
      {actions !== undefined && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

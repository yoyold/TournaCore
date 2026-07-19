import { cn } from '@utils/cn';

import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Lifts the card slightly on hover. Only use for clickable cards. */
  interactive?: boolean;
}

/**
 * Surface building block of the card layout.
 *
 * In dark mode, elevation is expressed through lightness rather than shadow:
 * shadows are barely perceptible on a dark background.
 */
export function Card({ interactive = false, className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-card)] border border-line bg-surface',
        interactive &&
          'transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('border-b border-line px-5 py-4', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  className,
  ...rest
}: HTMLAttributes<HTMLHeadingElement> & { children: ReactNode }) {
  return (
    <h2 className={cn('text-base font-semibold text-fg', className)} {...rest}>
      {children}
    </h2>
  );
}

export function CardBody({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-5 py-4', className)} {...rest}>
      {children}
    </div>
  );
}

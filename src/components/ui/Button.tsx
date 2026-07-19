import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { cn } from '@utils/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icon vor dem Label. Wird bei `size="icon"` zum alleinigen Inhalt. */
  icon?: ReactNode;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-fg-on-accent hover:bg-accent-hover shadow-sm',
  secondary: 'bg-elevated text-fg border border-line hover:bg-hover hover:border-line-strong',
  ghost: 'text-fg-secondary hover:bg-hover hover:text-fg',
  danger: 'bg-danger text-fg-on-accent hover:bg-danger-hover shadow-sm',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
  icon: 'h-10 w-10 justify-center',
};

/**
 * Base button.
 *
 * Uses forwardRef because headless primitives (dialog, popover, tooltip) need a
 * ref on the trigger element, and their `asChild` pattern does not work without one.
 *
 * With `size="icon"` an `aria-label` is required: a button without an accessible
 * name is useless to screen readers. The jsx-a11y rules enforce that at the call site.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center rounded-[var(--radius-control)] font-medium',
        'transition-colors duration-[120ms] ease-out',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {size !== 'icon' && children}
    </button>
  );
});

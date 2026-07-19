import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges class names and resolves Tailwind conflicts.
 *
 * `clsx` handles conditionals, `twMerge` makes the last competing utility win
 * (`px-2 px-4` becomes `px-4`). Without it, overriding a base style through a
 * `className` prop would depend on CSS source order rather than call order.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

/**
 * Input — sunken couch-surface field, warm focus ring. Forwards everything to
 * the native input (use `type`, `value`, `onChange`, etc. as usual).
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-10 w-full rounded-xl border border-couch-700 bg-couch-850 px-3.5 py-2',
        'text-sm text-cream-50 placeholder:text-cream-400/70',
        'transition-colors duration-200',
        'focus-visible:outline-none focus-visible:border-ember-500/60',
        'focus-visible:ring-2 focus-visible:ring-ember-500/40',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-cream-200',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

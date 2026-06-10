'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Badge variants:
 * - default: muted couch chip
 * - accent:  ember-tinted chip (now-playing, controller)
 * - outline: bordered, transparent
 * - live:    warm coral-red with a pulsing ring — for LIVE / screen-share
 */
export type BadgeVariant = 'default' | 'accent' | 'outline' | 'live';

const VARIANTS: Record<BadgeVariant, string> = {
  default: 'bg-couch-750 text-cream-200 border border-couch-700',
  accent:
    'bg-ember-500/15 text-ember-300 border border-ember-500/30',
  outline: 'border border-couch-650 text-cream-300',
  live:
    'bg-coal-red/90 text-cream-50 border border-coal-red/40 animate-live-pulse',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5',
        'text-xs font-semibold leading-none tracking-wide',
        '[&_svg]:size-3 [&_svg]:shrink-0',
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  ),
);
Badge.displayName = 'Badge';

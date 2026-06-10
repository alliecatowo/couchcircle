'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';

/**
 * Button variants:
 * - default: muted couch surface, subtle border
 * - accent:  the ember (lamp-amber) glow CTA — the primary "do the thing"
 * - ghost:   text-only, surfaces on hover
 * - outline: bordered, transparent fill
 * - danger:  warm coral-red, for emergency-pause / destructive actions
 */
export type ButtonVariant =
  | 'default'
  | 'accent'
  | 'ghost'
  | 'outline'
  | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const VARIANTS: Record<ButtonVariant, string> = {
  default:
    'bg-couch-800 text-cream-100 border border-couch-700 hover:bg-couch-750 hover:border-couch-650',
  accent:
    'bg-ember-500 text-couch-950 font-semibold border border-ember-400/40 ' +
    'hover:bg-ember-400 shadow-[0_0_0_1px_rgba(240,139,52,0.18),0_6px_24px_-6px_rgba(240,139,52,0.45)] ' +
    'hover:shadow-[0_0_0_1px_rgba(240,139,52,0.25),0_8px_30px_-6px_rgba(240,139,52,0.6)]',
  ghost: 'text-cream-200 hover:bg-couch-800/70 hover:text-cream-50',
  outline:
    'border border-couch-650 text-cream-100 bg-transparent hover:bg-couch-800 hover:border-couch-600',
  danger:
    'bg-coal-red/90 text-cream-50 font-semibold border border-coal-red/50 hover:bg-coal-red',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-xl',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-base gap-2 rounded-2xl',
  icon: 'h-10 w-10 rounded-xl',
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Render as the child element (Radix Slot), e.g. wrap a Next <Link>. */
  asChild?: boolean;
}

const baseClasses =
  'inline-flex select-none items-center justify-center whitespace-nowrap ' +
  'font-medium transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ' +
  'outline-none focus-visible:ring-2 focus-visible:ring-ember-500 focus-visible:ring-offset-2 ' +
  'focus-visible:ring-offset-couch-900 active:scale-[0.97] ' +
  'disabled:pointer-events-none disabled:opacity-45 ' +
  '[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-4';

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(baseClasses, VARIANTS[variant], SIZES[size], className)}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

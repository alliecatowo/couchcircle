'use client';

import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';

/**
 * Switch — warm toggle. Off = couch surface, On = ember glow.
 */
export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full',
      'border border-transparent transition-colors duration-200',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-500 focus-visible:ring-offset-2 focus-visible:ring-offset-couch-900',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=unchecked]:bg-couch-700',
      'data-[state=checked]:bg-ember-500 data-[state=checked]:border-ember-400/50',
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        'pointer-events-none block size-5 rounded-full bg-cream-50 shadow-sm',
        'transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
        'data-[state=unchecked]:translate-x-0.5 data-[state=checked]:translate-x-[1.375rem]',
      )}
    />
  </SwitchPrimitive.Root>
));
Switch.displayName = SwitchPrimitive.Root.displayName;

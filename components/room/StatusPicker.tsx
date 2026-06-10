'use client';

import * as React from 'react';
import { Popover, PopoverContent, PopoverTrigger, PopoverClose } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useRoom } from '@/lib/realtime/room-context';
import { STATUS_META } from '@/shared/constants';
import type { ParticipantStatus } from '@/shared/protocol';

const ALL_STATUSES = Object.keys(STATUS_META) as ParticipantStatus[];

interface StatusPickerProps {
  /** The child element that triggers the picker (the avatar). */
  children: React.ReactNode;
  /** The participant's current status, to highlight the active choice. */
  currentStatus: ParticipantStatus;
}

/**
 * A Popover grid of all 11 status options.
 * Clicking an option sends `presence:update { status }` and closes.
 * Sized so it never overflows the viewport (max-width + responsive side).
 */
export function StatusPicker({ children, currentStatus }: StatusPickerProps) {
  const { send } = useRoom();
  const [open, setOpen] = React.useState(false);

  function pick(status: ParticipantStatus) {
    send({ type: 'presence:update', status });
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      {/* sideOffset + collisionPadding keep the grid away from viewport edges */}
      <PopoverContent
        side="top"
        align="center"
        sideOffset={10}
        collisionPadding={12}
        className="w-[min(360px,_calc(100vw_-_24px))] p-3"
      >
        <p className="mb-2 text-sm font-display text-cream-200 text-center">
          set your vibe
        </p>
        <div className="grid grid-cols-3 gap-2" role="listbox" aria-label="pick your vibe">
          {ALL_STATUSES.map((status) => {
            const meta = STATUS_META[status];
            const isActive = status === currentStatus;
            return (
              <PopoverClose asChild key={status}>
                <button
                  role="option"
                  aria-selected={isActive}
                  onClick={() => pick(status)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-xl px-2 py-2.5',
                    'border text-xs font-body transition-all duration-150',
                    'cursor-pointer select-none outline-none',
                    'focus-visible:ring-2 focus-visible:ring-ember-500',
                    isActive
                      ? 'bg-ember-900 text-ember-200 border-ember-500 glow-ember'
                      : 'bg-couch-850 border-couch-700 text-cream-200 hover:bg-couch-750 hover:border-couch-650 hover:text-cream-50',
                  )}
                >
                  <span className="text-2xl leading-none" aria-hidden="true">
                    {meta.emoji}
                  </span>
                  <span className="leading-tight truncate max-w-full">{meta.label}</span>
                </button>
              </PopoverClose>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

'use client';

/**
 * SyncIndicator — the little sync-health pill (§12 MediaStage block).
 *
 * Reads the live {@link useSyncStatus} snapshot published by the active
 * {@link SyncEngine} and renders a cozy status pill: Synced 🟢, slight drift 🟡,
 * resyncing 🔄, buffering 🌀, LIVE (red live Badge), or blocked ⚠️. A Tooltip
 * exposes the measured drift in ms for the curious.
 */

import * as React from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { useSyncStatus, type SyncHealth } from '@/lib/sync/sync-engine';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface PillSpec {
  label: string;
  /** leading glyph (emoji) — omitted when an icon is used instead */
  glyph?: string;
  icon?: React.ReactNode;
  className: string;
}

function specFor(health: SyncHealth): PillSpec {
  switch (health) {
    case 'synced':
      return {
        label: 'synced',
        glyph: '🟢',
        className: 'border-moss-600/50 bg-moss-900/40 text-moss-300',
      };
    case 'drift':
      return {
        label: 'slight drift',
        glyph: '🟡',
        className: 'border-ember-600/40 bg-ember-950/40 text-ember-300',
      };
    case 'resyncing':
      return {
        label: 'resyncing',
        icon: <RefreshCw className="animate-spin" />,
        className: 'border-ember-600/40 bg-ember-950/40 text-ember-300',
      };
    case 'buffering':
      return {
        label: 'buffering',
        icon: <Loader2 className="animate-spin" />,
        className: 'border-haze-600/40 bg-haze-900/40 text-haze-300',
      };
    case 'blocked':
      return {
        label: 'tap to sync',
        glyph: '⚠️',
        className: 'border-coal-red/40 bg-coal-red/15 text-cream-100',
      };
    case 'idle':
    default:
      return {
        label: 'idle',
        glyph: '🌙',
        className: 'border-couch-700 bg-couch-800/70 text-cream-400',
      };
  }
}

export function SyncIndicator() {
  const status = useSyncStatus();

  // LIVE gets its own pulsing red Badge.
  if (status.health === 'live' || (status.isLive && status.health !== 'blocked')) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="live" className="cursor-default">
            🔴 LIVE
          </Badge>
        </TooltipTrigger>
        <TooltipContent>live stream — no rewind, we ride it together</TooltipContent>
      </Tooltip>
    );
  }

  const spec = specFor(status.health);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex select-none items-center gap-1.5 rounded-full border px-2.5 py-1',
            'text-xs font-semibold leading-none tracking-wide',
            'shadow-[var(--shadow-couch)] backdrop-blur-sm',
            '[&_svg]:size-3 [&_svg]:shrink-0',
            spec.className,
          )}
        >
          {spec.icon ?? <span aria-hidden>{spec.glyph}</span>}
          {spec.label}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {status.health === 'blocked'
          ? 'autoplay got blocked — tap the screen to sync up'
          : `drift ${Math.round(status.driftMs)}ms`}
      </TooltipContent>
    </Tooltip>
  );
}

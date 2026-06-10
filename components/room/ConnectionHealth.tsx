'use client';

import { useRoom } from '@/lib/realtime/room-context';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

/**
 * ConnectionHealth — a tiny dot + rtt label that lets you feel the link to the
 * couch. Color follows §12 thresholds against the measured round-trip time:
 * green < 80ms, amber < 250ms, red otherwise (or whenever we're not connected).
 */
export function ConnectionHealth() {
  const { connectionStatus, connection } = useRoom();
  const rtt = connection?.rttMs ?? 0;
  const connected = connectionStatus === 'connected';

  // Pick the health tier. A live-but-laggy link still goes amber/red by rtt;
  // anything that isn't a clean 'connected' is treated as a red, sad dot.
  const tier: 'good' | 'okay' | 'bad' =
    !connected ? 'bad' : rtt < 80 ? 'good' : rtt < 250 ? 'okay' : 'bad';

  const dotClass =
    tier === 'good'
      ? 'bg-moss-400 shadow-[0_0_8px_-1px_rgba(121,169,127,0.8)]'
      : tier === 'okay'
        ? 'bg-ember-400 shadow-[0_0_8px_-1px_rgba(242,168,80,0.8)]'
        : 'bg-coal-red shadow-[0_0_8px_-1px_rgba(229,86,75,0.8)]';

  const statusLabel =
    connectionStatus === 'connected'
      ? 'snug on the couch'
      : connectionStatus === 'connecting'
        ? 'finding the couch…'
        : connectionStatus === 'reconnecting'
          ? 'reconnecting to the couch…'
          : 'drifted offline';

  const rttLabel = connected && rtt > 0 ? `${Math.round(rtt)}ms` : '—';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex items-center gap-1.5 rounded-full border border-couch-700 bg-couch-850/70 px-2 py-1 text-xs text-cream-300"
          aria-label={`connection: ${statusLabel}, ${rttLabel}`}
        >
          <span
            className={cn(
              'block size-2 rounded-full transition-colors duration-300',
              dotClass,
              !connected && 'animate-pulse',
            )}
          />
          <span className="tabular-nums">{rttLabel}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {statusLabel}
        {connected && rtt > 0 ? ` · ${Math.round(rtt)}ms round trip` : ''}
      </TooltipContent>
    </Tooltip>
  );
}

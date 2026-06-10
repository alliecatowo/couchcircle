'use client';

/**
 * RotationPanel — floating card showing who's in the rotation and whose turn it is.
 *
 * Renders null unless sesh.enabled && sesh.rotationActive.
 * Positioned bottom-left over the media stage (absolute, pointer-events-auto).
 *
 * Shows:
 *  - ordered member chips (AvatarSprite + name)
 *  - current holder: ember ring + flame badge + "now"
 *  - next member labeled "up next"
 *  - auto-advance timer bar when settings.rotationAutoAdvanceSec is set
 *  - stop button for controller/host
 *
 * Missing/disconnected participants are skipped gracefully.
 */

import * as React from 'react';
import { useRoom } from '@/lib/realtime/room-context';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
// AvatarSprite is a concurrent sibling — import per contract.
import { AvatarSprite } from '@/components/avatars';

export function RotationPanel() {
  const { state, selfId, isHost, isController, send, serverNow } = useRoom();

  const [now, setNow] = React.useState(() => serverNow());

  const sesh = state?.sesh;
  const settings = state?.settings;
  const participants = state?.participants ?? {};

  // Only tick the timer when there's something to tick
  const hasTimer =
    sesh?.rotationActive &&
    !!settings?.rotationAutoAdvanceSec &&
    !!sesh.currentTurnStartedAt;

  React.useEffect(() => {
    if (!hasTimer) return;
    const id = setInterval(() => setNow(serverNow()), 250);
    return () => clearInterval(id);
  }, [hasTimer, serverNow]);

  if (!state || !sesh?.enabled || !sesh.rotationActive) return null;

  const { rotationIds, currentRotationIndex } = sesh;

  // Filter to IDs that still exist as participants (gracefully skip removed)
  const presentIds = rotationIds.filter((id) => id in participants);

  if (presentIds.length === 0) return null;

  // Map the current rotation index to the filtered presentIds list.
  // We do a best-effort: find the current holder or fall back to index 0.
  const currentHolderId =
    rotationIds[currentRotationIndex] ?? rotationIds[0];
  const currentPresentIdx = presentIds.indexOf(currentHolderId);
  // If the current holder was removed, treat the first present member as current.
  const effectiveCurrentIdx =
    currentPresentIdx === -1 ? 0 : currentPresentIdx;

  const nextPresentIdx = (effectiveCurrentIdx + 1) % presentIds.length;

  // Auto-advance timer bar
  let progress = 1; // full = time remaining
  const autoSec = settings?.rotationAutoAdvanceSec ?? null;
  if (autoSec && sesh.currentTurnStartedAt) {
    const elapsed = (now - sesh.currentTurnStartedAt) / 1000;
    progress = Math.max(0, Math.min(1, 1 - elapsed / autoSec));
  }

  const canStop = isController || isHost;

  return (
    <Card
      className={cn(
        'absolute bottom-4 left-4 z-30 w-56',
        'pointer-events-auto animate-float-bob',
        'border-couch-700 bg-couch-800/90 backdrop-blur-md',
        'shadow-[var(--shadow-lifted)]',
      )}
    >
      <CardContent className="p-3">
        {/* header row */}
        <div className="mb-2.5 flex items-center justify-between">
          <span className="font-display text-xs font-semibold text-cream-300 uppercase tracking-wider">
            the rotation
          </span>
          {canStop && (
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 rounded-lg text-cream-400 hover:text-cream-100"
              aria-label="stop rotation"
              onClick={() => send({ type: 'sesh:rotation:stop' })}
            >
              ✕
            </Button>
          )}
        </div>

        {/* member chips */}
        <div className="flex flex-col gap-1.5">
          {presentIds.map((id, idx) => {
            const p = participants[id];
            if (!p) return null;
            const isCurrent = idx === effectiveCurrentIdx;
            const isNext =
              presentIds.length > 1 && idx === nextPresentIdx;

            return (
              <div
                key={id}
                className={cn(
                  'flex items-center gap-2 rounded-xl px-2 py-1 transition-all duration-300',
                  isCurrent
                    ? 'bg-ember-500/10 border border-ember-500/40'
                    : 'border border-transparent',
                )}
              >
                {/* avatar with optional ember ring */}
                <div
                  className={cn(
                    'relative shrink-0 rounded-full',
                    isCurrent &&
                      'ring-2 ring-ember-400 ring-offset-1 ring-offset-couch-800',
                  )}
                >
                  <AvatarSprite
                    avatar={p.avatar}
                    accent={p.accent}
                    mood={isCurrent ? 'lit' : 'idle'}
                    size={28}
                  />
                  {/* flame badge */}
                  {isCurrent && (
                    <span
                      className="absolute -top-1 -right-1 text-[10px] leading-none select-none"
                      aria-hidden
                    >
                      🔥
                    </span>
                  )}
                </div>

                {/* name + label */}
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      'truncate text-xs font-medium leading-tight',
                      isCurrent ? 'text-cream-50' : 'text-cream-200',
                    )}
                    style={isCurrent ? { color: p.accent } : undefined}
                  >
                    {p.name}
                  </p>
                  {isCurrent && (
                    <p className="text-[10px] text-ember-300 leading-none">
                      now 🔥
                    </p>
                  )}
                  {!isCurrent && isNext && (
                    <p className="text-[10px] text-cream-400 leading-none">
                      up next
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* auto-advance timer bar */}
        {autoSec && sesh.currentTurnStartedAt && (
          <div className="mt-2.5 h-0.5 w-full overflow-hidden rounded-full bg-couch-700">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-200',
                progress > 0.4 ? 'bg-ember-400' : 'bg-coal-red/80',
              )}
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

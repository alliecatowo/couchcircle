'use client';

/**
 * Shared bits for the stage players (owned by media-stage, lives under
 * `components/room/players/*`).
 *
 * `MediaErrorPanel` is the friendly "this didn't play" surface used by the
 * YouTube and direct-URL players (§15 error matrix). When the viewer can drive
 * the remote it offers a "skip it" button that removes the offending item from
 * the queue so the night keeps moving.
 */

import * as React from 'react';
import { TvMinimal, SkipForward } from 'lucide-react';
import { useRoom } from '@/lib/realtime/room-context';
import { Button } from '@/components/ui/button';

export function MediaErrorPanel({ message, itemId }: { message: string; itemId: string }) {
  const { canControl, send } = useRoom();

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-couch-950/85 px-6 text-center backdrop-blur-sm">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-couch-800 text-cream-300 [&_svg]:size-7">
        <TvMinimal />
      </div>
      <div className="space-y-1.5">
        <p className="font-display text-lg text-cream-100">that one won&apos;t play 😵‍💫</p>
        <p className="mx-auto max-w-sm font-body text-sm text-cream-400">{message}</p>
      </div>
      {canControl ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => send({ type: 'queue:remove', itemId })}
        >
          <SkipForward />
          skip it
        </Button>
      ) : (
        <p className="font-body text-xs text-cream-500">
          ask whoever has the remote to skip it
        </p>
      )}
    </div>
  );
}

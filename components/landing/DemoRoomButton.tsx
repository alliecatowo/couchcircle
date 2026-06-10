'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { createRoom } from '@/lib/realtime/connection';

/**
 * "Spin up a demo room" button used by the /demo page.
 * Creates a room with seedDemo:true and roomName "the demo den", then
 * navigates to /r/<joinCode>.
 *
 * Extracted as a client component so the /demo route can remain a Server
 * Component.
 */
export function DemoRoomButton() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setLoading(true);
    try {
      const { roomId, joinCode } = await createRoom();

      const pending = JSON.stringify({
        roomId,
        roomName: 'the demo den',
        seedDemo: true,
      });
      sessionStorage.setItem(`couchcircle:pending-create:${joinCode}`, pending);

      router.push('/r/' + joinCode);
    } catch {
      setError("the room service is asleep — is the party server running?");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="accent"
        size="lg"
        onClick={handleClick}
        disabled={loading}
        className="glow-ember w-fit"
      >
        {loading ? 'warming up the den…' : 'spin up a demo room 🛋️'}
      </Button>
      {error && (
        <p className="text-sm text-coal-red animate-pop-in" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

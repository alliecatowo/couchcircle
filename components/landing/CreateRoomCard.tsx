'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Sofa } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createRoom } from '@/lib/realtime/connection';
import { cn } from '@/lib/utils';

interface CreateRoomCardProps {
  /** When true the created room will be seeded with demo content. */
  seedDemo?: boolean;
  /** Pre-fill the room name (used by the demo page). */
  defaultRoomName?: string;
  className?: string;
}

/**
 * Card that creates a new CouchCircle room.  Calls the lobby, writes the
 * pending-create payload to sessionStorage (picked up by RoomProvider on join),
 * then navigates to /r/<joinCode>.
 */
export function CreateRoomCard({
  seedDemo = false,
  defaultRoomName = '',
  className,
}: CreateRoomCardProps) {
  const router = useRouter();

  const [roomName, setRoomName] = React.useState(defaultRoomName);
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { roomId, joinCode } = await createRoom();

      // The RoomProvider reads this on first join to send the create payload.
      const pending = JSON.stringify({
        roomId,
        roomName: roomName.trim() || undefined,
        password: password.trim() || undefined,
        seedDemo,
      });
      sessionStorage.setItem(`couchcircle:pending-create:${joinCode}`, pending);

      router.push('/r/' + joinCode);
    } catch {
      // The only realistic failure is the lobby being down.
      setError("the room service is asleep — is the party server running?");
      setLoading(false);
    }
  }

  return (
    <Card
      className={cn(
        'w-full max-w-sm grain flex flex-col',
        'border-couch-700 bg-couch-800/90',
        className,
      )}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sofa className="size-5 text-ember-400" />
          roll up a couch
        </CardTitle>
        <CardDescription>
          you&apos;re the host — the remote is yours 🎮
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          {/* Room name */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="create-room-name">room name</Label>
            <Input
              id="create-room-name"
              placeholder="the couch"
              maxLength={40}
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="create-room-pass">
              password{' '}
              <span className="text-cream-400 font-normal text-xs">(optional)</span>
            </Label>
            <Input
              id="create-room-pass"
              type="password"
              placeholder="leave blank for open room"
              maxLength={72}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-coal-red animate-pop-in" role="alert">
              {error}
            </p>
          )}

          <Button
            variant="accent"
            size="lg"
            type="submit"
            disabled={loading}
            className="mt-1 w-full glow-ember"
          >
            {loading ? 'warming up…' : 'roll up a couch'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

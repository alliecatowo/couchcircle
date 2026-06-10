'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { normalizeJoinCode, isValidJoinCode } from '@/shared/join-codes';
import { resolveCode } from '@/lib/realtime/connection';
import { cn } from '@/lib/utils';

interface JoinRoomCardProps {
  className?: string;
}

/**
 * Card that lets someone join a room by typing its join code.
 * Normalizes the code as the user types, validates early, and calls
 * resolveCode() before navigating so we can give a useful "not found" hint.
 */
export function JoinRoomCard({ className }: JoinRoomCardProps) {
  const router = useRouter();

  const [raw, setRaw] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Normalize on every keystroke so the field always shows the canonical form.
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setRaw(e.target.value);
    setError(null);
  }

  const code = normalizeJoinCode(raw);
  const structurallyValid = isValidJoinCode(code);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!structurallyValid) {
      setError('enter a code like MOSS-420');
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const result = await resolveCode(code);
      if (!result) {
        setError('that room dissolved into the haze');
        setLoading(false);
        return;
      }
      router.push('/r/' + code);
    } catch {
      // Network error — let the room page handle the reconnect flow.
      router.push('/r/' + code);
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
          <ArrowRight className="size-5 text-moss-400" />
          join the circle
        </CardTitle>
        <CardDescription>
          got a code? flop on in 🛋️
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleJoin} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="join-code">room code</Label>
            <Input
              id="join-code"
              placeholder="MOSS-420"
              value={raw}
              onChange={handleChange}
              disabled={loading}
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={20}
              className={cn(
                'font-mono tracking-widest uppercase',
                error && 'border-coal-red/60 focus-visible:border-coal-red/60 animate-wiggle',
              )}
            />
            {/* Live canonical preview */}
            {raw && code !== raw.trim().toUpperCase() && (
              <p className="text-xs text-cream-400">
                looks like: <span className="text-ember-300 font-mono">{code}</span>
              </p>
            )}
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-coal-red animate-pop-in" role="alert">
              {error}
            </p>
          )}

          <Button
            variant="default"
            size="lg"
            type="submit"
            disabled={loading || (!structurallyValid && raw.length > 0)}
            className="mt-1 w-full"
          >
            {loading ? 'finding the couch…' : 'join the circle'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

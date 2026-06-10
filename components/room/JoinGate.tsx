'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { Loader2, Lock, Home } from 'lucide-react';
import { useRoom } from '@/lib/realtime/room-context';
import { ensureIdentity, saveIdentity } from '@/lib/identity';
import { AVATAR_IDS, AVATAR_META, ACCENT_COLORS } from '@/shared/constants';
import type { AvatarId } from '@/shared/protocol';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { AvatarSprite } from '@/components/avatars';

/**
 * JoinGate — the full-screen cozy porch that covers the room until you've
 * slid onto the couch (`joinPhase === 'joined'`). It handles every pre-join
 * phase: resolving the code, the empty-room/full-room dead ends, and the
 * name/avatar/accent/password form itself.
 */
export function JoinGate() {
  const { joinPhase, joinError, join } = useRoom();

  // Seed the form from the persisted identity (or a freshly-minted random one).
  const initial = useMemo(() => ensureIdentity(), []);
  const [name, setName] = useState(initial.name);
  const [avatar, setAvatar] = useState<AvatarId>(initial.avatar);
  const [accent, setAccent] = useState(
    ACCENT_COLORS.includes(initial.accent) ? initial.accent : ACCENT_COLORS[0],
  );
  const [password, setPassword] = useState('');

  // The form is "live" during these phases; everything else is a status screen.
  const showForm =
    joinPhase === 'gate' || joinPhase === 'wrong-password' || joinPhase === 'joining';

  // Show the password field when the server says we need one, or when a prior
  // attempt came back wrong.
  const passwordMentioned = !!joinError && /password/i.test(joinError);
  const wrongPassword = joinPhase === 'wrong-password';
  const showPassword = passwordMentioned || wrongPassword;

  // Shake the password field on a fresh wrong-password / password error.
  const [shakeKey, setShakeKey] = useState(0);
  useEffect(() => {
    if (wrongPassword) setShakeKey((k) => k + 1);
  }, [wrongPassword, joinError]);

  const joining = joinPhase === 'joining';

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (joining) return;
    const trimmed = name.trim() || initial.name;
    const identity = { ...initial, name: trimmed, avatar, accent };
    saveIdentity(identity);
    join({ identity, password: showPassword ? password : undefined });
  };

  return (
    <AnimatePresence>
      {joinPhase !== 'joined' && (
        <motion.div
          key="join-gate"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.4 } }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4"
        >
          {/* blurred backdrop over whatever room skeleton is rendering behind */}
          <div className="absolute inset-0 bg-couch-950/80 backdrop-blur-xl" />
          {/* a warm lamp glow drifting in the corner */}
          <div
            className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-ember-500/15 blur-3xl animate-flicker"
            aria-hidden
          />

          <div className="relative z-10 w-full max-w-md">
            {joinPhase === 'resolving' && <Resolving />}
            {joinPhase === 'not-found' && <NotFound />}
            {joinPhase === 'room-full' && <RoomFull />}
            {joinPhase === 'error' && <GenericError message={joinError} />}

            {showForm && (
              <form
                onSubmit={onSubmit}
                className="grain relative overflow-hidden rounded-3xl border border-couch-700 bg-couch-850/95 p-6 shadow-[var(--shadow-lifted)]"
              >
                <div className="relative z-10 flex flex-col gap-5">
                  <div className="text-center">
                    <h1 className="font-display text-3xl text-cream-50">
                      pull up a cushion
                    </h1>
                    <p className="mt-1 text-sm text-cream-400">
                      pick a face, pick a glow, slide on in
                    </p>
                  </div>

                  {/* name */}
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="join-name">what do we call you</Label>
                    <Input
                      id="join-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Blanket Wizard"
                      maxLength={24}
                      autoComplete="off"
                    />
                  </div>

                  {/* avatar picker */}
                  <div className="flex flex-col gap-2">
                    <Label>your couch creature</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {AVATAR_IDS.map((id) => {
                        const selected = id === avatar;
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setAvatar(id)}
                            aria-pressed={selected}
                            aria-label={AVATAR_META[id].label}
                            title={AVATAR_META[id].blurb}
                            className={cn(
                              'flex flex-col items-center gap-1 rounded-2xl border p-2 transition-all duration-200',
                              selected
                                ? 'border-transparent bg-couch-800'
                                : 'border-couch-700 bg-couch-850 hover:border-couch-650 hover:bg-couch-800',
                            )}
                            style={
                              selected
                                ? { boxShadow: `0 0 0 2px ${accent}, 0 6px 18px -8px ${accent}` }
                                : undefined
                            }
                          >
                            <AvatarSprite
                              avatar={id}
                              accent={accent}
                              mood={selected ? 'happy' : 'idle'}
                              size={44}
                            />
                            <span
                              className={cn(
                                'text-[0.65rem] leading-tight',
                                selected ? 'text-cream-100' : 'text-cream-400',
                              )}
                            >
                              {AVATAR_META[id].label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* accent swatches */}
                  <div className="flex flex-col gap-2">
                    <Label>your glow</Label>
                    <div className="flex flex-wrap gap-2">
                      {ACCENT_COLORS.map((c) => {
                        const selected = c === accent;
                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setAccent(c)}
                            aria-pressed={selected}
                            aria-label={`accent ${c}`}
                            className={cn(
                              'size-7 rounded-full transition-transform duration-200',
                              selected ? 'scale-110' : 'hover:scale-105',
                            )}
                            style={{
                              backgroundColor: c,
                              boxShadow: selected
                                ? `0 0 0 2px var(--color-couch-850), 0 0 0 4px ${c}`
                                : undefined,
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* password (conditional) */}
                  {showPassword && (
                    <motion.div
                      key={`pw-${shakeKey}`}
                      animate={wrongPassword ? { x: [0, -8, 8, -6, 6, 0] } : undefined}
                      transition={{ duration: 0.45 }}
                      className="flex flex-col gap-1.5"
                    >
                      <Label htmlFor="join-password" className="flex items-center gap-1.5">
                        <Lock className="size-3.5 text-ember-300" />
                        the secret knock
                      </Label>
                      <Input
                        id="join-password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••"
                        autoComplete="off"
                        className={wrongPassword ? 'border-coal-red/60' : undefined}
                      />
                      {wrongPassword && (
                        <span className="text-xs text-coal-red">
                          that&apos;s not the knock — try again
                        </span>
                      )}
                    </motion.div>
                  )}

                  <Button
                    type="submit"
                    variant="accent"
                    size="lg"
                    disabled={joining}
                    className="glow-ember mt-1 w-full"
                    style={{ backgroundColor: accent, color: '#100b09' }}
                  >
                    {joining ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        finding your spot…
                      </>
                    ) : (
                      'slide onto the couch'
                    )}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** A breathing "finding the room…" screen while we resolve the join code. */
function Resolving() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-3xl border border-couch-700 bg-couch-850/90 p-10 text-center shadow-[var(--shadow-lifted)]">
      <Loader2 className="size-8 animate-spin text-ember-400" />
      <p className="font-display text-xl text-cream-100">finding the room…</p>
      <p className="text-sm text-cream-400">peeking down the hallway for the right door</p>
    </div>
  );
}

/** Room never existed (or expired) — gently send them home. */
function NotFound() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-3xl border border-couch-700 bg-couch-850/90 p-10 text-center shadow-[var(--shadow-lifted)]">
      <span className="text-4xl" aria-hidden>
        💨
      </span>
      <h1 className="font-display text-2xl text-cream-50">
        this room dissolved into the haze
      </h1>
      <p className="text-sm text-cream-400">
        the code didn&apos;t lead anywhere — maybe it already drifted off.
      </p>
      <Button asChild variant="accent" size="lg" className="mt-1">
        <Link href="/">
          <Home className="size-4" />
          back to the front porch
        </Link>
      </Button>
    </div>
  );
}

/** All twelve cushions are taken. */
function RoomFull() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-3xl border border-couch-700 bg-couch-850/90 p-10 text-center shadow-[var(--shadow-lifted)]">
      <span className="text-4xl" aria-hidden>
        🛋️
      </span>
      <h1 className="font-display text-2xl text-cream-50">the couch is full (12 max)</h1>
      <p className="text-sm text-cream-400">
        not a single cushion left. give it a minute and try again.
      </p>
      <Button asChild variant="outline" size="lg" className="mt-1">
        <Link href="/">
          <Home className="size-4" />
          head home
        </Link>
      </Button>
    </div>
  );
}

/** Catch-all for an unexpected snag during join. */
function GenericError({ message }: { message: string | null }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-3xl border border-couch-700 bg-couch-850/90 p-10 text-center shadow-[var(--shadow-lifted)]">
      <span className="text-4xl" aria-hidden>
        🌫️
      </span>
      <h1 className="font-display text-2xl text-cream-50">something got hazy</h1>
      <p className="text-sm text-cream-400">{message || 'we couldn’t get you onto the couch.'}</p>
      <Button asChild variant="outline" size="lg" className="mt-1">
        <Link href="/">
          <Home className="size-4" />
          back home
        </Link>
      </Button>
    </div>
  );
}

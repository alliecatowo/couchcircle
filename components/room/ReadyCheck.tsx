'use client';

/**
 * ReadyCheck — overlay banner for the "everyone ready?" check.
 *
 * Renders null unless state.readyCheck?.active.
 * Pinned INSIDE the shell at top-16 (below the h-14 TopBar) so it never clips
 * on short screens. Drops in with a spring animation.
 *
 * Shows:
 *  - n/total count of connected participants who are ready (always visible)
 *  - big toggle: "i'm ready 🟢" / "actually wait" (ready:set true/false)
 *  - controller/host: "start anyway ▶" (ready:cancel + media:play) + "cancel"
 *  - moss pulse ring when everyone is ready
 */

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRoom } from '@/lib/realtime/room-context';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function ReadyCheck() {
  const { state, self, isHost, isController, send } = useRoom();

  const readyCheck = state?.readyCheck;
  const participants = state?.participants ?? {};

  // Count only connected participants
  const connected = Object.values(participants).filter((p) => p.connected);
  const total = connected.length;
  const readyCount = connected.filter((p) => p.isReady).length;
  const allReady = total > 0 && readyCount === total;

  const isSelfReady = self?.isReady ?? false;
  const canControl = isController || isHost;

  function handleStartAnyway() {
    send({ type: 'ready:cancel' });
    send({ type: 'media:play' });
  }

  return (
    <AnimatePresence>
      {readyCheck?.active && (
        <motion.div
          key="ready-check"
          initial={{ y: -40, opacity: 0, scale: 0.97 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -40, opacity: 0, scale: 0.97 }}
          transition={{
            type: 'spring',
            stiffness: 420,
            damping: 34,
          }}
          // top-16 = 64px, safely below the h-14 (56px) TopBar + border
          className={cn(
            'fixed top-16 left-1/2 z-50 -translate-x-1/2',
            'w-full max-w-sm pointer-events-auto px-3',
          )}
        >
          {/* Warm tray card — matches RemoteControls aesthetic */}
          <div
            className={cn(
              'relative overflow-hidden rounded-2xl border p-4',
              'bg-couch-800/96 backdrop-blur-md',
              'shadow-[inset_0_1px_0_rgba(224,139,52,0.08),var(--shadow-lifted)]',
              allReady
                ? 'border-moss-500/50'
                : 'border-couch-700',
            )}
          >
            {/* Grain texture — keep content above z-10 */}
            <div className="grain pointer-events-none absolute inset-0" aria-hidden />

            {/* Moss pulse ring when everyone's ready */}
            {allReady && (
              <div
                className="pointer-events-none absolute inset-0 rounded-2xl animate-pulse-glow"
                style={{
                  boxShadow:
                    '0 0 0 2px rgba(86,133,95,0.35), 0 0 28px -4px rgba(86,133,95,0.3)',
                }}
                aria-hidden
              />
            )}

            <div className="relative z-10 flex flex-col gap-3">
              {/* Header — always fully visible, n/total on same line */}
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-lg" aria-hidden>
                  {allReady ? '🟢' : '👀'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm font-semibold leading-tight text-cream-50">
                    {allReady ? "everyone's ready" : 'everyone ready?'}
                    {/* n/total always on the same line so it's never clipped */}
                    <span className="ml-1.5 font-mono text-xs font-normal text-cream-400">
                      {readyCount}/{total} locked in
                    </span>
                  </p>
                </div>

                {/* Ready-progress pips */}
                <div className="flex shrink-0 items-center gap-0.5">
                  {connected.slice(0, 8).map((p) => (
                    <div
                      key={p.id}
                      className={cn(
                        'h-1.5 w-1.5 rounded-full transition-all duration-300',
                        p.isReady ? 'bg-moss-400' : 'bg-couch-650',
                      )}
                      title={p.name}
                    />
                  ))}
                  {connected.length > 8 && (
                    <span className="ml-1 text-[10px] text-cream-400">
                      +{connected.length - 8}
                    </span>
                  )}
                </div>
              </div>

              {/* Self ready toggle */}
              <Button
                variant={isSelfReady ? 'outline' : 'accent'}
                size="md"
                className={cn(
                  'w-full',
                  isSelfReady
                    ? 'border-moss-600/60 text-moss-300 hover:border-moss-500'
                    : '',
                )}
                onClick={() =>
                  send({ type: 'ready:set', ready: !isSelfReady })
                }
              >
                {isSelfReady ? 'actually wait ✋' : 'locked in 🟢'}
              </Button>

              {/* Controller/host controls */}
              {canControl && (
                <div className="flex gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    className="flex-1 gap-1 border-moss-700/50 text-moss-300 hover:border-moss-600"
                    onClick={handleStartAnyway}
                  >
                    start anyway ▶
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-cream-400"
                    onClick={() => send({ type: 'ready:cancel' })}
                  >
                    nevermind
                  </Button>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

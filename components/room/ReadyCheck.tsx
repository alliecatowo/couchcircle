'use client';

/**
 * ReadyCheck — the minimal top-center mini-pill (SPRINT2 §12 refactor).
 *
 * The full "everyone ready?" interaction now lives in the consolidated RitualCard
 * pinned at the top of chat (see `rituals/ActiveRitualCard` + ChatPanel) — the ready
 * check is no longer a bespoke floating banner. This file stays as a thin mount so
 * the import graph (RoomShell) is unchanged, and renders ONLY a small top-center
 * "everyone ready? n/m" mini-pill so theater-mode users (whose chrome melts away and
 * who therefore can't see the chat panel) still get a glanceable readout of a live
 * check. Tapping the pill toggles your own locked-in flag — the one-tap affordance
 * survives even with the panel gone.
 *
 * Renders null unless `state.readyCheck?.active`.
 */

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRoom } from '@/lib/realtime/room-context';
import { cn } from '@/lib/utils';

export function ReadyCheck() {
  const { state, self, send } = useRoom();

  const readyCheck = state?.readyCheck;
  const participants = state?.participants ?? {};

  const connected = Object.values(participants).filter((p) => p.connected);
  const total = connected.length;
  const readyCount = connected.filter((p) => p.isReady).length;
  const allReady = total > 0 && readyCount === total;
  const isSelfReady = self?.isReady ?? false;

  return (
    <AnimatePresence>
      {readyCheck?.active && (
        <motion.button
          key="ready-pill"
          type="button"
          onClick={() => send({ type: 'ready:set', ready: !isSelfReady })}
          initial={{ y: -28, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -28, opacity: 0, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 440, damping: 34 }}
          // top-16 = 64px, safely below the h-14 TopBar
          className={cn(
            'fixed top-16 left-1/2 z-50 -translate-x-1/2',
            'pointer-events-auto flex items-center gap-2 rounded-full border px-3 py-1.5',
            'bg-couch-800/95 backdrop-blur-md shadow-[var(--shadow-lifted)]',
            'text-xs font-medium transition-colors duration-200',
            allReady
              ? 'border-moss-500/55 text-moss-200'
              : 'border-couch-650 text-cream-200 hover:border-ember-600/50',
          )}
          aria-label={
            isSelfReady ? 'tap to unlock — everyone ready check' : 'tap to lock in — everyone ready check'
          }
        >
          {/* moss pulse ring when everyone's ready */}
          {allReady && (
            <span
              className="pointer-events-none absolute inset-0 rounded-full animate-pulse-glow"
              style={{
                boxShadow: '0 0 0 2px rgba(86,133,95,0.35), 0 0 24px -4px rgba(86,133,95,0.3)',
              }}
              aria-hidden
            />
          )}
          <span className="relative leading-none" aria-hidden>
            {allReady ? '🟢' : '👀'}
          </span>
          <span className="relative font-display font-semibold leading-none">
            {allReady ? "everyone's ready" : 'everyone ready?'}
          </span>
          <span className="relative font-mono text-[11px] text-cream-400">
            {readyCount}/{total}
          </span>
          {!allReady && (
            <span
              className={cn(
                'relative ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] leading-none',
                isSelfReady
                  ? 'bg-moss-500/15 text-moss-300'
                  : 'bg-ember-500/15 text-ember-300',
              )}
            >
              {isSelfReady ? 'locked in' : 'tap to lock in'}
            </span>
          )}
        </motion.button>
      )}
    </AnimatePresence>
  );
}

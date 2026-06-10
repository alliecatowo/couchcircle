'use client';

/**
 * ReactionLayer — floating emoji reactions over the stage (§12).
 *
 * Maps `context.reactions` (the last few {@link ReactionBurst}s) to emoji that
 * rise from the bottom of the stage, fade, and drift. Horizontal position is
 * derived deterministically from the burst key so the same burst always floats
 * up the same lane (no jitter on re-render). Pure framer-motion; pointer-events
 * are off so it never steals clicks from the player.
 */

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRoom } from '@/lib/realtime/room-context';

/** Cheap deterministic hash → [0, 1) from the burst key (stable per burst). */
function keyToFraction(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) | 0;
  }
  // Map to a comfy band so emoji don't hug the very edges.
  return (Math.abs(h) % 1000) / 1000;
}

export function ReactionLayer() {
  const { reactions } = useRoom();

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      <AnimatePresence>
        {reactions.map((burst) => {
          const frac = keyToFraction(burst.key);
          const leftPct = 8 + frac * 78; // keep within 8%–86%
          const drift = (frac - 0.5) * 60; // small lateral drift in px
          return (
            <motion.span
              key={burst.key}
              className="absolute bottom-6 select-none text-3xl drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)]"
              style={{ left: `${leftPct}%` }}
              initial={{ opacity: 0, y: 10, scale: 0.5 }}
              animate={{ opacity: [0, 1, 1, 0], y: -220, x: drift, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 3.4, ease: [0.22, 1, 0.36, 1] }}
            >
              {burst.emoji}
            </motion.span>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

'use client';

/**
 * SeatStrip — the first-class PORTRAIT-mobile couch (SPRINT2 §6, Workflow B).
 *
 * On a phone the full anchored seat scene (ParticipantCircle) is too tall to sit
 * under a letterboxed TV. This is the same crew, the same join-order seats, the
 * same sticky-seat math (`seatRoom` from the seat-map util) — just compressed
 * into ONE horizontal, scrollable row of small avatars instead of an arc. It is
 * still seats, never a user list: order is seat order, the controller carries 📺,
 * the rotation turn glows, ready/disconnected flourishes ride along.
 *
 * Intentionally a thin alternative to ParticipantCircle (which doesn't compress
 * to a single phone row): it reuses <ParticipantAvatar size="sm"> so the
 * creatures, status bubbles, speech bubbles, and disconnect 💤 all come for free.
 */

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useRoom } from '@/lib/realtime/room-context';
import { ParticipantAvatar } from '@/components/room/ParticipantAvatar';
import { seatRoom } from '@/components/room/seating/seat-map';
import type { Participant } from '@/shared/protocol';

// ---------------------------------------------------------------------------
// Seat-anchored chips (mirrors ParticipantCircle's, sized for the strip)
// ---------------------------------------------------------------------------

function ControllerChip() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.7, y: 3 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.7 }}
      transition={{ duration: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
      className={cn(
        'absolute -top-1 left-1/2 z-30 -translate-x-1/2',
        'flex items-center rounded-full px-1.5 py-0.5',
        'bg-ember-900 border border-ember-500 text-ember-200',
        'text-[10px] leading-none whitespace-nowrap',
        'shadow-[var(--shadow-ember)] glow-ember',
      )}
      aria-label="has the remote"
    >
      <span aria-hidden="true">📺</span>
    </motion.div>
  );
}

function ReadyBadge({ isReady }: { isReady: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.5 }}
      transition={{ duration: 0.24, ease: [0.34, 1.56, 0.64, 1] }}
      className={cn(
        'absolute bottom-5 -right-0.5 z-30 flex h-4 w-4 items-center justify-center',
        'rounded-full text-[9px] leading-none select-none shadow-[var(--shadow-couch)]',
        isReady
          ? 'bg-moss-900 border border-moss-500 glow-moss'
          : 'bg-couch-800 border border-couch-650',
      )}
      aria-label={isReady ? 'locked in' : 'not ready yet'}
    >
      {isReady ? '✅' : '⏳'}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// One seat in the strip
// ---------------------------------------------------------------------------

function StripSeat({
  participant,
  isController,
  isRotationTurn,
  isReadyCheckActive,
}: {
  participant: Participant;
  isController: boolean;
  isRotationTurn: boolean;
  isReadyCheckActive: boolean;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'relative flex shrink-0 snap-start items-end justify-center',
        // rotation turn: ember ring + lift so "now" is unmistakable on the strip
        isRotationTurn &&
          'rounded-2xl ring-2 ring-ember-400 ring-offset-2 ring-offset-couch-950 animate-pulse-glow z-10',
      )}
    >
      <AnimatePresence>
        {isController && <ControllerChip key="ctrl" />}
      </AnimatePresence>
      <AnimatePresence>
        {isReadyCheckActive && (
          <ReadyBadge key="ready" isReady={participant.isReady} />
        )}
      </AnimatePresence>
      <ParticipantAvatar participant={participant} size="sm" />
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// SeatStrip
// ---------------------------------------------------------------------------

export function SeatStrip() {
  const { state } = useRoom();
  if (!state) return null;

  // Same seat math as the desktop scene → identical order + sticky seats.
  const { seated } = seatRoom(state.participants);
  const { remote, readyCheck, sesh } = state;
  const isReadyCheckActive = readyCheck?.active ?? false;
  const currentRotationId =
    sesh.rotationActive && sesh.rotationIds.length > 0
      ? sesh.rotationIds[sesh.currentRotationIndex % sesh.rotationIds.length]
      : null;

  return (
    <div
      className={cn(
        'relative w-full select-none overflow-hidden',
        // a slim lit shelf — the couch, compressed to a back-row strip
        'border-y border-couch-700/80',
        'bg-gradient-to-b from-couch-850/80 via-couch-900/80 to-couch-950/80',
      )}
      aria-label="the crew on the couch"
    >
      {/* a whisper of lamp glow so the strip still reads as a lit room */}
      <div
        className="pointer-events-none absolute -right-6 -top-8 h-24 w-40 rounded-full opacity-50 blur-2xl animate-flicker"
        style={{
          background:
            'radial-gradient(closest-side, rgba(240,139,52,0.25), transparent)',
        }}
        aria-hidden="true"
      />

      {seated.length === 0 ? (
        <p className="relative z-10 px-4 py-4 text-center font-body text-xs text-cream-400">
          the couch is empty… for now
        </p>
      ) : (
        <div
          className={cn(
            'relative z-10 flex snap-x snap-mandatory items-end gap-1',
            'overflow-x-auto overflow-y-hidden px-3 pt-3 pb-1.5',
            // hide the scrollbar on the strip; it's a flick-scroll surface
            '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          )}
        >
          <AnimatePresence initial={false}>
            {seated.map(({ participant }) => (
              <StripSeat
                key={participant.id}
                participant={participant}
                isController={remote.controllerId === participant.id}
                isRotationTurn={currentRotationId === participant.id}
                isReadyCheckActive={isReadyCheckActive}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

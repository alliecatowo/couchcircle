'use client';

/**
 * ParticipantCircle — the living-room seat map (CONCEPTS.md §4) that makes the
 * room feel like a place, not a user list.
 *
 * The room is a fixed seat map of 12 facing the TV (see `seating/seat-map.ts`):
 *   couch (3, center) · loveseat (2, left, angled in) · armchair (1, right,
 *   angled in) · floor arc (6: bean bag, cushion, pouf, cushion, bean bag, rug)
 *   + a lamp/side table on the right and a rug under the floor arc.
 *
 * Seats are sticky for the life of a participant (reconnects keep the seat); a
 * leaver frees their seat and the next NEW joiner takes the lowest open one —
 * no musical chairs (the math lives in `assignSeats`).
 *
 * Responsive (§4):
 *   - lg     → the full scene, ~210px tall, anchored on the seat map.
 *   - md     → the same scene, compressed (smaller box).
 *   - < md   → two clean rows (furniture row, floor row) — still seats, never a
 *              list, never stretched furniture.
 *
 * Transient flourishes (diffed from `state.events` by id) ride on seats:
 *   - 'join'                         → seat-bounce on the new person.
 *   - 'sesh' w/ emoji ✨ (pass-the-vibe) → ember glow wave across seats L→R.
 *   - 'remote'                       → 📺 sparkle on the new controller's seat.
 *
 * Always-on, seat-anchored:
 *   - controller → floating 📺 chip
 *   - rotation current turn → ember ring + pulse
 *   - readyCheck active → ✅/⏳ badge per person
 *   - disconnected → translucent + 💤 (handled in ParticipantAvatar)
 *   - speech bubbles + status bubbles (handled in ParticipantAvatar)
 */

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useRoom } from '@/lib/realtime/room-context';
import { ParticipantAvatar } from './ParticipantAvatar';
import { SeatingScene, seatStyle, STAGE_W, STAGE_H } from './seating/SeatingScene';
import { seatRoom, SEAT_MAP, type Seat } from './seating/seat-map';
import type { Participant, RoomState } from '@/shared/protocol';

// Stage aspect ratio — the overlay box must hold this so percentage seat anchors
// line up with the furniture drawn in the SVG (`preserveAspectRatio` letterboxes
// otherwise, and §4 forbids stretching furniture to fill space).
const STAGE_ASPECT = `${STAGE_W} / ${STAGE_H}`;

// ---------------------------------------------------------------------------
// Glow wave — an ember sweep across the occupied seats (pass-the-vibe).
// Anchored to seat positions so the wave travels the room L→R.
// ---------------------------------------------------------------------------

function GlowWave({ seats, onDone }: { seats: Seat[]; onDone: () => void }) {
  React.useEffect(() => {
    const t = setTimeout(onDone, 400 + seats.length * 80 + 600);
    return () => clearTimeout(t);
  }, [seats.length, onDone]);

  // sweep order follows seat index (≈ left→right, front rows last) so it reads
  // as one wave rolling across the room
  const ordered = [...seats].sort((a, b) => a.x - b.x);

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {ordered.map((seat, i) => (
        <motion.div
          key={seat.index}
          className="absolute h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ember-400"
          style={{ left: `${seat.x}%`, top: `${seat.y - 8}%` }}
          initial={{ opacity: 0, scale: 0.3 }}
          animate={{ opacity: [0, 0.5, 0], scale: [0.3, 1.4, 0.3] }}
          transition={{ duration: 0.6, delay: i * 0.08, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Remote sparkle — brief 📺 burst above a seat on remote transfer.
// ---------------------------------------------------------------------------

function RemoteSparkle({ onDone }: { onDone: () => void }) {
  React.useEffect(() => {
    const t = setTimeout(onDone, 1200);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <motion.div
      className="pointer-events-none absolute -top-6 left-1/2 z-20 -translate-x-1/2 select-none text-lg"
      initial={{ opacity: 1, y: 0, scale: 1 }}
      animate={{ opacity: 0, y: -20, scale: 1.5 }}
      transition={{ duration: 0.9, ease: 'easeOut' }}
    >
      📺
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Seat-bounce wrapper — pops the avatar up briefly on join.
// ---------------------------------------------------------------------------

function SeatBounce({ children, bounce }: { children: React.ReactNode; bounce: boolean }) {
  return (
    <motion.div
      className="relative"
      animate={bounce ? { y: [0, -18, 0] } : { y: 0 }}
      transition={bounce ? { duration: 0.45, ease: [0.34, 1.56, 0.64, 1] } : undefined}
    >
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Controller chip — 📺 over the controller's seat.
// ---------------------------------------------------------------------------

function ControllerChip() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.7, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.7 }}
      transition={{ duration: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
      className={cn(
        'absolute -top-2 left-1/2 -translate-x-1/2',
        'flex items-center gap-1 rounded-full px-2 py-0.5',
        'bg-ember-900 border border-ember-500 text-ember-200',
        'text-[10px] font-body font-semibold leading-none whitespace-nowrap z-30',
        'shadow-[var(--shadow-ember)] glow-ember',
      )}
    >
      <span aria-hidden="true">📺</span>
      <span>remote</span>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Ready badge (✅ or ⏳).
// ---------------------------------------------------------------------------

function ReadyBadge({ isReady }: { isReady: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.5 }}
      transition={{ duration: 0.24, ease: [0.34, 1.56, 0.64, 1] }}
      className={cn(
        'absolute top-7 -left-1 z-30 flex h-5 w-5 items-center justify-center',
        'rounded-full text-[11px] leading-none select-none shadow-[var(--shadow-couch)]',
        isReady ? 'bg-moss-900 border border-moss-500 glow-moss' : 'bg-couch-800 border border-couch-650',
      )}
      aria-label={isReady ? 'locked in' : 'not ready yet'}
    >
      {isReady ? '✅' : '⏳'}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// SeatSlot — one avatar + its seat-anchored overlays.
// ---------------------------------------------------------------------------

interface SeatSlotProps {
  participant: Participant;
  isController: boolean;
  isReadyCheckActive: boolean;
  isRotationTurn: boolean;
  bounce: boolean;
  showRemoteSparkle: boolean;
  onSparkleEnd: () => void;
  size?: 'sm' | 'md';
}

function SeatSlot({
  participant,
  isController,
  isReadyCheckActive,
  isRotationTurn,
  bounce,
  showRemoteSparkle,
  onSparkleEnd,
  size = 'md',
}: SeatSlotProps) {
  return (
    // NOTE: only opacity is animated here. The seat transform (translate/rotate)
    // is owned by a plain wrapper div — framer-motion would otherwise clobber an
    // inline `transform` when it animates `scale`, dropping the avatar off its
    // seat. The join "pop" is provided by the inner SeatBounce instead.
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'relative flex-shrink-0',
        // Rotation turn: glowing ember ring + lift so it's unmistakably "now"
        isRotationTurn &&
          'rounded-2xl ring-2 ring-ember-400 ring-offset-2 ring-offset-couch-900 scale-110 animate-pulse-glow z-20',
      )}
    >
      <AnimatePresence>
        {isController && <ControllerChip key="controller-chip" />}
      </AnimatePresence>

      <AnimatePresence>
        {showRemoteSparkle && <RemoteSparkle key="remote-sparkle" onDone={onSparkleEnd} />}
      </AnimatePresence>

      <AnimatePresence>
        {isReadyCheckActive && (
          <ReadyBadge key="ready-badge" isReady={participant.isReady} />
        )}
      </AnimatePresence>

      <SeatBounce bounce={bounce}>
        <ParticipantAvatar participant={participant} size={size} />
      </SeatBounce>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Flourish bookkeeping — diff state.events by id to fire transient effects.
// ---------------------------------------------------------------------------

interface Flourishes {
  bouncing: Set<string>;
  glowWave: boolean;
  remoteSparkles: Set<string>;
}

function useFlourishes(state: RoomState | null): {
  flourishes: Flourishes;
  clearGlowWave: () => void;
  clearSparkle: (id: string) => void;
} {
  const seenEventIds = React.useRef<Set<string>>(new Set());
  const [bouncing, setBouncing] = React.useState<Set<string>>(new Set());
  const [glowWave, setGlowWave] = React.useState(false);
  const [remoteSparkles, setRemoteSparkles] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (!state) return;

    const newBounces = new Set<string>();
    let triggerGlow = false;
    const newSparkles = new Set<string>();

    for (const evt of state.events) {
      if (seenEventIds.current.has(evt.id)) continue;
      seenEventIds.current.add(evt.id);

      if (evt.kind === 'join' && evt.actorId) newBounces.add(evt.actorId);
      if (evt.kind === 'sesh' && evt.emoji === '✨') triggerGlow = true;
      if (evt.kind === 'remote' && state.remote.controllerId) {
        newSparkles.add(state.remote.controllerId);
      }
    }

    if (newBounces.size > 0) {
      setBouncing((prev) => {
        const next = new Set(prev);
        for (const id of newBounces) next.add(id);
        return next;
      });
      setTimeout(() => {
        setBouncing((prev) => {
          const next = new Set(prev);
          for (const id of newBounces) next.delete(id);
          return next;
        });
      }, 600);
    }

    if (triggerGlow) setGlowWave(true);

    if (newSparkles.size > 0) {
      setRemoteSparkles((prev) => {
        const next = new Set(prev);
        for (const id of newSparkles) next.add(id);
        return next;
      });
    }
  }, [state]);

  const clearGlowWave = React.useCallback(() => setGlowWave(false), []);
  const clearSparkle = React.useCallback((id: string) => {
    setRemoteSparkles((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  return { flourishes: { bouncing, glowWave, remoteSparkles }, clearGlowWave, clearSparkle };
}

// ---------------------------------------------------------------------------
// ParticipantCircle
// ---------------------------------------------------------------------------

export function ParticipantCircle() {
  const { state, selfId } = useRoom();
  const { flourishes, clearGlowWave, clearSparkle } = useFlourishes(state);

  if (!state) {
    return (
      <div className="flex h-24 items-center justify-center font-body text-sm text-cream-400">
        waiting for the couch…
      </div>
    );
  }

  // Stable seat assignment (§4): join order → seat index, sticky for life.
  const { seated, emptySeatIndices } = seatRoom(state.participants);
  const crewCount = seated.length;

  const { remote, readyCheck, sesh } = state;
  const isReadyCheckActive = readyCheck?.active ?? false;
  const currentRotationId =
    sesh.rotationActive && sesh.rotationIds.length > 0
      ? sesh.rotationIds[sesh.currentRotationIndex % sesh.rotationIds.length]
      : null;

  // seats that currently hold someone — the glow wave sweeps these
  const occupiedSeats = seated.map((s) => s.seat);

  function slotProps(participant: Participant) {
    return {
      participant,
      isController: remote.controllerId === participant.id,
      isReadyCheckActive,
      isRotationTurn: currentRotationId === participant.id,
      bounce: flourishes.bouncing.has(participant.id),
      showRemoteSparkle: flourishes.remoteSparkles.has(participant.id),
      onSparkleEnd: () => clearSparkle(participant.id),
    };
  }

  return (
    <div
      className={cn(
        'relative w-full select-none overflow-hidden',
        'rounded-3xl border border-couch-700 grain',
        'bg-gradient-to-b from-couch-850 via-couch-900 to-couch-950',
        'shadow-[var(--shadow-couch)]',
        'px-3 pt-4 pb-3 sm:px-4',
      )}
    >
      {/* ambient lamp-amber bleed in the top-right corner of the scene */}
      <div
        className="pointer-events-none absolute -right-10 -top-16 h-56 w-72 rounded-full opacity-60 blur-2xl animate-flicker"
        style={{ background: 'radial-gradient(closest-side, rgba(240,139,52,0.28), transparent)' }}
        aria-hidden="true"
      />

      <div className="relative z-10">
        {/* ─────────────────────────────────────────────────────────────
            md and up: the full anchored scene. The box holds the stage's
            aspect ratio so percentage seat anchors land on the furniture.
            ───────────────────────────────────────────────────────────── */}
        <div
          className="relative mx-auto hidden w-full max-w-[640px] md:block"
          style={{ aspectRatio: STAGE_ASPECT }}
        >
          {/* furniture + decor layer (rug, lamp, empty-seat sprites, the cat) */}
          <SeatingScene emptySeatIndices={emptySeatIndices} crewCount={crewCount} />

          {/* glow wave sweeps the occupied seats on pass-the-vibe */}
          <AnimatePresence>
            {flourishes.glowWave && occupiedSeats.length > 0 && (
              <GlowWave key="glow-wave" seats={occupiedSeats} onDone={clearGlowWave} />
            )}
          </AnimatePresence>

          {/* seated crew — each anchored AT its seat via seatStyle on a wrapper
              that only fades on enter/exit (so framer-motion never overwrites the
              seat transform). The join "pop" lives inside via SeatBounce. */}
          <AnimatePresence>
            {seated.map(({ participant, seat }) => (
              <motion.div
                key={participant.id}
                style={{ ...seatStyle(seat), zIndex: 20 }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              >
                <SeatSlot {...slotProps(participant)} size={seat.pose === 'floor' ? 'sm' : 'md'} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            below md: two clean rows — furniture row (couch/loveseat/armchair
            sitters) then floor row. Still seats, never a list. The SeatingScene
            renders its own (compact) furniture backdrop above each row band.
            ───────────────────────────────────────────────────────────── */}
        <StackedRows
          state={state}
          slotProps={slotProps}
          emptySeatIndices={emptySeatIndices}
          crewCount={crewCount}
        />

        {/* Self-hint: click your own avatar to set status */}
        {selfId && state.participants[selfId] && (
          <p className="mt-2 text-center font-body text-[10px] text-cream-400">
            click your avatar to change your vibe
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StackedRows — the < md fallback: two tidy rows of seated crew, grouped by
// where they sit (furniture vs floor), with a compact furniture backdrop so it
// still reads as a room. Never a list, never stretched furniture.
// ---------------------------------------------------------------------------

const FLOOR_SEAT_INDICES = new Set(
  SEAT_MAP.filter((s) => s.pose === 'floor').map((s) => s.index),
);

function StackedRows({
  state,
  slotProps,
  emptySeatIndices,
  crewCount,
}: {
  state: RoomState;
  slotProps: (p: Participant) => Omit<SeatSlotProps, 'size'>;
  emptySeatIndices: number[];
  crewCount: number;
}) {
  const { seated } = seatRoom(state.participants);
  const furnitureCrew = seated.filter((s) => !FLOOR_SEAT_INDICES.has(s.seat.index));
  const floorCrew = seated.filter((s) => FLOOR_SEAT_INDICES.has(s.seat.index));

  return (
    <div className="flex flex-col gap-3 md:hidden">
      <StackRow
        label="on the furniture"
        crew={furnitureCrew}
        slotProps={slotProps}
        backdrop={
          <SeatingScene
            emptySeatIndices={emptySeatIndices}
            crewCount={crewCount}
            compact
          />
        }
      />
      <StackRow label="on the floor" crew={floorCrew} slotProps={slotProps} />
    </div>
  );
}

function StackRow({
  label,
  crew,
  slotProps,
  backdrop,
}: {
  label: string;
  crew: { participant: Participant; seat: Seat }[];
  slotProps: (p: Participant) => Omit<SeatSlotProps, 'size'>;
  backdrop?: React.ReactNode;
}) {
  if (crew.length === 0) return null;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-couch-700 bg-couch-850/70 px-3 pb-3 pt-2 shadow-[var(--shadow-couch)]">
      {/* a soft furniture hint behind the row so it still feels like a place */}
      {backdrop && (
        <div className="pointer-events-none absolute inset-0 opacity-40" aria-hidden="true">
          {backdrop}
        </div>
      )}
      <span className="relative z-10 mb-1 block font-body text-[10px] text-cream-400">
        {label}
      </span>
      <div className="relative z-10 flex flex-row flex-wrap items-end justify-center gap-2">
        <AnimatePresence mode="popLayout">
          {crew.map(({ participant, seat }) => (
            <SeatSlot
              key={participant.id}
              {...slotProps(participant)}
              size={seat.pose === 'floor' ? 'sm' : 'md'}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

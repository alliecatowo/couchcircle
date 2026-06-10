'use client';

/**
 * ParticipantCircle — the stylized couch row that makes the room feel alive.
 *
 * Layout:
 * - A layered CSS couch (fabric body, cushions, wooden feet, soft shadow)
 * - Up to 6 ParticipantAvatars "seated" along the top seat line
 * - Beyond 6, overflow participants sit on "floor cushions" in a second row
 * - framer-motion layout animations slide people in/out as they join/leave
 *
 * Transient flourishes triggered by diffing state.events by id:
 * - 'join' event → seat-bounce animation on the new person
 * - 'pass-the-vibe' (emoji ✨) → glow wave sweeping left→right across seats
 * - 'remote' event → 📺 sparkle on the new controller
 *
 * Always-on overlays:
 * - Current controller gets a floating 📺 chip
 * - readyCheck?.active → ✅/⏳ badges per person
 * - Rotation: current turn member (rotationIds[currentRotationIndex]) gets
 *   an ember ring + slight scale
 * - Disconnected participants are 60% transparent with a floating 💤
 *   (handled in ParticipantAvatar)
 */

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useRoom } from '@/lib/realtime/room-context';
import { ParticipantAvatar } from './ParticipantAvatar';
import type { Participant } from '@/shared/protocol';

// How many people fit on the main couch row before overflow to floor cushions
const COUCH_CAPACITY = 6;

// ---------------------------------------------------------------------------
// Glow wave helper — overlays an ember sweep across all seat positions
// ---------------------------------------------------------------------------

interface GlowWaveProps {
  count: number;
  onDone: () => void;
}

function GlowWave({ count, onDone }: GlowWaveProps) {
  React.useEffect(() => {
    const t = setTimeout(onDone, 400 + count * 80 + 600);
    return () => clearTimeout(t);
  }, [count, onDone]);

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-around px-10 z-10">
      {Array.from({ length: count }, (_, i) => (
        <motion.div
          key={i}
          className="w-10 h-10 rounded-full bg-ember-400"
          initial={{ opacity: 0, scale: 0.3 }}
          animate={{ opacity: [0, 0.55, 0], scale: [0.3, 1.4, 0.3] }}
          transition={{ duration: 0.6, delay: i * 0.08, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Remote sparkle — brief 📺 burst on the seat of the new controller
// ---------------------------------------------------------------------------

function RemoteSparkle({ onDone }: { onDone: () => void }) {
  React.useEffect(() => {
    const t = setTimeout(onDone, 1200);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <motion.div
      className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 text-lg z-20 select-none"
      initial={{ opacity: 1, y: 0, scale: 1 }}
      animate={{ opacity: 0, y: -20, scale: 1.5 }}
      transition={{ duration: 0.9, ease: 'easeOut' }}
    >
      📺
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Seat-bounce wrapper — animates the avatar upward briefly on join
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
// Controller chip
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
// Ready badge (✅ or ⏳)
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
      aria-label={isReady ? 'ready' : 'not ready yet'}
    >
      {isReady ? '✅' : '⏳'}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// SeatSlot — wraps one avatar with its overlays
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
    <motion.div
      layout
      key={participant.id}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.5 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'relative flex-shrink-0',
        // Rotation turn: glowing ember ring + lift so it's unmistakably "now"
        isRotationTurn &&
          'rounded-2xl ring-2 ring-ember-400 ring-offset-2 ring-offset-couch-900 scale-110 animate-pulse-glow z-20',
      )}
    >
      {/* Controller chip */}
      <AnimatePresence>
        {isController && <ControllerChip key="controller-chip" />}
      </AnimatePresence>

      {/* Remote transfer sparkle */}
      <AnimatePresence>
        {showRemoteSparkle && <RemoteSparkle key="remote-sparkle" onDone={onSparkleEnd} />}
      </AnimatePresence>

      {/* Ready badge */}
      <AnimatePresence>
        {isReadyCheckActive && (
          <ReadyBadge key="ready-badge" isReady={participant.isReady} />
        )}
      </AnimatePresence>

      {/* Seat bounce on join */}
      <SeatBounce bounce={bounce}>
        <ParticipantAvatar participant={participant} size={size} />
      </SeatBounce>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// CouchScene — the full warm scene strip: rug, plush couch, side table + lamp.
// Pure inline SVG, no images. Avatars are positioned ON the seat line above
// this in the parent layout; the couch is sized to sit behind them.
// ---------------------------------------------------------------------------

/** Stylized PLUSH warm-fabric couch + rug + glowing side-lamp prop. */
function CouchScene({ seatWidth }: { seatWidth: number }) {
  // Couch geometry
  const couchW = Math.max(seatWidth, 380);
  const armW = 38; // chunky visible armrests
  const padTop = 24; // space above the couch back for the lamp glow to bleed in
  const backH = 64;
  const seatH = 52;
  const footH = 16;
  const lampW = 96; // reserved width on the right for the side table + lamp

  // Whole drawing canvas (couch + lamp prop + rug margin)
  const totalW = couchW + lampW;
  const totalH = padTop + backH + seatH + footH + 28;

  const couchX = 0;
  const backY = padTop;
  const seatY = padTop + backH;
  const frameBottom = seatY + seatH;

  const innerX = couchX + armW;
  const innerW = couchW - armW * 2;
  const cushions = 3;
  const cushionW = innerW / cushions;

  // Lamp anatomy (sits to the right of the couch)
  const tableX = couchW + 14;
  const tableTopY = seatY + 6;
  const tableW = 56;
  const lampBaseX = tableX + tableW / 2;
  const lampGlowY = backY - 4;

  return (
    <svg
      width={totalW}
      height={totalH}
      viewBox={`0 0 ${totalW} ${totalH}`}
      aria-hidden="true"
      className="overflow-visible"
    >
      <defs>
        <linearGradient id="couchFabric" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7a5236" />
          <stop offset="55%" stopColor="#6b4a32" />
          <stop offset="100%" stopColor="#503422" />
        </linearGradient>
        <linearGradient id="cushionTop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8a6043" />
          <stop offset="100%" stopColor="#6b4a32" />
        </linearGradient>
        <radialGradient id="rugGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#3a2f1a" stopOpacity="0.9" />
          <stop offset="70%" stopColor="#241d12" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#1a140c" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="lampPool" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f8c178" stopOpacity="0.55" />
          <stop offset="45%" stopColor="#e08b34" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#e08b34" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="lampBulb" cx="50%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#fff3d6" />
          <stop offset="60%" stopColor="#f8c178" />
          <stop offset="100%" stopColor="#e08b34" />
        </radialGradient>
        <linearGradient id="woodFoot" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7a4a22" />
          <stop offset="100%" stopColor="#4a2c12" />
        </linearGradient>
      </defs>

      {/* Warm rug ellipse pooled under the couch (moss/ember dark tones) */}
      <ellipse
        cx={couchW / 2 + 6}
        cy={frameBottom + footH + 2}
        rx={couchW * 0.62}
        ry={26}
        fill="url(#rugGlow)"
      />
      <ellipse
        cx={couchW / 2 + 6}
        cy={frameBottom + footH + 2}
        rx={couchW * 0.5}
        ry={18}
        fill="none"
        stroke="#4a3a24"
        strokeWidth={1.5}
        strokeDasharray="5 7"
        opacity={0.5}
      />

      {/* Lamp glow pool washing over the couch top-right (drawn behind couch) */}
      <ellipse
        cx={lampBaseX - 8}
        cy={lampGlowY + 30}
        rx={150}
        ry={120}
        fill="url(#lampPool)"
        className="animate-flicker"
      />

      {/* Soft drop shadow beneath the whole couch */}
      <ellipse
        cx={couchW / 2}
        cy={frameBottom + footH + 6}
        rx={couchW * 0.46}
        ry={9}
        fill="rgba(0,0,0,0.45)"
      />

      {/* Back cushions (rounded plush) */}
      <rect x={innerX - 4} y={backY} width={innerW + 8} height={backH} rx={20} fill="url(#couchFabric)" />
      {/* darker piping along the back top */}
      <rect x={innerX - 4} y={backY} width={innerW + 8} height={7} rx={6} fill="#3f2a1a" opacity={0.6} />
      {/* back-cushion divisions + plush sheen per cushion */}
      {Array.from({ length: cushions }, (_, i) => {
        const bx = innerX + cushionW * i + 4;
        const bw = cushionW - 8;
        return (
          <g key={`back-${i}`}>
            <ellipse cx={bx + bw / 2} cy={backY + 14} rx={bw / 2.4} ry={7} fill="#fff" opacity={0.1} />
            {i > 0 && (
              <line
                x1={innerX + cushionW * i}
                y1={backY + 8}
                x2={innerX + cushionW * i}
                y2={backY + backH - 8}
                stroke="#3f2a1a"
                strokeWidth={2.5}
                strokeLinecap="round"
                opacity={0.7}
              />
            )}
          </g>
        );
      })}

      {/* Seat base (the plush seat the avatars sit on) */}
      <rect x={innerX - 4} y={seatY} width={innerW + 8} height={seatH} rx={16} fill="url(#couchFabric)" />
      {/* seat-front piping */}
      <rect x={innerX - 4} y={frameBottom - 8} width={innerW + 8} height={9} rx={6} fill="#3f2a1a" opacity={0.55} />
      {/* seat cushion tops — highlight sheen so they look soft */}
      {Array.from({ length: cushions }, (_, i) => {
        const bx = innerX + cushionW * i + 5;
        const bw = cushionW - 10;
        return (
          <g key={`seat-${i}`}>
            <rect x={bx} y={seatY + 4} width={bw} height={seatH - 14} rx={12} fill="url(#cushionTop)" />
            <ellipse cx={bx + bw / 2} cy={seatY + 11} rx={bw / 2.3} ry={6} fill="#fff" opacity={0.12} />
          </g>
        );
      })}

      {/* Left + right armrests (chunky, with a top highlight) */}
      {[couchX, couchW - armW].map((ax, i) => (
        <g key={`arm-${i}`}>
          <rect x={ax} y={backY + 10} width={armW} height={backH + seatH - 10} rx={16} fill="url(#couchFabric)" />
          {/* rolled-arm top */}
          <ellipse cx={ax + armW / 2} cy={backY + 16} rx={armW / 2 - 1} ry={12} fill="#7a5236" />
          <ellipse cx={ax + armW / 2 - 3} cy={backY + 13} rx={armW / 3} ry={5} fill="#fff" opacity={0.14} />
        </g>
      ))}

      {/* Wooden feet with a light catch */}
      {[couchX + 18, couchW - 18 - 14].map((fx, i) => (
        <g key={`foot-${i}`}>
          <rect x={fx} y={frameBottom} width={14} height={footH} rx={4} fill="url(#woodFoot)" />
          <rect x={fx + 2} y={frameBottom + 2} width={3} height={footH - 5} rx={2} fill="#a8763c" opacity={0.7} />
        </g>
      ))}

      {/* ---- Side table + glowing lamp prop ---- */}
      {/* table top */}
      <ellipse cx={lampBaseX} cy={tableTopY} rx={tableW / 2} ry={9} fill="#6b4a2c" />
      <ellipse cx={lampBaseX} cy={tableTopY - 2} rx={tableW / 2 - 3} ry={6} fill="#85613b" />
      {/* table legs */}
      <rect x={tableX + 6} y={tableTopY} width={5} height={frameBottom + footH - tableTopY} rx={2} fill="#4a2c12" />
      <rect x={tableX + tableW - 11} y={tableTopY} width={5} height={frameBottom + footH - tableTopY} rx={2} fill="#4a2c12" />
      {/* lamp stand */}
      <rect x={lampBaseX - 2} y={tableTopY - 34} width={4} height={32} rx={2} fill="#8a6a44" />
      {/* lamp shade */}
      <path
        d={`M ${lampBaseX - 20} ${tableTopY - 34} L ${lampBaseX + 20} ${tableTopY - 34} L ${lampBaseX + 14} ${tableTopY - 58} L ${lampBaseX - 14} ${tableTopY - 58} Z`}
        fill="url(#lampBulb)"
        className="animate-flicker"
      />
      {/* warm glow halo around the shade */}
      <ellipse cx={lampBaseX} cy={tableTopY - 46} rx={34} ry={30} fill="url(#lampPool)" className="animate-flicker" />
      {/* steaming mug on the table */}
      <rect x={lampBaseX - 22} y={tableTopY - 12} width={11} height={9} rx={2.5} fill="#caa074" />
      <path d={`M ${lampBaseX - 11} ${tableTopY - 10} q 4 1 4 4 q 0 3 -4 3`} stroke="#caa074" strokeWidth={1.6} fill="none" />
      {/* steam */}
      <path d={`M ${lampBaseX - 18} ${tableTopY - 14} q -2 -4 0 -7`} stroke="#cbb39a" strokeWidth={1.2} fill="none" opacity={0.5} className="animate-puff" />
      <path d={`M ${lampBaseX - 14} ${tableTopY - 14} q 2 -4 0 -7`} stroke="#cbb39a" strokeWidth={1.2} fill="none" opacity={0.4} className="animate-puff" style={{ animationDelay: '1.4s' }} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// ParticipantCircle
// ---------------------------------------------------------------------------

export function ParticipantCircle() {
  const { state, selfId } = useRoom();

  // Track seen event ids so we can diff for transient flourishes
  const seenEventIds = React.useRef<Set<string>>(new Set());
  // Per-participant bounce state (set briefly on join)
  const [bouncing, setBouncing] = React.useState<Set<string>>(new Set());
  // Glow wave active?
  const [glowWave, setGlowWave] = React.useState(false);
  // Remote sparkles: participantId → show
  const [remoteSparkles, setRemoteSparkles] = React.useState<Set<string>>(new Set());

  // Process new events to fire flourishes
  React.useEffect(() => {
    if (!state) return;

    const newBounces = new Set<string>();
    let triggerGlow = false;
    const newSparkles = new Set<string>();

    for (const evt of state.events) {
      if (seenEventIds.current.has(evt.id)) continue;
      seenEventIds.current.add(evt.id);

      if (evt.kind === 'join' && evt.actorId) {
        newBounces.add(evt.actorId);
      }
      if (evt.kind === 'sesh' && evt.emoji === '✨') {
        triggerGlow = true;
      }
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
      // Clear bounces after animation duration
      setTimeout(() => {
        setBouncing((prev) => {
          const next = new Set(prev);
          for (const id of newBounces) next.delete(id);
          return next;
        });
      }, 600);
    }

    if (triggerGlow) {
      setGlowWave(true);
    }

    if (newSparkles.size > 0) {
      setRemoteSparkles((prev) => {
        const next = new Set(prev);
        for (const id of newSparkles) next.add(id);
        return next;
      });
    }
  }, [state]);

  // Guard: nothing to render without state
  if (!state) {
    return (
      <div className="flex items-center justify-center h-24 text-cream-400 text-sm font-body">
        waiting for the room…
      </div>
    );
  }

  // Sort participants by joinedAt ascending (order of joining = seat order)
  const participants: Participant[] = Object.values(state.participants).sort(
    (a, b) => a.joinedAt - b.joinedAt,
  );

  const couchRow = participants.slice(0, COUCH_CAPACITY);
  const floorRow = participants.slice(COUCH_CAPACITY);

  const { sesh, readyCheck, remote } = state;
  const isReadyCheckActive = readyCheck?.active ?? false;
  const currentRotationId =
    sesh.rotationActive && sesh.rotationIds.length > 0
      ? sesh.rotationIds[sesh.currentRotationIndex % sesh.rotationIds.length]
      : null;

  // Estimate couch width based on how many are seated. Avatars are ~88px on
  // the seat, so reserve ~100px per person plus armrest room.
  const seatCount = Math.min(couchRow.length, COUCH_CAPACITY);
  const seatWidth = Math.max(seatCount * 100 + 96, 420);

  function handleSparkleEnd(id: string) {
    setRemoteSparkles((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  return (
    <div
      className={cn(
        'relative w-full select-none overflow-hidden',
        'rounded-3xl border border-couch-700 grain',
        // warm room-floor wash behind the whole scene
        'bg-gradient-to-b from-couch-850 via-couch-900 to-couch-950',
        'shadow-[var(--shadow-couch)]',
        'px-4 pt-5 pb-4',
      )}
    >
      {/* ambient lamp-amber bleed in the top-right corner of the scene */}
      <div
        className="pointer-events-none absolute -right-10 -top-16 h-56 w-72 rounded-full opacity-60 blur-2xl animate-flicker"
        style={{ background: 'radial-gradient(closest-side, rgba(240,139,52,0.28), transparent)' }}
        aria-hidden="true"
      />

      <div className="relative z-10 flex flex-col items-center gap-3">
        {/* Couch row — avatars sit ON the seat line (overlapping the couch) */}
        <div className="relative mx-auto" style={{ width: seatWidth + 96 }}>
          {/* The couch scene graphic (behind the people) */}
          <div className="relative">
            <CouchScene seatWidth={seatWidth} />
          </div>

          {/* Glow wave overlay */}
          <AnimatePresence>
            {glowWave && (
              <GlowWave
                key="glow-wave"
                count={couchRow.length}
                onDone={() => setGlowWave(false)}
              />
            )}
          </AnimatePresence>

          {/* Avatar row — absolutely positioned to sit on the seat line.
              bottom offset places feet on the cushions; left padding keeps
              them clear of the armrests and the lamp table on the right. */}
          <div
            className="absolute inset-x-0 z-20 flex flex-row items-end justify-center gap-2"
            style={{ bottom: 34, paddingRight: 96 }}
          >
            <AnimatePresence mode="popLayout">
              {couchRow.map((p) => (
                <SeatSlot
                  key={p.id}
                  participant={p}
                  isController={remote.controllerId === p.id}
                  isReadyCheckActive={isReadyCheckActive}
                  isRotationTurn={currentRotationId === p.id}
                  bounce={bouncing.has(p.id)}
                  showRemoteSparkle={remoteSparkles.has(p.id)}
                  onSparkleEnd={() => handleSparkleEnd(p.id)}
                  size="md"
                />
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Floor cushions — overflow participants */}
        <AnimatePresence>
          {floorRow.length > 0 && (
            <motion.div
              key="floor-row"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.3 }}
              className={cn(
                'flex flex-row flex-wrap items-end justify-center gap-2',
                'rounded-2xl bg-couch-850/80 border border-couch-700 px-4 py-3',
                'shadow-[var(--shadow-couch)]',
              )}
            >
              <span className="text-[11px] font-body text-cream-300 self-center mr-1 whitespace-nowrap">
                floor crew:
              </span>
              <AnimatePresence mode="popLayout">
                {floorRow.map((p) => (
                  <SeatSlot
                    key={p.id}
                    participant={p}
                    isController={remote.controllerId === p.id}
                    isReadyCheckActive={isReadyCheckActive}
                    isRotationTurn={currentRotationId === p.id}
                    bounce={bouncing.has(p.id)}
                    showRemoteSparkle={remoteSparkles.has(p.id)}
                    onSparkleEnd={() => handleSparkleEnd(p.id)}
                    size="sm"
                  />
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Self-hint: click your own avatar to set status */}
        {selfId && state.participants[selfId] && (
          <p className="text-[10px] font-body text-cream-400 text-center">
            click your avatar to change your vibe
          </p>
        )}
      </div>
    </div>
  );
}

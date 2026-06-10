'use client';

/**
 * MomentLayer — synchronized ambient "moments" (SPRINT2 §8 + §12 payoff pipeline).
 *
 * Zero-prop, mounted in RoomShell above everything (incl. theater). Diffs
 * `state.events` by id (the existing seen-ids pattern) and plays full-viewport,
 * GPU-cheap (opacity/transform only) 2–4s ambient filter moments — never blocking
 * input (`pointer-events-none`), respecting `prefers-reduced-motion` (opacity-only).
 *
 * Subtle > loud. These are the synchronized payoff every ritual lands on:
 *   - spark hits zero      → slow smoke haze wash + ember bloom
 *   - toast clink          → warm amber flash + floating 🥂 burst
 *   - everyone's ready     → soft golden pulse
 *   - sip roulette result  → suspense sweep + result flash
 *   - movie bingo          → popcorn burst (big finale on the fifth)
 *   - pass-the-vibe        → viewport-edge ripple (echoes the seat glow wave)
 *
 * Animations are driven entirely by framer-motion keyframes (no new global CSS),
 * so this stays GPU-cheap (transform/opacity only) and self-contained. Matches the
 * server event strings (ARCHITECTURE §7 + SPRINT2 §12); detection is by `emoji`
 * plus a substring of `text` so a server copy tweak can't silently break a payoff.
 */

import * as React from 'react';
import { motion } from 'framer-motion';
import { useRoom } from '@/lib/realtime/room-context';
import type { RoomEvent } from '@/shared/protocol';

// ---------------------------------------------------------------------------
// prefers-reduced-motion — collapse to opacity-only
// ---------------------------------------------------------------------------

function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return reduced;
}

// ---------------------------------------------------------------------------
// Moment kinds
// ---------------------------------------------------------------------------

type MomentKind =
  | 'spark'
  | 'clink'
  | 'ready'
  | 'roulette'
  | 'bingo'
  | 'bingo-finale'
  | 'vibe';

interface ActiveMoment {
  key: string;
  kind: MomentKind;
}

const MOMENT_DURATION_MS: Record<MomentKind, number> = {
  spark: 4000,
  clink: 2600,
  ready: 2200,
  roulette: 3000,
  bingo: 2400,
  'bingo-finale': 3600,
  vibe: 2000,
};

// ---------------------------------------------------------------------------
// Event → moment classification (matches server strings)
// ---------------------------------------------------------------------------

function classify(evt: RoomEvent): MomentKind | null {
  const text = evt.text ?? '';
  const lower = text.toLowerCase();
  const emoji = evt.emoji ?? '';

  // spark hits zero — "💨 BLAZE IT — the room sparked together"
  if (text.includes('BLAZE IT') || emoji === '💨') return 'spark';

  // toast clink — "🥂 CLINK — the whole couch raised one"
  if (text.includes('CLINK') || (emoji === '🥂' && lower.includes('raised'))) return 'clink';

  // everyone's ready — "🟢 Everyone's ready"
  if (
    (evt.kind === 'ready' || emoji === '🟢') &&
    lower.includes('ready') &&
    lower.includes('everyone')
  )
    return 'ready';

  // sip roulette result — "fate says {name} takes a sip 🎲"
  if (lower.includes('fate says') || (emoji === '🎲' && lower.includes('sip'))) return 'roulette';

  // movie bingo — "🍿 BINGO: {trigger} — everybody sips"
  if (text.includes('BINGO')) {
    if (lower.includes('full card') || lower.includes('finale')) return 'bingo-finale';
    return 'bingo';
  }

  // pass-the-vibe — sesh event flavored with ✨
  if (evt.kind === 'sesh' && emoji === '✨') return 'vibe';

  return null;
}

// ---------------------------------------------------------------------------
// MomentLayer
// ---------------------------------------------------------------------------

export function MomentLayer() {
  const { state } = useRoom();
  const reduced = useReducedMotion();
  const seenEventIds = React.useRef<Set<string>>(new Set());
  const initialized = React.useRef(false);
  const [moments, setMoments] = React.useState<ActiveMoment[]>([]);

  React.useEffect(() => {
    if (!state) return;

    // First state just records what's already there — we never replay history as
    // a barrage of moments on join.
    if (!initialized.current) {
      for (const evt of state.events) seenEventIds.current.add(evt.id);
      initialized.current = true;
      return;
    }

    const fresh: ActiveMoment[] = [];
    for (const evt of state.events) {
      if (seenEventIds.current.has(evt.id)) continue;
      seenEventIds.current.add(evt.id);
      const kind = classify(evt);
      if (kind) fresh.push({ key: `${evt.id}:${kind}`, kind });
    }
    if (fresh.length === 0) return;

    setMoments((prev) => [...prev, ...fresh]);
    for (const m of fresh) {
      const dur = MOMENT_DURATION_MS[m.kind];
      window.setTimeout(() => {
        setMoments((prev) => prev.filter((x) => x.key !== m.key));
      }, dur);
    }
  }, [state]);

  if (moments.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden>
      {moments.map((m) => (
        <Moment key={m.key} kind={m.kind} reduced={reduced} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Moment — the per-kind visual
// ---------------------------------------------------------------------------

function Moment({ kind, reduced }: { kind: MomentKind; reduced: boolean }) {
  switch (kind) {
    case 'spark':
      return <SparkMoment reduced={reduced} />;
    case 'clink':
      return <ClinkMoment reduced={reduced} />;
    case 'ready':
      return <ReadyMoment />;
    case 'roulette':
      return <RouletteMoment reduced={reduced} />;
    case 'bingo':
      return <BingoMoment finale={false} reduced={reduced} />;
    case 'bingo-finale':
      return <BingoMoment finale reduced={reduced} />;
    case 'vibe':
      return <VibeMoment reduced={reduced} />;
  }
}

// Per-burst jitter — this component only mounts after an event (client-only), so
// Math.random here is SSR-safe.
interface Particle {
  left: number;
  delay: number;
  drift: number;
  dur: number;
  size: number;
  tx: number;
  ty: number;
}

function useParticles(count: number, spread = 110, lift = 70): Particle[] {
  return React.useMemo(
    () =>
      Array.from({ length: count }, () => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.5,
        drift: (Math.random() - 0.5) * 60,
        dur: 1.8 + Math.random() * 1.3,
        size: 0.8 + Math.random() * 0.9,
        tx: (Math.random() - 0.5) * spread,
        ty: (Math.random() - 0.7) * lift,
      })),
    // count is the stable seed; recomputing per mount is the intent
    [count, spread, lift],
  );
}

// ── spark — smoke haze wash + ember bloom + rising puffs ─────────────────────

function SparkMoment({ reduced }: { reduced: boolean }) {
  const puffs = useParticles(7);
  return (
    <>
      <motion.div
        className="absolute inset-0 bg-gradient-to-t from-haze-900/35 via-haze-800/12 to-transparent"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{ duration: 4, times: [0, 0.18, 0.7, 1], ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-[-20%] left-1/2 h-[60vmin] w-[60vmin] -translate-x-1/2 rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(242,168,80,0.22) 0%, rgba(224,139,52,0.10) 40%, transparent 70%)',
        }}
        initial={{ opacity: 0, scale: reduced ? 1 : 0.6 }}
        animate={{ opacity: [0, 0.9, 0], scale: reduced ? 1 : [0.6, 1.15, 1.3] }}
        transition={{ duration: 3.4, ease: 'easeOut' }}
      />
      {!reduced &&
        puffs.map((p, i) => (
          <motion.span
            key={i}
            className="absolute bottom-0 select-none"
            style={{ left: `${p.left}%`, fontSize: `${p.size * 2}rem` }}
            initial={{ opacity: 0, y: 0, x: 0 }}
            animate={{ opacity: [0, 0.5, 0], y: '-70vh', x: p.drift }}
            transition={{ duration: p.dur + 1.6, delay: p.delay, ease: 'easeOut' }}
          >
            💨
          </motion.span>
        ))}
    </>
  );
}

// ── clink — warm amber flash + floating 🥂 burst ─────────────────────────────

function ClinkMoment({ reduced }: { reduced: boolean }) {
  const glasses = useParticles(10);
  return (
    <>
      <motion.div
        className="absolute inset-0 bg-ember-500/18"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: 0.9, times: [0, 0.2, 1], ease: 'easeOut' }}
      />
      {!reduced &&
        glasses.map((g, i) => (
          <motion.span
            key={i}
            className="absolute bottom-[20%] select-none"
            style={{ left: `${g.left}%`, fontSize: `${g.size * 1.8}rem` }}
            initial={{ opacity: 0, y: 0, scale: 0.6 }}
            animate={{ opacity: [0, 1, 0], y: '-40vh', x: g.drift, scale: 1 }}
            transition={{ duration: g.dur, delay: g.delay, ease: 'easeOut' }}
          >
            🥂
          </motion.span>
        ))}
    </>
  );
}

// ── ready — soft golden pulse ────────────────────────────────────────────────

function ReadyMoment() {
  return (
    <motion.div
      className="absolute inset-0"
      style={{
        background:
          'radial-gradient(circle at 50% 45%, rgba(121,169,127,0.20) 0%, rgba(86,133,95,0.06) 45%, transparent 70%)',
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 0.7, 0] }}
      transition={{ duration: 2.2, times: [0, 0.25, 0.6, 1], ease: 'easeInOut' }}
    />
  );
}

// ── roulette — suspense sweep + result flash ─────────────────────────────────

function RouletteMoment({ reduced }: { reduced: boolean }) {
  return (
    <>
      {!reduced && (
        <motion.div
          className="absolute inset-y-0 w-[40vw] bg-gradient-to-r from-transparent via-ember-400/15 to-transparent"
          initial={{ left: '-40vw' }}
          animate={{ left: ['-40vw', '100vw'] }}
          transition={{ duration: 2.2, ease: 'easeInOut' }}
        />
      )}
      <motion.div
        className="absolute inset-0 bg-ember-500/14"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 1, 0] }}
        transition={{ duration: 3, times: [0, 0.72, 0.82, 1], ease: 'easeOut' }}
      />
    </>
  );
}

// ── bingo — popcorn burst (finale = bigger, longer) ──────────────────────────

function BingoMoment({ finale, reduced }: { finale: boolean; reduced: boolean }) {
  const corn = useParticles(
    finale ? 22 : 12,
    finale ? 160 : 110,
    finale ? 90 : 70,
  );
  return (
    <>
      {finale && (
        <motion.div
          className="absolute inset-0 bg-moss-500/16"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
        />
      )}
      {!reduced &&
        corn.map((c, i) => (
          <motion.span
            key={i}
            className="absolute left-1/2 top-1/2 select-none"
            style={{ fontSize: `${c.size * (finale ? 2 : 1.5)}rem` }}
            initial={{ opacity: 0, x: 0, y: 0, scale: 0.5 }}
            animate={{
              opacity: [0, 1, 1, 0],
              x: `${c.tx}vw`,
              y: `${c.ty}vh`,
              scale: 1,
              rotate: c.drift,
            }}
            transition={{ duration: c.dur, delay: c.delay, ease: 'easeOut' }}
          >
            🍿
          </motion.span>
        ))}
    </>
  );
}

// ── vibe — viewport-edge ripple (echoes the seat glow wave) ──────────────────

function VibeMoment({ reduced }: { reduced: boolean }) {
  return (
    <motion.div
      className="absolute inset-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 0] }}
      transition={{ duration: 2, ease: 'easeInOut' }}
      style={{
        boxShadow: reduced
          ? 'inset 0 0 80px rgba(242,168,80,0.18)'
          : 'inset 0 0 120px rgba(242,168,80,0.22), inset 0 0 40px rgba(224,139,52,0.16)',
      }}
    />
  );
}

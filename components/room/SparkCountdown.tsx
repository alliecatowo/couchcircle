'use client';

/**
 * SparkCountdown — the synchronized "everyone hits together" moment (§12).
 *
 * When `sesh.sparkCountdownEndsAt` is in the future we render a huge centered
 * count (ceil of the remaining seconds) ticking against the SERVER clock, with
 * drifting smoke + an ember glow and a scale-pop on every tick. At zero we burst
 * a brief "BLAZE IT 🔥" before fading out.
 *
 * Pure social-ritual flavor — never consumption advice.
 */

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRoom } from '@/lib/realtime/room-context';

/** How long the "BLAZE IT" burst lingers after the count hits zero. */
const BURST_MS = 1200;

export function SparkCountdown() {
  const { state, serverNow } = useRoom();
  const endsAt = state?.sesh.sparkCountdownEndsAt;

  // Remaining whole seconds (ceil), re-derived on a 200ms tick against serverNow.
  const [remaining, setRemaining] = React.useState<number>(() =>
    endsAt ? Math.max(0, Math.ceil((endsAt - serverNow()) / 1000)) : 0,
  );
  // Stays true for a beat after the count reaches zero so we can flash "BLAZE IT".
  const [bursting, setBursting] = React.useState(false);

  React.useEffect(() => {
    if (!endsAt) {
      setRemaining(0);
      setBursting(false);
      return;
    }

    let burstTimer: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      const secs = Math.max(0, Math.ceil((endsAt - serverNow()) / 1000));
      setRemaining(secs);
      if (secs <= 0 && !burstTimer) {
        setBursting(true);
        burstTimer = setTimeout(() => setBursting(false), BURST_MS);
      }
    };

    tick();
    const id = setInterval(tick, 200);
    return () => {
      clearInterval(id);
      if (burstTimer) clearTimeout(burstTimer);
    };
  }, [endsAt, serverNow]);

  const counting = !!endsAt && remaining > 0;
  const show = counting || bursting;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="spark-overlay"
          // a CSS container so the number/burst size against THIS box (the
          // bezel interior, since we're absolute inset-0 inside the picture) via
          // cqmin units — that keeps the count centered in the bezel and never
          // clipped against the picture's overflow-hidden on short windows,
          // where a vh-based size would overshoot a small letterboxed TV.
          className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center [container-type:size]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* warm haze/ember wash behind the number */}
          <div
            className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(240,139,52,0.22),rgba(16,11,9,0.55)_70%)]"
            aria-hidden
          />
          {/* drifting smoke puffs */}
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="animate-puff absolute bottom-10 size-10 rounded-full bg-haze-400/20 blur-md"
              style={{ left: `${15 + i * 17}%`, animationDelay: `${i * 0.5}s` }}
              aria-hidden
            />
          ))}

          {counting ? (
            <AnimatePresence mode="popLayout">
              <motion.div
                key={remaining}
                // sized off the bezel (cqmin), capped so even the 1.5× exit
                // scale stays inside the picture's overflow-hidden.
                className="font-display text-[clamp(3.5rem,38cqmin,11rem)] font-semibold leading-none text-ember-300 drop-shadow-[0_0_28px_rgba(240,139,52,0.6)]"
                initial={{ scale: 0.55, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 1.5, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 18 }}
              >
                {remaining}
              </motion.div>
            </AnimatePresence>
          ) : (
            <motion.div
              key="blaze"
              // "blaze it 🔥" is wider than a single digit, so size it smaller
              // off the bezel (cqmin) and keep it on one line; even the 1.2×
              // peak of the burst stays inside the picture frame. px-4 gives the
              // glyphs breathing room so the burst never clips at the edges.
              className="whitespace-nowrap px-4 text-center font-display text-[clamp(2rem,14cqmin,5.5rem)] font-bold uppercase tracking-tight text-ember-300 drop-shadow-[0_0_40px_rgba(240,139,52,0.8)]"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: [0.4, 1.2, 1], opacity: 1 }}
              transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
            >
              blaze it 🔥
            </motion.div>
          )}

          {counting && (
            <p className="relative z-10 mt-4 font-body text-sm text-cream-300">
              everyone hits together…
            </p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

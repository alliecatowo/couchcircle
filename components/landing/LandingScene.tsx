'use client';

import * as React from 'react';
import { AvatarSprite } from '@/components/avatars';
import type { AvatarId } from '@/shared/protocol';
import type { AvatarMood } from '@/components/avatars';

// ---------------------------------------------------------------------------
// Deterministic pseudo-random helper (seeded so moods don't change on re-render
// but feel varied across sessions via a small build-time seed offset).
// ---------------------------------------------------------------------------
function seededRand(seed: number): number {
  // xorshift32 — good enough for animation offsets
  let x = seed ^ 0x9e3779b9;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  return (x >>> 0) / 0xffffffff;
}

// Three idle avatars sitting on the couch with randomized but stable moods.
const COUCH_AVATARS: Array<{
  id: AvatarId;
  mood: AvatarMood;
  accent: string;
  bobDelay: string;
  bobDuration: string;
}> = [
  {
    id: 'goblin',
    mood: 'idle',
    accent: '#f5b14c',
    bobDelay: `${(seededRand(1) * 1.5).toFixed(2)}s`,
    bobDuration: `${(4.2 + seededRand(2) * 1.5).toFixed(2)}s`,
  },
  {
    id: 'frog',
    mood: 'happy',
    accent: '#6f8f6a',
    bobDelay: `${(seededRand(3) * 1.5).toFixed(2)}s`,
    bobDuration: `${(4.2 + seededRand(4) * 1.5).toFixed(2)}s`,
  },
  {
    id: 'blanket',
    mood: 'sleepy',
    accent: '#9b7fc4',
    bobDelay: `${(seededRand(5) * 1.5).toFixed(2)}s`,
    bobDuration: `${(4.2 + seededRand(6) * 1.5).toFixed(2)}s`,
  },
];

// Smoke puffs drifting up from the scene.
const PUFFS = [
  { left: '38%', delay: '0s', duration: '3.4s', size: 10 },
  { left: '42%', delay: '1.3s', duration: '3.8s', size: 7 },
  { left: '35%', delay: '2.1s', duration: '4.0s', size: 9 },
  { left: '45%', delay: '0.7s', duration: '3.2s', size: 6 },
];

/**
 * Decorative living-room scene for the landing page. Contains an SVG couch,
 * a flickering lamp glow, drifting smoke puffs, and three idle AvatarSprites.
 * Pure presentational — no props required.
 */
export function LandingScene() {
  return (
    <div
      className="relative mx-auto w-full max-w-2xl select-none"
      aria-hidden="true"
    >
      {/* ---- Lamp glow (top-right ambient light) ------------------------------ */}
      <div
        className="pointer-events-none absolute right-8 top-2 h-32 w-32 rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(240,139,52,0.28) 0%, rgba(240,139,52,0.08) 50%, transparent 72%)',
          animation: 'flicker 4.2s steps(1,end) infinite',
          animationDelay: '0.3s',
        }}
      />

      {/* ---- Smoke puffs (rise from between the avatars) ---------------------- */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {PUFFS.map((p, i) => (
          <div
            key={i}
            className="absolute bottom-16 rounded-full bg-haze-500/20 blur-sm"
            style={{
              left: p.left,
              width: p.size,
              height: p.size,
              animation: `puff ${p.duration} ease-out infinite`,
              animationDelay: p.delay,
            }}
          />
        ))}
      </div>

      {/* ---- Couch (CSS / inline SVG) ---------------------------------------- */}
      <div className="relative z-10 px-4">
        {/* Avatars seated on the couch */}
        <div className="flex items-end justify-center gap-6 pb-2">
          {COUCH_AVATARS.map((av) => (
            <div
              key={av.id}
              className="animate-float-bob"
              style={{
                animationDelay: av.bobDelay,
                animationDuration: av.bobDuration,
              }}
            >
              <AvatarSprite
                avatar={av.id}
                accent={av.accent}
                mood={av.mood}
                size={72}
              />
            </div>
          ))}
        </div>

        {/* The couch body */}
        <CouchSVG />
      </div>

      {/* ---- Floor shadow ---------------------------------------------------- */}
      <div
        className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 h-4 w-4/5 rounded-full blur-xl"
        style={{ background: 'rgba(0,0,0,0.45)' }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline SVG couch — warm, cartoon-ish, cozy
// ---------------------------------------------------------------------------
function CouchSVG() {
  return (
    <svg
      viewBox="0 0 480 120"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-auto max-h-28 drop-shadow-lg"
      role="img"
      aria-label="a cozy couch"
    >
      {/* Couch body / seat */}
      <rect x="40" y="60" width="400" height="52" rx="18"
        fill="#2f2420" stroke="#4a3a32" strokeWidth="1.5" />

      {/* Seat cushions */}
      <rect x="55" y="62" width="118" height="42" rx="14"
        fill="#3a2d27" stroke="#4a3a32" strokeWidth="1" />
      <rect x="181" y="62" width="118" height="42" rx="14"
        fill="#3a2d27" stroke="#4a3a32" strokeWidth="1" />
      <rect x="307" y="62" width="118" height="42" rx="14"
        fill="#3a2d27" stroke="#4a3a32" strokeWidth="1" />

      {/* Back rest */}
      <rect x="40" y="32" width="400" height="36" rx="14"
        fill="#261d19" stroke="#3a2d27" strokeWidth="1.5" />

      {/* Back cushions */}
      <rect x="55" y="34" width="118" height="28" rx="10"
        fill="#2f2420" stroke="#3a2d27" strokeWidth="1" />
      <rect x="181" y="34" width="118" height="28" rx="10"
        fill="#2f2420" stroke="#3a2d27" strokeWidth="1" />
      <rect x="307" y="34" width="118" height="28" rx="10"
        fill="#2f2420" stroke="#3a2d27" strokeWidth="1" />

      {/* Left arm */}
      <rect x="24" y="40" width="28" height="72" rx="12"
        fill="#261d19" stroke="#3a2d27" strokeWidth="1.5" />
      {/* Right arm */}
      <rect x="428" y="40" width="28" height="72" rx="12"
        fill="#261d19" stroke="#3a2d27" strokeWidth="1.5" />

      {/* Legs */}
      <rect x="60" y="108" width="14" height="12" rx="4"
        fill="#1f1815" stroke="#3a2d27" strokeWidth="1" />
      <rect x="406" y="108" width="14" height="12" rx="4"
        fill="#1f1815" stroke="#3a2d27" strokeWidth="1" />

      {/* Ember accent stitching on arm caps */}
      <line x1="28" y1="46" x2="48" y2="46"
        stroke="#c06d25" strokeWidth="0.8" strokeLinecap="round" opacity="0.6" />
      <line x1="432" y1="46" x2="452" y2="46"
        stroke="#c06d25" strokeWidth="0.8" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

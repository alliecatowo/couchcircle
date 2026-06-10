'use client';

/**
 * Avatar system — §13 of ARCHITECTURE.md.
 *
 * Six pure SVG creatures with mood-driven expressions and idle animations.
 * All idle animations vary per-instance via inline style (hash of accent + avatarId)
 * so the room never moves in lockstep, and SSR/hydration stays stable.
 *
 * Consumers: import everything from '@/components/avatars'.
 */

import React from 'react';
import type { AvatarId, ParticipantStatus } from '@/shared/protocol';

import { GoblinAvatar } from './goblin';
import { FrogAvatar } from './frog';
import { CatAvatar } from './cat';
import { ChinchillaAvatar } from './chinchilla';
import { SproutAvatar } from './sprout';
import { BlanketAvatar } from './blanket';

// ---------------------------------------------------------------------------
// AvatarMood type
// ---------------------------------------------------------------------------

export type AvatarMood =
  | 'idle'
  | 'happy'
  | 'hyped'
  | 'sleepy'
  | 'melted'
  | 'focused'
  | 'away'
  | 'thirsty'
  | 'buffering'
  | 'lit';

// ---------------------------------------------------------------------------
// statusToMood — §13 exact mapping
// chilling→idle, laughing→happy, sparking|hitting→lit, rolling→focused,
// locked-in→focused, couchlocked→melted, afk→sleepy, snack-run→away,
// needs-water→thirsty, buffering→buffering
// ---------------------------------------------------------------------------

export function statusToMood(status: ParticipantStatus): AvatarMood {
  switch (status) {
    case 'chilling':    return 'idle';
    case 'laughing':    return 'happy';
    case 'sparking':    return 'lit';
    case 'hitting':     return 'lit';
    case 'rolling':     return 'focused';
    case 'locked-in':   return 'focused';
    case 'couchlocked': return 'melted';
    case 'afk':         return 'sleepy';
    case 'snack-run':   return 'away';
    case 'needs-water': return 'thirsty';
    case 'buffering':   return 'buffering';
    default: {
      // exhaustive check — TypeScript will error if a new status is unhandled
      const _exhaustive: never = status;
      return 'idle';
    }
  }
}

// ---------------------------------------------------------------------------
// Stable per-instance timing hash
// Produces a deterministic 0..1 float from a seed string (avatar + accent).
// Uses a cheap djb2-style hash — no randomness at render time for SSR safety.
// ---------------------------------------------------------------------------

function stableHash(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h) ^ seed.charCodeAt(i);
    h |= 0; // keep it 32-bit signed
  }
  // map to 0..1 (unsigned)
  return ((h >>> 0) % 10000) / 10000;
}

// ---------------------------------------------------------------------------
// AVATAR_COMPONENTS record
// ---------------------------------------------------------------------------

export const AVATAR_COMPONENTS: Record<
  AvatarId,
  React.FC<{ accent: string; mood: AvatarMood; size: number }>
> = {
  goblin:     GoblinAvatar,
  frog:       FrogAvatar,
  cat:        CatAvatar,
  chinchilla: ChinchillaAvatar,
  sprout:     SproutAvatar,
  blanket:    BlanketAvatar,
};

// ---------------------------------------------------------------------------
// AvatarSprite — the public component
// ---------------------------------------------------------------------------

interface AvatarSpriteProps {
  avatar: AvatarId;
  accent: string;
  mood?: AvatarMood;
  size?: number;
}

/**
 * Renders the correct creature SVG with mood-driven expressions and idle animations.
 * Idle animation timing is stable across renders (derived from avatar + accent hash).
 */
export function AvatarSprite({
  avatar,
  accent,
  mood = 'idle',
  size = 64,
}: AvatarSpriteProps): React.ReactElement {
  const Creature = AVATAR_COMPONENTS[avatar];

  // Stable per-instance timing so each avatar has its own rhythm without
  // using Math.random() at render time (which would break SSR hydration).
  const seed = `${avatar}:${accent}`;
  const t = stableHash(seed);

  // idle bob/sway: duration varies ±1s around a base, delay 0..2s
  const bobDuration = `${3.8 + t * 2}s`;
  const swayDuration = `${5 + t * 2.5}s`;
  const animDelay = `${-t * 2}s`;

  // Only apply ambient motion in idle/happy/focused moods; melted/sleepy etc.
  // have their own distinctive postures and shouldn't also be bobbing.
  const ambientMoods: AvatarMood[] = ['idle', 'happy', 'focused', 'thirsty'];
  const isAmbient = ambientMoods.includes(mood);

  const wrapperStyle: React.CSSProperties = isAmbient
    ? {
        display: 'inline-block',
        animation: `float-bob ${bobDuration} ease-in-out infinite`,
        animationDelay: animDelay,
      }
    : {
        display: 'inline-block',
      };

  // For sprout / blanket we add a gentle sway instead of (or additionally to) bob
  const needsSway = avatar === 'sprout' || avatar === 'blanket';
  const innerStyle: React.CSSProperties =
    isAmbient && needsSway
      ? {
          display: 'block',
          animation: `sway ${swayDuration} ease-in-out infinite`,
          animationDelay: `${-t * 1.5}s`,
          transformOrigin: 'bottom center',
        }
      : { display: 'block' };

  return (
    <span style={wrapperStyle}>
      <span style={innerStyle}>
        <Creature accent={accent} mood={mood} size={size} />
      </span>
    </span>
  );
}

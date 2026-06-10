/**
 * CouchCircle — shared tunables and presentation metadata (§5 of ARCHITECTURE.md).
 *
 * Pure constants shared by the server, sync engine, and UI. No runtime
 * dependencies beyond the protocol types, so safe to import anywhere
 * (workerd / Node / browser).
 */

import type { AvatarId, ParticipantStatus } from '@/shared/protocol';

// ---------------------------------------------------------------------------
// Timing & sync tunables
// ---------------------------------------------------------------------------

/** Scheduled-start lead so everyone starts together (all clients get the cue before t=0). */
export const PLAY_LEAD_MS = 450;
/** Controller truth cadence — how often the controller emits a `media:heartbeat`. */
export const HEARTBEAT_MS = 2500;
/** Client ↔ server ping cadence used to estimate the clock offset. */
export const PING_INTERVAL_MS = 10_000;
/** Imperceptible drift threshold — below this (ms) we're synced, ignore. */
export const DRIFT_SOFT_MS = 150;
/** Annoying drift threshold — at or above this (ms) we hard-seek back into sync. */
export const DRIFT_HARD_MS = 750;
/** Gentle catch-up rate delta — inaudible pitch change that nudges a drifting client. */
export const RATE_NUDGE = 0.05;
/** The seat map cap (§4 of CONCEPTS.md) — 12 seats, no overflow, no arbitrary number. */
export const MAX_PARTICIPANTS = 12;
/** P2P mesh quality cliff — warn above this many viewers that screen-share may degrade. */
export const MESH_COMFORT_LIMIT = 5;
/** A vibe, not an archive — max chat messages retained in room state (oldest dropped). */
export const MAX_CHAT = 100;
/** A vibe, not an archive — max activity events retained in room state (oldest dropped). */
export const MAX_EVENTS = 80;
/** Refresh ≠ leaving — grace window before a disconnected participant is removed. */
export const DISCONNECT_GRACE_MS = 60_000;
/** Long enough to inhale, short enough to stay funny — default spark-countdown in seconds. */
export const SPARK_DEFAULT_SECONDS = 5;
/** A vote, not a meeting — how long a snack-run vote stays open. */
export const SNACK_VOTE_WINDOW_MS = 30_000;
/** Fallback PartyKit host when NEXT_PUBLIC_PARTYKIT_HOST is unset. */
export const DEFAULT_PARTYKIT_HOST = '127.0.0.1:1999';

/** Demo/sample media used by the demo room and queue empty-state quick-adds. */
export const SAMPLE_VIDEOS = {
  mp4: 'https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_640x360.m4v',
  hls: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  youtube: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
} as const;

/** Quick reaction emojis offered in the chat reaction bar. */
export const REACTION_EMOJIS = ['🔥', '💨', '😂', '🛋️', '🍿', '💚', '😵‍💫', '👏'] as const;

// ---------------------------------------------------------------------------
// Status presentation
// ---------------------------------------------------------------------------

/** Human label + emoji for every {@link ParticipantStatus}. */
export const STATUS_META: Record<ParticipantStatus, { label: string; emoji: string }> = {
  'chilling': { label: 'Chilling', emoji: '😌' },
  'rolling': { label: 'Rolling', emoji: '🍃' },
  'sparking': { label: 'Sparking', emoji: '🔥' },
  'hitting': { label: 'Hitting', emoji: '💨' },
  'snack-run': { label: 'Snack Run', emoji: '🍿' },
  'couchlocked': { label: 'Couchlocked', emoji: '🛋️' },
  'locked-in': { label: 'Locked In', emoji: '🎯' },
  'afk': { label: 'AFK', emoji: '💤' },
  'needs-water': { label: 'Needs Water', emoji: '💧' },
  'laughing': { label: 'Laughing', emoji: '😂' },
  'buffering': { label: 'Buffering', emoji: '🌀' },
};

// ---------------------------------------------------------------------------
// Avatar presentation
// ---------------------------------------------------------------------------

/** All six avatar ids, in picker order. */
export const AVATAR_IDS: AvatarId[] = ['goblin', 'frog', 'cat', 'chinchilla', 'sprout', 'blanket'];

/** Display label + a cozy one-line blurb for every {@link AvatarId}. */
export const AVATAR_META: Record<AvatarId, { label: string; blurb: string }> = {
  'goblin': { label: 'Couch Goblin', blurb: 'Lives in the cushions, surfaces only for snacks.' },
  'frog': { label: 'Pond Frog', blurb: 'Damp, content, and weirdly good at vibes.' },
  'cat': { label: 'Window Cat', blurb: 'Watches the night and judges your queue softly.' },
  'chinchilla': { label: 'Dusty Chinchilla', blurb: 'Soft, fast, and perpetually a little blissed out.' },
  'sprout': { label: 'Lil Sprout', blurb: 'New to the couch, growing toward the lamp light.' },
  'blanket': { label: 'Blanket Person', blurb: 'Just two eyes and a heartbeat under a warm throw.' },
};

// ---------------------------------------------------------------------------
// Accent palette
// ---------------------------------------------------------------------------

/**
 * Eight warm hex accents matching the late-night living-room palette in
 * DESIGN.md — tuned BRIGHTER so they read clearly as text/tints on the deep
 * couch-900 background (the muddier originals vanished on dark). Each still
 * stays in the warm/cozy lane: ember orange, marigold, clay coral, rose,
 * lilac haze, fresh moss, teal sage, sand cream. Used to tint avatars, name
 * plates, and reaction flourishes.
 */
export const ACCENT_COLORS: string[] = [
  '#ff9d3d', // ember orange
  '#ffc24b', // marigold
  '#ff7a59', // clay coral
  '#f56a8c', // rose
  '#bd93f5', // lilac haze
  '#79c98a', // fresh moss
  '#5fc7bb', // teal sage
  '#e7c79a', // sand cream
];

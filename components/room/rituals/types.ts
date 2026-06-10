'use client';

/**
 * Ritual System — local shapes + safe accessors (SPRINT2 §8 + §12).
 *
 * The Sesh layer gains a generalized **circle** (kind `toke | drink`), a **toast**
 * window, and **games** — all part of the one ritual grammar (trigger →
 * participation window → synchronized payoff). The authoritative shapes for these
 * live on `SeshState` and the `ClientMessage` union in `@/shared/protocol`, owned by
 * the protocol + party-server tasks.
 *
 * Those additions may be MID-FLIGHT relative to this file. To keep the rituals-ui
 * surface strict-clean regardless of landing order, this module declares the future
 * shapes structurally and exposes tiny readers that pluck them off the live state
 * without the compiler needing the protocol to already carry the fields. When the
 * protocol catches up these readers keep working unchanged (structural overlap).
 *
 * Sending side: the new `sesh:circle:*`, `sesh:toast:*`, and `sesh:game:*` messages
 * are emitted through {@link sendRitual}, which narrows a single typed surface so we
 * never scatter `as never` casts across the components.
 */

import type { RoomState, ClientMessage } from '@/shared/protocol';

// ---------------------------------------------------------------------------
// Future-protocol shapes (SPRINT2 §8 + §12)
// ---------------------------------------------------------------------------

/** The circle kind — the rotation generalized (toke 🍃 or drink 🥂). */
export type CircleKind = 'toke' | 'drink';

/** The three chat games, all windowed like the snack vote. */
export type GameKind = 'roulette' | 'most-likely' | 'movie-bingo';

/** A toast window: members raise one 🥂; all-raise (or ≥2 at end) → the CLINK. */
export interface ToastState {
  startedById: string;
  endsAt: number;
  raised: string[];
}

/**
 * The generic game window on `SeshState.game`. The server keeps per-kind detail;
 * the UI only needs the shared window fields plus a few kind-specific extras that
 * the server reducer surfaces (the prompt for most-likely; the dealt triggers and
 * their checked-off state for movie-bingo; the in-flight confirm for bingo).
 */
export interface GameState {
  kind: GameKind;
  startedById: string;
  endsAt?: number;
  /** most-likely: the prompt text; tally is anonymous (votes by crew id). */
  prompt?: string;
  /** most-likely: voterId → chosen crew id (anonymous in UI; only the tally shows). */
  votes?: Record<string, string>;
  /** movie-bingo: the 5 dealt trigger strings. */
  triggers?: string[];
  /** movie-bingo: triggers already called (BINGO'd) — subset of `triggers`. */
  checked?: string[];
  /**
   * movie-bingo: a trigger awaiting a second-crew confirm. `by` smashed IT
   * HAPPENED; `endsAt` is the 10s confirm window.
   */
  pending?: { trigger: string; by: string; endsAt: number };
}

/** The circle/toast/game fields the rituals UI reads off `SeshState`. */
export interface RitualSeshExtras {
  circleKind?: CircleKind;
  toast?: ToastState;
  game?: GameState;
}

// ---------------------------------------------------------------------------
// Safe readers — pluck the future fields without the protocol carrying them yet
// ---------------------------------------------------------------------------

function seshExtras(state: RoomState | null): RitualSeshExtras {
  if (!state) return {};
  // `sesh` will gain these fields (protocol task); read structurally meanwhile.
  return state.sesh as unknown as RitualSeshExtras;
}

/** The active circle kind, defaulting to `toke` before the host picks. */
export function readCircleKind(state: RoomState | null): CircleKind {
  return seshExtras(state).circleKind ?? 'toke';
}

/** The active toast window, or undefined. */
export function readToast(state: RoomState | null): ToastState | undefined {
  return seshExtras(state).toast;
}

/** The active game window, or undefined. */
export function readGame(state: RoomState | null): GameState | undefined {
  return seshExtras(state).game;
}

// ---------------------------------------------------------------------------
// Sending side — the new ritual messages, narrowed in one place
// ---------------------------------------------------------------------------

/** Set the circle kind (host/controller). */
export type CircleKindMsg = { type: 'sesh:circle:kind'; kind: CircleKind };
/** Open a 10s toast window (circle members). */
export type ToastStartMsg = { type: 'sesh:toast:start' };
/** Raise one 🥂 (circle members; deduped server-side). */
export type ToastRaiseMsg = { type: 'sesh:toast:raise' };
/** Start a game (sesh tray button). */
export type GameStartMsg = { type: 'sesh:game:start'; kind: GameKind; value?: string };
/** A generic in-game action; per-kind reducer interprets `action`/`value`. */
export type GameActionMsg = { type: 'sesh:game:action'; action: string; value?: string };
/** Stop / clear the active game. */
export type GameStopMsg = { type: 'sesh:game:stop' };

export type RitualMsg =
  | CircleKindMsg
  | ToastStartMsg
  | ToastRaiseMsg
  | GameStartMsg
  | GameActionMsg
  | GameStopMsg;

/**
 * Send a ritual message through the room's `send`. The `send` signature is typed
 * against the protocol's `ClientMessage`; until the new variants land there we widen
 * through `unknown` in exactly this one spot rather than at every call site.
 */
export function sendRitual(
  send: (msg: ClientMessage) => void,
  msg: RitualMsg,
): void {
  (send as unknown as (m: RitualMsg) => void)(msg);
}

// ---------------------------------------------------------------------------
// Circle copy — the drink-kind reskin (SPRINT2 §8)
// ---------------------------------------------------------------------------

/** Per-circle-kind copy used across the sesh UI so the reskin lives in one place. */
export interface CircleCopy {
  /** join the circle button. */
  join: string;
  /** the synchronized action button ("hit now 💨" vs "raise one 🥂"). */
  act: string;
  /** the spark label ("spark in 5" vs "toast in 5"). */
  spark: string;
  /** noun for the circle ("the rotation" vs "the circle"). */
  noun: string;
  /** small emoji seasoning for the kind. */
  emoji: string;
}

export function circleCopy(kind: CircleKind): CircleCopy {
  if (kind === 'drink') {
    return {
      join: 'join the circle 🥂',
      act: 'raise one 🥂',
      spark: 'toast in 5',
      noun: 'the circle',
      emoji: '🥂',
    };
  }
  return {
    join: 'join rotation 🍃',
    act: 'hit now 💨',
    spark: 'spark in 5',
    noun: 'the rotation',
    emoji: '🍃',
  };
}

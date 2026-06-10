/**
 * CouchCircle — the media adapter contract (§10.1 of ARCHITECTURE.md).
 *
 * Every concrete player (YouTube, direct URL, screen share, hosted-upload stub)
 * implements {@link MediaAdapter}. The {@link SyncEngine} drives adapters
 * uniformly so the room stays in sync regardless of backend.
 *
 * Pure types — no runtime dependencies beyond protocol types.
 */

import type { MediaAdapterType, QueueItem } from '@/shared/protocol';

/**
 * The adapter's own view of playback status. Note this is RICHER than the
 * server-side {@link import('@/shared/protocol').MediaStatus} — it adds `ready`
 * and `error` which the engine maps down when reporting room state.
 */
export type AdapterMediaStatus = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'error';

/** A scheduled play target the engine may hand to `play()` (often ignored). */
export interface ScheduledPlay { atServerMs: number; position: number; playbackRate: number; }

/** Callbacks an adapter uses to report status changes and terminal events. */
export interface MediaAdapterEvents {
  onStatus(status: AdapterMediaStatus): void;
  onEnded(): void;
  onError(message: string): void;
}

/**
 * Uniform transport surface for a single media backend. The SyncEngine owns the
 * timing; adapters just do as they're told and report what's happening.
 */
export interface MediaAdapter {
  readonly type: MediaAdapterType;
  load(item: QueueItem): Promise<void>;
  /** `at` MAY be ignored — the SyncEngine pre-schedules; play() should start immediately */
  play(at?: ScheduledPlay): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
  setPlaybackRate(rate: number): Promise<void>;
  getCurrentTime(): number;
  getDuration(): number | undefined;
  getStatus(): AdapterMediaStatus;
  canSeek(): boolean; canPause(): boolean; isLive(): boolean;
  /** local-only volume 0..1 (not synced) */
  setVolume?(v: number): void; getVolume?(): number;
  /**
   * True when the most recent successful {@link play} could only start by
   * falling back to MUTED autoplay (the browser blocked audible autoplay in a
   * non-controller tab). Stays true until {@link unmute} is called. The
   * SyncEngine surfaces this as `needsUnmute` so the UI can offer a
   * "tap to unmute" affordance. Optional: adapters with no muted-fallback path
   * (e.g. screen share) may omit it.
   */
  wasAutoplayMuted?(): boolean;
  /**
   * Restore audible playback after a muted-autoplay fallback and clear the
   * {@link wasAutoplayMuted} flag. Must be driven by a user gesture. Optional:
   * only meaningful for adapters that implement {@link wasAutoplayMuted}.
   */
  unmute?(): void;
  destroy(): void;
}

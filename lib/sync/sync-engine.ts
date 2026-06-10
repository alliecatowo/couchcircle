'use client';

/**
 * CouchCircle — Sync Engine (§9 of ARCHITECTURE.md).
 *
 * The SyncEngine is the authority on making each viewer's local playback match
 * the room's authoritative MediaState. It drives a MediaAdapter via seek/play/
 * pause/setPlaybackRate and publishes a SyncStatusSnapshot to a module-level
 * store so any component can subscribe via useSyncStatus().
 *
 * The active engine instance writes to the module store; a previous engine
 * automatically stops publishing when destroyed. Only one engine should be
 * alive at a time (MediaStage ensures this).
 */

import { useSyncExternalStore } from 'react';
import type { MediaAdapter } from '@/lib/media/adapter';
import type { ClientMessage, MediaState, MediaStatus } from '@/shared/protocol';
import {
  HEARTBEAT_MS,
  DRIFT_SOFT_MS,
  DRIFT_HARD_MS,
  RATE_NUDGE,
} from '@/shared/constants';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Health summary of the local sync state, consumed by SyncIndicator. */
export type SyncHealth =
  | 'idle'
  | 'synced'
  | 'drift'
  | 'resyncing'
  | 'buffering'
  | 'live'
  | 'blocked';

/** Snapshot published to the module store ~4×/sec and on transitions. */
export interface SyncStatusSnapshot {
  health: SyncHealth;
  /** Authoritative position estimate in seconds (used by scrubber). */
  positionSec: number;
  durationSec?: number;
  /** Last measured local drift in ms (0 when not applicable). */
  driftMs: number;
  isLive: boolean;
  canSeek: boolean;
  canPause: boolean;
  mediaStatus: MediaStatus;
  /** Local-only volume 0..1 (not synced to room). */
  localVolume: number;
  /**
   * True when the adapter could only start playback via MUTED autoplay (the
   * browser blocked audible autoplay). The UI surfaces a "tap to unmute" pill
   * that calls {@link unmuteAndSync}. Cleared once the user unmutes.
   */
  needsUnmute: boolean;
}

// ---------------------------------------------------------------------------
// Module-level store (one shared slot; active engine writes here)
// ---------------------------------------------------------------------------

const IDLE_SNAPSHOT: SyncStatusSnapshot = Object.freeze({
  health: 'idle' as SyncHealth,
  positionSec: 0,
  durationSec: undefined,
  driftMs: 0,
  isLive: false,
  canSeek: false,
  canPause: false,
  mediaStatus: 'idle' as MediaStatus,
  localVolume: 1,
  needsUnmute: false,
});

type Listener = () => void;

const store: { snapshot: SyncStatusSnapshot; listeners: Set<Listener> } = {
  snapshot: IDLE_SNAPSHOT,
  listeners: new Set(),
};

function subscribe(listener: Listener): () => void {
  store.listeners.add(listener);
  return () => { store.listeners.delete(listener); };
}

function getSnapshot(): SyncStatusSnapshot {
  return store.snapshot;
}

/** SSR-safe: always returns the same stable idle constant. */
function getServerSnapshot(): SyncStatusSnapshot {
  return IDLE_SNAPSHOT;
}

function notifyListeners(): void {
  for (const l of store.listeners) l();
}

// ---------------------------------------------------------------------------
// Module-level local volume (persists across adapter swaps)
// ---------------------------------------------------------------------------

let _localVolume = 1;

/**
 * Set the local (non-synced) playback volume for the active adapter.
 * Remembered across adapter swaps and reflected in SyncStatusSnapshot.
 * Called by RemoteControls.
 */
export function setLocalVolume(v01: number): void {
  const clamped = Math.max(0, Math.min(1, v01));
  _localVolume = clamped;
  // Forward to active adapter if it supports setVolume
  if (_activeEngine) {
    _activeEngine._applyVolumeToAdapter();
  }
  // Publish snapshot update so the scrubber/volume slider re-renders
  if (_activeEngine) {
    _activeEngine._publish();
  }
}

/**
 * Restore audible playback after a muted-autoplay fallback and re-sync to the
 * authoritative position. Proxies to the active engine so UI (the MediaStage
 * "tap to unmute" pill) can call it without holding the engine instance —
 * mirrors {@link setLocalVolume}.
 */
export function unmuteAndSync(): void {
  _activeEngine?.unmuteAndSync();
}

// Reference to the currently active engine so setLocalVolume can reach it.
// eslint-disable-next-line @typescript-eslint/no-use-before-define
let _activeEngine: SyncEngine | null = null;

// ---------------------------------------------------------------------------
// Dev-only diagnostics window hook (TASK 1)
// ---------------------------------------------------------------------------

/**
 * Snapshot of the active engine's internals for live debugging from the browser
 * console: `window.__couchSync.state()`. Reads the active engine LIVE each call
 * (it's a getter, not a captured value), so the orchestrator can poll it while
 * reproducing the wedged "tap to sync up" curtain. Dev-only diagnostic layer —
 * stripped once the autoplay no-op is confirmed fixed.
 */
interface CouchSyncDiag {
  hasEngine: boolean;
  hasAdapter: boolean;
  adapterType: string | null;
  adapterStatus: string | null;
  adapterDestroyed: boolean;
  adapterCurrentTime: number | null;
  blocked: boolean;
  needsUnmute: boolean;
  lastSeq: number | null;
  anchorStatus: string | null;
  anchorPosition: number | null;
  health: SyncHealth;
}

if (typeof window !== 'undefined') {
  (window as unknown as { __couchSync?: { state: () => CouchSyncDiag } }).__couchSync = {
    state: (): CouchSyncDiag => {
      const eng = _activeEngine;
      if (!eng) {
        return {
          hasEngine: false,
          hasAdapter: false,
          adapterType: null,
          adapterStatus: null,
          adapterDestroyed: false,
          adapterCurrentTime: null,
          blocked: false,
          needsUnmute: false,
          lastSeq: null,
          anchorStatus: null,
          anchorPosition: null,
          health: store.snapshot.health,
        };
      }
      return eng._diag();
    },
  };
}

/**
 * Is this play() rejection an autoplay-policy block (vs. a real source error)?
 * Only DOMException 'NotAllowedError' is an autoplay block; everything else
 * (NotSupportedError for a dead/unsupported source, etc.) is a genuine error
 * that the adapter's own onError event surfaces — we must NOT mask it with the
 * "tap to sync up" curtain.
 */
function isAutoplayBlock(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'NotAllowedError';
}

/**
 * Some concrete adapters (YouTubeAdapter, DirectUrlAdapter) expose an internal
 * `isDestroyed(): boolean` that is NOT part of the shared MediaAdapter interface.
 * Probe for it structurally so the engine can drop a torn-down adapter instead
 * of issuing transport calls that silently no-op — the exact failure mode that
 * wedged the "tap to sync up" curtain when React's dev double-mount left the
 * engine holding a DESTROYED adapter.
 */
function adapterIsDestroyed(adapter: MediaAdapter | null): boolean {
  if (!adapter) return false;
  const probe = (adapter as { isDestroyed?: () => boolean }).isDestroyed;
  if (typeof probe !== 'function') return false;
  try {
    return probe.call(adapter) === true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// SyncEngine class
// ---------------------------------------------------------------------------

export class SyncEngine {
  // ---- construction deps ----------------------------------------------------
  private readonly _serverNow: () => number;
  private readonly _isController: () => boolean;
  private readonly _send: (msg: ClientMessage) => void;

  // ---- adapter ---------------------------------------------------------------
  private _adapter: MediaAdapter | null = null;

  // ---- authoritative anchor --------------------------------------------------
  private _anchor: MediaState | null = null;
  private _lastSeq = -1;

  // ---- timers ----------------------------------------------------------------
  private _tickInterval: ReturnType<typeof setInterval> | null = null;
  private _scheduledPlayTimer: ReturnType<typeof setTimeout> | null = null;
  private _resyncDecayTimer: ReturnType<typeof setTimeout> | null = null;
  private _heartbeatAccumMs = 0;
  private _lastTickTime = 0;

  // ---- per-tick state --------------------------------------------------------
  private _health: SyncHealth = 'idle';
  private _driftMs = 0;
  private _nudgeActive = false;
  private _blocked = false;
  private _destroyed = false;

  /** True when the adapter only managed muted autoplay; surfaced as needsUnmute. */
  private _needsUnmute = false;

  /**
   * Timestamp (ms, Date.now) of the last corrective seek issued by the PAUSED
   * enforcement path. A small cooldown stops us re-seeking every single tick
   * while a stubborn embed keeps creeping.
   */
  private _lastPauseSeekAt = 0;

  constructor(opts: {
    serverNow(): number;
    isController(): boolean;
    send(msg: ClientMessage): void;
  }) {
    this._serverNow = opts.serverNow;
    this._isController = opts.isController;
    this._send = opts.send;

    // Register as the active engine
    _activeEngine = this;

    // Publish initial idle state
    this._publish();

    // Start the 1-second tick
    this._lastTickTime = Date.now();
    this._tickInterval = setInterval(() => this._tick(), 1000);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Return the registered adapter only if it is still alive. If the registered
   * adapter has been destroyed (e.g. a stale instance left behind by a React
   * dev-mode double-mount), drop it here so the engine behaves exactly as if no
   * adapter were registered — never issuing transport calls into a dead object.
   */
  private _liveAdapter(): MediaAdapter | null {
    const a = this._adapter;
    if (a !== null && adapterIsDestroyed(a)) {
      this._adapter = null;
      return null;
    }
    return a;
  }

  /** Swap in a new media adapter (or null to detach). */
  setAdapter(adapter: MediaAdapter | null): void {
    const incomingType = adapter?.type ?? 'null';
    const incomingDestroyed = adapterIsDestroyed(adapter);

    // Ignore a request to register an already-destroyed adapter (a cancelled
    // effect's orphan): treat it as a detach so the engine never holds a dead
    // instance.
    if (adapter !== null && adapterIsDestroyed(adapter)) {
      adapter = null;
    }

    const changed = adapter !== this._adapter;
    this._adapter = adapter;

    if (changed) {
      // A fresh adapter must re-evaluate autoplay/mute from scratch — clear any
      // blocked/unmute flags carried over from a previous (now-gone) adapter so
      // a working new adapter isn't stuck behind a stale "tap to sync" curtain.
      this._blocked = false;
      this._needsUnmute = false;
      this._clearScheduledPlay();
    }

    const willReapply = adapter !== null && this._anchor !== null;
    console.debug(
      `[sync] setAdapter type=${incomingType} destroyed=${incomingDestroyed} ` +
      `→held=${this._adapter?.type ?? 'null'} changed=${changed} reapply=${willReapply}`,
    );

    if (adapter !== null) {
      this._applyVolumeToAdapter();
      // Re-apply the current anchor's command semantics so a newly-registered
      // adapter immediately matches the room — covers the late-joiner case
      // where the room is already 'playing' (or a scheduled play) when the
      // player effect finally registers its adapter, AFTER applyMediaState ran
      // with no adapter attached. We must re-run regardless of seq here because
      // _lastSeq was already advanced by that earlier applyMediaState.
      if (this._anchor !== null) {
        this._applyCommand(this._anchor);
      }
    }
    this._publish();
  }

  /**
   * Called on every room:state with state.media.
   * seq change → apply command; same seq → refresh anchor (heartbeat).
   */
  applyMediaState(media: MediaState): void {
    if (this._destroyed) return;

    const isNewCommand = media.seq !== this._lastSeq;
    this._anchor = media;

    if (isNewCommand) {
      this._lastSeq = media.seq;
      const scheduledInMs = media.status === 'playing'
        ? media.updatedAtServerMs - this._serverNow()
        : 0;
      console.debug(
        `[sync] applyMediaState NEW seq=${media.seq} status=${media.status} ` +
        `scheduledIn=${Math.round(scheduledInMs)}ms hasAdapter=${this._liveAdapter() !== null}`,
      );
      this._applyCommand(media);
    }
    // Same seq: anchor updated — next tick will compute drift against it.
    this._publish();
  }

  /**
   * User-gesture resume after autoplay block.
   * Re-seeks to the current authoritative position then plays.
   */
  async resumePlayback(): Promise<void> {
    const adapter = this._liveAdapter();
    if (this._destroyed || !adapter || !this._anchor) {
      // This early return is the prime suspect for the "total silent no-op":
      // a curtain shown with health 'blocked' but the engine holding a null/
      // destroyed adapter means the user's tap reaches here and bails with NO
      // transport call and NO log beyond this one.
      console.debug(
        `[sync] resumePlayback EXIT no-adapter destroyed=${this._destroyed} ` +
        `liveAdapter=${adapter !== null} rawAdapter=${this._adapter !== null} ` +
        `rawDestroyed=${adapterIsDestroyed(this._adapter)} anchor=${this._anchor !== null}`,
      );
      return;
    }

    console.debug(`[sync] resumePlayback ENTRY adapter=${adapter.type} status=${adapter.getStatus()}`);
    const target = this._authoritativePosition();
    try {
      await adapter.seek(target);
      await adapter.play();
      this._blocked = false;
      this._health = 'synced';
      this._refreshNeedsUnmute();
      this._publish();
      console.debug(`[sync] resumePlayback EXIT seek+play-ok needsUnmute=${this._needsUnmute}`);
    } catch (err) {
      // Still an autoplay block → keep the curtain. Any other rejection (e.g.
      // a now-failing source) is NOT a block — clear it so the adapter's error
      // panel can surface instead of a useless "tap to sync up".
      const name = err instanceof Error ? err.name : String(err);
      if (!isAutoplayBlock(err)) {
        this._blocked = false;
        this._publish();
        console.debug(`[sync] resumePlayback EXIT play-rejected-nonblock name=${name} (curtain cleared)`);
      } else {
        console.debug('[sync] resumePlayback EXIT play-rejected-block (curtain kept)');
      }
    }
  }

  /**
   * Restore audible playback after a muted-autoplay fallback, then re-seek to
   * the authoritative position and republish. Driven by a user gesture from the
   * MediaStage "tap to unmute" pill (directly or via the module-level proxy).
   */
  unmuteAndSync(): void {
    if (this._destroyed) return;
    const adapter = this._liveAdapter();
    adapter?.unmute?.();
    this._needsUnmute = false;
    // Re-seek to the authoritative position so audio resumes in sync.
    if (adapter && this._anchor) {
      adapter.seek(this._authoritativePosition()).catch(() => { /* best-effort */ });
    }
    this._publish();
  }

  /** Tear down all timers, deregister from the module store. */
  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;

    if (this._tickInterval !== null) {
      clearInterval(this._tickInterval);
      this._tickInterval = null;
    }
    this._clearScheduledPlay();
    this._clearResyncDecay();

    this._adapter = null;

    if (_activeEngine === this) {
      _activeEngine = null;
      store.snapshot = IDLE_SNAPSHOT;
      notifyListeners();
    }
  }

  // ---------------------------------------------------------------------------
  // Internal: volume
  // ---------------------------------------------------------------------------

  /** @internal — also called by module-level setLocalVolume */
  _applyVolumeToAdapter(): void {
    const adapter = this._liveAdapter();
    if (adapter?.setVolume) {
      adapter.setVolume(_localVolume);
    }
  }

  // ---------------------------------------------------------------------------
  // Internal: muted-autoplay tracking
  // ---------------------------------------------------------------------------

  /**
   * Refresh _needsUnmute from the adapter after a (successful) play attempt.
   * Adapters that fell back to muted autoplay report wasAutoplayMuted() === true
   * until unmute() is called.
   */
  private _refreshNeedsUnmute(): void {
    this._needsUnmute = this._liveAdapter()?.wasAutoplayMuted?.() ?? false;
  }

  // ---------------------------------------------------------------------------
  // Internal: dev diagnostics (TASK 1) — read by window.__couchSync.state()
  // ---------------------------------------------------------------------------

  /**
   * Live internal snapshot for the dev diagnostics hook. Deliberately reads the
   * RAW `_adapter` field (NOT `_liveAdapter()`) so a probe never has the side
   * effect of dropping a destroyed adapter — we WANT to observe a held
   * destroyed/null adapter, since that's the exact wedge we're hunting.
   */
  _diag(): CouchSyncDiag {
    const a = this._adapter;
    let adapterStatus: string | null = null;
    let adapterCurrentTime: number | null = null;
    if (a) {
      try { adapterStatus = a.getStatus(); } catch { adapterStatus = 'throw'; }
      try { adapterCurrentTime = a.getCurrentTime(); } catch { adapterCurrentTime = null; }
    }
    return {
      hasEngine: true,
      hasAdapter: a !== null,
      adapterType: a?.type ?? null,
      adapterStatus,
      adapterDestroyed: adapterIsDestroyed(a),
      adapterCurrentTime,
      blocked: this._blocked,
      needsUnmute: this._needsUnmute,
      lastSeq: this._lastSeq,
      anchorStatus: this._anchor?.status ?? null,
      anchorPosition: this._anchor?.position ?? null,
      health: this._health,
    };
  }

  // ---------------------------------------------------------------------------
  // Internal: snapshot publishing
  // ---------------------------------------------------------------------------

  /** @internal */
  _publish(): void {
    if (_activeEngine !== this) return; // Another engine took over

    const anchor = this._anchor;
    const adapter = this._liveAdapter();

    const positionSec = anchor ? this._authoritativePosition() : 0;
    const durationSec = adapter?.getDuration() ?? anchor?.duration;
    const mediaStatus: MediaStatus = anchor?.status ?? 'idle';
    const isLive = anchor?.isLive ?? false;
    const canSeek = anchor?.canSeek ?? false;
    const canPause = anchor?.canPause ?? false;

    // Determine health
    let health: SyncHealth = this._health;
    const adapterErrored = adapter?.getStatus() === 'error';
    if (anchor === null || mediaStatus === 'idle') {
      health = 'idle';
    } else if (isLive) {
      health = 'live';
    } else if (this._blocked && !adapterErrored) {
      // A real source error must never present as 'blocked' (the curtain would
      // hide the adapter's error panel). The adapter's onError surfaces it.
      health = 'blocked';
    } else if (adapter?.getStatus() === 'loading') {
      health = 'buffering';
    }

    const next: SyncStatusSnapshot = {
      health,
      positionSec,
      durationSec,
      driftMs: this._driftMs,
      isLive,
      canSeek,
      canPause,
      mediaStatus,
      localVolume: _localVolume,
      needsUnmute: this._needsUnmute,
    };

    store.snapshot = next;
    notifyListeners();
  }

  // ---------------------------------------------------------------------------
  // Internal: authoritative position calculation
  // ---------------------------------------------------------------------------

  private _authoritativePosition(): number {
    const anchor = this._anchor;
    if (!anchor) return 0;
    if (anchor.status !== 'playing') return anchor.position;
    const elapsed = Math.max(0, this._serverNow() - anchor.updatedAtServerMs) / 1000;
    return anchor.position + elapsed * anchor.playbackRate;
  }

  // ---------------------------------------------------------------------------
  // Internal: command application
  // ---------------------------------------------------------------------------

  private _applyCommand(media: MediaState): void {
    const adapter = this._liveAdapter();
    if (!adapter) return;

    // A new transport command resets the muted-autoplay state; it is recomputed
    // from the adapter once the next play() attempt resolves (and is irrelevant
    // for pause/seek). This avoids a stale "tap to unmute" pill lingering.
    if (media.status !== 'playing') {
      this._needsUnmute = false;
    }

    // Apply rate first (before potential seek/play)
    adapter.setPlaybackRate(media.playbackRate).catch(() => { /* best-effort */ });

    this._clearScheduledPlay();
    this._blocked = false;

    if (media.status === 'playing') {
      const now = this._serverNow();
      const lag = media.updatedAtServerMs - now; // positive → scheduled in future

      if (lag > 0) {
        // Scheduled play: seek to position NOW, then play after the delay
        const targetPosition = media.position;
        adapter.seek(targetPosition).catch(() => { /* best-effort */ });

        this._scheduledPlayTimer = setTimeout(async () => {
          this._scheduledPlayTimer = null;
          // Bail if torn down, swapped, or this adapter died while we waited.
          if (this._destroyed || this._adapter !== adapter || adapterIsDestroyed(adapter)) {
            console.debug('[sync] _applyCommand scheduled-play bail (torn-down/swapped/dead)');
            return;
          }
          try {
            await adapter.play();
            this._blocked = false;
            this._refreshNeedsUnmute();
            this._publish();
            console.debug('[sync] _applyCommand scheduled-play ok');
          } catch (err) {
            // Only an autoplay-policy rejection is 'blocked'; anything else
            // (e.g. NotSupportedError) is surfaced by the adapter's onError.
            const name = err instanceof Error ? err.name : String(err);
            if (isAutoplayBlock(err)) {
              this._blocked = true;
              this._health = 'blocked';
              this._publish();
              console.debug('[sync] _applyCommand scheduled-play blocked → health=blocked');
            } else {
              console.debug(`[sync] _applyCommand scheduled-play non-autoplay-rejection name=${name}`);
            }
          }
        }, lag);

        this._health = 'buffering';
      } else {
        // Play in the past: seek to authoritative position and play immediately
        const authPos = this._authoritativePosition();
        adapter.seek(authPos)
          .then(() => adapter.play())
          .then(() => {
            this._blocked = false;
            this._refreshNeedsUnmute();
            this._publish();
            console.debug('[sync] _applyCommand immediate-play ok');
          })
          .catch((err: unknown) => {
            // Only an autoplay-policy rejection is 'blocked'; anything else
            // (e.g. NotSupportedError) is surfaced by the adapter's onError.
            const name = err instanceof Error ? err.name : String(err);
            if (isAutoplayBlock(err)) {
              this._blocked = true;
              this._health = 'blocked';
              this._publish();
              console.debug('[sync] _applyCommand immediate-play blocked → health=blocked');
            } else {
              console.debug(`[sync] _applyCommand immediate-play non-autoplay-rejection name=${name}`);
            }
          });

        this._health = 'synced';
      }
    } else if (media.status === 'paused' || media.status === 'loading' || media.status === 'ended') {
      adapter.pause().catch(() => { /* best-effort */ });
      adapter.seek(media.position).catch(() => { /* best-effort */ });
      this._health = media.status === 'loading' ? 'buffering' : 'synced';
    }
    // 'idle', 'live' — no transport command from engine; MediaStage handles load
  }

  // ---------------------------------------------------------------------------
  // Internal: tick (called every 1s)
  // ---------------------------------------------------------------------------

  private _tick(): void {
    if (this._destroyed) return;

    const now = Date.now();
    const dtMs = now - this._lastTickTime;
    this._lastTickTime = now;

    const adapter = this._liveAdapter();
    const anchor = this._anchor;

    if (!adapter || !anchor) {
      this._publish();
      return;
    }

    // ------------------------------------------------------------------
    // PAUSED enforcement (applies to controller AND viewer alike).
    // The authoritative room is paused, but an embed can get nudged into
    // playing (or never actually paused) and then drift forever showing
    // 'synced'. Whenever the room is paused we hold the adapter at the anchor.
    // ------------------------------------------------------------------
    this._enforcePauseIfNeeded(adapter, anchor);

    // ------------------------------------------------------------------
    // Controller path: send heartbeat on cadence
    // ------------------------------------------------------------------
    if (this._isController()) {
      this._heartbeatAccumMs += dtMs;
      if (this._heartbeatAccumMs >= HEARTBEAT_MS) {
        this._heartbeatAccumMs = 0;
        const adapterStatus = adapter.getStatus();
        const mappedStatus = this._mapAdapterStatus(adapterStatus);
        this._send({
          type: 'media:heartbeat',
          position: adapter.getCurrentTime(),
          status: mappedStatus,
        });
      }
      // Controllers don't do drift correction — they ARE the reference
      this._health = this._resolveControllerHealth(adapter);
      this._driftMs = 0;
      this._publish();
      return;
    }

    // ------------------------------------------------------------------
    // Viewer path: drift correction
    // ------------------------------------------------------------------

    // Adapter status overrides
    const adapterStatus = adapter.getStatus();

    if (adapterStatus === 'loading') {
      this._health = 'buffering';
      this._driftMs = 0;
      this._publish();
      return;
    }

    if (anchor.isLive || adapter.isLive()) {
      this._health = 'live';
      this._driftMs = 0;
      this._publish();
      return;
    }

    if (this._blocked) {
      this._health = 'blocked';
      this._publish();
      return;
    }

    // Only do drift correction when both sides think we're playing
    if (anchor.status !== 'playing' || adapterStatus !== 'playing') {
      this._health = anchor.status === 'idle' ? 'idle' : 'synced';
      this._driftMs = 0;
      if (this._nudgeActive) {
        // Restore normal rate
        this._nudgeActive = false;
        adapter.setPlaybackRate(anchor.playbackRate).catch(() => { /* best-effort */ });
      }
      this._publish();
      return;
    }

    const adapterTime = adapter.getCurrentTime();
    const authTime = this._authoritativePosition();
    // Positive drift → adapter is ahead; negative → adapter is behind
    const drift = adapterTime - authTime;
    const absDriftMs = Math.abs(drift * 1000);
    this._driftMs = drift * 1000;

    if (absDriftMs >= DRIFT_HARD_MS) {
      // Hard seek
      this._nudgeActive = false;
      adapter.setPlaybackRate(anchor.playbackRate).catch(() => { /* best-effort */ });
      adapter.seek(authTime).catch(() => { /* best-effort */ });
      this._health = 'resyncing';
      this._clearResyncDecay();
      this._resyncDecayTimer = setTimeout(() => {
        this._resyncDecayTimer = null;
        if (this._destroyed) return;
        if (this._health === 'resyncing') {
          this._health = 'synced';
          this._publish();
        }
      }, 1500);
    } else if (absDriftMs >= DRIFT_SOFT_MS) {
      // Soft nudge: adjust rate to gradually converge
      this._nudgeActive = true;
      // If adapter is ahead (drift > 0), slow down; if behind, speed up
      const nudgedRate = anchor.playbackRate + (drift > 0 ? -RATE_NUDGE : RATE_NUDGE);
      adapter.setPlaybackRate(nudgedRate).catch(() => { /* best-effort */ });
      this._health = 'drift';
    } else {
      // Within tolerance
      if (this._nudgeActive && absDriftMs < 60 / 1000 * 1000) {
        // Drift < 60ms: restore base rate
        this._nudgeActive = false;
        adapter.setPlaybackRate(anchor.playbackRate).catch(() => { /* best-effort */ });
      }
      if (this._health !== 'resyncing') {
        this._health = 'synced';
      }
    }

    this._publish();
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Enforce a PAUSED room on the local adapter. Runs every tick (both roles).
   *
   * When the authoritative status is 'paused':
   *  - if the adapter is actually playing, pause it; and
   *  - if it has crept more than 1.0s away from the anchor position, seek back.
   *
   * A small cooldown on the corrective seek stops us spamming seeks every tick
   * while a stubborn embed keeps inching forward. Live media is left alone.
   */
  private _enforcePauseIfNeeded(adapter: MediaAdapter, anchor: MediaState): void {
    if (anchor.status !== 'paused') return;
    if (anchor.isLive || adapter.isLive()) return;

    // Stop an embed that's still rolling while the room is paused.
    if (adapter.getStatus() === 'playing') {
      adapter.pause().catch(() => { /* best-effort */ });
    }

    // Pull a drifted position back onto the anchor (with a cooldown).
    const PAUSE_DRIFT_LIMIT_S = 1.0;
    const PAUSE_SEEK_COOLDOWN_MS = 1500;
    const off = Math.abs(adapter.getCurrentTime() - anchor.position);
    if (off > PAUSE_DRIFT_LIMIT_S) {
      const now = Date.now();
      if (now - this._lastPauseSeekAt >= PAUSE_SEEK_COOLDOWN_MS) {
        this._lastPauseSeekAt = now;
        adapter.seek(anchor.position).catch(() => { /* best-effort */ });
      }
    }
  }

  private _resolveControllerHealth(adapter: MediaAdapter): SyncHealth {
    const s = adapter.getStatus();
    if (s === 'loading') return 'buffering';
    if (adapter.isLive()) return 'live';
    if (this._blocked) return 'blocked';
    if (s === 'playing' || s === 'paused' || s === 'ready') return 'synced';
    if (s === 'idle' || s === 'ended') return 'idle';
    return 'synced';
  }

  /** Map an AdapterMediaStatus to the server-side MediaStatus for heartbeats. */
  private _mapAdapterStatus(s: ReturnType<MediaAdapter['getStatus']>): MediaStatus {
    switch (s) {
      case 'playing': return 'playing';
      case 'paused': return 'paused';
      case 'ended': return 'ended';
      case 'loading': return 'loading';
      case 'ready': return 'paused'; // ready but not yet playing → treat as paused
      case 'error': return 'idle';
      case 'idle': return 'idle';
      default: {
        // exhaustive check — TypeScript will error if AdapterMediaStatus gains a value
        const _exhaustive: never = s;
        return _exhaustive;
      }
    }
  }

  private _clearScheduledPlay(): void {
    if (this._scheduledPlayTimer !== null) {
      clearTimeout(this._scheduledPlayTimer);
      this._scheduledPlayTimer = null;
    }
  }

  private _clearResyncDecay(): void {
    if (this._resyncDecayTimer !== null) {
      clearTimeout(this._resyncDecayTimer);
      this._resyncDecayTimer = null;
    }
  }
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

/**
 * Subscribe any component to the active engine's sync status.
 * Uses useSyncExternalStore for concurrent-safe reads and SSR safety.
 * The server snapshot is the stable IDLE_SNAPSHOT constant (same reference).
 */
export function useSyncStatus(): SyncStatusSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

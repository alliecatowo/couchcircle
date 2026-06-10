/// <reference types="@types/youtube" />
/**
 * CouchCircle — YouTube IFrame API adapter (§10, yt-adapter task).
 *
 * Wraps the YouTube IFrame Player API in a MediaAdapter so the SyncEngine
 * can drive it exactly like any other backend.
 *
 * Key design decisions:
 *  - Singleton API-script loader: the YT script is appended once and a shared
 *    promise is resolved/rejected by onYouTubeIframeAPIReady / a 10-s timeout.
 *  - Pre-ready command queuing: play() calls that arrive before the player is
 *    ready are queued and replayed once it fires onReady.
 *  - Volume: YT API uses 0–100; our interface is 0–1; we convert at the
 *    boundary.
 */

import type { MediaAdapterType, QueueItem } from '@/shared/protocol';
import type { AdapterMediaStatus, MediaAdapter, MediaAdapterEvents, ScheduledPlay } from '@/lib/media/adapter';
import { parseYouTubeUrl } from '@/lib/media/url-parse';

// ---------------------------------------------------------------------------
// Singleton IFrame API loader
// ---------------------------------------------------------------------------

/** Module-level promise so every YouTubeAdapter instance shares it. */
let apiReadyPromise: Promise<void> | null = null;

/**
 * Load the YouTube IFrame API exactly once.
 * Resolves when window.onYouTubeIframeAPIReady fires, rejects after 10 s.
 */
function loadYouTubeApi(): Promise<void> {
  if (apiReadyPromise) return apiReadyPromise;

  apiReadyPromise = new Promise<void>((resolve, reject) => {
    // Already loaded (e.g. script injected by a previous call, page refresh mid-flight)
    if (typeof window !== 'undefined' && typeof window.YT?.Player === 'function') {
      resolve();
      return;
    }

    // Timeout guard — YT script failed to load or never called our callback.
    // Reset the shared slot so a later mount can retry instead of inheriting a
    // permanently-rejected promise.
    const timer = setTimeout(() => {
      apiReadyPromise = null;
      reject(new Error('YouTube IFrame API timed out'));
    }, 10_000);

    // Chain any existing handler so we don't break other integrations
    const previousHandler = (window as Window & { onYouTubeIframeAPIReady?: () => void })
      .onYouTubeIframeAPIReady;

    (window as Window & { onYouTubeIframeAPIReady?: () => void }).onYouTubeIframeAPIReady =
      function () {
        clearTimeout(timer);
        if (typeof previousHandler === 'function') {
          previousHandler();
        }
        resolve();
      };

    // Only inject the script tag once
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      document.head.appendChild(script);
    }
  });

  return apiReadyPromise;
}

// ---------------------------------------------------------------------------
// Error code → friendly copy
// ---------------------------------------------------------------------------

// NOTE: YT.PlayerError is a TYPE-ONLY enum from @types/youtube — it does NOT
// exist on the real window.YT global at runtime.  Compare against plain numeric
// literals instead.
//   InvalidParam            = 2
//   Html5Error              = 5
//   VideoNotFound           = 100
//   EmbeddingNotAllowed     = 101
//   EmbeddingNotAllowed2    = 150
function friendlyError(code: YT.PlayerError): string {
  switch (code as number) {
    case 2:   // YT.PlayerError.InvalidParam
    case 5:   // YT.PlayerError.Html5Error
      return "that link looks broken";
    case 100: // YT.PlayerError.VideoNotFound
      return "video not found";
    case 101: // YT.PlayerError.EmbeddingNotAllowed
    case 150: // YT.PlayerError.EmbeddingNotAllowed2
      return "this video can't be embedded — try another link";
  }
  return "something went wrong with the youtube player";
}

// ---------------------------------------------------------------------------
// State → AdapterMediaStatus mapping
// ---------------------------------------------------------------------------

function playerStateToStatus(state: YT.PlayerState): AdapterMediaStatus | null {
  switch (state) {
    case YT.PlayerState.CUED:      return 'ready';
    case YT.PlayerState.BUFFERING: return 'loading';
    case YT.PlayerState.PLAYING:   return 'playing';
    case YT.PlayerState.PAUSED:    return 'paused';
    case YT.PlayerState.ENDED:     return 'ended';
    case YT.PlayerState.UNSTARTED: return 'loading';
    default:                       return null;
  }
}

// ---------------------------------------------------------------------------
// YouTubeAdapter
// ---------------------------------------------------------------------------

export class YouTubeAdapter implements MediaAdapter {
  readonly type: MediaAdapterType = 'youtube';

  private readonly container: HTMLElement;
  private readonly events: MediaAdapterEvents;

  /** The YT.Player instance, available once the API + player are both ready. */
  private player: YT.Player | null = null;

  /**
   * Resolves when the YT.Player fires onReady — OR when destroy() is called.
   * It is deliberately RESOLVE-only on the destroy path (never rejected by
   * destroy()): destroy() resolves it so every awaiting caller (load/play)
   * unblocks and then bails on the `destroyed` flag. Resolving instead of
   * rejecting means the "YouTubeAdapter destroyed" string can never surface as
   * an unhandled rejection under React's dev-mode double-mount (mount → unmount
   * destroys mid-load → remount).
   *
   * It CAN, however, reject via a one-shot ready timeout (see READY_TIMEOUT_MS):
   * if onReady never fires for a player that was never destroyed, an awaiting
   * play()/load() would otherwise hang forever — and a hung play() inside
   * resumePlayback() makes the "tap to sync up" curtain a total silent no-op
   * (no .then/.catch ever runs). The timeout rejects with a descriptive
   * non-NotAllowedError so the engine's resumePlayback catch fires and clears
   * the curtain instead of wedging.
   */
  private playerReadyPromise: Promise<void>;
  private resolvePlayerReady!: () => void;
  private rejectPlayerReady!: (err: Error) => void;
  /** Settles the ready promise exactly once (resolve or reject); cleared after. */
  private playerReadySettled = false;
  private readyTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

  private status: AdapterMediaStatus = 'idle';

  /** play() calls that arrived before the player was ready. */
  private pendingPlay: ScheduledPlay | undefined = undefined;
  private playPending = false;

  /**
   * True when the last successful play() had to fall back to muted autoplay
   * because the browser blocked audible autoplay. Cleared by unmute().
   */
  private autoplayMuted = false;

  /**
   * Generation counter for the play()-polling routine. Bumped on every play()
   * call and on destroy() so a stale poll loop from a previous attempt aborts
   * cleanly instead of resolving/rejecting the wrong promise.
   */
  private playGeneration = 0;

  /** Active poll timer for the play() autoplay-detection routine. */
  private playPollTimer: ReturnType<typeof setTimeout> | null = null;

  /** true after destroy() so we ignore any stale callbacks. */
  private destroyed = false;

  /**
   * If onReady hasn't fired within this window after we begin building a player,
   * the ready promise rejects so awaiting play()/load() callers don't hang
   * forever (which would wedge resumePlayback / the autoplay curtain).
   */
  private static readonly READY_TIMEOUT_MS = 8000;

  constructor(container: HTMLElement, events: MediaAdapterEvents) {
    this.container = container;
    this.events = events;

    this.playerReadyPromise = new Promise<void>((res, rej) => {
      this.resolvePlayerReady = res;
      this.rejectPlayerReady = rej;
    });
    // Swallow a late rejection's unhandled-rejection warning: callers that were
    // already awaiting get the rejection; this no-op handler only covers the
    // case where nobody is currently awaiting when the timeout fires.
    this.playerReadyPromise.catch(() => { /* settled via timeout; handled by awaiters */ });
  }

  /** Resolve the ready promise once; subsequent calls are harmless no-ops. */
  private settleReadyResolve(): void {
    if (this.playerReadySettled) return;
    this.playerReadySettled = true;
    this.clearReadyTimeout();
    this.resolvePlayerReady();
  }

  /** Reject the ready promise once (timeout path); subsequent calls no-op. */
  private settleReadyReject(err: Error): void {
    if (this.playerReadySettled) return;
    this.playerReadySettled = true;
    this.clearReadyTimeout();
    this.rejectPlayerReady(err);
  }

  private clearReadyTimeout(): void {
    if (this.readyTimeoutTimer !== null) {
      clearTimeout(this.readyTimeoutTimer);
      this.readyTimeoutTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // load
  // -------------------------------------------------------------------------

  async load(item: QueueItem): Promise<void> {
    if (this.destroyed) return;

    this.setStatus('loading');

    // 1. Make sure the IFrame API script is loaded
    await loadYouTubeApi();
    if (this.destroyed) return;

    // 2. Parse out the video ID
    const parsed = parseYouTubeUrl(item.source);
    if (!parsed) {
      this.setStatus('error');
      this.events.onError("that link looks broken");
      return;
    }
    const { videoId } = parsed;

    // 3. Build or reuse the YT.Player
    if (!this.player) {
      // createPlayer resolves (never rejects) — even when destroy() interrupts
      // the await, control returns here and the destroyed guard below stops us
      // from touching a torn-down player.
      await this.createPlayer(videoId);
      if (this.destroyed) return;
    } else {
      // Player already exists — just cue the new video
      this.player.cueVideoById(videoId);
    }
  }

  /** Instantiate a YT.Player inside this.container and wait for onReady. */
  private createPlayer(videoId: string): Promise<void> {
    // Clear any previous content
    this.container.innerHTML = '';

    // Create a div for YT to replace with an iframe
    const div = document.createElement('div');
    this.container.appendChild(div);

    // Arm the ready timeout: if onReady never fires (and we weren't destroyed),
    // reject the ready promise so awaiting play()/load() callers don't hang.
    this.clearReadyTimeout();
    this.readyTimeoutTimer = setTimeout(() => {
      this.readyTimeoutTimer = null;
      if (this.destroyed || this.playerReadySettled) return;
      console.debug('[sync] yt.ready timeout — onReady never fired (8s)');
      this.settleReadyReject(
        new Error('YouTube player never became ready (onReady timed out)'),
      );
    }, YouTubeAdapter.READY_TIMEOUT_MS);

    // eslint-disable-next-line no-new
    new YT.Player(div, {
      width: '100%',
      height: '100%',
      videoId,
      playerVars: {
        // NOTE: YT.PlaysInline / YT.RelatedVideos / YT.ModestBranding /
        // YT.KeyboardControls are TYPE-ONLY enums from @types/youtube and do
        // NOT exist on the real window.YT at runtime.  Use numeric literals
        // with a type cast so TypeScript stays happy without touching window.YT.
        playsinline: 1 as YT.PlayerVars['playsinline'],   // YT.PlaysInline.Inline
        rel: 0 as YT.PlayerVars['rel'],                   // YT.RelatedVideos.Hide
        modestbranding: 1 as YT.PlayerVars['modestbranding'], // YT.ModestBranding.Modest
        disablekb: 1 as YT.PlayerVars['disablekb'],       // YT.KeyboardControls.Disable
      },
      events: {
        onReady: (e: YT.PlayerEvent) => {
          if (this.destroyed) return;
          this.player = e.target;
          this.settleReadyResolve();
          // NOTE: a play() that arrived before ready is resumed by play()
          // itself once playerReadyPromise resolves (it awaits, then runs the
          // autoplay-detecting routine), so the rejection reaches its caller.
        },
        onStateChange: (e: YT.OnStateChangeEvent) => {
          if (this.destroyed) return;
          const next = playerStateToStatus(e.data);
          if (next === null) return;
          this.setStatus(next);
          if (e.data === YT.PlayerState.ENDED) {
            this.events.onEnded();
          }
        },
        onError: (e: YT.OnErrorEvent) => {
          if (this.destroyed) return;
          this.setStatus('error');
          this.events.onError(friendlyError(e.data));
        },
      },
    });

    return this.playerReadyPromise;
  }

  // -------------------------------------------------------------------------
  // Transport
  // -------------------------------------------------------------------------

  async play(_at?: ScheduledPlay): Promise<void> {
    if (this.destroyed) return;
    console.debug(`[sync] yt.play entry hasPlayer=${!!this.player} state=${this.safePlayerState()}`);

    // If the player isn't ready yet, wait for it (the YT API has no play
    // promise, so we can't start polling until the player exists). The ready
    // promise resolves on onReady or destroy(), and REJECTS on the ready
    // timeout — so a never-ready player surfaces here as a rejection instead of
    // hanging this await forever (which would wedge resumePlayback).
    if (!this.player) {
      this.playPending = true;
      try {
        await this.playerReadyPromise;
      } finally {
        this.playPending = false;
      }
      if (this.destroyed || !this.player) {
        console.debug('[sync] yt.play bail after ready-await (destroyed/no-player)');
        return;
      }
    }

    await this.playWithFallback();
  }

  /** getPlayerState() that never throws — for breadcrumb logging only. */
  private safePlayerState(): number | string {
    try {
      return this.player?.getPlayerState() ?? 'no-player';
    } catch {
      return 'throw';
    }
  }

  /**
   * Start playback and detect a silently-blocked autoplay.
   *
   * playVideo() returns void, so we can't rely on a rejected promise the way
   * the <video> element does. Instead we call playVideo() then poll
   * getPlayerState():
   *   1. Audible attempt: poll up to ~1.5s. If state → PLAYING or BUFFERING the
   *      audible play succeeded → resolve (and clear the muted flag).
   *   2. Muted fallback: mute() + playVideo(), poll up to ~1.2s. If it plays we
   *      resolve but set wasAutoplayMuted so the UI can offer "tap to unmute".
   *   3. Even muted play failed → reject with a DOMException 'NotAllowedError'
   *      so the SyncEngine's blocked path fires.
   *
   * Repeated play() calls bump playGeneration so an in-flight poll loop from a
   * previous call aborts instead of settling the wrong attempt.
   */
  private playWithFallback(): Promise<void> {
    const player = this.player;
    if (!player) return Promise.resolve();

    // New attempt: invalidate any in-flight poll loop.
    const generation = ++this.playGeneration;
    this.clearPlayPoll();

    return new Promise<void>((resolve, reject) => {
      const isPlayingState = (): boolean => {
        try {
          const s = player.getPlayerState();
          return s === YT.PlayerState.PLAYING || s === YT.PlayerState.BUFFERING;
        } catch {
          return false;
        }
      };

      // ---- phase helpers ----
      const AUDIBLE_BUDGET_MS = 1500;
      const MUTED_BUDGET_MS = 1200;
      const POLL_MS = 250;

      const stale = (): boolean =>
        this.destroyed || this.playGeneration !== generation || this.player !== player;

      // Phase 2: muted retry
      const MUTE_CONFIRM_MS = 100;  // poll interval while waiting for mute to apply
      const MUTE_CONFIRM_BUDGET_MS = 800; // max time to wait for isMuted() → true
      const startMutedPhase = (): void => {
        if (stale()) { console.debug('[sync] yt.play muted-phase stale → resolve'); resolve(); return; }
        console.debug('[sync] yt.play muted-fallback attempt');
        try {
          player.mute();
        } catch {
          // fall through; if mute() threw we still poll isMuted() below
        }
        // mute() is a postMessage fire-and-forget — poll until isMuted() confirms
        // the command has applied before issuing playVideo(), otherwise playVideo()
        // can land in the iframe before mute takes effect and YouTube treats it as
        // an unmuted autoplay attempt and blocks it.
        const muteDeadline = Date.now() + MUTE_CONFIRM_BUDGET_MS;
        const muteStart = Date.now();
        const pollMuteConfirm = (): void => {
          if (stale()) { console.debug('[sync] yt.play muted-phase stale (mute-confirm) → resolve'); resolve(); return; }
          let muted = false;
          try { muted = player.isMuted(); } catch { /* treat as not yet confirmed */ }
          if (muted) {
            console.debug(`[sync] yt.play mute confirmed after ${Date.now() - muteStart}ms`);
            // Mute has applied — now it is safe to start playback.
            try {
              player.playVideo();
            } catch {
              // fall through to the playing-state poll below
            }
            const deadline = Date.now() + MUTED_BUDGET_MS;
            const pollMuted = (): void => {
              if (stale()) { console.debug('[sync] yt.play muted-poll stale → resolve'); resolve(); return; }
              if (isPlayingState()) {
                this.autoplayMuted = true; // played, but only while muted
                console.debug('[sync] yt.play resolve (muted autoplay ok → needsUnmute)');
                resolve();
                return;
              }
              if (Date.now() >= deadline) {
                // Even muted autoplay was blocked — surface as an autoplay block.
                try { player.unMute(); } catch { /* no-op */ }
                console.debug('[sync] yt.play reject NotAllowedError (muted autoplay also blocked)');
                reject(new DOMException('Autoplay was blocked by the browser', 'NotAllowedError'));
                return;
              }
              this.playPollTimer = setTimeout(pollMuted, POLL_MS);
            };
            this.playPollTimer = setTimeout(pollMuted, POLL_MS);
            return;
          }
          if (Date.now() >= muteDeadline) {
            // mute() never confirmed — treat as an autoplay block.
            console.debug('[sync] yt.play reject NotAllowedError (muted autoplay also blocked)');
            reject(new DOMException('Autoplay was blocked by the browser', 'NotAllowedError'));
            return;
          }
          this.playPollTimer = setTimeout(pollMuteConfirm, MUTE_CONFIRM_MS);
        };
        this.playPollTimer = setTimeout(pollMuteConfirm, MUTE_CONFIRM_MS);
      };

      // Phase 1: audible attempt
      console.debug('[sync] yt.play audible attempt');
      try {
        player.playVideo();
      } catch {
        // fall through to polling
      }
      const audibleDeadline = Date.now() + AUDIBLE_BUDGET_MS;
      const pollAudible = (): void => {
        if (stale()) { console.debug('[sync] yt.play audible-poll stale → resolve'); resolve(); return; }
        if (isPlayingState()) {
          this.autoplayMuted = false; // audible play succeeded
          console.debug(`[sync] yt.play resolve (audible ok, state=${this.safePlayerState()})`);
          resolve();
          return;
        }
        if (Date.now() >= audibleDeadline) {
          console.debug('[sync] yt.play audible budget exhausted → muted fallback');
          startMutedPhase();
          return;
        }
        this.playPollTimer = setTimeout(pollAudible, POLL_MS);
      };
      this.playPollTimer = setTimeout(pollAudible, POLL_MS);
    });
  }

  /** Cancel any pending play()-polling timer. */
  private clearPlayPoll(): void {
    if (this.playPollTimer !== null) {
      clearTimeout(this.playPollTimer);
      this.playPollTimer = null;
    }
  }

  /** True until unmute() while the last play() only succeeded muted. */
  wasAutoplayMuted(): boolean {
    return this.autoplayMuted;
  }

  /** Restore audible playback after a muted-autoplay fallback (user gesture). */
  unmute(): void {
    this.autoplayMuted = false;
    if (this.destroyed || !this.player) return;
    try {
      this.player.unMute();
    } catch {
      // player not ready / already destroyed — no-op
    }
  }

  async pause(): Promise<void> {
    if (this.destroyed || !this.player) return;
    this.player.pauseVideo();
  }

  async seek(seconds: number): Promise<void> {
    if (this.destroyed || !this.player) return;
    this.player.seekTo(seconds, /* allowSeekAhead */ true);
  }

  async setPlaybackRate(rate: number): Promise<void> {
    if (this.destroyed || !this.player) return;

    // Clamp to the rates the player says are available (when present)
    let clamped = rate;
    try {
      const available = this.player.getAvailablePlaybackRates();
      if (available.length > 0) {
        const min = available[0]!;
        const max = available[available.length - 1]!;
        clamped = Math.min(Math.max(rate, min), max);
      }
    } catch {
      // getAvailablePlaybackRates may throw before the player is fully ready
    }

    this.player.setPlaybackRate(clamped);
  }

  // -------------------------------------------------------------------------
  // Getters
  // -------------------------------------------------------------------------

  getCurrentTime(): number {
    if (!this.player) return 0;
    try {
      return this.player.getCurrentTime() ?? 0;
    } catch {
      return 0;
    }
  }

  getDuration(): number | undefined {
    if (!this.player) return undefined;
    try {
      const d = this.player.getDuration();
      // YT returns 0 while metadata isn't loaded yet
      return d > 0 ? d : undefined;
    } catch {
      return undefined;
    }
  }

  getStatus(): AdapterMediaStatus {
    return this.status;
  }

  /**
   * Cheap, internal liveness check. Not part of the shared MediaAdapter
   * interface — the SyncEngine probes for it defensively (`'isDestroyed' in
   * adapter`) so it can drop a torn-down adapter instead of issuing transport
   * calls that would silently no-op (which is what wedged the autoplay curtain).
   */
  isDestroyed(): boolean {
    return this.destroyed;
  }

  canSeek(): boolean  { return true; }
  canPause(): boolean { return true; }
  isLive(): boolean   { return false; }

  // -------------------------------------------------------------------------
  // Volume (0..1 ↔ 0..100)
  // -------------------------------------------------------------------------

  setVolume(v: number): void {
    if (!this.player) return;
    try {
      this.player.setVolume(Math.round(Math.min(1, Math.max(0, v)) * 100));
    } catch {
      // no-op if player not ready
    }
  }

  getVolume(): number {
    if (!this.player) return 1;
    try {
      return this.player.getVolume() / 100;
    } catch {
      return 1;
    }
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  destroy(): void {
    // Idempotent: calling destroy() more than once must be a safe no-op.
    if (this.destroyed) return;
    this.destroyed = true;

    // Cancel any in-flight play() polling and invalidate its generation so a
    // stale loop can't settle after teardown.
    this.playGeneration++;
    this.clearPlayPoll();
    this.clearReadyTimeout();

    // RESOLVE (never reject) the ready promise so any awaiting callers
    // (play/load) unblock and then no-op on the `destroyed` guard. Resolving
    // means there is no "YouTubeAdapter destroyed" rejection to leak as an
    // unhandled rejection under React's dev double-mount. If it already
    // settled (resolved by onReady, or rejected by the ready timeout) this is a
    // harmless no-op.
    this.settleReadyResolve();

    try {
      this.player?.destroy();
    } catch {
      // already destroyed or API missing — that's fine
    }

    this.player = null;
    // Guard against container having been removed from the DOM already
    try {
      this.container.innerHTML = '';
    } catch {
      // detached node — ignore
    }
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private setStatus(next: AdapterMediaStatus): void {
    if (next === this.status) return;
    this.status = next;
    this.events.onStatus(next);
  }
}

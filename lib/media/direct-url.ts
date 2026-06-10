/**
 * CouchCircle — DirectUrlAdapter (§10, direct-adapter task)
 *
 * Handles 'direct-url' queue items: HLS streams (.m3u8) and plain media files
 * (.mp4, .webm, etc.) via a provided <video> element.
 *
 * HLS playback order:
 *   1. Native HLS (Safari / iOS): video.canPlayType returns a non-empty string.
 *   2. hls.js (everyone else): dynamically imported; FATAL errors surfaced to onError.
 *
 * The adapter keeps stable handler references so destroy() can remove them cleanly.
 */

import type { MediaAdapter, MediaAdapterEvents, AdapterMediaStatus, ScheduledPlay } from '@/lib/media/adapter';
import type { MediaAdapterType, QueueItem } from '@/shared/protocol';
// classifyDirectUrl is provided by the concurrent yt-adapter task — import per contract.
import { classifyDirectUrl } from '@/lib/media/url-parse';

// hls.js is large; import the type namespace only at the module level so we can
// annotate the stored instance without pulling in the runtime bundle.
import type HlsType from 'hls.js';

// ---------------------------------------------------------------------------
// Friendly error copy
// ---------------------------------------------------------------------------

const MEDIA_ERROR_COPY =
  "This link can't be played directly by your browser. Try a direct MP4/WebM/HLS link, or screen share instead.";

// ---------------------------------------------------------------------------
// DirectUrlAdapter
// ---------------------------------------------------------------------------

export class DirectUrlAdapter implements MediaAdapter {
  readonly type: MediaAdapterType = 'direct-url';

  private readonly video: HTMLVideoElement;
  private readonly events: MediaAdapterEvents;

  /** Running playback status reported via onStatus. */
  private status: AdapterMediaStatus = 'idle';

  /** true after destroy() so the engine can drop a torn-down adapter. */
  private destroyed = false;

  /**
   * True when the last successful play() had to fall back to muted autoplay
   * because the browser blocked audible autoplay. Cleared by unmute().
   */
  private autoplayMuted = false;

  /** hls.js instance (only set when native HLS is unavailable). */
  private hls: HlsType | null = null;

  // Stable handler references required for removeEventListener in destroy().
  private readonly onLoadedMetadata: () => void;
  private readonly onCanPlay: () => void;
  private readonly onPlaying: () => void;
  private readonly onPause: () => void;
  private readonly onWaiting: () => void;
  private readonly onStalled: () => void;
  private readonly onEnded: () => void;
  private readonly onError: () => void;

  constructor(video: HTMLVideoElement, events: MediaAdapterEvents) {
    this.video = video;
    this.events = events;

    // Build stable handler closures once so we can add and remove cleanly.
    this.onLoadedMetadata = () => this.setStatus('ready');
    this.onCanPlay = () => this.setStatus('ready');
    this.onPlaying = () => this.setStatus('playing');
    this.onPause = () => {
      // 'pause' fires at the end of a natural `ended` sequence after 'ended'
      // already fired — don't regress the status back to 'paused'.
      if (this.status !== 'ended') {
        this.setStatus('paused');
      }
    };
    this.onWaiting = () => this.setStatus('loading');
    this.onStalled = () => this.setStatus('loading');
    this.onEnded = () => {
      this.setStatus('ended');
      this.events.onEnded();
    };
    this.onError = () => {
      this.setStatus('error');
      this.events.onError(MEDIA_ERROR_COPY);
    };

    this.attachVideoListeners();
  }

  // ---------------------------------------------------------------------------
  // MediaAdapter — load
  // ---------------------------------------------------------------------------

  async load(item: QueueItem): Promise<void> {
    const url = item.source;

    // Tear down any previous hls.js instance first.
    this.destroyHls();

    const kind = classifyDirectUrl(url);

    if (kind === 'hls') {
      await this.loadHls(url);
    } else {
      // 'file' or null — treat null as a best-effort file load; the error
      // handler will fire if the browser genuinely can't play it.
      this.video.src = url;
      this.video.preload = 'auto';
    }

    this.setStatus('loading');
  }

  // ---------------------------------------------------------------------------
  // HLS loading — native or hls.js
  // ---------------------------------------------------------------------------

  private async loadHls(url: string): Promise<void> {
    // Safari / iOS have native HLS — just set src.
    if (this.video.canPlayType('application/vnd.apple.mpegurl') !== '') {
      this.video.src = url;
      this.video.preload = 'auto';
      return;
    }

    // Dynamic import keeps hls.js out of the initial bundle.
    const { default: Hls } = await import('hls.js');

    if (!Hls.isSupported()) {
      // Neither native HLS nor hls.js — surface a friendly error.
      this.setStatus('error');
      this.events.onError(MEDIA_ERROR_COPY);
      return;
    }

    const hls = new Hls();
    this.hls = hls;

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        this.setStatus('error');
        this.events.onError(MEDIA_ERROR_COPY);
      }
    });

    hls.loadSource(url);
    hls.attachMedia(this.video);
  }

  // ---------------------------------------------------------------------------
  // MediaAdapter — transport
  // ---------------------------------------------------------------------------

  /**
   * Start playback, falling back to MUTED autoplay if the browser blocks
   * audible autoplay (a non-controller tab without a user gesture).
   *
   *   1. video.play() — if it resolves, audible play succeeded.
   *   2. On a 'NotAllowedError' rejection: set video.muted = true and retry. If
   *      that resolves we set the autoplay-muted flag so the UI can offer
   *      "tap to unmute" (unmute() restores audio).
   *   3. If even muted play rejects, rethrow the NotAllowedError so the
   *      SyncEngine's blocked path fires.
   *
   * Any non-autoplay rejection (e.g. a dead source) propagates unchanged so the
   * adapter's onError surfaces instead of a useless "tap to sync up" curtain.
   */
  async play(_at?: ScheduledPlay): Promise<void> {
    try {
      await this.video.play();
      // Audible play succeeded — make sure we're not stuck reporting muted.
      this.autoplayMuted = false;
    } catch (err) {
      if (!(err instanceof DOMException) || err.name !== 'NotAllowedError') {
        // Genuine source error (NotSupportedError, AbortError, …) — propagate.
        throw err;
      }
      // Audible autoplay blocked — retry muted.
      this.video.muted = true;
      try {
        await this.video.play();
        this.autoplayMuted = true; // played, but only while muted
      } catch (mutedErr) {
        // Even muted autoplay failed — surface as an autoplay block.
        throw mutedErr;
      }
    }
  }

  async pause(): Promise<void> {
    this.video.pause();
  }

  async seek(seconds: number): Promise<void> {
    const duration = this.getDuration();
    const clamped =
      duration !== undefined
        ? Math.min(Math.max(0, seconds), duration)
        : Math.max(0, seconds);
    this.video.currentTime = clamped;
  }

  async setPlaybackRate(rate: number): Promise<void> {
    this.video.playbackRate = rate;
  }

  // ---------------------------------------------------------------------------
  // MediaAdapter — introspection
  // ---------------------------------------------------------------------------

  getCurrentTime(): number {
    return this.video.currentTime;
  }

  /**
   * Returns undefined while the media duration is not yet known (NaN) or is
   * effectively infinite (Infinity — live streams). MVP scope: isLive is false
   * and live edge nuances are out of scope.
   */
  getDuration(): number | undefined {
    const d = this.video.duration;
    if (!isFinite(d) || isNaN(d)) return undefined;
    return d;
  }

  getStatus(): AdapterMediaStatus {
    return this.status;
  }

  /**
   * Cheap, internal liveness check. Not part of the shared MediaAdapter
   * interface — the SyncEngine probes for it defensively so it can drop a
   * torn-down adapter instead of issuing transport calls into a dead element.
   */
  isDestroyed(): boolean {
    return this.destroyed;
  }

  /** Direct URLs / files are always seekable at MVP scope. */
  canSeek(): boolean {
    return true;
  }

  /** Direct URLs / files can always be paused at MVP scope. */
  canPause(): boolean {
    return true;
  }

  /**
   * HLS live edge nuances are explicitly out of MVP scope per ARCHITECTURE §10.
   * We always report false so the sync engine uses normal seek/play logic.
   */
  isLive(): boolean {
    return false;
  }

  // ---------------------------------------------------------------------------
  // MediaAdapter — local-only volume
  // ---------------------------------------------------------------------------

  setVolume(v: number): void {
    this.video.volume = Math.min(1, Math.max(0, v));
  }

  getVolume(): number {
    return this.video.volume;
  }

  // ---------------------------------------------------------------------------
  // MediaAdapter — muted-autoplay fallback
  // ---------------------------------------------------------------------------

  /** True until unmute() while the last play() only succeeded muted. */
  wasAutoplayMuted(): boolean {
    return this.autoplayMuted;
  }

  /** Restore audible playback after a muted-autoplay fallback (user gesture). */
  unmute(): void {
    this.autoplayMuted = false;
    this.video.muted = false;
  }

  // ---------------------------------------------------------------------------
  // MediaAdapter — destroy
  // ---------------------------------------------------------------------------

  destroy(): void {
    // Idempotent: calling destroy() more than once must be a safe no-op.
    if (this.destroyed) return;
    this.destroyed = true;

    this.removeVideoListeners();
    this.destroyHls();

    // Release the network connection — clear src then call load() on the element
    // (the spec-recommended "empty" sequence).
    try {
      this.video.removeAttribute('src');
      this.video.load();
    } catch {
      // detached/teardown — ignore
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private setStatus(next: AdapterMediaStatus): void {
    if (this.status === next) return;
    this.status = next;
    this.events.onStatus(next);
  }

  private attachVideoListeners(): void {
    const v = this.video;
    v.addEventListener('loadedmetadata', this.onLoadedMetadata);
    v.addEventListener('canplay', this.onCanPlay);
    v.addEventListener('playing', this.onPlaying);
    v.addEventListener('pause', this.onPause);
    v.addEventListener('waiting', this.onWaiting);
    v.addEventListener('stalled', this.onStalled);
    v.addEventListener('ended', this.onEnded);
    v.addEventListener('error', this.onError);
  }

  private removeVideoListeners(): void {
    const v = this.video;
    v.removeEventListener('loadedmetadata', this.onLoadedMetadata);
    v.removeEventListener('canplay', this.onCanPlay);
    v.removeEventListener('playing', this.onPlaying);
    v.removeEventListener('pause', this.onPause);
    v.removeEventListener('waiting', this.onWaiting);
    v.removeEventListener('stalled', this.onStalled);
    v.removeEventListener('ended', this.onEnded);
    v.removeEventListener('error', this.onError);
  }

  private destroyHls(): void {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
  }
}

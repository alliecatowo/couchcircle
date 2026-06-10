/**
 * CouchCircle — ScreenShare media adapter (§10 of ARCHITECTURE.md).
 *
 * Wraps a <video> element driven by a MediaStream delivered via WebRTC.
 * The SyncEngine treats this as a live source: isLive=true, canSeek/canPause=false.
 *
 * isLocal=true  → local preview (muted, no echo).
 * isLocal=false → remote stream from the host (volume controls active).
 */

'use client';

import type { MediaAdapterType, QueueItem } from '@/shared/protocol';
import type { MediaAdapter, MediaAdapterEvents, ScheduledPlay, AdapterMediaStatus } from '@/lib/media/adapter';

export class ScreenShareAdapter implements MediaAdapter {
  readonly type: MediaAdapterType = 'screen-share';

  private readonly video: HTMLVideoElement;
  private readonly events: MediaAdapterEvents;
  private readonly isLocalPreview: boolean;

  private _status: AdapterMediaStatus = 'idle';

  // Event handler references kept so we can remove them precisely in destroy()
  private readonly _onPlaying: () => void;
  private readonly _onWaiting: () => void;
  private readonly _onEnded: () => void;
  private readonly _onError: () => void;

  constructor(
    video: HTMLVideoElement,
    events: MediaAdapterEvents,
    opts: { isLocal: boolean },
  ) {
    this.video = video;
    this.events = events;
    this.isLocalPreview = opts.isLocal;

    this._onPlaying = () => this._setStatus('playing');
    this._onWaiting = () => this._setStatus('loading');
    this._onEnded = () => {
      this._setStatus('ended');
      this.events.onEnded();
    };
    this._onError = () => {
      this._setStatus('error');
      this.events.onError('Screen share stream lost.');
    };

    this.video.addEventListener('playing', this._onPlaying);
    this.video.addEventListener('waiting', this._onWaiting);
    this.video.addEventListener('ended', this._onEnded);
    this.video.addEventListener('error', this._onError);
  }

  // -------------------------------------------------------------------------
  // Stream attachment
  // -------------------------------------------------------------------------

  /**
   * Attach (or detach) a MediaStream to the video element.
   *
   * - Muted only when isLocal so the host doesn't hear their own mic/system audio.
   * - Triggers play() automatically once the stream is attached.
   * - Passing null clears the source and returns to 'idle'.
   */
  attachStream(stream: MediaStream | null): void {
    if (stream === null) {
      this.video.srcObject = null;
      this._setStatus('idle');
      return;
    }

    this.video.srcObject = stream;
    // Mute only for the local preview to prevent audio echo/feedback.
    this.video.muted = this.isLocalPreview;

    this._setStatus('loading');

    // Attempt autoplay; ignore AbortError (element unmounted before play resolved).
    this.video.play().catch((err: unknown) => {
      // AbortError is benign — element was destroyed or srcObject changed
      if (err instanceof DOMException && err.name === 'AbortError') return;
      // NotAllowedError = autoplay policy; caller can show a "tap to play" prompt
      this.events.onError('Autoplay blocked — tap to resume the stream.');
    });
  }

  // -------------------------------------------------------------------------
  // MediaAdapter — transport
  // -------------------------------------------------------------------------

  /**
   * Screen share items are live — load() is a no-op because the stream arrives
   * out-of-band via ScreenShareMesh.attachStream().
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async load(_item: QueueItem): Promise<void> {
    // No-op: stream attachment is handled externally via attachStream().
    this._setStatus('loading');
  }

  /** Start playing. Resolves when the element actually begins playing. */
  async play(_at?: ScheduledPlay): Promise<void> {
    await this.video.play();
  }

  /** Screen share is live — pause is not meaningful, but keep it a safe no-op. */
  async pause(): Promise<void> {
    // no-op
  }

  /** Seeking a live stream is not supported. */
  async seek(_seconds: number): Promise<void> {
    // no-op
  }

  /** Playback rate cannot be changed for a live WebRTC stream. */
  async setPlaybackRate(_rate: number): Promise<void> {
    // no-op
  }

  // -------------------------------------------------------------------------
  // MediaAdapter — queries
  // -------------------------------------------------------------------------

  getCurrentTime(): number {
    // Live stream — report 0 (sync engine won't use this for drift correction).
    return 0;
  }

  getDuration(): number | undefined {
    return undefined;
  }

  getStatus(): AdapterMediaStatus {
    return this._status;
  }

  canSeek(): boolean { return false; }
  canPause(): boolean { return false; }
  isLive(): boolean { return true; }

  // -------------------------------------------------------------------------
  // Volume (viewer side only; local preview is always muted)
  // -------------------------------------------------------------------------

  setVolume(v: number): void {
    this.video.volume = Math.max(0, Math.min(1, v));
  }

  getVolume(): number {
    return this.video.volume;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  destroy(): void {
    this.video.removeEventListener('playing', this._onPlaying);
    this.video.removeEventListener('waiting', this._onWaiting);
    this.video.removeEventListener('ended', this._onEnded);
    this.video.removeEventListener('error', this._onError);

    this.video.srcObject = null;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private _setStatus(status: AdapterMediaStatus): void {
    if (this._status === status) return;
    this._status = status;
    this.events.onStatus(status);
  }
}

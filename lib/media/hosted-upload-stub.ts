/**
 * CouchCircle — Hosted Upload Adapter Stub (FUTURE)
 *
 * This is a placeholder implementation for the hosted-upload media adapter.
 * The feature will eventually allow rooms to upload media files to secure,
 * time-limited object storage and stream them together.
 *
 * Current status: all methods are safe no-ops. TODO: full integration pending
 * backend infrastructure and upload UI.
 *
 * ARCHITECTURE.md §10 (Hosted upload)
 */

import type { MediaAdapter, MediaAdapterEvents, ScheduledPlay, AdapterMediaStatus } from './adapter';
import type { QueueItem } from '@/shared/protocol';

/**
 * Describes the intended future flow for hosted uploads.
 * This roadmap is exposed as a tooltip in the queue UI.
 */
export const HOSTED_UPLOAD_ROADMAP: string[] = [
  '1. Upload a file via secure signed-URL to object storage (S3 / Cloudflare R2 / similar)',
  '2. Server buffers metadata and verifies ready state before room can play',
  '3. Everyone streams the same hosted object URL simultaneously — no peer-to-peer',
  '4. Automatic TTL expiry (e.g., 24h) and purge after room closes',
  '5. File size caps (e.g., 500 MB) and per-room storage limits (e.g., 2 GB)',
  '6. Authorized media only — the feature is for sharing personal videos and recordings with friends,',
  '   never for circumventing copyright or DRM. ReadMe will explicitly disclaim piracy use cases.',
];

/**
 * HostedUploadAdapter — stub implementation.
 *
 * Every method returns a safe no-op or error state. The error message
 * "Hosted Upload is coming later." is shown to users in the MediaStage
 * error panel if they somehow reach this adapter.
 *
 * Integration TODOs:
 * - @todo queue.ts: AddToQueueDialog needs a "Hosted Upload" tab with file picker
 * - @todo upload backend: server-side presigned URL generation + upload verification
 * - @todo storage: object store bucket + TTL lifecycle rules
 * - @todo player: DirectUrlAdapter could reuse video playback for hosted files
 * - @todo room state: track which uploads belong to the room, enforce size/count limits
 * - @todo cleanup: periodic purge of expired/orphaned uploads and room metadata
 */
export class HostedUploadAdapter implements MediaAdapter {
  readonly type = 'hosted-upload' as const;

  private readonly events: MediaAdapterEvents;

  // @todo: store reference to file metadata when load() is eventually called
  // private uploadMeta?: { uploadId: string; url: string; expiresAt: number };

  constructor(events: MediaAdapterEvents) {
    this.events = events;
  }

  /** @todo: on real implementation, validate item.source is a known upload id and fetch metadata */
  async load(item: QueueItem): Promise<void> {
    // Stub: immediately report error
    this.events.onError('Hosted Upload is coming later.');
  }

  /** @todo: on real implementation, set up stream to the hosted object URL */
  async play(at?: ScheduledPlay): Promise<void> {
    // Stub: no-op
  }

  /** @todo: on real implementation, pause the underlying stream */
  async pause(): Promise<void> {
    // Stub: no-op
  }

  /** @todo: on real implementation, seek to position in the hosted stream */
  async seek(seconds: number): Promise<void> {
    // Stub: no-op
  }

  /** @todo: on real implementation, apply playback rate to stream (if server supports it) */
  async setPlaybackRate(rate: number): Promise<void> {
    // Stub: no-op
  }

  /** @todo: on real implementation, return current position from underlying stream */
  getCurrentTime(): number {
    return 0;
  }

  /** @todo: on real implementation, return duration from upload metadata */
  getDuration(): number | undefined {
    return undefined;
  }

  /** Always returns 'error' in stub. @todo: track actual status (loading → ready → playing) */
  getStatus(): AdapterMediaStatus {
    return 'error';
  }

  /** @todo: hosted streams should support seeking (depends on server implementation) */
  canSeek(): boolean {
    return false;
  }

  /** @todo: hosted streams should support pause */
  canPause(): boolean {
    return false;
  }

  /** Not a live stream. */
  isLive(): boolean {
    return false;
  }

  /** @todo: optional; implement local volume if underlying stream supports it */
  setVolume(v: number): void {
    // Stub: no-op
  }

  /** @todo: optional; return local volume if implemented */
  getVolume(): number {
    return 1;
  }

  /** Cleanup: nothing to destroy in stub. @todo: close underlying stream/connection */
  destroy(): void {
    // Stub: no-op
  }
}

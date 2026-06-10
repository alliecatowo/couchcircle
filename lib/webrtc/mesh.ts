/**
 * CouchCircle — WebRTC screen-share mesh (§10 of ARCHITECTURE.md).
 *
 * HOST creates one RTCPeerConnection per viewer that sends screen:viewer-ready.
 * VIEWER creates one RTCPeerConnection toward the host and answers the offer.
 *
 * ICE: two Google STUN servers, no TURN (README documents the mesh size limit).
 */

import type { RoomConnection } from '@/lib/realtime/types';
import {
  type SharePreset,
  SHARE_PRESETS,
  DEFAULT_SHARE_PRESET,
  displayMediaConstraints,
  scaledMaxBitrate,
} from '@/lib/media/screen-share';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PeerConnState = 'connecting' | 'connected' | 'failed' | 'disconnected';

interface MeshOpts {
  selfId: string;
  connection: RoomConnection;
  /** viewer side: called when the remote MediaStream arrives or is removed */
  onRemoteStream(stream: MediaStream | null): void;
  /** called whenever any peer connection state changes */
  onPeerStates(states: Record<string, PeerConnState>): void;
  /** host side: called when the sharer's own track ends (user hit browser Stop) */
  onLocalEnded(): void;
}

/** Live encode telemetry surfaced to the host's stats chip. */
export interface ShareStats {
  width: number;
  height: number;
  fps: number;
  kbpsUp: number;
  viewers: number;
}

/** Live decode telemetry surfaced to the viewer's stats chip. */
export interface ViewerStats {
  kbpsDown: number;
}

/** Cached getStats sample for kbps deltas (bytes counters are monotonic). */
interface ByteSample {
  bytes: number;
  ts: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

// ---------------------------------------------------------------------------
// ScreenShareMesh
// ---------------------------------------------------------------------------

export class ScreenShareMesh {
  private readonly opts: MeshOpts;

  // host-side state
  private localStream: MediaStream | null = null;
  private hostPeers = new Map<string, RTCPeerConnection>(); // viewerId → pc
  /** Viewers who announced readiness before we had a stream to offer. */
  private pendingViewers = new Set<string>();
  /** Quality preset chosen for the active share; drives constraints + bitrate. */
  private preset: SharePreset = DEFAULT_SHARE_PRESET;
  /** Cached outbound-rtp byte sample for kbpsUp deltas (host side). */
  private hostByteSample: ByteSample | null = null;

  // viewer-side state
  private viewerPc: RTCPeerConnection | null = null;
  private viewerSharerId: string | null = null;
  /** ICE candidates buffered before remoteDescription is set */
  private bufferedCandidates: RTCIceCandidateInit[] = [];
  /** Cached inbound-rtp byte sample for kbpsDown deltas (viewer side). */
  private viewerByteSample: ByteSample | null = null;

  // peer states record published via onPeerStates
  private peerStates: Record<string, PeerConnState> = {};

  // unsubscribe functions for connection listeners — cleaned up in destroy()
  private unsubs: Array<() => void> = [];

  constructor(opts: MeshOpts) {
    this.opts = opts;
    this._subscribeToSignaling();
  }

  // -------------------------------------------------------------------------
  // HOST side
  // -------------------------------------------------------------------------

  /**
   * Acquire screen media for the chosen quality preset, then wait for viewers
   * to announce themselves via screen:viewer-ready before creating offers.
   *
   * The preset drives three things: the getDisplayMedia constraints (resolution
   * + framerate ideals), the video track's `contentHint` (the encoder's
   * quality-vs-motion bias), and the per-sender maxBitrate (scaled live by how
   * many people are watching). Sharper than discord, lighter on your upload.
   */
  async startSharing(opts: { preset: SharePreset } = { preset: DEFAULT_SHARE_PRESET }): Promise<MediaStream> {
    this.preset = opts.preset;
    const spec = SHARE_PRESETS[this.preset];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia(displayMediaConstraints(this.preset));
    } catch (err) {
      // Audio capture failed on some platforms/browsers — retry video-only.
      if (err instanceof DOMException && err.name !== 'NotAllowedError') {
        const videoOnly = { ...displayMediaConstraints(this.preset), audio: false };
        stream = await navigator.mediaDevices.getDisplayMedia(videoOnly);
      } else {
        throw err;
      }
    }

    this.localStream = stream;
    this.hostByteSample = null;

    // Steer the encoder: 'detail' holds pixels for text/code, 'motion' keeps the
    // framerate for video. Applied to the video track before any sender reads it.
    for (const track of stream.getVideoTracks()) {
      track.contentHint = spec.contentHint;
    }

    // Any viewers who announced readiness while we were still picking a screen
    // never got an offer — offer to them now that we have a stream.
    for (const viewerId of this.pendingViewers) {
      this._createOfferForViewer(viewerId);
    }
    this.pendingViewers.clear();

    // Bitrate is viewer-count-sensitive; the pending flush above changed the
    // count, so settle every sender to the current target.
    this._applySenderParamsToAll();

    // When the user presses the browser's native "Stop sharing" button each
    // track fires an ended event — forward the first one to the caller so they
    // can clean up the room state.
    for (const track of stream.getTracks()) {
      track.addEventListener('ended', () => {
        this.opts.onLocalEnded();
      }, { once: true });
    }

    return stream;
  }

  /** Stop all local tracks and close every peer connection. */
  stopSharing(): void {
    this.localStream?.getTracks().forEach(t => t.stop());
    this.localStream = null;
    this.hostByteSample = null;

    this.hostPeers.forEach(pc => pc.close());
    this.hostPeers.clear();
    this.pendingViewers.clear();

    this.peerStates = {};
    this.opts.onPeerStates({});
  }

  // -------------------------------------------------------------------------
  // VIEWER side
  // -------------------------------------------------------------------------

  /**
   * Express intent to watch `sharerId`'s screen.  The host will respond with a
   * WebRTC offer once it receives our screen:viewer-ready message.
   */
  becomeViewer(sharerId: string): void {
    this.viewerSharerId = sharerId;
    this.opts.connection.send({ type: 'screen:viewer-ready', toId: sharerId });
  }

  /** Close the viewer peer connection and clear the remote stream. */
  leaveViewer(): void {
    this._closeViewerPc();
    this.opts.onRemoteStream(null);
    this.viewerSharerId = null;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Full teardown: tracks, PCs, and all connection listeners. */
  destroy(): void {
    this.stopSharing();
    this._closeViewerPc();
    this.opts.onRemoteStream(null);
    this.viewerSharerId = null;
    this.unsubs.forEach(fn => fn());
    this.unsubs = [];
  }

  // -------------------------------------------------------------------------
  // Private — signaling subscription
  // -------------------------------------------------------------------------

  private _subscribeToSignaling(): void {
    const { connection } = this.opts;

    // HOST: a viewer is ready — create offer (or remember them until we have a
    // stream, so a viewer that announced before we hit "start" still connects).
    const unsubViewerReady = connection.on('screen:viewer-ready', msg => {
      if (this.localStream) {
        this._createOfferForViewer(msg.fromId);
      } else {
        this.pendingViewers.add(msg.fromId);
      }
    });

    // HOST: receive an answer from a viewer
    const unsubAnswer = connection.on('webrtc:answer', msg => {
      const pc = this.hostPeers.get(msg.fromId);
      if (!pc) return;
      const desc = JSON.parse(msg.sdp) as RTCSessionDescriptionInit;
      pc.setRemoteDescription(new RTCSessionDescription(desc)).catch(() => {
        // ignore stale / out-of-order answers
      });
    });

    // HOST/VIEWER: relay incoming ICE candidates
    const unsubIce = connection.on('webrtc:ice', msg => {
      // Determine whether this is for host or viewer path
      const hostPc = this.hostPeers.get(msg.fromId);
      if (hostPc) {
        // We're the host receiving a candidate from a viewer
        const candidate = msg.candidate as RTCIceCandidateInit;
        hostPc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
        return;
      }

      // We're the viewer receiving a candidate from the host
      if (this.viewerPc && msg.fromId === this.viewerSharerId) {
        if (this.viewerPc.remoteDescription) {
          this.viewerPc.addIceCandidate(new RTCIceCandidate(msg.candidate as RTCIceCandidateInit)).catch(() => {});
        } else {
          // Buffer until setRemoteDescription is done
          this.bufferedCandidates.push(msg.candidate as RTCIceCandidateInit);
        }
      }
    });

    // VIEWER: receive an offer from the host
    const unsubOffer = connection.on('webrtc:offer', msg => {
      if (msg.fromId !== this.viewerSharerId) return;
      this._handleOffer(msg.fromId, msg.sdp);
    });

    this.unsubs.push(unsubViewerReady, unsubAnswer, unsubIce, unsubOffer);
  }

  // -------------------------------------------------------------------------
  // Private — host helpers
  // -------------------------------------------------------------------------

  private _createOfferForViewer(viewerId: string): void {
    const stream = this.localStream;
    if (!stream) return;

    // Avoid duplicate PCs for the same viewer
    const existing = this.hostPeers.get(viewerId);
    if (existing) {
      existing.close();
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.hostPeers.set(viewerId, pc);

    // Add all local tracks
    for (const track of stream.getTracks()) {
      pc.addTrack(track, stream);
    }

    // Prefer VP9 on the video transceiver (better quality/bitrate, esp. for the
    // crisp text/code preset). Guard: getCapabilities can be null in some envs.
    this._preferVp9(pc);

    // Cap the encode for this viewer (degradationPreference + scaled maxBitrate).
    // Re-applied across ALL viewers below so the new arrival changes everyone's
    // slice of the host's upload, per the viewer-count scaling rule.
    this._applySenderParamsToAll();

    // Trickle ICE to viewer
    pc.addEventListener('icecandidate', ({ candidate }) => {
      if (candidate) {
        this.opts.connection.send({
          type: 'webrtc:ice',
          toId: viewerId,
          candidate: candidate.toJSON(),
        });
      }
    });

    // Track connection state
    pc.addEventListener('connectionstatechange', () => {
      const state = this._mapConnState(pc.connectionState);
      this.peerStates = { ...this.peerStates, [viewerId]: state };
      this.opts.onPeerStates({ ...this.peerStates });

      // A viewer dropping for good shrinks the live count — close + forget the
      // PC and re-scale everyone else back up to their fatter slice.
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        if (this.hostPeers.get(viewerId) === pc) {
          this.hostPeers.delete(viewerId);
          this._applySenderParamsToAll();
        }
      }
    });

    // Create offer and send
    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer))
      .then(() => {
        if (!pc.localDescription) return;
        this.opts.connection.send({
          type: 'webrtc:offer',
          toId: viewerId,
          sdp: JSON.stringify(pc.localDescription),
        });
      })
      .catch(() => {
        // Offer creation failed — mark as failed
        this.peerStates = { ...this.peerStates, [viewerId]: 'failed' };
        this.opts.onPeerStates({ ...this.peerStates });
      });
  }

  // -------------------------------------------------------------------------
  // Private — viewer helpers
  // -------------------------------------------------------------------------

  private async _handleOffer(sharerId: string, sdpJson: string): Promise<void> {
    this._closeViewerPc();

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.viewerPc = pc;

    // Collect incoming tracks into a MediaStream and forward it
    const remoteStream = new MediaStream();
    pc.addEventListener('track', ({ track }) => {
      remoteStream.addTrack(track);
      this.opts.onRemoteStream(remoteStream);
    });

    // Trickle ICE to host
    pc.addEventListener('icecandidate', ({ candidate }) => {
      if (candidate) {
        this.opts.connection.send({
          type: 'webrtc:ice',
          toId: sharerId,
          candidate: candidate.toJSON(),
        });
      }
    });

    // Track connection state (viewer's "peer" key is the sharerId)
    pc.addEventListener('connectionstatechange', () => {
      const state = this._mapConnState(pc.connectionState);
      this.peerStates = { [sharerId]: state };
      this.opts.onPeerStates({ ...this.peerStates });
    });

    const desc = JSON.parse(sdpJson) as RTCSessionDescriptionInit;
    await pc.setRemoteDescription(new RTCSessionDescription(desc));

    // Flush buffered candidates now that remoteDescription is set
    for (const c of this.bufferedCandidates) {
      await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
    }
    this.bufferedCandidates = [];

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    this.opts.connection.send({
      type: 'webrtc:answer',
      toId: sharerId,
      sdp: JSON.stringify(pc.localDescription),
    });
  }

  private _closeViewerPc(): void {
    this.viewerPc?.close();
    this.viewerPc = null;
    this.bufferedCandidates = [];
    this.viewerByteSample = null;
    this.peerStates = {};
    this.opts.onPeerStates({});
  }

  // -------------------------------------------------------------------------
  // Private — encode tuning (preset → codec / degradation / bitrate)
  // -------------------------------------------------------------------------

  /**
   * Prefer VP9 first on the connection's video transceiver. Guarded: in some
   * environments `RTCRtpSender.getCapabilities` is null (or the method is
   * absent), in which case we leave the browser's default codec ordering alone.
   */
  private _preferVp9(pc: RTCPeerConnection): void {
    const getCaps = RTCRtpSender.getCapabilities;
    if (typeof getCaps !== 'function') return;
    const caps = getCaps('video');
    if (!caps) return;

    const codecs = caps.codecs ?? [];
    const vp9 = codecs.filter(c => /vp9/i.test(c.mimeType));
    if (vp9.length === 0) return;
    const rest = codecs.filter(c => !/vp9/i.test(c.mimeType));
    const ordered = [...vp9, ...rest];

    for (const transceiver of pc.getTransceivers()) {
      if (transceiver.sender.track?.kind !== 'video') continue;
      // setCodecPreferences may throw if the list is somehow invalid — never let
      // a codec-ordering nicety abort the whole offer.
      try {
        transceiver.setCodecPreferences(ordered);
      } catch {
        /* keep default ordering */
      }
    }
  }

  /** Re-apply degradationPreference + scaled maxBitrate to every host sender. */
  private _applySenderParamsToAll(): void {
    const viewers = this.hostPeers.size;
    for (const pc of this.hostPeers.values()) {
      void this._applySenderParams(pc, viewers);
    }
  }

  /**
   * Cap one peer connection's video sender for the current preset + viewer
   * count. Per the WebRTC spec we read the live parameters, MUTATE the
   * `encodings` object we got back (never fabricate a fresh one), and write it.
   */
  private async _applySenderParams(pc: RTCPeerConnection, viewers: number): Promise<void> {
    const spec = SHARE_PRESETS[this.preset];
    const maxBitrate = scaledMaxBitrate(this.preset, viewers);

    for (const sender of pc.getSenders()) {
      if (sender.track?.kind !== 'video') continue;

      const params = sender.getParameters();
      // Some browsers hand back an empty encodings array before the first
      // negotiation settles — seed one entry so the cap actually lands.
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      for (const enc of params.encodings) {
        enc.maxBitrate = maxBitrate;
      }
      params.degradationPreference = spec.degradation;

      try {
        await sender.setParameters(params);
      } catch {
        // Stale parameters (transceiver renegotiating) — the next join/leave or
        // the periodic re-apply will settle it.
      }
    }
  }

  // -------------------------------------------------------------------------
  // Stats sampling (getShareStats / getViewerStats)
  // -------------------------------------------------------------------------

  /**
   * Host telemetry: frame size + framerate from the outbound-rtp report plus an
   * up-kbps figure derived from the bytesSent delta since the last sample
   * (counters are monotonic; we cache the previous read). Returns null until a
   * stream and at least one outbound video report exist.
   */
  async getShareStats(): Promise<ShareStats | null> {
    const stream = this.localStream;
    if (!stream) return null;

    // Any one host PC carries the same encode; sample the first connected one.
    const pc =
      [...this.hostPeers.values()].find(p => p.connectionState === 'connected') ??
      [...this.hostPeers.values()][0];

    let width = 0;
    let height = 0;
    let fps = 0;
    let bytesSent = 0;
    let haveOutbound = false;

    if (pc) {
      const report = await pc.getStats();
      report.forEach(stat => {
        if (stat.type === 'outbound-rtp' && (stat as RTCOutboundRtpStreamStats).kind === 'video') {
          const s = stat as RTCOutboundRtpStreamStats & {
            frameWidth?: number;
            frameHeight?: number;
            framesPerSecond?: number;
          };
          haveOutbound = true;
          width = s.frameWidth ?? width;
          height = s.frameHeight ?? height;
          fps = Math.round(s.framesPerSecond ?? fps);
          bytesSent += s.bytesSent ?? 0;
        }
      });
    }

    // Fall back to the capture track's settings if no report has dimensions yet
    // (e.g. before the first viewer connects — still want to show resolution).
    if (width === 0 || height === 0) {
      const settings = stream.getVideoTracks()[0]?.getSettings();
      width = width || settings?.width || SHARE_PRESETS[this.preset].width;
      height = height || settings?.height || SHARE_PRESETS[this.preset].height;
      fps = fps || Math.round(settings?.frameRate ?? SHARE_PRESETS[this.preset].fps);
    }

    const kbpsUp = haveOutbound
      ? this._kbpsFromDelta(bytesSent, () => this.hostByteSample, s => (this.hostByteSample = s))
      : 0;

    return {
      width,
      height,
      fps,
      kbpsUp,
      viewers: this.hostPeers.size,
    };
  }

  /**
   * Viewer telemetry: down-kbps from the inbound-rtp bytesReceived delta since
   * the last sample. Returns null until the viewer PC has a video report.
   */
  async getViewerStats(): Promise<ViewerStats | null> {
    const pc = this.viewerPc;
    if (!pc) return null;

    let bytesReceived = 0;
    let haveInbound = false;

    const report = await pc.getStats();
    report.forEach(stat => {
      if (stat.type === 'inbound-rtp' && (stat as RTCInboundRtpStreamStats).kind === 'video') {
        haveInbound = true;
        bytesReceived += (stat as RTCInboundRtpStreamStats).bytesReceived ?? 0;
      }
    });

    if (!haveInbound) return null;

    const kbpsDown = this._kbpsFromDelta(
      bytesReceived,
      () => this.viewerByteSample,
      s => (this.viewerByteSample = s),
    );
    return { kbpsDown };
  }

  /**
   * Turn a monotonic byte counter into kbps using the cached previous sample.
   * First call (no prior sample) seeds the cache and reports 0 — the chip fills
   * in on the next poll once a real ~2s window has elapsed.
   */
  private _kbpsFromDelta(
    bytes: number,
    getPrev: () => ByteSample | null,
    setPrev: (s: ByteSample) => void,
  ): number {
    const now = Date.now();
    const prev = getPrev();
    setPrev({ bytes, ts: now });
    if (!prev) return 0;
    const dtSec = (now - prev.ts) / 1000;
    if (dtSec <= 0) return 0;
    const deltaBytes = Math.max(0, bytes - prev.bytes); // guard counter resets
    return Math.round((deltaBytes * 8) / dtSec / 1000);
  }

  // -------------------------------------------------------------------------
  // Utility
  // -------------------------------------------------------------------------

  private _mapConnState(state: RTCPeerConnectionState): PeerConnState {
    switch (state) {
      case 'connected':
        return 'connected';
      case 'failed':
        return 'failed';
      case 'disconnected':
      case 'closed':
        return 'disconnected';
      default:
        // 'new' | 'connecting' | 'checking'
        return 'connecting';
    }
  }
}

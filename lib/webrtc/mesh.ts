/**
 * CouchCircle — WebRTC screen-share mesh (§10 of ARCHITECTURE.md).
 *
 * HOST creates one RTCPeerConnection per viewer that sends screen:viewer-ready.
 * VIEWER creates one RTCPeerConnection toward the host and answers the offer.
 *
 * ICE: two Google STUN servers, no TURN (README documents the mesh size limit).
 */

import type { RoomConnection } from '@/lib/realtime/types';

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

  // viewer-side state
  private viewerPc: RTCPeerConnection | null = null;
  private viewerSharerId: string | null = null;
  /** ICE candidates buffered before remoteDescription is set */
  private bufferedCandidates: RTCIceCandidateInit[] = [];

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
   * Acquire screen media (video + audio when available), then wait for viewers
   * to announce themselves via screen:viewer-ready before creating offers.
   */
  async startSharing(): Promise<MediaStream> {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    } catch (err) {
      // Audio capture failed on some platforms/browsers — retry video-only.
      if (err instanceof DOMException && err.name !== 'NotAllowedError') {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      } else {
        throw err;
      }
    }

    this.localStream = stream;

    // Any viewers who announced readiness while we were still picking a screen
    // never got an offer — offer to them now that we have a stream.
    for (const viewerId of this.pendingViewers) {
      this._createOfferForViewer(viewerId);
    }
    this.pendingViewers.clear();

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
    this.peerStates = {};
    this.opts.onPeerStates({});
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

/**
 * CouchCircle — authoritative room engine (§7 of ARCHITECTURE.md).
 *
 * `RoomEngine` owns the in-memory {@link RoomState}, a private password (never
 * placed in state or broadcast), the `connectionId → participantId` map, and all
 * server-side timers (disconnect grace, spark countdown, rotation auto-advance,
 * snack-vote tally). `party/index.ts` is a thin `Party.Server` that forwards
 * lifecycle events here.
 *
 * Design rule (§4): everything durable lives in `RoomState` and is broadcast as
 * a full `room:state` snapshot after EVERY mutation. The joiner additionally
 * gets a `joined` reply. Ephemeral things (pong, reactions, webrtc relay) are
 * direct messages.
 *
 * PartyKit's esbuild does not resolve the `@/*` alias for party code, so shared
 * modules are imported via relative paths.
 */
import type * as Party from 'partykit/server';
import {
  canControl,
  parseClientMessage,
  serializeMessage,
} from '../shared/protocol';
import type {
  ChatMessage,
  ClientMessage,
  CreateOptions,
  ErrorCode,
  IdentitySnapshot,
  MediaState,
  NewQueueItem,
  Participant,
  QueueItem,
  QueueItemType,
  RoomActionKind,
  RoomEvent,
  RoomEventKind,
  RoomState,
  ServerMessage,
} from '../shared/protocol';
import {
  DISCONNECT_GRACE_MS,
  MAX_CHAT,
  MAX_EVENTS,
  MAX_PARTICIPANTS,
  PLAY_LEAD_MS,
  SAMPLE_VIDEOS,
  SNACK_VOTE_WINDOW_MS,
} from '../shared/constants';
import { RATE_RULES, RateCategory, RateLimiter } from './rate-limit';

/** What we persist to `room.storage` for restart resilience. */
interface Snapshot {
  state: RoomState;
  password?: string;
  savedAt: number;
}

/** Snapshots older than this are ignored on restore. */
const SNAPSHOT_MAX_AGE_MS = 6 * 60 * 60 * 1000;
/** Persist at most this often (§7: throttled ~2s). */
const PERSIST_THROTTLE_MS = 2_000;
/** Storage key for the snapshot. */
const SNAPSHOT_KEY = '__snapshot__';
/** Heartbeat adoption threshold (§7: |reported − authoritative| > 0.4s). */
const HEARTBEAT_DRIFT_S = 0.4;

// Sanitization caps (§7).
const MAX_NAME_LEN = 24;
const MAX_ROOM_NAME_LEN = 40;
const MAX_TITLE_LEN = 120;
const MAX_URL_LEN = 2000;
const MAX_CHAT_LEN = 500;

export class RoomEngine {
  /** The authoritative durable state (null until initialized via a create join). */
  private state: RoomState | null = null;
  /** Private room password — NEVER placed in state or broadcast. */
  private password: string | undefined;
  /** connectionId → participantId for this room's live sockets. */
  private readonly conns = new Map<string, string>();
  /**
   * connectionId → projector id for attached companion big-screen windows.
   * Projectors are NOT participants (no seat, not counted toward
   * MAX_PARTICIPANTS) but their conn→id mapping lives here so webrtc relays
   * (`screen:viewer-ready`, offers/ice) can reach them — a projector becomes a
   * screen-share viewer just like a crew member.
   */
  private readonly projectors = new Map<string, string>();
  /** Per-connection sliding-window limiter. */
  private readonly limiter = new RateLimiter();

  // Timer handles, cleared when superseded.
  private disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private rotationTimer: ReturnType<typeof setTimeout> | null = null;
  private countdownTimer: ReturnType<typeof setTimeout> | null = null;
  private snackTimer: ReturnType<typeof setTimeout> | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private persistDirty = false;

  constructor(private readonly room: Party.Room) {}

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Restore a recent snapshot from storage on cold start. */
  async onStart(): Promise<void> {
    try {
      const snap = await this.room.storage.get<Snapshot>(SNAPSHOT_KEY);
      if (snap && Date.now() - snap.savedAt < SNAPSHOT_MAX_AGE_MS) {
        this.state = snap.state;
        this.password = snap.password;
        // Everyone restored from disk is, by definition, currently disconnected.
        for (const p of Object.values(this.state.participants)) {
          p.connected = false;
        }
        // Old snapshots predate projectorCount; default it. No projector window
        // survives a restart, so any restored count is also stale → 0.
        this.state.projectorCount = 0;
      }
    } catch {
      // Corrupt snapshot — start fresh.
      this.state = null;
    }
  }

  /** A websocket opened; we wait for an explicit `room:join` before doing anything. */
  onConnect(_conn: Party.Connection): void {
    // No-op: identity is established by the room:join message.
  }

  /** Handle one inbound client message. */
  onMessage(raw: string | ArrayBuffer | ArrayBufferView, sender: Party.Connection): void {
    const text = typeof raw === 'string' ? raw : decodeBinary(raw);
    if (text === null) return;
    const msg = parseClientMessage(text);
    if (!msg) return this.sendError(sender, 'invalid-message', "couldn't read that message");

    // Ping is special: stateless, pre-join, never rate-limited.
    if (msg.type === 'ping') {
      this.reply(sender, { type: 'pong', t0: msg.t0, serverNow: Date.now() });
      return;
    }

    // Join is special: establishes identity, has its own rate category.
    if (msg.type === 'room:join') {
      if (!this.rateOk(sender, 'join')) return this.sendError(sender, 'rate-limited', 'slow down a sec');
      this.handleJoin(msg, sender);
      return;
    }

    // Projector connections aren't participants, but their relay traffic
    // (webrtc:* + screen:viewer-ready) must still flow so they can watch a
    // screen share. They may only relay or leave — never mutate room state.
    const projectorId = this.projectors.get(sender.id);
    if (projectorId) {
      this.handleProjectorMessage(msg, sender, projectorId);
      return;
    }

    // Everything else requires an established participant on this connection.
    const pid = this.conns.get(sender.id);
    if (!this.state || !pid || !this.state.participants[pid]) {
      return this.sendError(sender, 'invalid-message', 'join the room first');
    }
    this.state.participants[pid].lastSeen = Date.now();
    this.handleMessage(msg, sender, pid);
  }

  /** A websocket closed. Mark disconnected + schedule removal. */
  onClose(conn: Party.Connection): void {
    this.limiter.forgetPrefix(`${conn.id}:`);

    // A projector window closing just decrements the count and re-broadcasts;
    // there's no participant, grace window, or remote handoff to worry about.
    if (this.projectors.has(conn.id)) {
      this.projectors.delete(conn.id);
      if (this.state) {
        this.state.projectorCount = this.projectors.size;
        this.touch();
        this.broadcastState();
        this.schedulePersist();
      }
      return;
    }

    const pid = this.conns.get(conn.id);
    this.conns.delete(conn.id);
    if (!this.state || !pid) return;
    const p = this.state.participants[pid];
    if (!p) return;

    // If the participant still has another live connection, do nothing.
    if (this.hasOtherConnection(pid, conn.id)) return;

    p.connected = false;
    this.pushEvent('leave', `${p.name} drifted off the couch`, p.id, '💤');

    // If the controller left, transfer the remote immediately.
    if (this.state.remote.controllerId === pid) this.transferRemoteFrom(pid);
    // If the sharer left, end the screen share immediately.
    if (this.state.media.adapter === 'screen-share' && this.state.media.sharerId === pid) {
      this.endScreenShare(p.name);
    }

    // Schedule full removal after the grace window.
    const existing = this.disconnectTimers.get(pid);
    if (existing) clearTimeout(existing);
    this.disconnectTimers.set(
      pid,
      setTimeout(() => this.removeParticipant(pid), DISCONNECT_GRACE_MS),
    );

    this.touch();
    this.broadcastState();
  }

  // -------------------------------------------------------------------------
  // Join flow
  // -------------------------------------------------------------------------

  private handleJoin(
    msg: Extract<ClientMessage, { type: 'room:join' }>,
    sender: Party.Connection,
  ): void {
    // Projectors are second-screen viewers, not crew — handled entirely apart
    // from the participant/seat/capacity/password machinery below.
    if (msg.role === 'projector') {
      this.handleProjectorJoin(msg, sender);
      return;
    }

    const identity = sanitizeIdentity(msg.participant);
    const now = Date.now();

    // Initialize on first create.
    if (!this.state) {
      if (!msg.create) {
        this.sendError(sender, 'room-not-found', 'this room dissolved into the haze');
        return void closeSoon(sender);
      }
      this.initRoom(identity, msg.create, now);
    }
    const state = this.state!;

    const existing = state.participants[identity.id];

    // Password gate (skip for an already-known rejoining participant).
    if (state.passwordEnabled && !existing) {
      const provided = msg.password ?? '';
      if (!provided) {
        this.sendError(sender, 'password-required', 'this couch is locked — password please');
        return void closeSoon(sender);
      }
      if (!constantTimeEqual(provided, this.password ?? '')) {
        this.sendError(sender, 'wrong-password', "that's not the password");
        return void closeSoon(sender);
      }
    }

    if (existing) {
      // Rejoin / reattach: cancel pending removal, refresh identity + presence.
      const timer = this.disconnectTimers.get(identity.id);
      if (timer) {
        clearTimeout(timer);
        this.disconnectTimers.delete(identity.id);
      }
      existing.connected = true;
      existing.lastSeen = now;
      existing.name = identity.name;
      existing.avatar = identity.avatar;
      existing.accent = identity.accent;
    } else {
      // New participant — enforce capacity (count connected only).
      const connected = Object.values(state.participants).filter((p) => p.connected).length;
      if (connected >= MAX_PARTICIPANTS) {
        this.sendError(sender, 'room-full', 'the couch is full — try again when someone leaves');
        return void closeSoon(sender);
      }
      state.participants[identity.id] = {
        id: identity.id,
        name: identity.name,
        avatar: identity.avatar,
        accent: identity.accent,
        status: 'chilling',
        isReady: false,
        joinedAt: now,
        lastSeen: now,
        connected: true,
      };
      const isHost = state.hostId === identity.id;
      this.pushEvent(
        'join',
        isHost ? `${identity.name} rolled up and started the room` : `${identity.name} flopped onto the couch`,
        identity.id,
        '🛋️',
      );
    }

    this.conns.set(sender.id, identity.id);

    // The host coming back to a controller-less couch reclaims the remote. While
    // the host was away the remote may have been handed off and then orphaned
    // (the last connected controller left → controllerId undefined, or it points
    // at a participant who has since been removed). Rather than leave the couch
    // stuck with nobody able to drive, the remote finds its way home.
    this.maybeRestoreRemoteToHost(identity.id);

    this.touch();

    // Reply to the joiner specifically; broadcast to everyone else.
    this.reply(sender, { type: 'joined', selfId: identity.id, state, serverNow: Date.now() });
    this.broadcastState(sender.id);
    this.schedulePersist();
  }

  /**
   * A companion "projector" window attaching (§1). It takes no seat, isn't
   * password-gated, doesn't count toward MAX_PARTICIPANTS, and creates no
   * participant entry — but it gets a `joined` reply + every broadcast, and its
   * conn→id mapping is registered so screen-share webrtc relays reach it.
   */
  private handleProjectorJoin(
    msg: Extract<ClientMessage, { type: 'room:join' }>,
    sender: Party.Connection,
  ): void {
    // Can't throw a movie onto a wall that doesn't exist yet.
    if (!this.state) {
      this.sendError(sender, 'room-not-found', 'this room dissolved into the haze');
      return void closeSoon(sender);
    }
    const projectorId = String(msg.participant?.id ?? '').slice(0, 64) || `prj_${crypto.randomUUID()}`;
    this.projectors.set(sender.id, projectorId);
    this.state.projectorCount = this.projectors.size;

    this.touch();
    // The projector needs full state to render; the crew wants the bumped count.
    this.reply(sender, { type: 'joined', selfId: projectorId, state: this.state, serverNow: Date.now() });
    this.broadcastState(sender.id);
    this.schedulePersist();
  }

  /**
   * Messages from a projector connection. Projectors are pure viewers: the only
   * traffic they may send is webrtc relay + `screen:viewer-ready` (so they can
   * pull a screen share), plus `ping`/`room:leave`. Anything that would mutate
   * room state is silently ignored — a projector can never drive the couch.
   */
  private handleProjectorMessage(
    msg: ClientMessage,
    sender: Party.Connection,
    projectorId: string,
  ): void {
    switch (msg.type) {
      case 'webrtc:offer':
        this.relay(msg.toId, { type: 'webrtc:offer', fromId: projectorId, sdp: msg.sdp });
        return;
      case 'webrtc:answer':
        this.relay(msg.toId, { type: 'webrtc:answer', fromId: projectorId, sdp: msg.sdp });
        return;
      case 'webrtc:ice':
        this.relay(msg.toId, { type: 'webrtc:ice', fromId: projectorId, candidate: msg.candidate });
        return;
      case 'screen:viewer-ready':
        this.relay(msg.toId, { type: 'screen:viewer-ready', fromId: projectorId });
        return;
      case 'room:leave':
        this.projectors.delete(sender.id);
        if (this.state) {
          this.state.projectorCount = this.projectors.size;
          this.touch();
          this.broadcastState();
          this.schedulePersist();
        }
        closeSoon(sender);
        return;
      default:
        // Projectors don't drive anything else; ignore silently.
        return;
    }
  }

  /**
   * If `pid` is the host and the remote is currently orphaned — `controllerId`
   * is undefined or points at a participant who no longer exists — hand the
   * remote back to the host. No-op otherwise (a live controller keeps it; the
   * §7 "last controller leaves" behavior of leaving controllerId as-is is
   * preserved until the host actually returns).
   */
  private maybeRestoreRemoteToHost(pid: string): void {
    const state = this.state!;
    if (state.hostId !== pid) return;
    const current = state.remote.controllerId;
    const orphaned = !current || !state.participants[current];
    if (!orphaned) return;
    state.remote.controllerId = pid;
    state.remote.pendingRequests = state.remote.pendingRequests.filter((id) => id !== pid);
    this.pushEvent('remote', `📺 the remote found its way back to ${this.name(pid)}`, pid, '📺');
  }

  private initRoom(identity: IdentitySnapshot, create: CreateOptions, now: number): void {
    const roomName = clampText(create.roomName ?? 'the couch', MAX_ROOM_NAME_LEN) || 'the couch';
    this.password = create.password || undefined;

    const media: MediaState = {
      adapter: 'idle',
      status: 'idle',
      position: 0,
      playbackRate: 1,
      updatedAtServerMs: now,
      seq: 0,
      isLive: false,
      canSeek: false,
      canPause: false,
    };

    this.state = {
      roomId: this.room.id,
      joinCode: create.joinCode,
      createdAt: now,
      updatedAt: now,
      passwordEnabled: !!create.password,
      hostId: identity.id,
      settings: {
        roomName,
        guestsCanAddToQueue: true,
        rotationAutoAdvanceSec: null,
      },
      participants: {},
      queue: [],
      media,
      remote: { controllerId: identity.id, pendingRequests: [], mode: 'request' },
      sesh: { enabled: false, rotationActive: false, rotationIds: [], currentRotationIndex: 0 },
      chat: [],
      events: [],
      projectorCount: this.projectors.size,
    };

    if (create.seedDemo) this.seedDemoQueue(identity, now);
  }

  private seedDemoQueue(identity: IdentitySnapshot, now: number): void {
    const state = this.state!;
    const seeds: Array<{ type: QueueItemType; source: string; title: string }> = [
      { type: 'direct-url', source: SAMPLE_VIDEOS.mp4, title: 'Big Buck Bunny (MP4)' },
      { type: 'direct-url', source: SAMPLE_VIDEOS.hls, title: 'Mux test stream (HLS)' },
      { type: 'youtube', source: SAMPLE_VIDEOS.youtube, title: 'Big Buck Bunny (YouTube)' },
    ];
    for (const s of seeds) {
      state.queue.push({
        id: crypto.randomUUID(),
        type: s.type,
        title: s.title,
        source: s.source,
        addedById: identity.id,
        addedByName: identity.name,
        createdAt: now,
        votes: [],
      });
    }
  }

  // -------------------------------------------------------------------------
  // Message dispatch
  // -------------------------------------------------------------------------

  private handleMessage(msg: ClientMessage, sender: Party.Connection, pid: string): void {
    const state = this.state!;
    switch (msg.type) {
      case 'room:leave':
        this.handleLeave(sender, pid);
        return;

      case 'presence:update':
        // Mutates state + triggers a broadcast, so it shares the 'action'
        // budget (vibe/name/avatar flips are user-paced, never high-frequency).
        if (!this.rateOk(sender, 'action')) return this.rateLimited(sender);
        this.handlePresence(msg, pid);
        break;
      case 'sesh:status':
        if (!this.rateOk(sender, 'action')) return this.rateLimited(sender);
        this.handleStatusChange(pid, msg.status);
        break;
      case 'chat:message':
        if (!this.rateOk(sender, 'chat')) return this.rateLimited(sender);
        if (!this.handleChat(msg, pid)) return;
        break;
      case 'reaction:send':
        if (!this.rateOk(sender, 'reaction')) return this.rateLimited(sender);
        this.handleReaction(msg, pid);
        return; // ephemeral — no state broadcast

      // ---- queue --------------------------------------------------------
      case 'queue:add':
        if (!this.rateOk(sender, 'queue')) return this.rateLimited(sender);
        if (!this.handleQueueAdd(msg, sender, pid)) return;
        break;
      case 'queue:remove':
        if (!this.rateOk(sender, 'queue')) return this.rateLimited(sender);
        if (!this.handleQueueRemove(msg, sender, pid)) return;
        break;
      case 'queue:move':
        if (!this.rateOk(sender, 'media')) return this.rateLimited(sender);
        if (!this.requireControl(sender, pid)) return;
        if (!this.handleQueueMove(msg)) return;
        break;
      case 'queue:vote':
        if (!this.rateOk(sender, 'queue')) return this.rateLimited(sender);
        if (!this.handleQueueVote(msg, pid)) return;
        break;
      case 'queue:play':
        if (!this.rateOk(sender, 'media')) return this.rateLimited(sender);
        if (!this.requireControl(sender, pid)) return;
        if (!this.handleLoad(msg.itemId, true, pid)) return;
        break;

      // ---- media --------------------------------------------------------
      case 'media:load':
        if (!this.rateOk(sender, 'media')) return this.rateLimited(sender);
        if (!this.requireControl(sender, pid)) return;
        if (!this.handleLoad(msg.itemId, false, pid)) return;
        break;
      case 'media:play':
        if (!this.rateOk(sender, 'media')) return this.rateLimited(sender);
        if (!this.requireControl(sender, pid)) return;
        this.handlePlay(msg.position, pid);
        break;
      case 'media:pause':
        if (!this.rateOk(sender, 'media')) return this.rateLimited(sender);
        if (!this.requireControl(sender, pid)) return;
        this.handlePause(pid);
        break;
      case 'media:seek':
        if (!this.rateOk(sender, 'media')) return this.rateLimited(sender);
        if (!this.requireControl(sender, pid)) return;
        this.handleSeek(msg.position, pid);
        break;
      case 'media:rate':
        if (!this.rateOk(sender, 'media')) return this.rateLimited(sender);
        if (!this.requireControl(sender, pid)) return;
        this.handleRate(msg.rate, pid);
        break;
      case 'media:heartbeat':
        // Controller only; adopts position WITHOUT a seq bump.
        if (state.remote.controllerId !== pid && state.hostId !== pid && state.remote.mode !== 'chaos') return;
        if (!this.handleHeartbeat(msg.position, msg.status)) return;
        break;
      case 'media:ended':
        if (state.remote.controllerId !== pid && state.hostId !== pid && state.remote.mode !== 'chaos') return;
        this.handleEnded();
        break;

      // ---- remote -------------------------------------------------------
      case 'remote:request':
        if (!this.rateOk(sender, 'action')) return this.rateLimited(sender);
        this.handleRemoteRequest(pid);
        break;
      case 'remote:grant':
        if (!this.rateOk(sender, 'action')) return this.rateLimited(sender);
        if (!this.handleRemoteGrant(msg.toId, sender, pid)) return;
        break;
      case 'remote:revoke':
        if (!this.rateOk(sender, 'action')) return this.rateLimited(sender);
        if (!this.handleRemoteRevoke(sender, pid)) return;
        break;
      case 'remote:pass':
        if (!this.rateOk(sender, 'action')) return this.rateLimited(sender);
        if (!this.handleRemotePass(msg.toId, sender, pid)) return;
        break;

      // ---- room actions -------------------------------------------------
      case 'room:action':
        if (!this.rateOk(sender, 'action')) return this.rateLimited(sender);
        this.handleRoomAction(msg.kind, pid);
        break;

      // ---- ready check --------------------------------------------------
      case 'ready:start':
        if (!this.rateOk(sender, 'action')) return this.rateLimited(sender);
        if (!this.requireControlOrHost(sender, pid)) return;
        this.handleReadyStart(pid);
        break;
      case 'ready:set':
        if (!this.rateOk(sender, 'action')) return this.rateLimited(sender);
        this.handleReadySet(msg.ready, pid);
        break;
      case 'ready:cancel':
        if (!this.rateOk(sender, 'action')) return this.rateLimited(sender);
        if (!this.requireControlOrHost(sender, pid)) return;
        if (!state.readyCheck) return;
        state.readyCheck = undefined;
        this.pushEvent('ready', 'ready check called off', pid);
        break;

      // ---- sesh ---------------------------------------------------------
      case 'sesh:enable':
        if (!this.rateOk(sender, 'action')) return this.rateLimited(sender);
        if (!this.requireControlOrHost(sender, pid)) return;
        this.handleSeshEnable(msg.enabled, pid);
        break;
      case 'sesh:rotation:join':
        if (!this.rateOk(sender, 'action')) return this.rateLimited(sender);
        if (!this.handleRotationJoin(pid)) return;
        break;
      case 'sesh:rotation:leave':
        if (!this.rateOk(sender, 'action')) return this.rateLimited(sender);
        if (!this.handleRotationLeave(pid)) return;
        break;
      case 'sesh:rotation:start':
        if (!this.rateOk(sender, 'action')) return this.rateLimited(sender);
        if (!this.requireControlOrHost(sender, pid)) return;
        if (!this.handleRotationStart(pid)) return;
        break;
      case 'sesh:rotation:stop':
        if (!this.rateOk(sender, 'action')) return this.rateLimited(sender);
        if (!this.requireControlOrHost(sender, pid)) return;
        if (!this.handleRotationStop()) return;
        break;
      case 'sesh:rotation:pass':
        if (!this.rateOk(sender, 'action')) return this.rateLimited(sender);
        if (!this.handleRotationPass(msg.direction ?? 'left', sender, pid)) return;
        break;
      case 'sesh:rotation:hit':
        if (!this.rateOk(sender, 'action')) return this.rateLimited(sender);
        if (!this.handleRotationHit(sender, pid)) return;
        break;
      case 'sesh:countdown:start':
        if (!this.rateOk(sender, 'action')) return this.rateLimited(sender);
        if (!this.handleCountdownStart(msg.seconds, sender, pid)) return;
        break;
      case 'sesh:snack-vote':
        if (!this.rateOk(sender, 'action')) return this.rateLimited(sender);
        this.handleSnackVote(msg.vote, pid);
        break;

      // ---- settings -----------------------------------------------------
      case 'settings:update':
        if (!this.rateOk(sender, 'action')) return this.rateLimited(sender);
        if (state.hostId !== pid) return this.sendError(sender, 'not-allowed', 'only the host can do that');
        this.handleSettingsUpdate(msg.settings, pid);
        break;

      // ---- relays (ephemeral, no broadcast) -----------------------------
      case 'webrtc:offer':
        this.relay(msg.toId, { type: 'webrtc:offer', fromId: pid, sdp: msg.sdp });
        return;
      case 'webrtc:answer':
        this.relay(msg.toId, { type: 'webrtc:answer', fromId: pid, sdp: msg.sdp });
        return;
      case 'webrtc:ice':
        this.relay(msg.toId, { type: 'webrtc:ice', fromId: pid, candidate: msg.candidate });
        return;
      case 'screen:viewer-ready':
        this.relay(msg.toId, { type: 'screen:viewer-ready', fromId: pid });
        return;

      // ---- screen share -------------------------------------------------
      case 'screen:start':
        if (!this.rateOk(sender, 'action')) return this.rateLimited(sender);
        if (!this.handleScreenStart(pid)) return;
        break;
      case 'screen:stop':
        if (!this.rateOk(sender, 'action')) return this.rateLimited(sender);
        if (!this.handleScreenStop(pid)) return;
        break;

      default: {
        // Exhaustiveness guard — every handled type returns/breaks above.
        const _never: never = msg as never;
        return _never;
      }
    }

    // Common tail for any branch that fell through (i.e. mutated state).
    this.touch();
    this.broadcastState();
    this.schedulePersist();
  }

  // -------------------------------------------------------------------------
  // Presence / chat / reactions
  // -------------------------------------------------------------------------

  private handleLeave(sender: Party.Connection, pid: string): void {
    this.conns.delete(sender.id);
    if (!this.hasOtherConnection(pid, sender.id)) {
      // An explicit leave IS a disconnect — flip `connected` first so
      // removeParticipant's "they reconnected in the meantime" guard
      // (`if (p.connected) return`) doesn't skip the removal.
      const p = this.state?.participants[pid];
      if (p) p.connected = false;
      this.removeParticipant(pid);
    }
    closeSoon(sender);
  }

  private handlePresence(msg: Extract<ClientMessage, { type: 'presence:update' }>, pid: string): void {
    const p = this.state!.participants[pid];
    if (msg.status) p.status = msg.status;
    if (typeof msg.isReady === 'boolean') p.isReady = msg.isReady;
    if (msg.name) p.name = clampText(msg.name, MAX_NAME_LEN) || p.name;
    if (msg.avatar) p.avatar = msg.avatar;
    if (msg.accent) p.accent = msg.accent;
  }

  /** A sesh-flavored status change (`sesh:status`): sets status + logs a sesh event line. */
  private handleStatusChange(pid: string, status: Participant['status']): void {
    const p = this.state!.participants[pid];
    p.status = status;
    this.pushEvent('status', `${p.name} is now ${statusPhrase(status)}`, pid, statusEmoji(status));
  }

  private handleChat(msg: Extract<ClientMessage, { type: 'chat:message' }>, pid: string): boolean {
    const text = sanitizeChat(msg.text);
    if (!text) return false;
    const p = this.state!.participants[pid];
    const line: ChatMessage = {
      id: crypto.randomUUID(),
      authorId: p.id,
      authorName: p.name,
      authorAvatar: p.avatar,
      authorAccent: p.accent,
      text,
      ts: Date.now(),
    };
    this.state!.chat.push(line);
    if (this.state!.chat.length > MAX_CHAT) this.state!.chat.splice(0, this.state!.chat.length - MAX_CHAT);
    return true;
  }

  private handleReaction(msg: Extract<ClientMessage, { type: 'reaction:send' }>, pid: string): void {
    const emoji = clampText(msg.emoji, 16);
    if (!emoji) return;
    this.broadcast({ type: 'reaction:send', fromId: pid, emoji });
  }

  // -------------------------------------------------------------------------
  // Queue
  // -------------------------------------------------------------------------

  private handleQueueAdd(
    msg: Extract<ClientMessage, { type: 'queue:add' }>,
    sender: Party.Connection,
    pid: string,
  ): boolean {
    const state = this.state!;
    const allowed = state.settings.guestsCanAddToQueue || canControl(state, pid);
    if (!allowed) {
      this.sendError(sender, 'not-allowed', 'ask whoever has the remote to add things');
      return false;
    }
    const item = sanitizeNewItem(msg.item);
    if (!item) {
      this.sendError(sender, 'invalid-message', "that link didn't look right");
      return false;
    }
    const p = state.participants[pid];
    const queueItem: QueueItem = {
      id: crypto.randomUUID(),
      type: item.type,
      title: item.title || defaultTitle(item.type),
      source: item.source,
      addedById: pid,
      addedByName: p.name,
      duration: item.duration,
      thumbnail: item.thumbnail,
      createdAt: Date.now(),
      votes: [],
    };
    state.queue.push(queueItem);
    this.pushEvent('queue', `${p.name} added "${queueItem.title}" to the queue`, pid, '➕');
    return true;
  }

  private handleQueueRemove(
    msg: Extract<ClientMessage, { type: 'queue:remove' }>,
    sender: Party.Connection,
    pid: string,
  ): boolean {
    const state = this.state!;
    const idx = state.queue.findIndex((q) => q.id === msg.itemId);
    if (idx === -1) return false;
    const item = state.queue[idx];
    const allowed = item.addedById === pid || canControl(state, pid);
    if (!allowed) {
      this.sendError(sender, 'not-allowed', "that's not yours to yoink");
      return false;
    }
    state.queue.splice(idx, 1);
    const p = state.participants[pid];
    this.pushEvent('queue', `${p.name} removed "${item.title}" from the queue`, pid, '➖');

    // If the removed item is the one currently loaded/playing, the MediaState
    // would otherwise go stale (adapter/status frozen, position ticking forever,
    // and MediaStage's adapter==='idle' auto-play guard never re-arming). Reset
    // to a clean idle command. A live screen-share also needs the screen:stop
    // teardown so viewers tear down their peer connections.
    if (state.media.queueItemId === item.id) {
      const wasScreenShare = state.media.adapter === 'screen-share';
      const sharerName = state.media.sharerId ? this.name(state.media.sharerId) : 'someone';
      this.resetMediaToIdle();
      this.pushEvent('media', `📺 ${p.name} took "${item.title}" off the tv`, pid, '📺');
      // Mirror the screen:stop teardown so viewers drop their peer connections.
      if (wasScreenShare) {
        this.pushEvent('media', `🖥️ ${sharerName} stopped sharing`, undefined, '🖥️');
      }
    }
    return true;
  }

  private handleQueueMove(msg: Extract<ClientMessage, { type: 'queue:move' }>): boolean {
    const state = this.state!;
    const idx = state.queue.findIndex((q) => q.id === msg.itemId);
    if (idx === -1) return false;
    const to = Math.max(0, Math.min(state.queue.length - 1, Math.floor(msg.toIndex)));
    if (to === idx) return false;
    const [item] = state.queue.splice(idx, 1);
    state.queue.splice(to, 0, item);
    return true;
  }

  private handleQueueVote(msg: Extract<ClientMessage, { type: 'queue:vote' }>, pid: string): boolean {
    const item = this.state!.queue.find((q) => q.id === msg.itemId);
    if (!item) return false;
    const i = item.votes.indexOf(pid);
    if (i === -1) item.votes.push(pid);
    else item.votes.splice(i, 1);
    return true;
  }

  // -------------------------------------------------------------------------
  // Media (authoritative; seq++ on each explicit command)
  // -------------------------------------------------------------------------

  /** Load (and optionally schedule play) a queue item. Returns false if missing. */
  private handleLoad(itemId: string, play: boolean, pid: string): boolean {
    const state = this.state!;
    const item = state.queue.find((q) => q.id === itemId);
    if (!item) return false;
    const now = Date.now();
    const m = state.media;

    m.queueItemId = item.id;
    m.sourceId = item.source;
    m.title = item.title;
    m.duration = item.duration;
    m.playbackRate = 1;
    m.seq += 1;

    if (item.type === 'screen-share') {
      m.adapter = 'screen-share';
      m.sharerId = item.source;
      m.isLive = true;
      m.canSeek = false;
      m.canPause = false;
      m.position = 0;
      m.status = 'loading'; // becomes 'live' when the sharer sends screen:start
      m.updatedAtServerMs = now;
    } else {
      m.adapter = item.type === 'youtube' ? 'youtube' : 'direct-url';
      m.sharerId = undefined;
      m.isLive = false;
      m.canSeek = true;
      m.canPause = true;
      m.position = 0;
      if (play) {
        m.status = 'playing';
        m.updatedAtServerMs = now + PLAY_LEAD_MS;
      } else {
        m.status = 'loading';
        m.updatedAtServerMs = now;
      }
    }

    const p = state.participants[pid];
    this.pushEvent('media', `${p.name} ${play ? 'started' : 'cued up'} "${item.title}"`, pid, '📺');
    return true;
  }

  private handlePlay(position: number | undefined, pid: string): void {
    const state = this.state!;
    const m = state.media;
    if (m.adapter === 'idle' || m.adapter === 'screen-share') return;
    const now = Date.now();
    m.position = position ?? authoritativePosition(m, now);
    m.status = 'playing';
    m.updatedAtServerMs = now + PLAY_LEAD_MS;
    m.seq += 1;
    this.pushEvent('media', `${this.name(pid)} hit play`, pid, '▶️');
  }

  private handlePause(pid: string): void {
    const m = this.state!.media;
    if (m.adapter === 'idle' || m.adapter === 'screen-share') return;
    const now = Date.now();
    m.position = authoritativePosition(m, now);
    m.status = 'paused';
    m.updatedAtServerMs = now;
    m.seq += 1;
    this.pushEvent('media', `${this.name(pid)} paused it`, pid, '⏸️');
  }

  private handleSeek(position: number, pid: string): void {
    const m = this.state!.media;
    if (m.adapter === 'idle' || m.adapter === 'screen-share' || !m.canSeek) return;
    const now = Date.now();
    const max = m.duration && m.duration > 0 ? m.duration : Number.POSITIVE_INFINITY;
    m.position = Math.max(0, Math.min(max, position));
    m.updatedAtServerMs = m.status === 'playing' ? now + PLAY_LEAD_MS : now;
    m.seq += 1;
    this.pushEvent('media', `${this.name(pid)} jumped to ${formatTime(m.position)}`, pid, '⏩');
  }

  private handleRate(rate: number, pid: string): void {
    const m = this.state!.media;
    if (m.adapter === 'idle' || m.adapter === 'screen-share') return;
    const now = Date.now();
    // Recompute position to now BEFORE changing the rate so the anchor stays correct.
    m.position = authoritativePosition(m, now);
    m.updatedAtServerMs = now;
    m.playbackRate = Math.max(0.25, Math.min(2, rate));
    m.seq += 1;
    this.pushEvent('media', `${this.name(pid)} set speed to ${m.playbackRate}×`, pid, '⏱️');
  }

  /**
   * Adopt a heartbeat position when it drifts > 0.4s. NO seq bump.
   * Returns true if the position was adopted (triggers broadcast); false otherwise.
   *
   * Position is ONLY adopted when ALL of:
   *   1. Server media.status === 'playing'
   *   2. The controller's locally-reported status === 'playing'
   *      (prevents a stalled/black player from dragging the authoritative position)
   *   3. updatedAtServerMs <= now (no pending scheduled start in the future)
   *      (prevents heartbeats from fighting a scheduled play command)
   *
   * When conditions are not met we still refresh state.updatedAt so the room
   * stays alive — but we do NOT broadcast (no seq bump, no position change).
   */
  private handleHeartbeat(reported: number, reportedStatus: string): boolean {
    const state = this.state!;
    const m = state.media;
    const now = Date.now();

    // Guard: all three conditions must hold before adopting the reported position.
    const canAdopt =
      m.status === 'playing' &&
      reportedStatus === 'playing' &&
      m.updatedAtServerMs <= now;

    if (!canAdopt) {
      // Refresh updatedAt so the room doesn't appear stale, but skip the broadcast.
      state.updatedAt = now;
      return false;
    }

    const auth = authoritativePosition(m, now);
    if (Math.abs(reported - auth) <= HEARTBEAT_DRIFT_S) return false;

    m.position = Math.max(0, reported);
    m.updatedAtServerMs = now;
    // seq deliberately NOT bumped — this is an anchor refresh, not a command.
    return true;
  }

  private handleEnded(): void {
    const state = this.state!;
    const m = state.media;
    const idx = state.queue.findIndex((q) => q.id === m.queueItemId);
    const next = idx >= 0 ? state.queue[idx + 1] : undefined;
    if (next) {
      this.handleLoad(next.id, true, state.hostId);
      this.pushEvent('media', `up next: "${next.title}"`, undefined, '⏭️');
    } else {
      m.status = 'ended';
      m.updatedAtServerMs = Date.now();
      m.seq += 1;
      this.pushEvent('media', 'that was the last one — queue something else', undefined, '🎬');
    }
  }

  // -------------------------------------------------------------------------
  // Remote
  // -------------------------------------------------------------------------

  private handleRemoteRequest(pid: string): void {
    const r = this.state!.remote;
    if (r.controllerId === pid) return;
    if (!r.pendingRequests.includes(pid)) {
      r.pendingRequests.push(pid);
      this.pushEvent('remote', `${this.name(pid)} wants the remote`, pid, '🙋');
    }
  }

  private handleRemoteGrant(toId: string, sender: Party.Connection, pid: string): boolean {
    const state = this.state!;
    if (state.remote.controllerId !== pid && state.hostId !== pid) {
      this.sendError(sender, 'not-allowed', "you don't have the remote to give");
      return false;
    }
    if (!state.participants[toId]) return false;
    state.remote.controllerId = toId;
    state.remote.pendingRequests = state.remote.pendingRequests.filter((id) => id !== toId);
    this.pushEvent('remote', `the remote went to ${this.name(toId)}`, toId, '📺');
    return true;
  }

  private handleRemoteRevoke(sender: Party.Connection, pid: string): boolean {
    const state = this.state!;
    if (state.remote.controllerId !== pid && state.hostId !== pid) {
      this.sendError(sender, 'not-allowed', 'only the controller or host can do that');
      return false;
    }
    state.remote.controllerId = state.hostId;
    this.pushEvent('remote', `the remote slid back to ${this.name(state.hostId)}`, state.hostId, '📺');
    return true;
  }

  private handleRemotePass(toId: string, sender: Party.Connection, pid: string): boolean {
    const state = this.state!;
    if (state.remote.controllerId !== pid) {
      this.sendError(sender, 'not-allowed', 'you have to hold the remote to pass it');
      return false;
    }
    if (!state.participants[toId]) return false;
    state.remote.controllerId = toId;
    state.remote.pendingRequests = state.remote.pendingRequests.filter((id) => id !== toId);
    this.pushEvent('remote', `${this.name(pid)} passed the remote to ${this.name(toId)}`, toId, '📺');
    return true;
  }

  // -------------------------------------------------------------------------
  // Room actions
  // -------------------------------------------------------------------------

  private handleRoomAction(kind: RoomActionKind, pid: string): void {
    const state = this.state!;
    const name = this.name(pid);
    switch (kind) {
      case 'emergency-pause': {
        const m = state.media;
        if (m.canPause && m.status === 'playing') {
          m.position = authoritativePosition(m, Date.now());
          m.status = 'paused';
          m.updatedAtServerMs = Date.now();
          m.seq += 1;
        }
        this.pushEvent('media', `🚨 ${name} emergency-paused the room — they're dying`, pid, '🚨');
        break;
      }
      case 'water-check':
        this.pushEvent('sesh', `💧 ${name} called a water check — hydrate, gremlins`, pid, '💧');
        break;
      case 'vibe-check':
        this.pushEvent('sesh', `✨ ${name} ran a vibe check — everyone confirm the vibes`, pid, '🔮');
        break;
      case 'bathroom':
        this.pushEvent('sesh', `🚽 ${name} is making a bathroom run — hold the moment`, pid, '🚽');
        break;
      case 'pass-the-vibe':
        this.pushEvent('sesh', `${name} passed the vibe around the couch`, pid, '✨');
        break;
      case 'snack-run':
        this.pushEvent('sesh', `🍿 ${name} is doing a snack run — take orders`, pid, '🍿');
        break;
      default: {
        const _never: never = kind;
        return _never;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Ready check
  // -------------------------------------------------------------------------

  private handleReadyStart(pid: string): void {
    const state = this.state!;
    state.readyCheck = { active: true, startedAt: Date.now(), startedById: pid };
    for (const p of Object.values(state.participants)) p.isReady = false;
    this.pushEvent('ready', `${this.name(pid)} started a ready check — everyone lock in`, pid, '✅');
  }

  private handleReadySet(ready: boolean, pid: string): void {
    const state = this.state!;
    const p = state.participants[pid];
    if (p.isReady === ready) return;
    p.isReady = ready;
    if (ready) this.pushEvent('ready', `${p.name} is locked in`, pid, '🟢');

    if (state.readyCheck?.active) {
      const connected = Object.values(state.participants).filter((x) => x.connected);
      if (connected.length > 0 && connected.every((x) => x.isReady)) {
        this.pushEvent('ready', "🟢 Everyone's ready", undefined, '🟢');
        state.readyCheck = undefined; // keep flags
      }
    }
  }

  // -------------------------------------------------------------------------
  // Sesh
  // -------------------------------------------------------------------------

  private handleSeshEnable(enabled: boolean, pid: string): void {
    const state = this.state!;
    state.sesh.enabled = enabled;
    if (!enabled) {
      this.stopRotation();
      this.clearCountdown();
      state.sesh.snackVote = undefined;
      if (this.snackTimer) clearTimeout(this.snackTimer), (this.snackTimer = null);
    }
    this.pushEvent('sesh', enabled ? `${this.name(pid)} flipped on Sesh Mode 🌿` : `${this.name(pid)} ended the sesh`, pid, enabled ? '🌿' : '🌙');
  }

  private handleRotationJoin(pid: string): boolean {
    const s = this.state!.sesh;
    if (!s.enabled) return false;
    if (s.rotationIds.includes(pid)) return false;
    s.rotationIds.push(pid);
    this.pushEvent('sesh', `${this.name(pid)} joined the rotation`, pid, '🔄');
    return true;
  }

  private handleRotationLeave(pid: string): boolean {
    const s = this.state!.sesh;
    const idx = s.rotationIds.indexOf(pid);
    if (idx === -1) return false;
    this.removeFromRotation(pid);
    this.pushEvent('sesh', `${this.name(pid)} stepped out of the rotation`, pid, '🔄');
    return true;
  }

  private handleRotationStart(pid: string): boolean {
    const s = this.state!.sesh;
    if (!s.enabled || s.rotationIds.length < 1) return false;
    s.rotationActive = true;
    s.currentRotationIndex = 0;
    s.currentTurnStartedAt = Date.now();
    this.pushEvent('sesh', `🔄 rotation started — ${this.name(s.rotationIds[0])} is up first`, pid, '🔄');
    this.armRotationTimer();
    return true;
  }

  private handleRotationStop(): boolean {
    const s = this.state!.sesh;
    if (!s.rotationActive) return false;
    this.stopRotation();
    this.pushEvent('sesh', 'rotation wrapped up', undefined, '🔄');
    return true;
  }

  private handleRotationPass(direction: 'left' | 'right', sender: Party.Connection, pid: string): boolean {
    const state = this.state!;
    const s = state.sesh;
    if (!s.rotationActive || s.rotationIds.length === 0) return false;
    const isMember = s.rotationIds.includes(pid);
    if (!isMember && !canControl(state, pid)) {
      this.sendError(sender, 'not-allowed', 'only people in the rotation can pass');
      return false;
    }
    const delta = direction === 'right' ? -1 : 1; // left = +1 (default), right = −1
    const n = s.rotationIds.length;
    s.currentRotationIndex = ((s.currentRotationIndex + delta) % n + n) % n;
    s.currentTurnStartedAt = Date.now();
    this.pushEvent('sesh', `🍃 passed to ${this.name(s.rotationIds[s.currentRotationIndex])}`, pid, '🍃');
    this.armRotationTimer(); // resets the auto-advance window
    return true;
  }

  private handleRotationHit(sender: Party.Connection, pid: string): boolean {
    const s = this.state!.sesh;
    if (!s.rotationIds.includes(pid)) {
      this.sendError(sender, 'not-allowed', 'join the rotation first');
      return false;
    }
    const p = this.state!.participants[pid];
    p.status = 'hitting';
    this.pushEvent('sesh', `💨 ${p.name} is hitting it`, pid, '💨');
    return true;
  }

  private handleCountdownStart(seconds: number, sender: Party.Connection, pid: string): boolean {
    const s = this.state!.sesh;
    if (!s.enabled) {
      this.sendError(sender, 'not-allowed', 'turn on sesh mode first');
      return false;
    }
    const secs = Math.max(1, Math.min(60, Math.floor(seconds)));
    this.clearCountdown();
    s.sparkCountdownEndsAt = Date.now() + secs * 1000;
    this.pushEvent('sesh', `🔥 Spark countdown — everyone hits in ${secs}…`, pid, '🔥');
    this.countdownTimer = setTimeout(() => this.fireSpark(), secs * 1000);
    return true;
  }

  private fireSpark(): void {
    if (!this.state) return;
    const s = this.state.sesh;
    s.sparkCountdownEndsAt = undefined;
    this.countdownTimer = null;
    for (const id of s.rotationIds) {
      const p = this.state.participants[id];
      if (p) p.status = 'hitting';
    }
    this.pushEvent('sesh', '💨 BLAZE IT — the room sparked together', undefined, '💨');
    this.touch();
    this.broadcastState();
    this.schedulePersist();
  }

  private handleSnackVote(vote: 'yes' | 'no', pid: string): void {
    const s = this.state!.sesh;
    const now = Date.now();
    if (!s.snackVote || s.snackVote.endsAt <= now) {
      s.snackVote = { startedById: pid, endsAt: now + SNACK_VOTE_WINDOW_MS, yes: [], no: [] };
      this.pushEvent('sesh', `🍿 ${this.name(pid)} opened a snack-run vote — yay or nay?`, pid, '🍿');
      if (this.snackTimer) clearTimeout(this.snackTimer);
      this.snackTimer = setTimeout(() => this.tallySnack(), SNACK_VOTE_WINDOW_MS);
    }
    const v = s.snackVote;
    v.yes = v.yes.filter((id) => id !== pid);
    v.no = v.no.filter((id) => id !== pid);
    if (vote === 'yes') v.yes.push(pid);
    else v.no.push(pid);
  }

  private tallySnack(): void {
    if (!this.state) return;
    const v = this.state.sesh.snackVote;
    this.snackTimer = null;
    if (!v) return;
    const y = v.yes.length;
    const n = v.no.length;
    const approved = y > n;
    this.pushEvent(
      'sesh',
      approved ? `🍿 Snack run APPROVED ${y}–${n}` : `🍿 Snack run rejected ${y}–${n}, the couch wins`,
      undefined,
      '🍿',
    );
    this.state.sesh.snackVote = undefined;
    this.touch();
    this.broadcastState();
    this.schedulePersist();
  }

  // -------------------------------------------------------------------------
  // Settings
  // -------------------------------------------------------------------------

  private handleSettingsUpdate(
    settings: Extract<ClientMessage, { type: 'settings:update' }>['settings'],
    pid: string,
  ): void {
    const state = this.state!;
    if (typeof settings.roomName === 'string') {
      state.settings.roomName = clampText(settings.roomName, MAX_ROOM_NAME_LEN) || state.settings.roomName;
    }
    if (typeof settings.guestsCanAddToQueue === 'boolean') {
      state.settings.guestsCanAddToQueue = settings.guestsCanAddToQueue;
    }
    if ('rotationAutoAdvanceSec' in settings) {
      const v = settings.rotationAutoAdvanceSec;
      state.settings.rotationAutoAdvanceSec =
        v === null ? null : Math.max(5, Math.min(600, Math.floor(v as number)));
      this.armRotationTimer(); // re-arm/cancel with the new cadence
    }
    if (settings.remoteMode && (settings.remoteMode === 'host-only' || settings.remoteMode === 'request' || settings.remoteMode === 'chaos')) {
      state.remote.mode = settings.remoteMode;
    }
    this.pushEvent('system', `${this.name(pid)} tweaked the room settings`, pid, '⚙️');
  }

  // -------------------------------------------------------------------------
  // Screen share
  // -------------------------------------------------------------------------

  private handleScreenStart(pid: string): boolean {
    const state = this.state!;
    const m = state.media;
    if (m.adapter !== 'screen-share' || m.sharerId !== pid) return false;
    m.status = 'live';
    m.isLive = true;
    m.updatedAtServerMs = Date.now();
    // No seq bump needed: clients already know the adapter; this is a liveness flip.
    this.pushEvent('media', `🖥️ ${this.name(pid)} started sharing their screen`, pid, '🖥️');
    return true;
  }

  private handleScreenStop(pid: string): boolean {
    const state = this.state!;
    const m = state.media;
    if (m.adapter !== 'screen-share' || m.sharerId !== pid) return false;
    this.endScreenShare(this.name(pid));
    return true;
  }

  /** Reset media to idle when a screen-share ends (sharer stop or disconnect). */
  private endScreenShare(name: string): void {
    this.resetMediaToIdle();
    this.pushEvent('media', `🖥️ ${name} stopped sharing`, undefined, '🖥️');
  }

  /**
   * Reset `media` to a clean idle state and bump `seq` so clients apply it as a
   * command. Mirrors the §7 idle defaults set on room creation. Callers append
   * their own contextual event (screen-share teardown, queue removal, etc.).
   */
  private resetMediaToIdle(): void {
    const m = this.state!.media;
    m.adapter = 'idle';
    m.status = 'idle';
    m.queueItemId = undefined;
    m.sourceId = undefined;
    m.sharerId = undefined;
    m.title = undefined;
    m.duration = undefined;
    m.position = 0;
    m.isLive = false;
    m.canSeek = false;
    m.canPause = false;
    m.playbackRate = 1;
    m.updatedAtServerMs = Date.now();
    m.seq += 1;
  }

  // -------------------------------------------------------------------------
  // Rotation helpers
  // -------------------------------------------------------------------------

  private removeFromRotation(id: string): void {
    const s = this.state!.sesh;
    const idx = s.rotationIds.indexOf(id);
    if (idx === -1) return;
    s.rotationIds.splice(idx, 1);
    if (s.rotationIds.length === 0) {
      this.stopRotation();
      return;
    }
    // Keep currentRotationIndex pointing at the same logical "next" person.
    if (idx < s.currentRotationIndex) s.currentRotationIndex -= 1;
    if (s.currentRotationIndex >= s.rotationIds.length) s.currentRotationIndex = 0;
  }

  private stopRotation(): void {
    const s = this.state!.sesh;
    s.rotationActive = false;
    s.currentTurnStartedAt = undefined;
    if (this.rotationTimer) {
      clearTimeout(this.rotationTimer);
      this.rotationTimer = null;
    }
  }

  /** (Re)arm the auto-advance timer if rotation is active and a cadence is set. */
  private armRotationTimer(): void {
    if (this.rotationTimer) {
      clearTimeout(this.rotationTimer);
      this.rotationTimer = null;
    }
    const state = this.state!;
    const s = state.sesh;
    const sec = state.settings.rotationAutoAdvanceSec;
    if (!s.rotationActive || sec === null || s.rotationIds.length === 0) return;
    this.rotationTimer = setTimeout(() => this.autoAdvanceRotation(), sec * 1000);
  }

  private autoAdvanceRotation(): void {
    if (!this.state) return;
    const s = this.state.sesh;
    this.rotationTimer = null;
    if (!s.rotationActive || s.rotationIds.length === 0) return;
    const n = s.rotationIds.length;
    s.currentRotationIndex = (s.currentRotationIndex + 1) % n;
    s.currentTurnStartedAt = Date.now();
    this.pushEvent('sesh', `🍃 auto-passed to ${this.name(s.rotationIds[s.currentRotationIndex])}`, undefined, '🍃');
    this.armRotationTimer();
    this.touch();
    this.broadcastState();
    this.schedulePersist();
  }

  // -------------------------------------------------------------------------
  // Presence lifecycle
  // -------------------------------------------------------------------------

  private removeParticipant(pid: string): void {
    if (!this.state) return;
    const timer = this.disconnectTimers.get(pid);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(pid);
    }
    const p = this.state.participants[pid];
    if (!p) return;
    // If they reconnected in the meantime, keep them.
    if (p.connected) return;

    delete this.state.participants[pid];
    this.removeFromRotation(pid);
    this.state.remote.pendingRequests = this.state.remote.pendingRequests.filter((id) => id !== pid);
    if (this.state.remote.controllerId === pid) this.transferRemoteFrom(pid);
    if (this.state.media.adapter === 'screen-share' && this.state.media.sharerId === pid) {
      this.endScreenShare(p.name);
    }

    // §7 hygiene: the last seat just emptied (post-grace). Dissolve the couch —
    // wipe state to uninitialized, cancel EVERY timer, and clear storage so a
    // cold reload can't resurrect a ghost room. A lingering projector window, if
    // any, is left to discover the empty room on its own and close out.
    if (Object.keys(this.state.participants).length === 0) {
      this.resetRoom();
      return;
    }

    this.touch();
    this.broadcastState();
    this.schedulePersist();
  }

  /**
   * Full room teardown (§7): cancel all server timers, drop the in-memory state
   * + private password back to uninitialized, and wipe storage so nothing
   * survives. The next `room:join` with a `create` payload starts fresh.
   *
   * Projectors are dropped from the count but their sockets aren't force-closed
   * here — a projector watching an empty couch will get the now-uninitialized
   * picture on its next interaction and tear itself down.
   */
  private resetRoom(): void {
    this.cancelAllTimers();
    this.state = null;
    this.password = undefined;
    this.persistDirty = false;
    void this.room.storage.deleteAll().catch(() => {
      // Best-effort wipe; a failed deleteAll only risks a stale snapshot that
      // SNAPSHOT_MAX_AGE_MS will eventually age out anyway.
    });
  }

  /**
   * Cancel and forget EVERY server-side timer handle: per-participant disconnect
   * grace timers, rotation auto-advance, spark countdown, snack-vote tally, and
   * the throttled persist timer. Audited against every `setTimeout`/`setInterval`
   * in this file — if a new timer is added, clear it here too.
   */
  private cancelAllTimers(): void {
    for (const t of this.disconnectTimers.values()) clearTimeout(t);
    this.disconnectTimers.clear();
    if (this.rotationTimer) {
      clearTimeout(this.rotationTimer);
      this.rotationTimer = null;
    }
    if (this.countdownTimer) {
      clearTimeout(this.countdownTimer);
      this.countdownTimer = null;
    }
    if (this.snackTimer) {
      clearTimeout(this.snackTimer);
      this.snackTimer = null;
    }
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
  }

  /** Hand the remote to the host (if connected) else the earliest-joined connected participant. */
  private transferRemoteFrom(fromId: string): void {
    const state = this.state!;
    const host = state.participants[state.hostId];
    let target: Participant | undefined;
    if (host && host.connected && host.id !== fromId) {
      target = host;
    } else {
      target = Object.values(state.participants)
        .filter((p) => p.connected && p.id !== fromId)
        .sort((a, b) => a.joinedAt - b.joinedAt)[0];
    }
    state.remote.controllerId = target?.id;
    if (target) {
      this.pushEvent('remote', `📺 the remote slid over to ${target.name}`, target.id, '📺');
    }
  }

  // -------------------------------------------------------------------------
  // Permission helpers
  // -------------------------------------------------------------------------

  private requireControl(sender: Party.Connection, pid: string): boolean {
    if (canControl(this.state!, pid)) return true;
    this.sendError(sender, 'not-allowed', 'ask for the remote first');
    return false;
  }

  private requireControlOrHost(sender: Party.Connection, pid: string): boolean {
    const state = this.state!;
    if (state.hostId === pid || state.remote.controllerId === pid) return true;
    this.sendError(sender, 'not-allowed', 'that needs the host or the remote');
    return false;
  }

  // -------------------------------------------------------------------------
  // Events / broadcasting / persistence
  // -------------------------------------------------------------------------

  private pushEvent(kind: RoomEventKind, text: string, actorId?: string, emoji?: string): void {
    if (!this.state) return;
    const ev: RoomEvent = { id: crypto.randomUUID(), ts: Date.now(), kind, text, actorId, emoji };
    this.state.events.push(ev);
    if (this.state.events.length > MAX_EVENTS) {
      this.state.events.splice(0, this.state.events.length - MAX_EVENTS);
    }
  }

  private touch(): void {
    if (this.state) this.state.updatedAt = Date.now();
  }

  private broadcastState(exceptId?: string): void {
    if (!this.state) return;
    const payload = serializeMessage({ type: 'room:state', state: this.state, serverNow: Date.now() });
    this.room.broadcast(payload, exceptId ? [exceptId] : undefined);
  }

  private broadcast(msg: ServerMessage): void {
    this.room.broadcast(serializeMessage(msg));
  }

  private reply(conn: Party.Connection, msg: ServerMessage): void {
    conn.send(serializeMessage(msg));
  }

  private relay(toId: string, msg: ServerMessage): void {
    const payload = serializeMessage(msg);
    for (const [connId, pid] of this.conns) {
      if (pid !== toId) continue;
      const conn = this.room.getConnection(connId);
      if (conn) conn.send(payload);
    }
    // Projectors are valid relay targets — a screen share reaches them the same
    // way it reaches any crew viewer.
    for (const [connId, prjId] of this.projectors) {
      if (prjId !== toId) continue;
      const conn = this.room.getConnection(connId);
      if (conn) conn.send(payload);
    }
  }

  private sendError(conn: Party.Connection, code: ErrorCode, message: string): void {
    conn.send(serializeMessage({ type: 'error', code, message }));
  }

  private rateLimited(conn: Party.Connection): void {
    this.sendError(conn, 'rate-limited', 'whoa, slow down');
  }

  private rateOk(sender: Party.Connection, category: RateCategory): boolean {
    return this.limiter.check(`${sender.id}:${category}`, RATE_RULES[category]);
  }

  /** Throttled persist (~2s) of `{ state, password }` to room storage. */
  private schedulePersist(): void {
    this.persistDirty = true;
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      if (this.persistDirty) void this.persistNow();
    }, PERSIST_THROTTLE_MS);
  }

  private async persistNow(): Promise<void> {
    if (!this.state) return;
    this.persistDirty = false;
    const snap: Snapshot = { state: this.state, password: this.password, savedAt: Date.now() };
    try {
      await this.room.storage.put(SNAPSHOT_KEY, snap);
    } catch {
      // Best-effort; a failed persist just loses restart resilience.
    }
  }

  // -------------------------------------------------------------------------
  // Small utilities
  // -------------------------------------------------------------------------

  private name(pid: string): string {
    return this.state?.participants[pid]?.name ?? 'someone';
  }

  private hasOtherConnection(pid: string, exceptConnId: string): boolean {
    for (const [connId, id] of this.conns) {
      if (id === pid && connId !== exceptConnId) return true;
    }
    return false;
  }

  private clearCountdown(): void {
    if (this.countdownTimer) {
      clearTimeout(this.countdownTimer);
      this.countdownTimer = null;
    }
    if (this.state) this.state.sesh.sparkCountdownEndsAt = undefined;
  }
}

// ---------------------------------------------------------------------------
// Free helpers (pure)
// ---------------------------------------------------------------------------

/**
 * Authoritative media position (seconds) at time `t` (ms).
 *
 * When the media `duration` is known we clamp the projected position to it: a
 * controller-less room (nobody sending heartbeats / `media:ended`) would
 * otherwise tick past the end forever, so the scrubber and any late joiner's
 * pre-seek would land beyond the real end of the clip. Live/seekless media has
 * no meaningful duration, so the clamp is a no-op there.
 */
function authoritativePosition(m: MediaState, t: number): number {
  if (m.status !== 'playing') return m.position;
  const elapsed = Math.max(0, t - m.updatedAtServerMs) / 1000;
  const projected = m.position + elapsed * m.playbackRate;
  if (typeof m.duration === 'number' && m.duration > 0 && !m.isLive) {
    return Math.min(projected, m.duration);
  }
  return projected;
}

/** Decode a binary frame to UTF-8 text; null on failure. */
function decodeBinary(raw: ArrayBuffer | ArrayBufferView): string | null {
  try {
    const view = raw instanceof ArrayBuffer ? new Uint8Array(raw) : new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
    return new TextDecoder().decode(view);
  } catch {
    return null;
  }
}

/** Close a connection politely after a tick so a just-sent error is flushed. */
function closeSoon(conn: Party.Connection): void {
  setTimeout(() => {
    try {
      conn.close(1000, 'bye');
    } catch {
      // already closed
    }
  }, 50);
}

/** Constant-time-ish string compare to avoid leaking length/timing on the password. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Trim, strip control chars, and cap to `max` characters. */
function clampText(input: string, max: number): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\x00-\x1f\x7f-\x9f]/g, '').trim().slice(0, max);
}

/** Chat sanitization (§7): trim, strip control chars, cap 500, drop empty. */
function sanitizeChat(input: string): string {
  if (typeof input !== 'string') return '';
  return clampText(input, MAX_CHAT_LEN);
}

/** Sanitize an inbound identity snapshot — never trust client strings raw. */
function sanitizeIdentity(p: IdentitySnapshot): IdentitySnapshot {
  return {
    id: String(p.id).slice(0, 64),
    name: clampText(String(p.name ?? ''), MAX_NAME_LEN) || 'couch gremlin',
    avatar: p.avatar,
    accent: String(p.accent ?? '#f5b14c').slice(0, 16),
  };
}

/** Validate + sanitize a new queue item; null when it fails basic checks. */
function sanitizeNewItem(item: NewQueueItem): NewQueueItem | null {
  if (!item || typeof item.source !== 'string') return null;
  const type = item.type;
  const validTypes: QueueItemType[] = ['youtube', 'direct-url', 'screen-share', 'hosted-upload-stub'];
  if (!validTypes.includes(type)) return null;

  let source = item.source.trim();
  if (type === 'screen-share') {
    // source is a participant id, not a URL.
    source = source.slice(0, 64);
    if (!source) return null;
  } else if (type === 'hosted-upload-stub') {
    source = source.slice(0, MAX_URL_LEN);
  } else {
    if (source.length > MAX_URL_LEN) return null;
    if (!isHttpUrl(source)) return null;
  }

  return {
    type,
    source,
    title: item.title ? clampText(String(item.title), MAX_TITLE_LEN) : undefined,
    duration: typeof item.duration === 'number' && isFinite(item.duration) && item.duration >= 0 ? item.duration : undefined,
    thumbnail: item.thumbnail && isHttpUrl(item.thumbnail) ? item.thumbnail.slice(0, MAX_URL_LEN) : undefined,
  };
}

/** True when `s` parses as an http(s) URL. */
function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** A default queue title per item type. */
function defaultTitle(type: QueueItemType): string {
  switch (type) {
    case 'youtube':
      return 'YouTube video';
    case 'direct-url':
      return 'Direct link';
    case 'screen-share':
      return 'Screen share';
    case 'hosted-upload-stub':
      return 'Hosted upload (coming later)';
    default:
      return 'Something';
  }
}

/** Sesh-flavored phrasing for a status change event line. */
function statusPhrase(status: Participant['status']): string {
  switch (status) {
    case 'rolling':
      return 'rolling one up 🍃';
    case 'sparking':
      return 'sparking up 🔥';
    case 'hitting':
      return 'taking a hit 💨';
    case 'couchlocked':
      return 'fully couchlocked 🛋️';
    case 'snack-run':
      return 'on a snack run 🍿';
    case 'needs-water':
      return 'in need of water 💧';
    case 'laughing':
      return 'wheezing 😂';
    case 'locked-in':
      return 'locked in 🎯';
    case 'afk':
      return 'afk 💤';
    case 'buffering':
      return 'buffering 🌀';
    case 'chilling':
    default:
      return 'just chilling 😌';
  }
}

/** Emoji for a status change event. */
function statusEmoji(status: Participant['status']): string {
  const map: Record<Participant['status'], string> = {
    chilling: '😌',
    rolling: '🍃',
    sparking: '🔥',
    hitting: '💨',
    'snack-run': '🍿',
    couchlocked: '🛋️',
    'locked-in': '🎯',
    afk: '💤',
    'needs-water': '💧',
    laughing: '😂',
    buffering: '🌀',
  };
  return map[status];
}

/** Format seconds as m:ss for event lines. */
function formatTime(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

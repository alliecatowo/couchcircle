/**
 * CouchCircle — shared realtime protocol (§4 of ARCHITECTURE.md).
 *
 * These shapes are the binding contract between the PartyKit server and every
 * client. Everything durable lives in {@link RoomState} and is broadcast as a
 * full `room:state` snapshot on every mutation. Ephemeral things (pong,
 * reactions, webrtc relay) are sent as direct messages.
 *
 * Pure types + three tiny helpers ({@link serializeMessage},
 * {@link parseClientMessage}, {@link canControl}) — no runtime dependencies, so
 * this module is safe to import from workerd, Node, and the browser.
 */

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

/** A participant's current vibe, shown as an animated status bubble. */
export type ParticipantStatus =
  | 'chilling' | 'rolling' | 'sparking' | 'hitting' | 'snack-run' | 'couchlocked'
  | 'locked-in' | 'afk' | 'needs-water' | 'laughing' | 'buffering';

/** The six hand-drawn avatar creatures a participant can pick. */
export type AvatarId = 'goblin' | 'frog' | 'cat' | 'chinchilla' | 'sprout' | 'blanket';

/** Who may drive the shared remote. */
export type RemoteMode = 'host-only' | 'request' | 'chaos';

/** Which media backend the shared TV is currently using. */
export type MediaAdapterType = 'idle' | 'youtube' | 'direct-url' | 'screen-share' | 'hosted-upload';

/** Transport status of the shared media as tracked by the authoritative server. */
export type MediaStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'live';

/** The kind of source a queue item references. */
export type QueueItemType = 'youtube' | 'direct-url' | 'screen-share' | 'hosted-upload-stub';

// ---------------------------------------------------------------------------
// Core entities
// ---------------------------------------------------------------------------

/** The identity a client persists locally and presents on join. */
export interface IdentitySnapshot { id: string; name: string; avatar: AvatarId; accent: string; }

/** A person on the couch. */
export interface Participant {
  id: string; name: string; avatar: AvatarId; accent: string;
  status: ParticipantStatus; isReady: boolean;
  joinedAt: number; lastSeen: number;
  /** false while in the disconnect grace window (60s) before removal */
  connected: boolean;
}

/** One entry in the shared watch queue. */
export interface QueueItem {
  id: string; type: QueueItemType; title: string;
  /** youtube: original URL; direct-url: media URL; screen-share: sharer participant id */
  source: string;
  addedById: string; addedByName: string;
  duration?: number; thumbnail?: string; createdAt: number;
  /** participant ids who upvoted */
  votes: string[];
}

/** Authoritative transport state of the shared media. */
export interface MediaState {
  adapter: MediaAdapterType;
  queueItemId?: string;
  /** adapter-specific id, e.g. youtube video id or sharer participant id */
  sourceId?: string;
  title?: string; duration?: number;
  status: MediaStatus;
  /** media position in SECONDS at `updatedAtServerMs` */
  position: number;
  playbackRate: number;
  /** server timestamp the position anchors to; may be slightly in the FUTURE for scheduled play */
  updatedAtServerMs: number;
  /** increments on every explicit media command (load/play/pause/seek/rate). NOT on heartbeats. */
  seq: number;
  /** participant currently screen-sharing, when adapter === 'screen-share' */
  sharerId?: string;
  isLive: boolean; canSeek: boolean; canPause: boolean;
}

/** Who holds the remote, plus any outstanding requests. */
export interface RemoteState { controllerId?: string; pendingRequests: string[]; mode: RemoteMode; }

/** An in-progress snack-run vote. */
export interface SnackVote { startedById: string; endsAt: number; yes: string[]; no: string[]; }

/** The social "Sesh Mode" layer state (ritual flavor only). */
export interface SeshState {
  enabled: boolean;
  rotationActive: boolean;
  rotationIds: string[];
  currentRotationIndex: number;
  currentTurnStartedAt?: number;
  /** server ts when the synchronized spark moment lands */
  sparkCountdownEndsAt?: number;
  snackVote?: SnackVote;
}

/** Host-editable room settings. */
export interface RoomSettings {
  roomName: string;
  guestsCanAddToQueue: boolean;
  /** null = manual pass only */
  rotationAutoAdvanceSec: number | null;
}

/** An active "everyone ready?" check. */
export interface ReadyCheckState { active: boolean; startedAt: number; startedById: string; }

/** A single chat line (lives inside RoomState, capped at MAX_CHAT). */
export interface ChatMessage {
  id: string; authorId: string; authorName: string; authorAvatar: AvatarId;
  authorAccent: string; text: string; ts: number;
}

/** Category of a room event line. */
export type RoomEventKind =
  | 'join' | 'leave' | 'queue' | 'media' | 'remote' | 'sesh' | 'status' | 'ready' | 'system';

/** A pre-composed activity-log line (lives inside RoomState, capped at MAX_EVENTS). */
export interface RoomEvent {
  id: string; ts: number; kind: RoomEventKind;
  /** pre-composed human text, e.g. "Maya passed the remote to Jules" */
  text: string;
  actorId?: string;
  /** optional emoji to flavor the line / trigger avatar animations */
  emoji?: string;
}

/**
 * The complete, durable state of a room. Broadcast in full as a `room:state`
 * snapshot on every mutation; clients diff `events` by id to trigger animations.
 */
export interface RoomState {
  roomId: string; joinCode: string;
  createdAt: number; updatedAt: number;
  passwordEnabled: boolean;
  hostId: string;
  settings: RoomSettings;
  participants: Record<string, Participant>;
  queue: QueueItem[];
  media: MediaState;
  remote: RemoteState;
  sesh: SeshState;
  readyCheck?: ReadyCheckState;
  /** capped at MAX_CHAT, oldest dropped */
  chat: ChatMessage[];
  /** capped at MAX_EVENTS, oldest dropped */
  events: RoomEvent[];
}

/** A lightweight "do a thing" room action with personality. */
export type RoomActionKind =
  | 'emergency-pause' | 'water-check' | 'vibe-check' | 'bathroom' | 'pass-the-vibe' | 'snack-run';

/** All error codes the server may report. */
export type ErrorCode =
  | 'room-not-found' | 'wrong-password' | 'password-required' | 'not-allowed'
  | 'rate-limited' | 'room-full' | 'invalid-message';

// ---------------------------------------------------------------------------
// Client → Server messages
// ---------------------------------------------------------------------------

/** Options sent with `room:join` when creating (rather than joining) a room. */
export interface CreateOptions { roomName?: string; password?: string; seedDemo?: boolean; joinCode: string; }

/** Payload describing a new queue item from a client. */
export interface NewQueueItem { type: QueueItemType; source: string; title?: string; duration?: number; thumbnail?: string; }

/**
 * Discriminated union (on `type`) of every message a client may send to the
 * room. The server validates permissions per §7 before applying any of these.
 */
export type ClientMessage =
  | { type: 'room:join'; participant: IdentitySnapshot; password?: string; create?: CreateOptions }
  | { type: 'room:leave' }
  | { type: 'ping'; t0: number }
  | { type: 'presence:update'; status?: ParticipantStatus; isReady?: boolean; name?: string; avatar?: AvatarId; accent?: string }
  | { type: 'chat:message'; text: string }
  | { type: 'reaction:send'; emoji: string }
  | { type: 'queue:add'; item: NewQueueItem }
  | { type: 'queue:remove'; itemId: string }
  | { type: 'queue:move'; itemId: string; toIndex: number }
  | { type: 'queue:play'; itemId: string }          // load + schedule play
  | { type: 'queue:vote'; itemId: string }          // toggle upvote
  | { type: 'media:load'; itemId: string }          // load, stay paused
  | { type: 'media:play'; position?: number }
  | { type: 'media:pause' }
  | { type: 'media:seek'; position: number }
  | { type: 'media:rate'; rate: number }
  | { type: 'media:heartbeat'; position: number; status: MediaStatus }   // controller only
  | { type: 'media:ended' }                          // controller reports natural end
  | { type: 'remote:request' }
  | { type: 'remote:grant'; toId: string }
  | { type: 'remote:revoke' }                        // host/controller -> control returns to host
  | { type: 'remote:pass'; toId: string }
  | { type: 'room:action'; kind: RoomActionKind }
  | { type: 'ready:start' } | { type: 'ready:set'; ready: boolean } | { type: 'ready:cancel' }
  | { type: 'sesh:enable'; enabled: boolean }
  | { type: 'sesh:status'; status: ParticipantStatus }
  | { type: 'sesh:rotation:join' } | { type: 'sesh:rotation:leave' }
  | { type: 'sesh:rotation:start' } | { type: 'sesh:rotation:stop' }
  | { type: 'sesh:rotation:pass'; direction?: 'left' | 'right' }
  | { type: 'sesh:rotation:hit' }
  | { type: 'sesh:countdown:start'; seconds: number }
  | { type: 'sesh:snack-vote'; vote: 'yes' | 'no' }
  | { type: 'settings:update'; settings: Partial<RoomSettings> & { remoteMode?: RemoteMode } }  // host only
  | { type: 'webrtc:offer'; toId: string; sdp: string }
  | { type: 'webrtc:answer'; toId: string; sdp: string }
  | { type: 'webrtc:ice'; toId: string; candidate: unknown }
  | { type: 'screen:start' } | { type: 'screen:stop' }
  | { type: 'screen:viewer-ready'; toId: string };

// ---------------------------------------------------------------------------
// Server → Client messages
// ---------------------------------------------------------------------------

/**
 * Every message the server may send to a client. Durable updates arrive as full
 * `room:state` snapshots; the rest are ephemeral direct messages.
 */
export type ServerMessage =
  | { type: 'joined'; selfId: string; state: RoomState; serverNow: number }
  | { type: 'room:state'; state: RoomState; serverNow: number }
  | { type: 'pong'; t0: number; serverNow: number }
  | { type: 'reaction:send'; fromId: string; emoji: string }
  | { type: 'error'; code: ErrorCode; message: string }
  | { type: 'webrtc:offer'; fromId: string; sdp: string }
  | { type: 'webrtc:answer'; fromId: string; sdp: string }
  | { type: 'webrtc:ice'; fromId: string; candidate: unknown }
  | { type: 'screen:viewer-ready'; fromId: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Serialize any client or server message to a JSON string for the wire. */
export function serializeMessage(msg: ClientMessage | ServerMessage): string {
  return JSON.stringify(msg);
}

/**
 * Safely parse a raw wire string into a {@link ClientMessage}.
 *
 * Performs a guarded `JSON.parse` plus a minimal shape check (the parsed value
 * must be a non-null object whose `type` field is a string). Returns `null` for
 * any garbage so callers never have to wrap this in their own try/catch.
 */
export function parseClientMessage(raw: string): ClientMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  if (typeof (parsed as { type?: unknown }).type !== 'string') return null;
  return parsed as ClientMessage;
}

/**
 * The §7 permission matrix for MEDIA control (`media:*`, `queue:play`,
 * `queue:move`), shared by the server and the UI so both agree on who may drive.
 *
 * A participant may control the media when they are the current remote
 * controller, OR the remote is in `chaos` mode (anyone), OR they are the host
 * (the host can always act).
 */
export function canControl(state: RoomState, participantId: string): boolean {
  if (state.remote.mode === 'chaos') return true;
  if (state.hostId === participantId) return true;
  return state.remote.controllerId === participantId;
}

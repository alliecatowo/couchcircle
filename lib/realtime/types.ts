/**
 * CouchCircle — client-side realtime types (§8.1 of ARCHITECTURE.md).
 *
 * Pure types describing the connection wrapper and the React room context.
 * Imports protocol shapes ONLY from `@/shared/protocol` (deliberately does NOT
 * depend on `@/lib/identity`, which may not exist yet during parallel work).
 */

import type {
  ClientMessage,
  ServerMessage,
  RoomState,
  Participant,
  IdentitySnapshot,
  ErrorCode,
} from '@/shared/protocol';

/** Lifecycle of the underlying WebSocket as surfaced to the UI. */
export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

/**
 * How this client is attached to the couch (§1 projector).
 *
 * - `crew` (default): a real participant — takes a seat, drives the room through
 *   the JoinGate flow, persists identity.
 * - `projector`: a companion big-screen window. It auto-joins on socket open with
 *   a fresh ephemeral identity (never persisted), takes no seat, and is a pure
 *   viewer (its conn→id mapping is still registered so webrtc relays reach it).
 */
export type RoomRole = 'crew' | 'projector';

/** Phases the join flow moves through, from code resolution to a live seat. */
export type JoinPhase =
  | 'resolving'        // looking up join code via lobby
  | 'gate'             // waiting for the user in the JoinGate (name/avatar/password)
  | 'joining'          // room:join sent
  | 'joined'
  | 'not-found' | 'wrong-password' | 'room-full' | 'error';

/**
 * A typed wrapper around the PartyKit socket: typed send, per-type subscription,
 * and a server-clock estimate derived from the ping/pong loop.
 */
export interface RoomConnection {
  send(msg: ClientMessage): void;
  /** subscribe to a server message type; returns unsubscribe */
  on<T extends ServerMessage['type']>(type: T, cb: (msg: Extract<ServerMessage, { type: T }>) => void): () => void;
  serverNow(): number;
  readonly clockOffsetMs: number;
  readonly rttMs: number;
  close(): void;
}

/** One floating reaction emoji queued for the overlay; pruned after ~4s. */
export interface ReactionBurst { key: string; fromId: string; emoji: string; tsLocal: number; }

/**
 * The value provided by `<RoomProvider>` and consumed via `useRoom()`. Every
 * `components/room/**` component reads its data from here (zero props).
 */
export interface RoomContextValue {
  state: RoomState | null;
  selfId: string;
  self: Participant | null;
  isHost: boolean;
  isController: boolean;
  /**
   * How this client is attached to the couch (§1). `crew` for a normal seat,
   * `projector` for a companion big-screen window that auto-joins as a pure
   * viewer. Defaults to `crew` when the provider is mounted without a role.
   */
  role: RoomRole;
  /** true when this client may issue media/queue control commands right now */
  canControl: boolean;
  connectionStatus: ConnectionStatus;
  joinPhase: JoinPhase;
  joinError: string | null;
  lastError: { code: ErrorCode; message: string; ts: number } | null;
  /**
   * true once the socket is open and room:join can actually be sent — gate
   * the JoinGate submit on this. Resets to false while disconnected/reconnecting
   * and returns to true only after the next `open` event fires.
   */
  joinReady: boolean;
  send(msg: ClientMessage): void;
  join(opts: { identity: IdentitySnapshot; password?: string }): void;
  serverNow(): number;
  connection: RoomConnection | null;
  /** last few reaction bursts for the overlay; pruned after ~4s */
  reactions: ReactionBurst[];
}

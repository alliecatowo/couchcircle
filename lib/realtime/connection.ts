/**
 * CouchCircle — low-level PartyKit connection wrapper (§8 of ARCHITECTURE.md).
 *
 * Exports four helper functions for resolving rooms via the lobby, plus
 * `createRoomConnection` which wraps a `PartySocket` with typed messaging,
 * per-type subscriptions, and a clock-sync loop.
 */

import PartySocket from 'partysocket';
import { serializeMessage } from '@/shared/protocol';
import type { ClientMessage, ServerMessage } from '@/shared/protocol';
import { PING_INTERVAL_MS, DEFAULT_PARTYKIT_HOST } from '@/shared/constants';
import type { RoomConnection } from '@/lib/realtime/types';

// ---------------------------------------------------------------------------
// Host / URL helpers
// ---------------------------------------------------------------------------

/** The deployed PartyKit host, used automatically on non-localhost origins. */
const PRODUCTION_PARTYKIT_HOST = 'couchcircle.alliecatowo.partykit.dev';

/**
 * Returns the PartyKit host: explicit env wins; otherwise localhost dev
 * defaults to the local party server and any deployed origin defaults to the
 * production PartyKit deployment (so the frontend deploy needs no env vars).
 */
export function partyHost(): string {
  if (process.env.NEXT_PUBLIC_PARTYKIT_HOST) {
    return process.env.NEXT_PUBLIC_PARTYKIT_HOST;
  }
  if (
    typeof window !== 'undefined' &&
    !['localhost', '127.0.0.1'].includes(window.location.hostname)
  ) {
    return PRODUCTION_PARTYKIT_HOST;
  }
  return DEFAULT_PARTYKIT_HOST;
}

/**
 * Returns the lobby HTTP(S) URL.
 * Uses https unless the host starts with `localhost` or `127.`.
 */
export function lobbyUrl(): string {
  const host = partyHost();
  const isLocal =
    host.startsWith('localhost') || host.startsWith('127.');
  const scheme = isLocal ? 'http' : 'https';
  return `${scheme}://${host}/parties/lobby/index`;
}

/**
 * Ask the lobby to allocate a fresh room and return its id + join code.
 */
export async function createRoom(): Promise<{ roomId: string; joinCode: string }> {
  const res = await fetch(lobbyUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create' }),
  });
  if (!res.ok) {
    throw new Error(`lobby create failed: ${res.status}`);
  }
  const data = (await res.json()) as { roomId: string; joinCode: string };
  return data;
}

/**
 * Resolve a join code to a roomId via the lobby.
 * Returns `null` on 404 (room not found / expired).
 */
export async function resolveCode(
  code: string,
): Promise<{ roomId: string } | null> {
  const url = `${lobbyUrl()}?code=${encodeURIComponent(code)}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`lobby resolve failed: ${res.status}`);
  const data = (await res.json()) as { roomId: string };
  return data;
}

// ---------------------------------------------------------------------------
// RoomConnection implementation
// ---------------------------------------------------------------------------

type ListenerMap = {
  [T in ServerMessage['type']]?: Set<
    (msg: Extract<ServerMessage, { type: T }>) => void
  >;
};

/**
 * Wraps a PartySocket into a typed `RoomConnection`.
 *
 * Features:
 * - Typed `send` (serializes via protocol helpers).
 * - Per-type listener registry (`on`) — returns an unsubscribe fn.
 * - Ping loop every PING_INTERVAL_MS; uses the 5 lowest-RTT samples to
 *   estimate clock offset via median.
 * - `serverNow()` = `Date.now() + clockOffsetMs`.
 * - `close()` tears everything down cleanly.
 */
export function createRoomConnection(roomId: string): RoomConnection {
  const host = partyHost();

  const socket = new PartySocket({ host, room: roomId, party: 'main' });

  // -------------------------------------------------------------------------
  // Listener registry
  // -------------------------------------------------------------------------
  const listeners: ListenerMap = {};

  function dispatch(msg: ServerMessage): void {
    const bucket = listeners[msg.type] as
      | Set<(m: ServerMessage) => void>
      | undefined;
    if (bucket) {
      bucket.forEach((cb) => cb(msg));
    }
  }

  // -------------------------------------------------------------------------
  // Clock sync
  // -------------------------------------------------------------------------

  /** All RTT samples we have kept so far, newest appended. */
  const rttSamples: Array<{ rtt: number; offset: number }> = [];
  const MAX_SAMPLES = 5;

  let _clockOffsetMs = 0;
  let _rttMs = 0;

  /** Median of a sorted copy of `arr`. */
  function median(arr: number[]): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function handlePong(t0: number, serverNowMs: number): void {
    const nowLocal = Date.now();
    const rtt = nowLocal - t0;
    const offset = serverNowMs + rtt / 2 - nowLocal;

    _rttMs = rtt;

    // Keep the 5 lowest-rtt samples
    rttSamples.push({ rtt, offset });
    rttSamples.sort((a, b) => a.rtt - b.rtt);
    if (rttSamples.length > MAX_SAMPLES) {
      rttSamples.length = MAX_SAMPLES;
    }

    _clockOffsetMs = median(rttSamples.map((s) => s.offset));
  }

  // -------------------------------------------------------------------------
  // Ping loop
  // -------------------------------------------------------------------------
  let pingTimer: ReturnType<typeof setInterval> | null = null;

  function startPingLoop(): void {
    if (pingTimer !== null) return;
    pingTimer = setInterval(() => {
      const t0 = Date.now();
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      conn.send({ type: 'ping', t0 });
    }, PING_INTERVAL_MS);
  }

  function stopPingLoop(): void {
    if (pingTimer !== null) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // Socket event wiring
  // -------------------------------------------------------------------------
  socket.addEventListener('open', () => {
    startPingLoop();
  });

  socket.addEventListener('message', (evt: MessageEvent) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(evt.data as string);
    } catch {
      return;
    }
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as { type?: unknown }).type !== 'string'
    ) {
      return;
    }
    const msg = parsed as ServerMessage;

    // Handle pong here before dispatching so clock sync is always updated
    if (msg.type === 'pong') {
      handlePong(msg.t0, msg.serverNow);
    }

    dispatch(msg);
  });

  // -------------------------------------------------------------------------
  // Public interface
  // -------------------------------------------------------------------------
  /**
   * The returned object satisfies `RoomConnection` and also exposes
   * `addEventListener` / `removeEventListener` forwarded from the underlying
   * PartySocket so callers can listen for socket lifecycle events (open/close)
   * without widening the `RoomConnection` interface (which is protocol-owned).
   */
  const conn: RoomConnection & {
    addEventListener(
      event: string,
      handler: (e: Event) => void,
      opts?: boolean | AddEventListenerOptions,
    ): void;
    removeEventListener(
      event: string,
      handler: (e: Event) => void,
      opts?: boolean | EventListenerOptions,
    ): void;
  } = {
    send(msg: ClientMessage): void {
      socket.send(serializeMessage(msg));
    },

    on<T extends ServerMessage['type']>(
      type: T,
      cb: (msg: Extract<ServerMessage, { type: T }>) => void,
    ): () => void {
      if (!listeners[type]) {
        // Using a cast because the map is typed per-key; setting it once is safe.
        (listeners as Record<string, Set<(m: ServerMessage) => void>>)[type] =
          new Set();
      }
      const bucket = listeners[type] as Set<
        (msg: Extract<ServerMessage, { type: T }>) => void
      >;
      bucket.add(cb);
      return () => {
        bucket.delete(cb);
      };
    },

    serverNow(): number {
      return Date.now() + _clockOffsetMs;
    },

    get clockOffsetMs(): number {
      return _clockOffsetMs;
    },

    get rttMs(): number {
      return _rttMs;
    },

    close(): void {
      stopPingLoop();
      // Drop all listeners so stale callbacks can't fire after close
      (Object.keys(listeners) as ServerMessage['type'][]).forEach((k) => {
        delete listeners[k];
      });
      socket.close();
    },

    /** Forward socket lifecycle events (open/close/error) to consumers. */
    addEventListener(
      event: string,
      handler: (e: Event) => void,
      opts?: boolean | AddEventListenerOptions,
    ): void {
      socket.addEventListener(event, handler, opts);
    },

    removeEventListener(
      event: string,
      handler: (e: Event) => void,
      opts?: boolean | EventListenerOptions,
    ): void {
      socket.removeEventListener(event, handler, opts);
    },
  };

  return conn;
}

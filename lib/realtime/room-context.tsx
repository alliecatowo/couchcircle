'use client';

/**
 * CouchCircle — React room context (§8 of ARCHITECTURE.md).
 *
 * Provides `<RoomProvider>` (wraps a room by join-code) and `useRoom()` (the
 * consumer hook). All `components/room/**` components rely on this context and
 * must render inside a `<RoomProvider>`.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import { nanoid } from 'nanoid';

import type { AvatarId, IdentitySnapshot, RoomState } from '@/shared/protocol';
import { canControl as protocolCanControl } from '@/shared/protocol';
import { normalizeJoinCode } from '@/shared/join-codes';
import { ACCENT_COLORS } from '@/shared/constants';

import {
  createRoomConnection,
  resolveCode,
} from '@/lib/realtime/connection';
import type {
  ConnectionStatus,
  JoinPhase,
  ReactionBurst,
  RoomConnection,
  RoomContextValue,
  RoomRole,
} from '@/lib/realtime/types';

// ---------------------------------------------------------------------------
// Session-storage key helper
// ---------------------------------------------------------------------------

/** Shape stored by the landing page when creating a new room. */
interface PendingCreate {
  roomId: string;
  roomName?: string;
  password?: string;
  seedDemo?: boolean;
}

function pendingCreateKey(code: string): string {
  return `couchcircle:pending-create:${code}`;
}

function readPendingCreate(code: string): PendingCreate | null {
  try {
    const raw = sessionStorage.getItem(pendingCreateKey(code));
    if (!raw) return null;
    return JSON.parse(raw) as PendingCreate;
  } catch {
    return null;
  }
}

function deletePendingCreate(code: string): void {
  try {
    sessionStorage.removeItem(pendingCreateKey(code));
  } catch {
    // SSR / private browsing — silently ignore
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const RoomContext = createContext<RoomContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * Build the fresh, never-persisted ephemeral identity a projector window joins
 * with (§1). The id is prefixed `prj_` so the server (and any diagnostics) can
 * spot a projector; the accent is any warm swatch.
 */
function makeProjectorIdentity(): IdentitySnapshot {
  const accent =
    ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)] ?? '#ff9d3d';
  return {
    id: `prj_${nanoid()}`,
    name: 'the projector',
    avatar: 'blanket' as AvatarId,
    accent,
  };
}

export function RoomProvider({
  code: rawCode,
  role = 'crew',
  children,
}: {
  code: string;
  /** `crew` (default) or `projector` — see {@link RoomRole}. */
  role?: RoomRole;
  children: React.ReactNode;
}): React.ReactElement {
  const code = normalizeJoinCode(rawCode);

  // ---- core state ----
  const [state, setState] = useState<RoomState | null>(null);
  const [selfId, setSelfId] = useState<string>('');
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('connecting');
  const [joinPhase, setJoinPhase] = useState<JoinPhase>('resolving');
  // Mirror of joinPhase for reads inside the long-lived `error` socket handler,
  // whose closure (registered once per `code`) would otherwise see a stale phase.
  const joinPhaseRef = useRef<JoinPhase>('resolving');
  joinPhaseRef.current = joinPhase;
  const [joinError, setJoinError] = useState<string | null>(null);
  const [lastError, setLastError] = useState<{
    code: string;
    message: string;
    ts: number;
  } | null>(null);
  const [reactions, setReactions] = useState<ReactionBurst[]>([]);
  /**
   * True once the underlying socket has fired `open` and room:join can actually
   * be sent. Drops back to false on close/reconnect; rises again on the next open.
   */
  const [joinReady, setJoinReady] = useState<boolean>(false);

  // ---- refs (not causing re-renders) ----
  const connectionRef = useRef<RoomConnection | null>(null);
  /** True once we receive a 'joined' message — used to detect reconnects. */
  const hasJoinedRef = useRef(false);
  /** The last identity + password used in room:join, so we can re-send on reconnect. */
  const joinOptsRef = useRef<{ identity: IdentitySnapshot; password?: string } | null>(
    null,
  );
  const lastErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Belt-and-braces: if join() is called before the socket has opened, we
   * queue the opts here and fire the actual room:join when the socket opens.
   */
  const pendingJoinRef = useRef<{ identity: IdentitySnapshot; password?: string } | null>(null);
  /**
   * Projector windows (§1) auto-join on socket open with a fresh ephemeral
   * identity that is NEVER persisted. We mint it once and keep it in a ref so
   * reconnects reattach the same projector rather than spawning a new one.
   */
  const projectorIdentityRef = useRef<IdentitySnapshot | null>(null);
  if (role === 'projector' && !projectorIdentityRef.current) {
    projectorIdentityRef.current = makeProjectorIdentity();
  }

  // ---- auto-clear lastError after 6s ----
  function setLastErrorWithAutoClear(
    err: { code: string; message: string; ts: number } | null,
  ): void {
    if (lastErrorTimerRef.current) {
      clearTimeout(lastErrorTimerRef.current);
      lastErrorTimerRef.current = null;
    }
    setLastError(err);
    if (err) {
      lastErrorTimerRef.current = setTimeout(() => {
        setLastError(null);
        lastErrorTimerRef.current = null;
      }, 6_000);
    }
  }

  // ---- prune reactions older than 4s ----
  useEffect(() => {
    if (reactions.length === 0) return;
    const timer = setTimeout(() => {
      const cutoff = Date.now() - 4_000;
      setReactions((prev) => prev.filter((r) => r.tsLocal >= cutoff));
    }, 4_100);
    return () => clearTimeout(timer);
  }, [reactions]);

  // ---- send helper ----
  const send = useCallback(
    (msg: Parameters<RoomContextValue['send']>[0]): void => {
      connectionRef.current?.send(msg);
    },
    [],
  );

  // ---- join ----
  const join = useCallback(
    ({ identity, password }: { identity: IdentitySnapshot; password?: string }): void => {
      const conn = connectionRef.current;

      // Check for pending-create payload (written by landing page)
      const pending = readPendingCreate(code);

      // Persist so we can re-send on reconnect — a creator's password lives in
      // the pending-create payload, not the gate form, so merge it here too.
      joinOptsRef.current = { identity, password: pending?.password ?? password };

      if (!conn) {
        // [sync] no connection yet — queue the join to fire on the next open
        console.debug('[couchcircle:join] connection not ready — queueing join', { identity });
        pendingJoinRef.current = { identity, password: pending?.password ?? password };
        return;
      }

      const msg: Parameters<typeof conn.send>[0] = {
        type: 'room:join',
        participant: identity,
        // A projector attaches as a pure viewer (§1) — the server skips the seat
        // + participant entry and only registers its conn→id for webrtc relays.
        ...(role === 'projector' ? { role: 'projector' as const } : {}),
        ...(password ? { password } : {}),
        ...(pending
          ? {
              password: pending.password ?? password,
              create: {
                joinCode: code,
                ...(pending.roomName ? { roomName: pending.roomName } : {}),
                ...(pending.password ? { password: pending.password } : {}),
                ...(pending.seedDemo ? { seedDemo: pending.seedDemo } : {}),
              },
            }
          : {}),
      };

      conn.send(msg);
      setJoinPhase('joining');
    },
    [code, role],
  );

  // ---- resend room:join on reconnect ----
  const resendJoin = useCallback((): void => {
    const conn = connectionRef.current;
    const opts = joinOptsRef.current;
    if (!conn || !opts) return;

    conn.send({
      type: 'room:join',
      participant: opts.identity,
      ...(role === 'projector' ? { role: 'projector' as const } : {}),
      ...(opts.password ? { password: opts.password } : {}),
    });
  }, [role]);

  // ---- bootstrap: resolve code, create connection ----
  useEffect(() => {
    let cancelled = false;
    let conn: RoomConnection | null = null;

    async function bootstrap(): Promise<void> {
      setJoinPhase('resolving');

      let roomId: string | null = null;

      // Check pending-create first — if present we already know the roomId
      const pending = readPendingCreate(code);
      if (pending) {
        roomId = pending.roomId;
      } else {
        const result = await resolveCode(code).catch(() => null);
        if (cancelled) return;
        if (!result) {
          setJoinPhase('not-found');
          return;
        }
        roomId = result.roomId;
      }

      if (cancelled) return;

      conn = createRoomConnection(roomId);
      connectionRef.current = conn;

      // ---- wire socket lifecycle ----
      // createRoomConnection returns a RoomConnection extended with addEventListener;
      // we cast to that augmented type to attach open/close lifecycle listeners.
      type ConnWithEvents = typeof conn & {
        addEventListener(event: string, handler: (e: Event) => void): void;
      };
      const connWithEvents = conn as ConnWithEvents;

      const handleOpen = (): void => {
        if (cancelled) return;
        setConnectionStatus('connected');
        // Socket is open — room:join can now be sent
        setJoinReady(true);
        // [sync] socket open — joinReady=true
        console.debug('[couchcircle:joinReady] socket open → joinReady=true');
        if (hasJoinedRef.current) {
          // Reconnected after a prior join — re-send join automatically
          resendJoin();
        } else if (pendingJoinRef.current) {
          // Belt-and-braces: drain a join() that was called before the socket opened
          const pending = pendingJoinRef.current;
          pendingJoinRef.current = null;
          console.debug('[couchcircle:join] draining queued join on open', pending);
          // Re-invoke the full join() logic so pending-create is picked up correctly
          join(pending);
        } else if (role === 'projector' && projectorIdentityRef.current) {
          // Projector windows (§1) skip the JoinGate entirely: the moment the
          // socket is open we auto-join as a pure viewer with the ephemeral
          // identity. Never persisted; reconnects reuse the same identity ref.
          console.debug('[couchcircle:join] projector auto-join on open');
          join({ identity: projectorIdentityRef.current });
        }
      };

      const handleClose = (): void => {
        if (cancelled) return;
        // Socket closed — room:join cannot be sent until re-opened
        setJoinReady(false);
        // [sync] socket close — joinReady=false
        console.debug('[couchcircle:joinReady] socket close → joinReady=false');
        if (hasJoinedRef.current) {
          setConnectionStatus('reconnecting');
        } else {
          setConnectionStatus('disconnected');
        }
      };

      connWithEvents.addEventListener('open', handleOpen);
      connWithEvents.addEventListener('close', handleClose);

      // ---- wire server messages ----

      conn.on('joined', (msg) => {
        if (cancelled) return;
        hasJoinedRef.current = true;
        setSelfId(msg.selfId);
        setState(msg.state);
        setConnectionStatus('connected');
        setJoinPhase('joined');
        setJoinError(null);
        // Remove pending-create key now that we're in
        deletePendingCreate(code);
      });

      conn.on('room:state', (msg) => {
        if (cancelled) return;
        setState(msg.state);
      });

      conn.on('error', (msg) => {
        if (cancelled) return;
        const { code: errCode, message } = msg;

        if (errCode === 'wrong-password' || errCode === 'password-required') {
          setJoinPhase('wrong-password');
          setJoinError(
            errCode === 'password-required'
              ? 'this room has a password — go ahead and enter it'
              : 'wrong password, give it another shot',
          );
        } else if (errCode === 'room-full') {
          setJoinPhase('room-full');
          setJoinError('the couch is full — maybe someone will get up');
        } else if (errCode === 'room-not-found' && joinPhaseRef.current === 'joining') {
          // The code resolved via the lobby but the room itself is still
          // uninitialized (creator hasn't joined yet). Without this the gate
          // spins on "finding your spot…" forever — surface the not-found
          // screen the gate already renders.
          setJoinPhase('not-found');
        } else {
          setLastErrorWithAutoClear({ code: errCode, message, ts: Date.now() });
        }
      });

      conn.on('reaction:send', (msg) => {
        if (cancelled) return;
        const burst: ReactionBurst = {
          // random-ish key — nanoid not available, use timestamp + random
          key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          fromId: msg.fromId,
          emoji: msg.emoji,
          tsLocal: Date.now(),
        };
        setReactions((prev) => [...prev, burst]);
      });

      setJoinPhase('gate');
    }

    void bootstrap();

    return () => {
      cancelled = true;
      conn?.close();
      connectionRef.current = null;
      // Socket is gone — joinReady must be false until a new connection opens
      setJoinReady(false);
      if (lastErrorTimerRef.current) {
        clearTimeout(lastErrorTimerRef.current);
        lastErrorTimerRef.current = null;
      }
    };
    // `code`, `resendJoin`, and `join` are all stable within a given `code` value;
    // adding them to deps would cause no extra reruns but the lint rule is noisy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // ---- derived values ----
  const self = state && selfId ? (state.participants[selfId] ?? null) : null;
  const isHost = state !== null && selfId !== '' && state.hostId === selfId;
  const isController =
    state !== null &&
    selfId !== '' &&
    state.remote.controllerId === selfId;
  const canControl =
    state !== null && selfId !== ''
      ? protocolCanControl(state, selfId)
      : false;

  const serverNow = useCallback((): number => {
    return connectionRef.current?.serverNow() ?? Date.now();
  }, []);

  const value: RoomContextValue = {
    state,
    selfId,
    self,
    isHost,
    isController,
    role,
    canControl,
    connectionStatus,
    joinPhase,
    joinReady,
    joinError,
    // Cast is safe — both have the same shape; we narrowed ErrorCode usage above
    lastError: lastError as RoomContextValue['lastError'],
    send,
    join,
    serverNow,
    connection: connectionRef.current,
    reactions,
  };

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

// ---------------------------------------------------------------------------
// Consumer hook
// ---------------------------------------------------------------------------

/**
 * Returns the current {@link RoomContextValue}.
 * Must be called inside a `<RoomProvider>` — throws otherwise.
 */
export function useRoom(): RoomContextValue {
  const ctx = useContext(RoomContext);
  if (!ctx) {
    throw new Error('useRoom() must be used inside <RoomProvider>');
  }
  return ctx;
}

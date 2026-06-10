/**
 * CouchCircle — main room party (§7 of ARCHITECTURE.md).
 *
 * A thin `Party.Server` default export that delegates every lifecycle event to
 * {@link RoomEngine}, which owns the authoritative {@link RoomState}, the private
 * password, all timers, and the broadcast/persist logic.
 *
 * PartyKit's esbuild does not resolve the `@/*` alias for party code, so the
 * engine is imported via a relative path.
 */
import type * as Party from 'partykit/server';
import { RoomEngine } from './room';

export default class MainServer implements Party.Server {
  private readonly engine: RoomEngine;

  constructor(readonly room: Party.Room) {
    this.engine = new RoomEngine(room);
  }

  /** Restore a recent snapshot before any connection or request is handled. */
  onStart(): Promise<void> {
    return this.engine.onStart();
  }

  onConnect(conn: Party.Connection): void {
    this.engine.onConnect(conn);
  }

  onMessage(message: string | ArrayBuffer | ArrayBufferView, sender: Party.Connection): void {
    this.engine.onMessage(message, sender);
  }

  onClose(conn: Party.Connection): void {
    this.engine.onClose(conn);
  }

  onError(conn: Party.Connection): void {
    // A socket-level error is effectively a disconnect; reuse close handling.
    this.engine.onClose(conn);
  }
}

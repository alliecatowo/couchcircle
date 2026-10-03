import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomEngine } from '../party/room';
import { serializeMessage } from '../shared/protocol';
import type { ClientMessage, ServerMessage, RoomState, IdentitySnapshot } from '../shared/protocol';

class FakeConn {
  sent: ServerMessage[] = [];
  closed = false;
  constructor(public id: string) {}
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { this.closed = true; }
}

function makeRoom() {
  const conns = new Map<string, FakeConn>();
  const room = {
    id: 'test-room',
    broadcast: (data: string, without?: string[]) => {
      for (const c of conns.values()) if (!without?.includes(c.id)) c.send(data);
    },
    getConnection: (id: string) => conns.get(id),
    storage: { get: async () => undefined, put: async () => {}, deleteAll: async () => {} },
  };
  return { room, conns };
}

const ident = (id: string): IdentitySnapshot => ({ id, name: id, avatar: 'cat', accent: '#a78bfa' });

describe('RoomEngine (authoritative room logic)', () => {
  let engine: RoomEngine;
  let conns: Map<string, FakeConn>;
  const open = (id: string) => { const c = new FakeConn(id); conns.set(id, c); return c; };
  const send = (c: FakeConn, msg: ClientMessage) => engine.onMessage(serializeMessage(msg), c as never);
  const lastState = (c: FakeConn): RoomState => {
    const m = [...c.sent].reverse().find((s) => s.type === 'room:state' || s.type === 'joined');
    return (m as { state: RoomState }).state;
  };
  const errors = (c: FakeConn) => c.sent.filter((s) => s.type === 'error').map((s) => (s as { code: string }).code);

  beforeEach(() => {
    vi.useFakeTimers();
    const r = makeRoom();
    conns = r.conns;
    engine = new RoomEngine(r.room as never);
  });
  afterEach(() => vi.useRealTimers());

  function setup() {
    const host = open('c-host');
    send(host, { type: 'room:join', participant: ident('host'), create: { joinCode: 'COZY-123' } });
    const guest = open('c-guest');
    send(guest, { type: 'room:join', participant: ident('guest') });
    return { host, guest };
  }

  it('rejects garbage and pre-join messages', () => {
    const c = open('c1');
    engine.onMessage('not json', c as never);
    send(c, { type: 'media:pause' });
    expect(errors(c)).toEqual(['invalid-message', 'invalid-message']);
  });

  it('answers ping before joining', () => {
    const c = open('c1');
    send(c, { type: 'ping', t0: 7 });
    expect(c.sent[0]).toMatchObject({ type: 'pong', t0: 7 });
  });

  it('refuses to join a room that does not exist', () => {
    const c = open('c1');
    send(c, { type: 'room:join', participant: ident('x') });
    expect(errors(c)).toContain('room-not-found');
  });

  it('makes the creator host and seats a guest', () => {
    const { host, guest } = setup();
    const s = lastState(host);
    expect(s.hostId).toBe('host');
    expect(Object.keys(s.participants).sort()).toEqual(['guest', 'host']);
    expect(lastState(guest).participants.guest.connected).toBe(true);
  });

  it('only lets the host or controller hand off the remote', () => {
    const { host, guest } = setup();
    send(guest, { type: 'remote:grant', toId: 'guest' });
    expect(errors(guest)).toContain('not-allowed');

    send(host, { type: 'remote:grant', toId: 'guest' });
    expect(lastState(host).remote.controllerId).toBe('guest');

    // The holder can pass it back; a non-holder cannot pass it.
    send(host, { type: 'remote:pass', toId: 'host' });
    expect(errors(host)).toContain('not-allowed');
    send(guest, { type: 'remote:pass', toId: 'host' });
    expect(lastState(guest).remote.controllerId).toBe('host');
  });

  it('refuses to grab a remote someone else holds', () => {
    const { host, guest } = setup();
    send(host, { type: 'remote:grant', toId: 'host' });
    send(guest, { type: 'remote:grab' });
    expect(errors(guest)).toContain('not-allowed');
    expect(lastState(host).remote.controllerId).toBe('host');
  });

  it('revoke returns control to the host', () => {
    const { host, guest } = setup();
    send(host, { type: 'remote:grant', toId: 'guest' });
    send(guest, { type: 'remote:revoke' });
    expect(lastState(host).remote.controllerId).toBe('host');
  });

  it('rate-limits action spam per connection (4 per 5s)', () => {
    const { guest } = setup();
    for (let i = 0; i < 6; i++) send(guest, { type: 'remote:request' });
    expect(errors(guest)).toContain('rate-limited');
  });
});

import { describe, expect, it } from 'vitest';
import { canControl, parseClientMessage, serializeMessage } from '../shared/protocol';
import type { RoomState } from '../shared/protocol';

const state = (over: Partial<RoomState['remote']> = {}, hostId = 'host'): RoomState =>
  ({ hostId, remote: { mode: 'host-only', pendingRequests: [], ...over } }) as unknown as RoomState;

describe('parseClientMessage', () => {
  it('parses a well-formed message', () => {
    expect(parseClientMessage('{"type":"ping","t0":5}')).toEqual({ type: 'ping', t0: 5 });
  });
  it('round-trips with serializeMessage', () => {
    const msg = { type: 'media:pause' } as const;
    expect(parseClientMessage(serializeMessage(msg))).toEqual(msg);
  });
  it.each(['', 'not json', '42', 'null', '[]', '{"type":5}', '{"no":"type"}'])('rejects %j', (raw) => {
    expect(parseClientMessage(raw)).toBeNull();
  });
});

describe('canControl', () => {
  it('lets the host always act', () => {
    expect(canControl(state(), 'host')).toBe(true);
  });
  it('lets the current controller act', () => {
    expect(canControl(state({ controllerId: 'bob' }), 'bob')).toBe(true);
  });
  it('denies other guests', () => {
    expect(canControl(state({ controllerId: 'bob' }), 'eve')).toBe(false);
    expect(canControl(state(), 'eve')).toBe(false);
  });
  it('allows anyone in chaos mode', () => {
    expect(canControl(state({ mode: 'chaos' }), 'eve')).toBe(true);
  });
});

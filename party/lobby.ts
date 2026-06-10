/**
 * CouchCircle — lobby party (§7 of ARCHITECTURE.md).
 *
 * A single-instance HTTP-only party (addressed as room id "index") that maps
 * human join codes to opaque room ids:
 *
 *   POST /parties/lobby/index   { action: 'create' }      → { roomId, joinCode }
 *   GET  /parties/lobby/index?code=MOSS-420               → { roomId } | 404 { error }
 *
 * The mapping lives in `room.storage` (so it survives restarts) and is purged
 * lazily: entries older than 24h are dropped on access. There is deliberately
 * NO listing endpoint — codes are unguessable enough for an ephemeral party app
 * and we never want to enumerate live rooms.
 *
 * PartyKit's esbuild does not resolve the `@/*` tsconfig alias for party code,
 * so shared modules are imported via relative paths.
 */
import type * as Party from 'partykit/server';
import { generateJoinCode, normalizeJoinCode } from '../shared/join-codes';
import { RateLimiter } from './rate-limit';

/** A stored code → room mapping. */
interface CodeRecord {
  roomId: string;
  createdAt: number;
}

/** Mappings older than this are purged lazily on access. */
const PURGE_AFTER_MS = 24 * 60 * 60 * 1000;
/** Per-IP budget: ~12 requests/min. */
const LOBBY_RATE = { limit: 12, windowMs: 60_000 } as const;
/** How many times we retry on a join-code collision before giving up. */
const CODE_RETRIES = 40;

/** CORS headers applied to every lobby response, including the preflight. */
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/** Build a JSON Response with CORS headers and the given status. */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

export default class LobbyServer implements Party.Server {
  /** Per-IP sliding-window limiter (in-memory; resets if the instance recycles). */
  private readonly limiter = new RateLimiter();

  constructor(readonly room: Party.Room) {}

  async onRequest(req: Party.Request): Promise<Response> {
    // Preflight: answer immediately with the CORS allowlist.
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Per-IP rate limit.
    const ip = clientIp(req);
    if (!this.limiter.check(ip, LOBBY_RATE)) {
      return json({ error: 'rate-limited' }, 429);
    }
    // Lazy GC of stale limiter keys so memory stays bounded.
    this.limiter.prune();

    if (req.method === 'POST') {
      return this.handleCreate(req);
    }
    if (req.method === 'GET') {
      return this.handleResolve(req);
    }
    return json({ error: 'method-not-allowed' }, 405);
  }

  /** POST { action: 'create' } → allocate a fresh room id + unique join code. */
  private async handleCreate(req: Party.Request): Promise<Response> {
    let action: unknown;
    try {
      const body = (await req.json()) as { action?: unknown };
      action = body?.action;
    } catch {
      action = undefined;
    }
    if (action !== 'create') {
      return json({ error: 'invalid-message' }, 400);
    }

    const now = Date.now();
    await this.purgeStale(now);

    const roomId = crypto.randomUUID();

    // Find a join code not currently in use.
    let joinCode = '';
    for (let i = 0; i < CODE_RETRIES; i++) {
      const candidate = generateJoinCode();
      const existing = await this.room.storage.get<CodeRecord>(candidate);
      if (!existing) {
        joinCode = candidate;
        break;
      }
    }
    if (!joinCode) {
      // Astronomically unlikely with our wordlist, but fail loud rather than loop forever.
      return json({ error: 'room-not-found' }, 503);
    }

    const record: CodeRecord = { roomId, createdAt: now };
    await this.room.storage.put(joinCode, record);
    return json({ roomId, joinCode });
  }

  /** GET ?code=MOSS-420 → { roomId } or 404. */
  private async handleResolve(req: Party.Request): Promise<Response> {
    const url = new URL(req.url);
    const raw = url.searchParams.get('code') ?? '';
    const code = normalizeJoinCode(raw);
    if (!code) {
      return json({ error: 'room-not-found' }, 404);
    }

    const now = Date.now();
    const record = await this.room.storage.get<CodeRecord>(code);
    if (!record || now - record.createdAt > PURGE_AFTER_MS) {
      if (record) await this.room.storage.delete(code);
      return json({ error: 'room-not-found' }, 404);
    }
    return json({ roomId: record.roomId });
  }

  /** Drop any stored mappings older than 24h. */
  private async purgeStale(now: number): Promise<void> {
    const all = await this.room.storage.list<CodeRecord>();
    const dead: string[] = [];
    for (const [code, rec] of all) {
      if (now - rec.createdAt > PURGE_AFTER_MS) dead.push(code);
    }
    if (dead.length) await this.room.storage.delete(dead);
  }
}

/**
 * Best-effort client IP for rate-limiting. PartyKit sits behind Cloudflare, so
 * `CF-Connecting-IP` is the real client; we fall back to forwarded headers and
 * finally a constant bucket so a missing header still rate-limits *something*.
 */
function clientIp(req: Party.Request): string {
  return (
    req.headers.get('CF-Connecting-IP') ??
    req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ??
    req.headers.get('X-Real-IP') ??
    'unknown'
  );
}

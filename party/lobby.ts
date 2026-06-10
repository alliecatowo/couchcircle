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

/**
 * A cached YouTube oEmbed lookup. Stored under `yt:<videoId>` so it never
 * collides with the `WORD-NNN` join-code keyspace.
 */
interface OEmbedRecord {
  title: string;
  author: string;
  thumbnail: string;
  fetchedAt: number;
}

/** Mappings older than this are purged lazily on access. */
const PURGE_AFTER_MS = 24 * 60 * 60 * 1000;
/** Per-IP budget: ~12 requests/min. */
const LOBBY_RATE = { limit: 12, windowMs: 60_000 } as const;
/** How many times we retry on a join-code collision before giving up. */
const CODE_RETRIES = 40;
/** Storage-key prefix for cached oEmbed lookups. */
const OEMBED_PREFIX = 'yt:';
/** Cached oEmbed results live this long (§4: 1h). */
const OEMBED_TTL_MS = 60 * 60 * 1000;
/** YouTube video ids are exactly 11 chars of this set — anything else is rejected. */
const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Methods/headers we accept; the allowed *origin* is decided per-request (see CORS below). */
const CORS_STATIC_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  // Caches must key on Origin since we reflect it conditionally (avoids a
  // permissive response being cached for a disallowed origin).
  Vary: 'Origin',
};

/**
 * Resolve the `Access-Control-Allow-Origin` value for one request.
 *
 * Production intent: set `ALLOWED_ORIGINS` (comma-separated) on the PartyKit
 * deploy (e.g. `https://couchcircle.app,https://www.couchcircle.app`). We then
 * reflect the request `Origin` ONLY when it appears in that allowlist — never a
 * wildcard. A wildcard would let any site on the internet call the lobby and
 * mint/resolve room codes from a victim's browser.
 *
 * Dev convenience (when `ALLOWED_ORIGINS` is unset): allow localhost/127.0.0.1
 * origins on any port, and echo whatever origin asked so two-tab local testing
 * and LAN devices "just work". This branch is intentionally permissive and is
 * the reason production MUST set `ALLOWED_ORIGINS`.
 *
 * Returns the exact origin string to reflect, or `null` when the request's
 * origin is not allowed (caller omits the ACAO header entirely → browser blocks).
 */
function resolveAllowedOrigin(origin: string | null, env: Record<string, unknown>): string | null {
  const configured = parseAllowedOrigins(env.ALLOWED_ORIGINS);

  // Production / explicit allowlist: reflect only exact matches.
  if (configured.length > 0) {
    if (!origin) return null;
    return configured.includes(origin) ? origin : null;
  }

  // No allowlist configured → dev mode. No Origin header (curl, same-origin,
  // server-to-server) needs no CORS, so signal "*" is unnecessary by returning
  // null; browsers that DO send an Origin get it echoed back below.
  if (!origin) return null;
  if (isLocalhostOrigin(origin)) return origin;
  // Dev echo: reflect any origin so LAN testing works without ceremony.
  return origin;
}

/** Split a comma-separated ALLOWED_ORIGINS value into a clean list. */
function parseAllowedOrigins(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, '')) // tolerate trailing slashes
    .filter(Boolean);
}

/** True for http(s)://localhost or 127.0.0.1 (any port) — the dev allowlist. */
function isLocalhostOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
  } catch {
    return false;
  }
}

/** Build the CORS header set for a given (already-resolved) allowed origin. */
function corsHeaders(allowOrigin: string | null): Record<string, string> {
  const headers: Record<string, string> = { ...CORS_STATIC_HEADERS };
  if (allowOrigin) headers['Access-Control-Allow-Origin'] = allowOrigin;
  return headers;
}

/** Build a JSON Response with CORS headers and the given status. */
function json(body: unknown, status: number, allowOrigin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(allowOrigin) },
  });
}

export default class LobbyServer implements Party.Server {
  /** Per-IP sliding-window limiter (in-memory; resets if the instance recycles). */
  private readonly limiter = new RateLimiter();

  constructor(readonly room: Party.Room) {}

  async onRequest(req: Party.Request): Promise<Response> {
    // Decide the allowed origin once per request from the deploy's allowlist.
    const allowOrigin = resolveAllowedOrigin(req.headers.get('Origin'), this.room.env);

    // Preflight: answer immediately with the resolved CORS headers. We still
    // 204 even when the origin isn't allowed — we just omit ACAO, so the
    // browser's preflight check fails cleanly without leaking allowlist shape.
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(allowOrigin) });
    }

    // Per-IP rate limit.
    const ip = clientIp(req);
    if (!this.limiter.check(ip, LOBBY_RATE)) {
      return json({ error: 'rate-limited' }, 429, allowOrigin);
    }
    // Lazy GC of stale limiter keys so memory stays bounded.
    this.limiter.prune();

    if (req.method === 'POST') {
      return this.handleCreate(req, allowOrigin);
    }
    if (req.method === 'GET') {
      return this.handleResolve(req, allowOrigin);
    }
    return json({ error: 'method-not-allowed' }, 405, allowOrigin);
  }

  /** POST { action: 'create' } → allocate a fresh room id + unique join code. */
  private async handleCreate(req: Party.Request, allowOrigin: string | null): Promise<Response> {
    let action: unknown;
    try {
      const body = (await req.json()) as { action?: unknown };
      action = body?.action;
    } catch {
      action = undefined;
    }
    if (action !== 'create') {
      return json({ error: 'invalid-message' }, 400, allowOrigin);
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
      return json({ error: 'room-not-found' }, 503, allowOrigin);
    }

    const record: CodeRecord = { roomId, createdAt: now };
    await this.room.storage.put(joinCode, record);
    return json({ roomId, joinCode }, 200, allowOrigin);
  }

  /** GET ?code=MOSS-420 → { roomId }; ?yt=<id> → oEmbed metadata; else 404. */
  private async handleResolve(req: Party.Request, allowOrigin: string | null): Promise<Response> {
    const url = new URL(req.url);

    // YouTube oEmbed drill-down (§4). Strictly id-validated, cached, never a
    // general-purpose proxy.
    if (url.searchParams.has('yt')) {
      return this.handleOEmbed(url.searchParams.get('yt') ?? '', allowOrigin);
    }

    const raw = url.searchParams.get('code') ?? '';
    const code = normalizeJoinCode(raw);
    if (!code) {
      return json({ error: 'room-not-found' }, 404, allowOrigin);
    }

    const now = Date.now();
    const record = await this.room.storage.get<CodeRecord>(code);
    if (!record || now - record.createdAt > PURGE_AFTER_MS) {
      if (record) await this.room.storage.delete(code);
      return json({ error: 'room-not-found' }, 404, allowOrigin);
    }
    return json({ roomId: record.roomId }, 200, allowOrigin);
  }

  /**
   * GET ?yt=<11-char-id> → `{ title, author, thumbnail }` from YouTube's public
   * oEmbed endpoint (§4). Strict id validation (this is NOT a proxy — only a
   * valid YouTube video id is ever fetched), 1h cache in lobby storage, behind
   * the same per-IP limiter and CORS as every other lobby response.
   *
   * 400 on a malformed id, 404 when YouTube doesn't recognize the video.
   */
  private async handleOEmbed(rawId: string, allowOrigin: string | null): Promise<Response> {
    const id = rawId.trim();
    if (!YT_ID_RE.test(id)) {
      return json({ error: 'invalid-message' }, 400, allowOrigin);
    }

    const key = OEMBED_PREFIX + id;
    const now = Date.now();

    // Serve a fresh cache hit; drop a stale one so we re-fetch below.
    const cached = await this.room.storage.get<OEmbedRecord>(key);
    if (cached && now - cached.fetchedAt <= OEMBED_TTL_MS) {
      return json({ title: cached.title, author: cached.author, thumbnail: cached.thumbnail }, 200, allowOrigin);
    }

    // Build the oEmbed request from the validated id only — never echo arbitrary
    // client input into the upstream URL.
    const watchUrl = `https://www.youtube.com/watch?v=${id}`;
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`;

    let upstream: Response;
    try {
      upstream = await fetch(oembedUrl, { headers: { Accept: 'application/json' } });
    } catch {
      // Network hiccup reaching YouTube — treat as not found rather than 500.
      return json({ error: 'room-not-found' }, 404, allowOrigin);
    }

    if (!upstream.ok) {
      // 401/404 from oEmbed = embedding disabled or unknown video.
      return json({ error: 'room-not-found' }, 404, allowOrigin);
    }

    let data: { title?: unknown; author_name?: unknown; thumbnail_url?: unknown };
    try {
      data = (await upstream.json()) as typeof data;
    } catch {
      return json({ error: 'room-not-found' }, 404, allowOrigin);
    }

    const record: OEmbedRecord = {
      title: typeof data.title === 'string' ? data.title.slice(0, 200) : 'YouTube video',
      author: typeof data.author_name === 'string' ? data.author_name.slice(0, 120) : '',
      thumbnail: typeof data.thumbnail_url === 'string' ? data.thumbnail_url.slice(0, 500) : '',
      fetchedAt: now,
    };
    // Best-effort cache write; a failure just means the next lookup re-fetches.
    try {
      await this.room.storage.put(key, record);
    } catch {
      // ignore
    }

    return json({ title: record.title, author: record.author, thumbnail: record.thumbnail }, 200, allowOrigin);
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

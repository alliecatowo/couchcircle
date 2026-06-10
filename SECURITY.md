# Security posture

CouchCircle is an ephemeral, account-less watch-party app. This is an honest
description of what we protect, what we deliberately don't, and how to report a
problem. No marketing — just the threat model.

## What CouchCircle is (and isn't)

- **No accounts, no database, no history.** Room state lives in memory in a
  PartyKit room with a short-lived storage snapshot for restart resilience.
- **No recording.** Nothing you watch, say, or share is captured server-side.
- **Ephemeral by design.** Rooms dissolve into the haze when everyone drifts off;
  the lobby's couch-code → room mapping is purged 24h after creation.
- **Authorized media only.** YouTube embeds, direct media URLs you have rights to,
  or your own screen. No DRM circumvention, no scraping, no proxying.

## Access model

- **Room ids are unguessable.** A room is a `crypto.randomUUID()` — the realtime
  party is addressed by that id, never by the human couch code.
- **Couch codes are short and friendly** (`MOSS-420`) and resolve to the room id
  through the lobby. They are convenient, not strong secrets: someone who watches
  you type a code can join. Treat a couch code like the address of a house party —
  share it with the people you want on the couch.
- **No discovery.** The lobby has no listing endpoint and rooms are never
  enumerable. You cannot ask "what rooms exist".

## Optional room password — NOT a security boundary

A room may set a password. Be clear-eyed about what it is:

- It is a **soft gate against drive-by joins**, not a cryptographic boundary.
- It is compared **server-side with a plain (length-then-constant-time) string
  compare**. There is no hashing, no per-room salt, no key derivation — there's
  nothing valuable to protect at rest because rooms are ephemeral and in-memory.
- It is **never placed in `RoomState` and never broadcast**; it lives only as a
  private field on the room engine and in the throttled storage snapshot.
- Its confidentiality **depends entirely on TLS** in transit (Vercel + PartyKit
  both terminate TLS). We make no secrecy claim independent of the transport.
- **Do not reuse a real password here.** If you need actual access control, this
  app is the wrong tool — it has no accounts on purpose.

## Abuse resistance

- **Per-connection rate limits** (sliding window, `party/rate-limit.ts`) cover
  every state-mutating message category: chat (5/5s), reactions (10/5s), media
  commands (10/3s), queue ops (10/10s), room/sesh/presence/remote/screen actions
  (4/5s), and join (5/10s). Exceeding a budget returns a kind `rate-limited`
  error to the sender only — no state change.
  - Controller heartbeats and WebRTC signaling relays (`webrtc:*`,
    `screen:viewer-ready`) are intentionally exempt: they are high-frequency by
    design and bounded by being controller/peer-scoped, so a tight limit would
    break legitimate sync and ICE trickle.
- **Per-IP rate limit on the lobby** (~12 req/min) guards code create/resolve.
  Behind Cloudflare/Vercel it reads the real client IP from `CF-Connecting-IP`,
  then the first hop of `X-Forwarded-For`, then `X-Real-IP`.
- **CORS allowlist on the lobby.** In production set `ALLOWED_ORIGINS`
  (comma-separated) on the PartyKit deploy; the lobby reflects a request `Origin`
  **only** when it matches — never a wildcard. With `ALLOWED_ORIGINS` unset the
  lobby falls back to a permissive dev mode (localhost + echo) for local testing,
  so **production deploys must set it.** (The realtime WebSocket party is not
  origin-restricted — room ids are the unguessable secret there.)
- **Capacity cap.** Twelve seats (the seat map is the cap); a 13th joiner is
  turned away.

## Input handling

- **All client strings are sanitized server-side:** control chars stripped,
  hard length caps (chat 500, names 24, room name 40, queue titles 120, URLs
  2000), empties dropped. Queue URLs must parse as `http(s)`.
- **User text is only ever rendered as React text nodes** on the client — never
  `dangerouslySetInnerHTML` — so chat/names can't inject markup.
- **The server is authoritative** for playback position, the remote, the queue,
  and every permission check; clients cannot assert control they don't hold.

## HTTP security headers

The Next.js frontend (`next.config.mjs`) sends, on every route:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin` (keeps couch codes in the
  path out of cross-origin referrers)
- `Permissions-Policy: camera=(), microphone=(), geolocation=()` —
  **`display-capture` is deliberately left enabled** so screen share works.
- `X-Frame-Options: DENY` (anti-clickjacking)

There is **no Content-Security-Policy** by design: a CSP strict enough to be
worth shipping would break the YouTube iframe, PartyKit WebSockets, and
`getDisplayMedia`. We judged a broken-but-strict CSP worse than none; revisit if
the embed surface shrinks.

## What we deliberately DON'T do

- **No media proxying.** Direct URLs and YouTube load straight in the viewer's
  browser. The server never fetches third-party media, so it can't be turned into
  an SSRF proxy — but it also can't fix a source that blocks cross-origin embeds.
- **No TURN server** for screen share — STUN only (`stun.l.google.com`). P2P mesh
  is best for small rooms; behind symmetric NATs a connection may simply fail.
  We don't relay your screen through our infrastructure.
- **No accounts, sessions, cookies, or tokens.** There is no auth state to steal.
- **No analytics or third-party trackers** beyond the YouTube embed itself.

## Reporting an issue

Found something? Please **don't** open a public issue for a sensitive
vulnerability. Instead, open a [GitHub Security Advisory](https://docs.github.com/en/code-security/security-advisories)
on the repository (Security → Report a vulnerability), or open a regular GitHub
issue for non-sensitive concerns. Because rooms are ephemeral and account-less,
the blast radius of most bugs is a single live room — but we still want to know.

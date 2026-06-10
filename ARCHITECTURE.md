# CouchCircle — Architecture & Contracts (v1)

CouchCircle is a cozy real-time browser watch-party app: one room, one shared queue, one
shared remote, one authoritative sync protocol, multiple media adapters (YouTube, direct
URL, P2P screen share), plus an explicit "Sesh Mode" social layer (blunt rotation, spark
countdown, snack votes — social ritual only, never consumption/procurement advice).

This file is the **binding contract** for every agent working on the codebase. Read it
fully before writing code. If a contract seems wrong, implement it as written and flag
the concern in your report — do NOT unilaterally change shared signatures.

## 1. Stack

- Next.js 15 (App Router) + React 19 + TypeScript **strict**
- Tailwind CSS **v4** — CSS-first config via `@theme` in `app/globals.css`. There is NO
  `tailwind.config.*` file. Do not create one.
- PartyKit (`party/` dir) for the realtime server; `partysocket` on the client.
- `framer-motion` (import from `"framer-motion"`) for animation, `lucide-react` icons,
  Radix primitives wrapped in `components/ui/*`.
- `hls.js` via **dynamic import** for HLS direct URLs.
- No database, no accounts, no payments. Rooms are ephemeral in-memory state in the
  PartyKit room (with a throttled `room.storage` snapshot for restart resilience).

Path alias: `@/*` → repo root (e.g. `@/shared/protocol`, `@/lib/identity`,
`@/components/ui/button`).

## 2. Repo layout & file ownership

Each file has exactly one owning task. Never create/edit/delete a file you don't own.
Importing from other modules per the contracts below is expected and fine.

| Path | Owner task |
|---|---|
| package.json, tsconfig.json, next.config.mjs, postcss.config.mjs, partykit.json, .gitignore, .env.example | scaffold |
| shared/protocol.ts, shared/constants.ts, shared/join-codes.ts, lib/realtime/types.ts, lib/media/adapter.ts | protocol |
| DESIGN.md, app/globals.css, app/layout.tsx, lib/utils.ts, components/ui/* | design-system |
| lib/identity.ts | identity |
| party/index.ts, party/room.ts, party/lobby.ts, party/rate-limit.ts | party-server |
| lib/realtime/connection.ts, lib/realtime/room-context.tsx | realtime-client |
| lib/sync/sync-engine.ts | sync-engine |
| lib/media/youtube.ts, lib/media/url-parse.ts | yt-adapter |
| lib/media/direct-url.ts | direct-adapter |
| lib/media/screen-share.ts, lib/webrtc/mesh.ts | screenshare |
| lib/media/hosted-upload-stub.ts | upload-stub |
| components/avatars/* | avatars |
| app/page.tsx, components/landing/*, app/about/page.tsx, app/demo/page.tsx | landing |
| app/r/[code]/page.tsx, components/room/RoomShell.tsx, TopBar.tsx, JoinGate.tsx, ErrorBanner.tsx, ConnectionHealth.tsx | room-shell |
| components/room/MediaStage.tsx, components/room/players/*, SyncIndicator.tsx, SparkCountdown.tsx, ReactionLayer.tsx | media-stage |
| components/room/ParticipantCircle.tsx, ParticipantAvatar.tsx, StatusPicker.tsx | participants |
| components/room/QueuePanel.tsx, AddToQueueDialog.tsx | queue |
| components/room/SidePanel.tsx, ChatPanel.tsx, EventLog.tsx | chat-events |
| components/room/RemoteControls.tsx | remote |
| components/room/SeshControls.tsx, RotationPanel.tsx, ReadyCheck.tsx | sesh |
| components/room/RoomSettings.tsx | settings |
| README.md | readme |
| scripts/smoke.mjs | smoke |

## 3. Conventions (all agents)

- TypeScript strict. No `any` unless truly unavoidable (then a one-line comment why).
- Every React component that uses hooks/browser APIs starts with `'use client'`.
- All `components/room/**` components render inside `<RoomProvider>` and consume
  `useRoom()` from `@/lib/realtime/room-context`. **Zero props unless a contract below
  says otherwise.**
- Render user-supplied text only as React text nodes (never `dangerouslySetInnerHTML`).
- All timestamps are **ms since epoch on the SERVER clock** unless a name says otherwise.
  Client code converts via `serverNow()` from the room context.
- Do not add npm dependencies. Do not run dev servers. Do not run project-wide builds
  during the parallel implementation phase (sibling files are mid-flight; their type
  errors are not yours). You MAY run `npx tsc --noEmit` and ignore errors outside your
  own files.
- Style with Tailwind utilities + tokens from DESIGN.md. Match the cozy late-night
  living-room vibe. No sterile SaaS, no blue/purple startup gradients.
- Keep files under ~500 lines; split sensibly within your owned set if needed.

## 4. Shared protocol — `shared/protocol.ts`

The exact shapes below are normative. Complete, exported, JSDoc'd.

```ts
export type ParticipantStatus =
  | 'chilling' | 'rolling' | 'sparking' | 'hitting' | 'snack-run' | 'couchlocked'
  | 'locked-in' | 'afk' | 'needs-water' | 'laughing' | 'buffering';

export type AvatarId = 'goblin' | 'frog' | 'cat' | 'chinchilla' | 'sprout' | 'blanket';

export type RemoteMode = 'host-only' | 'request' | 'chaos';
export type MediaAdapterType = 'idle' | 'youtube' | 'direct-url' | 'screen-share' | 'hosted-upload';
export type MediaStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'live';
export type QueueItemType = 'youtube' | 'direct-url' | 'screen-share' | 'hosted-upload-stub';

/** The identity a client persists locally and presents on join. */
export interface IdentitySnapshot { id: string; name: string; avatar: AvatarId; accent: string; }

export interface Participant {
  id: string; name: string; avatar: AvatarId; accent: string;
  status: ParticipantStatus; isReady: boolean;
  joinedAt: number; lastSeen: number;
  /** false while in the disconnect grace window (60s) before removal */
  connected: boolean;
}

export interface QueueItem {
  id: string; type: QueueItemType; title: string;
  /** youtube: original URL; direct-url: media URL; screen-share: sharer participant id */
  source: string;
  addedById: string; addedByName: string;
  duration?: number; thumbnail?: string; createdAt: number;
  /** participant ids who upvoted */
  votes: string[];
}

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

export interface RemoteState { controllerId?: string; pendingRequests: string[]; mode: RemoteMode; }

export interface SnackVote { startedById: string; endsAt: number; yes: string[]; no: string[]; }

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

export interface RoomSettings {
  roomName: string;
  guestsCanAddToQueue: boolean;
  /** null = manual pass only */
  rotationAutoAdvanceSec: number | null;
}

export interface ReadyCheckState { active: boolean; startedAt: number; startedById: string; }

export interface ChatMessage {
  id: string; authorId: string; authorName: string; authorAvatar: AvatarId;
  authorAccent: string; text: string; ts: number;
}

export type RoomEventKind =
  | 'join' | 'leave' | 'queue' | 'media' | 'remote' | 'sesh' | 'status' | 'ready' | 'system';

export interface RoomEvent {
  id: string; ts: number; kind: RoomEventKind;
  /** pre-composed human text, e.g. "Maya passed the remote to Jules" */
  text: string;
  actorId?: string;
  /** optional emoji to flavor the line / trigger avatar animations */
  emoji?: string;
}

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

export type RoomActionKind =
  | 'emergency-pause' | 'water-check' | 'vibe-check' | 'bathroom' | 'pass-the-vibe' | 'snack-run';

export type ErrorCode =
  | 'room-not-found' | 'wrong-password' | 'password-required' | 'not-allowed'
  | 'rate-limited' | 'room-full' | 'invalid-message';
```

### Client → Server messages (`ClientMessage` discriminated union on `type`)

```ts
export interface CreateOptions { roomName?: string; password?: string; seedDemo?: boolean; joinCode: string; }
export interface NewQueueItem { type: QueueItemType; source: string; title?: string; duration?: number; thumbnail?: string; }

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
  | { type: 'settings:update'; settings: Partial<RoomSettings> }  // host only
  | { type: 'webrtc:offer'; toId: string; sdp: string }
  | { type: 'webrtc:answer'; toId: string; sdp: string }
  | { type: 'webrtc:ice'; toId: string; candidate: unknown }
  | { type: 'screen:start' } | { type: 'screen:stop' }
  | { type: 'screen:viewer-ready'; toId: string };
```

### Server → Client messages (`ServerMessage`)

```ts
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
```

Design rule: **everything durable lives in `RoomState` and is broadcast as a full
`room:state` snapshot on every mutation** (rooms are small; fine for MVP). Chat and
events live IN the state (capped). Ephemeral things (pong, reactions, webrtc relay)
are direct messages. Clients trigger animations by diffing `state.events` by id.

Also export tiny helpers: `serializeMessage` / `parseClientMessage(raw: string): ClientMessage | null`
(safe JSON parse + minimal shape check via `typeof msg.type === 'string'`), and
`canControl(state: RoomState, participantId: string): boolean` implementing §7's matrix
(shared by server and UI).

## 5. Constants — `shared/constants.ts`

```ts
export const PLAY_LEAD_MS = 450;          // play commands schedule this far in the future
export const HEARTBEAT_MS = 2500;         // controller heartbeat cadence
export const PING_INTERVAL_MS = 10_000;
export const DRIFT_SOFT_MS = 150;         // below: ignore
export const DRIFT_HARD_MS = 750;         // above: hard seek
export const RATE_NUDGE = 0.05;           // gentle catch-up rate delta
export const MAX_PARTICIPANTS = 12;
export const MESH_COMFORT_LIMIT = 5;      // show screen-share quality warning above this
export const MAX_CHAT = 100;
export const MAX_EVENTS = 80;
export const DISCONNECT_GRACE_MS = 60_000;
export const SPARK_DEFAULT_SECONDS = 5;
export const SNACK_VOTE_WINDOW_MS = 30_000;
export const DEFAULT_PARTYKIT_HOST = '127.0.0.1:1999';
export const SAMPLE_VIDEOS = {
  mp4: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  hls: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  youtube: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
} as const;
export const REACTION_EMOJIS = ['🔥', '💨', '😂', '🛋️', '🍿', '💚', '😵‍💫', '👏'] as const;
export const STATUS_META: Record<ParticipantStatus, { label: string; emoji: string }>;
// chilling 😌, rolling 🍃, sparking 🔥, hitting 💨, snack-run 🍿, couchlocked 🛋️,
// locked-in 🎯, afk 💤, needs-water 💧, laughing 😂, buffering 🌀
export const AVATAR_IDS: AvatarId[];      // all six
export const AVATAR_META: Record<AvatarId, { label: string; blurb: string }>;
// goblin "Couch Goblin", frog "Pond Frog", cat "Window Cat", chinchilla "Dusty Chinchilla",
// sprout "Lil Sprout", blanket "Blanket Person" — write cozy one-line blurbs
export const ACCENT_COLORS: string[];     // 8 warm hex accents matching DESIGN.md palette
```

## 6. Join codes — `shared/join-codes.ts`

- `generateJoinCode(): string` → `WORD-NNN` (e.g. `MOSS-420`, `COUCH-117`). Wordlist of
  ~80 cozy/sesh-adjacent ALL-CAPS words (MOSS, COUCH, HAZE, PUFF, FERN, DRIP, SNACK,
  BLAZE, CLOUD, MELLOW, NOODLE, GOBLIN, …). NNN in 100–999 via `crypto.getRandomValues`.
- `normalizeJoinCode(input: string): string` → trim, uppercase, collapse spaces/underscores
  to `-`. `isValidJoinCode(s): boolean`.
- Must run in both workerd (party) and browser. No Node APIs.

## 7. Realtime server — `party/`

`partykit.json`: name `couchcircle`, `main: "party/index.ts"`, `parties: { "lobby": "party/lobby.ts" }`,
recent `compatibilityDate`.

### Lobby (`party/lobby.ts`) — single instance, room id `index`, HTTP only

- `POST /parties/lobby/index` body `{ action: 'create' }` → generates
  `roomId = crypto.randomUUID()` and a unique `joinCode`, stores `code → { roomId, createdAt }`
  in `room.storage`, returns `{ roomId, joinCode }`.
- `GET /parties/lobby/index?code=MOSS-420` → `{ roomId }` or 404 `{ error: 'room-not-found' }`.
- **CORS:** every response (incl. `OPTIONS` preflight) sets `Access-Control-Allow-Origin: *`,
  `Access-Control-Allow-Methods: GET, POST, OPTIONS`, `Access-Control-Allow-Headers: Content-Type`.
- Per-IP in-memory rate limit (≈12 requests/min) → 429 `{ error: 'rate-limited' }`.
- Purge mappings older than 24h lazily on access.
- Never enumerable; no listing endpoint.

### Room (`party/index.ts` default export + `party/room.ts` logic)

Connection-level map `connectionId → participantId`. The room holds `RoomState` in memory
plus a private `password?: string` (NEVER placed in `RoomState` or broadcast). Persist a
`{ state, password }` snapshot to `room.storage` (throttled ~2s) and restore in `onStart`
if < 6h old (gives dev-reload + restart resilience).

**Join flow** (`room:join`):
- Room uninitialized + `create` present → initialize state: creator = `hostId` =
  `remote.controllerId`, `joinCode = create.joinCode`, `passwordEnabled = !!create.password`,
  settings defaults (`roomName` from create or `"the couch"`, `guestsCanAddToQueue: true`,
  `rotationAutoAdvanceSec: null`), media idle (`seq: 0`, `playbackRate: 1`), remote mode
  `'request'`, sesh `{ enabled: false, rotationActive: false, rotationIds: [], currentRotationIndex: 0 }`.
  If `create.seedDemo`, seed the queue with the three SAMPLE_VIDEOS entries (titles
  "Big Buck Bunny (MP4)", "Mux test stream (HLS)", "Big Buck Bunny (YouTube)").
- Room uninitialized + no `create` → `error room-not-found`, close connection politely.
- Password: if `passwordEnabled` and password missing → `error password-required`;
  mismatch → `error wrong-password`. (Constant-time-ish compare is fine.)
- Full (≥ MAX_PARTICIPANTS connected) and participant id unknown → `error room-full`.
- Rejoin with an existing participant id → reattach (set `connected: true`, update
  identity fields, cancel pending removal).
- Reply `joined { selfId, state, serverNow }` to the joiner; broadcast `room:state` to
  the rest; append a `join` event ("Maya flopped onto the couch").

**Permission matrix** (single helper, mirrored by `canControl` in protocol):
- media commands (`media:*`, `queue:play`, `queue:move`): controller; or anyone in
  `chaos` mode; the host can always act.
- `queue:add`: anyone if `settings.guestsCanAddToQueue`, else controller/host.
  `queue:remove`: item adder, controller, or host. `queue:vote`: anyone.
- `remote:grant`/`remote:revoke`: controller or host. `remote:pass`: controller.
  `remote:request`: anyone (dedup into `pendingRequests`, event logged).
- `settings:update`, `sesh:enable`: host (controller also allowed for `sesh:enable`).
- rotation start/stop: controller or host. join/leave/hit/pass/countdown: rotation
  members (pass also controller/host). `room:action`: anyone (rate-limited).
- `'emergency-pause'` room action: **anyone**; if media canPause + playing → pause it;
  event: "🚨 {name} emergency-paused the room — they're dying".
- Violations → `error not-allowed` to sender only; no state change.

**Media command semantics** (server is authoritative; `seq++` on each):
- `media:load` / `queue:play`: look up queue item; set adapter by item type
  (`youtube` → parse video id into `sourceId` server-side is NOT required — clients
  parse; store `sourceId = item.source`), `status: 'loading'` then for `queue:play`
  schedule playing: `status: 'playing'`, `position: 0`,
  `updatedAtServerMs: now + PLAY_LEAD_MS`. For screen-share items: `isLive: true`,
  `canSeek: false`, `canPause: false`, `sharerId = item.source`, `status: 'loading'`
  until `screen:start` arrives from the sharer (→ `status: 'live'`).
- `media:play`: `status: 'playing'`, `position` = msg.position ?? current authoritative
  position, `updatedAtServerMs = now + PLAY_LEAD_MS`.
- `media:pause`: `status: 'paused'`, `position` = current authoritative position,
  `updatedAtServerMs = now`.
- `media:seek`: keep status; `position = clamp(msg.position)`;
  `updatedAtServerMs = status === 'playing' ? now + PLAY_LEAD_MS : now`.
- `media:rate`: clamp 0.25–2; recompute position to now first.
- Authoritative position at time t: `position + max(0, t - updatedAtServerMs) / 1000 * playbackRate`
  while `status === 'playing'`, else `position`.
- `media:heartbeat` (controller only): if `|reported − authoritative| > 0.4s`, adopt
  reported position (`position = reported`, `updatedAtServerMs = now`) WITHOUT bumping
  `seq`. Update `updatedAt`.
- `media:ended`: advance to the next queue item after `queueItemId` and schedule play;
  if none, `status: 'ended'` + event.
- Events for every load/play/pause/seek with human text.

**Sesh semantics:**
- `sesh:countdown:start`: set `sparkCountdownEndsAt = now + seconds*1000`, event
  "🔥 Spark countdown — everyone hits in {seconds}…". `setTimeout` at end: clear field,
  event "💨 BLAZE IT — the room sparked together", set all rotation members' status to
  `'hitting'`.
- rotation: `join` appends id (dedup), `leave` removes (fix index), `start` requires ≥1
  member → `rotationActive: true`, index 0, `currentTurnStartedAt = now`; `stop` clears.
  `pass` direction left = +1 (default), right = −1, modulo members; reset
  `currentTurnStartedAt`; event "🍃 passed to {name}". `hit`: event
  "💨 {name} is hitting it", set that participant status `'hitting'`.
  If `settings.rotationAutoAdvanceSec`, auto-pass via `setTimeout` (cancel on manual pass/stop).
- `sesh:snack-vote`: first vote opens `snackVote` (window SNACK_VOTE_WINDOW_MS); votes
  dedup/toggle between arrays; on window end (`setTimeout`) tally → event
  ("🍿 Snack run APPROVED {y}–{n}" / "🍿 Snack run rejected {y}–{n}, the couch wins"), clear.
- `room:action` kinds → events with personality (and for `pass-the-vibe`, emoji '✨';
  participants UI animates off the event).
- `sesh:status` = `presence:update {status}` but the event line is sesh-flavored.

**Ready check:** `ready:start` (controller/host) → `readyCheck` set, all `isReady=false`,
event. `ready:set` flips own flag (+event when becoming ready, text "{name} is locked in").
All ready → event "🟢 Everyone's ready" + clear `readyCheck` (keep flags). `ready:cancel`
(controller/host) clears.

**Presence/lifecycle:** any message refreshes `lastSeen`. `onClose`: mark
`connected: false`, event "{name} drifted off the couch"; after DISCONNECT_GRACE_MS
without rejoin, remove participant, drop from rotation/pendingRequests. If the
**controller** disconnects: immediately transfer remote to host if connected, else
earliest-joined connected participant; event "📺 the remote slid over to {name}". If the
**sharer** of an active screen-share disconnects or sends `screen:stop`: media → idle,
event "🖥️ {name} stopped sharing".

**Relays:** `webrtc:offer/answer/ice` and `screen:viewer-ready` are relayed verbatim to
`toId`'s connection(s) with `fromId` injected. No broadcast.

**Rate limits** (`party/rate-limit.ts`, sliding window per connection per category):
chat 5/5s, reactions 10/5s, media commands 10/3s, queue ops 10/10s, room/sesh actions
4/5s, join 5/10s. Exceeding → `error rate-limited` (sender only).

**Sanitize:** chat text: trim, strip control chars, cap 500 chars, drop empty. Names cap
24 chars, room name 40, queue titles 120, URLs cap 2000 + must parse as http(s).

## 8. Client realtime — `lib/realtime/`

### `lib/realtime/types.ts` (owned by protocol task; pure types + small helpers)

```ts
export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
export type JoinPhase =
  | 'resolving'        // looking up join code via lobby
  | 'gate'             // waiting for the user in the JoinGate (name/avatar/password)
  | 'joining'          // room:join sent
  | 'joined'
  | 'not-found' | 'wrong-password' | 'room-full' | 'error';

export interface RoomConnection {
  send(msg: ClientMessage): void;
  /** subscribe to a server message type; returns unsubscribe */
  on<T extends ServerMessage['type']>(type: T, cb: (msg: Extract<ServerMessage, { type: T }>) => void): () => void;
  serverNow(): number;
  readonly clockOffsetMs: number;
  readonly rttMs: number;
  close(): void;
}

export interface ReactionBurst { key: string; fromId: string; emoji: string; tsLocal: number; }

export interface RoomContextValue {
  state: RoomState | null;
  selfId: string;
  self: Participant | null;
  isHost: boolean;
  isController: boolean;
  /** true when this client may issue media/queue control commands right now */
  canControl: boolean;
  connectionStatus: ConnectionStatus;
  joinPhase: JoinPhase;
  joinError: string | null;
  lastError: { code: ErrorCode; message: string; ts: number } | null;
  send(msg: ClientMessage): void;
  join(opts: { identity: IdentitySnapshot; password?: string }): void;
  serverNow(): number;
  connection: RoomConnection | null;
  /** last few reaction bursts for the overlay; pruned after ~4s */
  reactions: ReactionBurst[];
}
```

### `lib/realtime/connection.ts` (realtime-client task)

- `export function partyHost(): string` → `process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? DEFAULT_PARTYKIT_HOST`.
- `export function lobbyUrl(): string` → `http(s)://{host}/parties/lobby/index`
  (https unless host is localhost/127.0.0.1).
- `export async function createRoom(): Promise<{ roomId: string; joinCode: string }>` (POST).
- `export async function resolveCode(code: string): Promise<{ roomId: string } | null>` (GET; null on 404).
- `export function createRoomConnection(roomId: string): RoomConnection` — wraps
  `PartySocket` (`import PartySocket from 'partysocket'`; `{ host, room: roomId, party: 'main' }`).
  Typed send (JSON), listener registry for `on`, ping loop every PING_INTERVAL_MS:
  send `{type:'ping', t0: Date.now()}`; on pong compute `offset = serverNow + rtt/2 − Date.now()`;
  keep the ~5 lowest-rtt samples, use their median. `serverNow() = Date.now() + clockOffsetMs`.

### `lib/realtime/room-context.tsx` (realtime-client task)

- `export function RoomProvider({ code, children }: { code: string; children: React.ReactNode })`
- `export function useRoom(): RoomContextValue` (throws outside provider).
- Provider flow: normalize code → `resolveCode` → `not-found` or create connection →
  phase `gate`. `join()` sends `room:join` (with `create` payload if a pending-create
  exists — see below). On `joined`: store selfId, state, phase `joined`. On `room:state`:
  replace state. On `error`: map `wrong-password`/`password-required` → phase
  `wrong-password` (back to gate w/ message), `room-full` → `room-full`; others → set
  `lastError` (auto-clear after ~6s).
- **Pending create:** sessionStorage key `couchcircle:pending-create:{CODE}` holding
  `{ roomId, roomName?, password?, seedDemo? }`, written by the landing page. On join,
  if present, include `create: { joinCode: code, ...pending }` and the creator's chosen
  password; remove the key after `joined`.
- Reconnect: partysocket auto-reconnects; on `open` after a previous `joined`, re-send
  `room:join` with the same identity (+password from memory). Track
  `connectionStatus` from socket events ('reconnecting' on close after first open).
- Reactions: accumulate `reaction:send` into `reactions` with a random key, prune > 4s.
- On unmount: `connection.close()`.

## 9. Sync engine — `lib/sync/sync-engine.ts`

```ts
export type SyncHealth = 'idle' | 'synced' | 'drift' | 'resyncing' | 'buffering' | 'live' | 'blocked';

export interface SyncStatusSnapshot {
  health: SyncHealth;
  positionSec: number;          // authoritative position estimate (for scrubber)
  durationSec?: number;
  driftMs: number;              // last measured local drift (0 when n/a)
  isLive: boolean; canSeek: boolean; canPause: boolean;
  mediaStatus: MediaStatus;
}

export class SyncEngine {
  constructor(opts: {
    serverNow(): number;
    isController(): boolean;
    send(msg: ClientMessage): void;
  });
  setAdapter(adapter: MediaAdapter | null): void;
  /** call on EVERY room:state with state.media */
  applyMediaState(media: MediaState): void;
  /** user-gesture resume after autoplay block */
  resumePlayback(): void;
  destroy(): void;
}

/** subscribe UI to the engine's snapshot (useSyncExternalStore over a module-level store
    that the active engine instance publishes to ~4x/sec) */
export function useSyncStatus(): SyncStatusSnapshot;
```

Behavior:
- Track `lastSeq`. On `applyMediaState`: if `media.seq !== lastSeq` → apply the command:
  compute target position; if `status==='playing'` and `updatedAtServerMs` is in the
  future, pre-seek the adapter to `position` and `setTimeout` until
  `updatedAtServerMs − serverNow()` to call `adapter.play()`; if in the past, seek to the
  authoritative position and play immediately. `paused` → `adapter.pause()` + seek.
  Apply rate changes. If `queueItemId` changed, the **MediaStage** handles load (engine
  only syncs transport).
- Heartbeat-only updates (same seq) just refresh the authoritative anchor.
- 1s interval: controller → send `media:heartbeat` every HEARTBEAT_MS with adapter time +
  status. Non-controller while playing → drift = adapterTime − authoritative:
  `<DRIFT_SOFT_MS` ignore (health `synced`); soft band → temporarily set adapter rate to
  `rate ± RATE_NUDGE` until caught up (health `drift`); `≥DRIFT_HARD_MS` → hard seek
  (health `resyncing`, decays back to `synced` ~1.5s later).
- Adapter status `loading` → `buffering`; `isLive` → `live`; play() rejection (autoplay
  policy) → `blocked` until `resumePlayback()` succeeds.
- All timers cleaned in `destroy()`.

## 10. Media adapters — `lib/media/`

### `lib/media/adapter.ts` (protocol task)

```ts
export type AdapterMediaStatus = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'error';

export interface ScheduledPlay { atServerMs: number; position: number; playbackRate: number; }

export interface MediaAdapterEvents {
  onStatus(status: AdapterMediaStatus): void;
  onEnded(): void;
  onError(message: string): void;
}

export interface MediaAdapter {
  readonly type: MediaAdapterType;
  load(item: QueueItem): Promise<void>;
  /** `at` MAY be ignored — the SyncEngine pre-schedules; play() should start immediately */
  play(at?: ScheduledPlay): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
  setPlaybackRate(rate: number): Promise<void>;
  getCurrentTime(): number;
  getDuration(): number | undefined;
  getStatus(): AdapterMediaStatus;
  canSeek(): boolean; canPause(): boolean; isLive(): boolean;
  /** local-only volume 0..1 (not synced) */
  setVolume?(v: number): void; getVolume?(): number;
  destroy(): void;
}
```

### YouTube — `lib/media/youtube.ts` + `lib/media/url-parse.ts` (yt-adapter task)

- `url-parse.ts`: `parseYouTubeUrl(url): { videoId: string } | null` (watch?v=, youtu.be,
  shorts, embed, live, with extra params; reject invalid ids — 11 chars
  `[A-Za-z0-9_-]`), `youTubeThumbnail(videoId): string` (`i.ytimg.com/vi/{id}/hqdefault.jpg`),
  `classifyDirectUrl(url): 'hls' | 'file' | null` (`.m3u8` → hls; `.mp4/.webm/.ogv/.mov`
  or unknown-but-http → file), `isProbablyMediaUrl(url): boolean`.
- `YouTubeAdapter` — `new YouTubeAdapter(container: HTMLElement, events: MediaAdapterEvents)`.
  Singleton script loader for `https://www.youtube.com/iframe_api` (idempotent across
  instances; resolve on `window.onYouTubeIframeAPIReady`, chain previous handler). Uses
  `@types/youtube` (installed) for typing; `playerVars: { playsinline: 1, rel: 0, modestbranding: 1, disablekb: 1 }`.
  Map player states → AdapterMediaStatus; `onError` → friendly message ("This video can't
  be embedded — try another link" for 101/150). `destroy()` destroys player + clears container.

### Direct URL — `lib/media/direct-url.ts` (direct-adapter task)

- `new DirectUrlAdapter(video: HTMLVideoElement, events)`. For `hls` sources: if
  `video.canPlayType('application/vnd.apple.mpegurl')` use native, else
  `const { default: Hls } = await import('hls.js')`; attach, forward fatal errors.
  For files: set `src`, `preload='auto'`, `crossOrigin` left unset.
- Wire `loadedmetadata/canplay/playing/pause/waiting/ended/error/stalled` → statuses.
  Error → friendly copy: "This link can't be played directly by your browser. Try a
  direct MP4/WebM/HLS link, or screen share instead." `play()` propagates the rejection
  (sync engine surfaces `blocked`).

### Screen share — `lib/media/screen-share.ts` + `lib/webrtc/mesh.ts` (screenshare task)

```ts
// lib/webrtc/mesh.ts
export type PeerConnState = 'connecting' | 'connected' | 'failed' | 'disconnected';
export class ScreenShareMesh {
  constructor(opts: {
    selfId: string;
    connection: RoomConnection;                       // subscribes to webrtc:* + screen:viewer-ready
    onRemoteStream(stream: MediaStream | null): void; // viewer side
    onPeerStates(states: Record<string, PeerConnState>): void;
    onLocalEnded(): void;                             // host's tracks ended (user hit browser Stop)
  });
  startSharing(): Promise<MediaStream>;  // getDisplayMedia({video: true, audio: true}); offers to each viewer-ready
  stopSharing(): void;                   // stop tracks, close PCs, (caller then sends screen:stop)
  becomeViewer(sharerId: string): void;  // sends screen:viewer-ready {toId: sharerId}, awaits offer
  leaveViewer(): void;
  destroy(): void;                       // full cleanup: tracks, PCs, listeners
}
```
- ICE: `[{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]`,
  no TURN (README documents the limitation). Mesh: host has one `RTCPeerConnection` per
  viewer; host creates the offer when a `screen:viewer-ready` arrives; viewer answers;
  trickle ICE via `webrtc:ice`. Track `connectionstatechange` → `onPeerStates`.
  Host listens for track `ended` → `onLocalEnded`.
- `ScreenShareAdapter implements MediaAdapter` —
  `new ScreenShareAdapter(video: HTMLVideoElement, events, opts: { isLocal: boolean })`
  plus `attachStream(stream: MediaStream | null): void`. `isLive() === true`,
  `canSeek/canPause === false`, `getCurrentTime() = 0`, status `live`-ish: report
  `playing` once a stream is attached and the video is playing, `loading` before.

### Hosted upload (FUTURE) — `lib/media/hosted-upload-stub.ts` (upload-stub task)

`HostedUploadAdapter implements MediaAdapter` where every method throws/no-ops with
status `'error'` and message "Hosted Upload is coming later." Exports
`HOSTED_UPLOAD_ROADMAP: string[]` describing the future flow (signed-URL upload to object
storage → server-side buffer/ready gate → everyone streams the same hosted object → TTL
expiry, size caps). Rich TODO comments marking where it plugs in (queue item type already
exists). No upload UI beyond a disabled card (queue task renders it).

## 11. Identity — `lib/identity.ts` (identity task)

```ts
export type LocalIdentity = IdentitySnapshot;     // re-export shape from protocol
export function loadIdentity(): LocalIdentity | null;   // localStorage 'couchcircle:identity'; SSR-safe (null on server)
export function saveIdentity(identity: LocalIdentity): void;
export function ensureIdentity(): LocalIdentity;  // load or create+save a random one
export function randomName(): string;             // cozy two-parter: "Blanket Wizard", "Couch Cryptid", "Haze Gremlin"...
export function randomIdentity(): LocalIdentity;  // nanoid() id, randomName, random avatar from AVATAR_IDS, random ACCENT_COLORS entry
```

## 12. UI component contracts

All zero-prop + `useRoom()` unless stated. Read DESIGN.md and the `components/ui/*`
implementations before styling anything.

- **`app/r/[code]/page.tsx`** (room-shell): client component:
  `export default function RoomPage({ params }: { params: Promise<{ code: string }> })`
  → `use(params)`, normalize code, render `<RoomShell code={code} />`.
- **`RoomShell({ code }: { code: string })`**: wraps everything in `<RoomProvider code={code}>`.
  Layout (desktop-first grid): TopBar / main row (stage column + 380px side panel) /
  RemoteControls bottom bar. Stage column = MediaStage with ParticipantCircle below it
  (the couch row), SeshControls strip between couch and bottom bar (renders nothing when
  sesh off). Overlays: JoinGate (full-screen until `joinPhase === 'joined'`), ErrorBanner,
  ReadyCheck, RoomSettings (open state owned by TopBar via a tiny local state lift inside
  RoomShell: `const [settingsOpen, setSettingsOpen] = useState(false)` — TopBar takes
  `{ onOpenSettings(): void }`, RoomSettings takes `{ open: boolean; onClose(): void }`).
  Responsive: side panel collapses under stage on < lg.
- **`TopBar({ onOpenSettings })`**: room name + join code chip (click = copy invite link
  `${location.origin}/r/{code}` with a "copied 🛋️" toast-ish flourish), lock icon when
  `passwordEnabled`, Sesh Mode toggle (sends `sesh:enable`; host/controller only —
  disabled otherwise with tooltip), ConnectionHealth, settings gear.
- **`JoinGate`**: cozy full-screen porch: name input (prefilled from `ensureIdentity()`),
  avatar picker grid (AvatarSprite for all six + AVATAR_META labels), accent swatches,
  password field when `joinPhase === 'wrong-password'` or pending-create has none but
  state demands it; big "slide onto the couch" button → `join()`; handles `not-found`
  (link to `/` "this room dissolved into the haze"), `room-full`, `resolving` spinner vibe.
  Persists identity via `saveIdentity` on join.
- **`ErrorBanner`**: `lastError` + `connectionStatus !== 'connected'` states ("reconnecting
  to the couch…"). Slides down from top; auto-dismiss when cleared.
- **`ConnectionHealth`**: small dot+label from `connectionStatus` + rttMs (green < 80ms,
  amber < 250, red otherwise).
- **`MediaStage`** (media-stage): the shared TV. Owns ONE `SyncEngine` instance (created
  with context fns, destroyed on unmount) and renders the right player by
  `state.media.adapter`: `'idle'` → cozy TV-off screen (flickering glow, "queue something
  to start the night", quick-add sample buttons that send `queue:add` + `queue:play`);
  `youtube|direct-url|screen-share` → the player components below. Overlays:
  `SparkCountdown`, `ReactionLayer`, autoplay-`blocked` "tap to sync up" overlay
  (→ `engine.resumePlayback()`), media error panel (friendly copy + "remove from queue"
  when canControl). Players receive `{ engine, item }`:
  - **`YouTubePlayer({ engine, item }: { engine: SyncEngine; item: QueueItem })`** —
    container div, instantiate `YouTubeAdapter`, `adapter.load(item)`,
    `engine.setAdapter(adapter)`, destroy on unmount/item change.
  - **`DirectUrlPlayer({ engine, item })`** — same with `<video>` + `DirectUrlAdapter`.
  - **`ScreenSharePlayer({ engine, item })`** — splits host (`state.media.sharerId === selfId`)
    vs viewer. Host: button "Start sharing your screen" → mesh.startSharing(), local
    preview (muted), send `screen:start`; "Stop" → mesh.stopSharing() + `screen:stop`;
    per-viewer connection states row. Viewer: mesh.becomeViewer(sharerId), remote stream
    into `<video autoplay playsInline>`; state chips connecting/connected/failed/disconnected;
    "Best for small rooms — quality depends on the host's upload" copy
    (+ louder warning when participants > MESH_COMFORT_LIMIT). Permission denied →
    friendly error + `screen:stop`. Full mesh cleanup on unmount.
- **`SyncIndicator`**: pill from `useSyncStatus()` health: Synced 🟢 / Slight drift 🟡 /
  Resyncing 🔄 / Buffering 🌀 / LIVE 🔴 / blocked ⚠️ "tap to sync".
- **`SparkCountdown`**: when `sesh.sparkCountdownEndsAt` is in the future render a huge
  centered count (ceil((endsAt − serverNow())/1000)) with smoke/glow animation, then a
  brief "BLAZE IT 🔥" burst at 0. Ticks via rAF/250ms interval against `serverNow()`.
- **`ReactionLayer`**: floats `reactions` bursts up over the stage (framer-motion).
- **`ParticipantCircle`** (participants): the couch row — a stylized couch (CSS/SVG) with
  `ParticipantAvatar`s seated along it (wrap to floor cushions beyond ~6). Diff
  `state.events` to fire flourishes: join bounce, `pass-the-vibe` glow wave across seats,
  rotation current-turn ring, ready ✅ badges during readyCheck, controller 📺 chip,
  disconnected → translucent zZz.
- **`ParticipantAvatar({ participant, size = 'md' }: { participant: Participant; size?: 'sm'|'md'|'lg' })`**:
  AvatarSprite + name plate + StatusBubble (STATUS_META emoji+label, animated on change);
  clicking YOUR OWN avatar opens **`StatusPicker`** (popover grid of all statuses →
  `presence:update`). Idle sway/bob always running (alive!).
- **`QueuePanel`** (queue): list with thumbnail (YouTube thumb via `youTubeThumbnail`,
  type icon otherwise), title, addedByName, duration, vote button (▲ count, toggles
  `queue:vote`), now-playing glow on current `queueItemId`. Controller/host: ▶ play now
  (`queue:play`), ↑↓ move (`queue:move`), ✕ remove. Non-controller adds allowed per
  `settings.guestsCanAddToQueue`. "Add to queue" button → **`AddToQueueDialog`**:
  tabs for YouTube URL / Direct URL / Screen share. Parse + validate on submit
  (`parseYouTubeUrl`, `isProbablyMediaUrl`); YouTube title defaults to "YouTube video"
  (no oEmbed fetch needed; thumbnail from id); screen-share tab: pick "share MY screen"
  → `queue:add { type:'screen-share', source: selfId, title: "{name}'s screen" }`.
  Includes the disabled "Hosted Upload — coming later" card (upload icon, one-liner,
  `HOSTED_UPLOAD_ROADMAP` tooltip/expand). Empty state: "the queue is empty… someone do
  something" + sample quick-adds (SAMPLE_VIDEOS).
- **`SidePanel`** (chat-events): right panel with Tabs: Chat / Activity. Unread dot on
  inactive tab. **`ChatPanel`**: scrolling list (auto-stick to bottom unless scrolled up),
  author avatar dot + accent name, input (Enter sends `chat:message`, 500 char cap),
  emoji reaction bar (REACTION_EMOJIS → `reaction:send`). **`EventLog`**: `state.events`
  newest-last with kind filters (chips: all/media/sesh/people), emoji-flavored lines,
  relative times.
- **`RemoteControls`** (remote): bottom bar. Transport: play/pause (`media:play`/`media:pause`),
  scrubber bound to `useSyncStatus().positionSec/durationSec` (drag → `media:seek`;
  HIDDEN when `!canSeek`), time readout, rate menu 0.5–2× (`media:rate`), LOCAL volume
  slider (adapter `setVolume` — note "your volume only"). Controller chip: "🎮 you have
  the remote" or "{name} has the remote". Buttons: request remote (non-controller,
  `remote:request`, disabled in host-only mode w/ tooltip), pass remote (controller →
  dropdown of participants, `remote:pass`), grant/deny pending requests (controller sees
  pendingRequests badges), emergency pause (anyone, red, `room:action emergency-pause`).
  Renders `<SyncIndicator />`. Transport disabled (with cozy tooltip "ask for the
  remote") when `!canControl`.
- **`SeshControls`** (sesh): horizontal strip visible only when `sesh.enabled`:
  Join/Leave rotation, Start/Stop rotation (controller/host), Spark countdown
  (`sesh:countdown:start` SPARK_DEFAULT_SECONDS), Hit now, Pass (left/right split button),
  Water check / Snack run / Bathroom / Pass the vibe / Vibe check (`room:action`),
  status quick-set ("rolling", "couchlocked"… → `sesh:status`). Buttons that need
  rotation membership disable with tooltips. **`RotationPanel`**: floating card
  (bottom-left over stage) when `rotationActive`: ordered member avatars, current turn
  highlighted + "now: {name}" / "next: {name}", turn timer if `rotationAutoAdvanceSec`.
  **`ReadyCheck`**: overlay banner when `readyCheck?.active`: "{n}/{total} ready", big
  "I'm ready" toggle (`ready:set`), controller: "start anyway" (`ready:cancel` +
  `media:play`) and cancel.
- **`RoomSettings({ open, onClose })`** (settings): dialog; host-only editing (read-only
  view otherwise): room name (text), remote mode (host-only / request / chaos →
  `settings:update`? NO — remote mode lives in RemoteState: send
  `settings:update { }`… **remote mode is changed via a dedicated control**: include a
  segmented control that sends `remote:revoke`-style? → Implementation: extend
  `settings:update` handling on the server: when `settings` includes
  `remoteMode?: RemoteMode` (add OPTIONAL `remoteMode` field to `Partial<RoomSettings>`
  payload — server applies it to `remote.mode`), guests-can-add-to-queue switch,
  rotation auto-advance (off/15s/30s/60s), copy invite link, room code display. To keep
  types honest: `settings:update` payload type is
  `{ settings: Partial<RoomSettings> & { remoteMode?: RemoteMode } }`.
- **Landing** (landing): `app/page.tsx` hero ("Watch YouTube, direct media links, or
  screen share with friends — synced, cozy, and actually fun."), animated cozy scene
  (couch + lamp glow + drifting smoke, a couple of idle AvatarSprites hanging out),
  **`CreateRoomCard`**: room name (optional), password (optional), "roll up a room" →
  `createRoom()` → write sessionStorage `couchcircle:pending-create:{CODE}` →
  `router.push('/r/'+joinCode)`. **`JoinRoomCard`**: code input (normalize), "join the
  circle" → resolve via `resolveCode` for early not-found feedback → push. Footer links
  to /about + /demo. **`app/demo/page.tsx`**: how to demo locally (two tabs, sample
  URLs listed, what to click), "spin up a demo room" button (create with
  `seedDemo: true`). **`app/about/page.tsx`**: what it is, limitations (CORS, DRM —
  "Netflix won't work and we're not pretending it will"), authorized-media-only note,
  sesh mode is social flavor only.

## 13. Avatars — `components/avatars/` (avatars task)

```ts
export type AvatarMood =
  | 'idle' | 'happy' | 'hyped' | 'sleepy' | 'melted' | 'focused'
  | 'away' | 'thirsty' | 'buffering' | 'lit';
export function statusToMood(status: ParticipantStatus): AvatarMood;
// chilling→idle, laughing→happy, sparking|hitting→lit, rolling→focused, locked-in→focused,
// couchlocked→melted, afk→sleepy, snack-run→away, needs-water→thirsty, buffering→buffering
export function AvatarSprite(props: { avatar: AvatarId; accent: string; mood?: AvatarMood; size?: number }): React.ReactElement;
export const AVATAR_COMPONENTS: Record<AvatarId, React.FC<{ accent: string; mood: AvatarMood; size: number }>>;
```

Six hand-drawn-feeling inline SVG creatures (couch goblin, frog, cat, chinchilla, lil
sprout, blanket person), each ~80–120 lines of SVG with personality: accent color tints
clothing/markings; moods change eyes/mouth/posture/effects (lit → subtle glow + tiny
smoke puffs; melted → drooping; buffering → spiral eyes; sleepy → zzz). CSS keyframe
idle animations (gentle bob/sway/blink — randomize duration per instance via inline
style so the room never moves in lockstep). Pure SVG+CSS, no images.

## 14. Design system (design-system task)

`DESIGN.md` documents everything below for the other agents; `app/globals.css` implements
tokens via Tailwind v4 `@theme` (+ keyframes + a film-grain/noise overlay utility +
glow utilities). Direction: late-night living room — deep warm browns/inks, lamp-amber,
moss green, faint purple haze; generous rounding (rounded-2xl+); soft layered shadows;
slow drifting smoke; light typographic warmth (Fraunces for display via `next/font`,
a soft sans for body). Components in `components/ui/` follow shadcn-style APIs:

`button.tsx` (Button: variant `default|accent|ghost|outline|danger`, size `sm|md|lg|icon`),
`card.tsx` (Card, CardHeader, CardTitle, CardContent, CardFooter), `dialog.tsx` (Radix:
Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription,
DialogFooter, DialogClose), `input.tsx`, `label.tsx`, `badge.tsx` (variant
`default|accent|outline|live`), `tabs.tsx` (Radix Tabs, TabsList, TabsTrigger,
TabsContent), `tooltip.tsx` (Radix + TooltipProvider in layout), `switch.tsx`,
`slider.tsx`, `dropdown-menu.tsx`, `popover.tsx`, `separator.tsx` — all Radix-based,
all accepting `className`, merged with `cn` from `lib/utils.ts`
(`cn = twMerge(clsx(...))`). `app/layout.tsx`: fonts, `<TooltipProvider>`, dark cozy
body classes, metadata (title "CouchCircle — watch together, actually together").

## 15. Error states matrix

| Situation | Surface |
|---|---|
| WS reconnecting / dropped | ErrorBanner + ConnectionHealth |
| Room not found / expired | JoinGate `not-found` screen |
| Wrong password | JoinGate inline error, field shake |
| Room full | JoinGate state |
| Media failed (CORS/format) | MediaStage error panel w/ friendly copy |
| YouTube embed blocked | adapter onError → same panel |
| Screen-share permission denied | ScreenSharePlayer inline + auto `screen:stop` |
| WebRTC failed | per-peer chips + retry hint |
| Host stopped sharing | server event + media→idle TV-off screen |
| Controller left | server auto-transfer + event |
| Queue empty | QueuePanel empty state |
| Rate limited / not allowed | ErrorBanner (short) |

## 16. Scripts & env

`package.json` scripts: `dev` (next dev), `dev:party` (partykit dev --port 1999),
`dev:all` (concurrently both), `build`, `typecheck` (tsc --noEmit), `start`,
`deploy:party` (partykit deploy). `.env.example`: `NEXT_PUBLIC_PARTYKIT_HOST=127.0.0.1:1999`.

## 17. Hosted Upload (future) — boundaries

Stub only (§10). No file uploads, no object storage, no proxying arbitrary URLs through
the server, no DRM circumvention, ever. README documents the intended future design.

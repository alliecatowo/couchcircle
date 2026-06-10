# CouchCircle

> **watch together, actually together.**

CouchCircle is a cozy real-time browser watch-party app built for the group chat that actually shows up. One room, one shared queue, one remote that gets passed around — YouTube, direct media links, or P2P screen share, all kept in sync by an authoritative server clock so nobody's a scene ahead. Throw in a social layer for the rituals that go along with watching things, a spark countdown that fires at the exact same moment for everyone, and a blunt rotation tracker because passing things around a couch — even a digital one — is a whole vibe. No accounts, no payments, no algorithms. Just your friends, melted into a couch.

---

## what it does

| feature | the deal |
|---|---|
| **YouTube sync** | paste any YouTube URL (watch, youtu.be, shorts, live) — embedded iframe, synced to the server clock |
| **direct URL + HLS sync** | MP4, WebM, OGV, MOV, and `.m3u8` HLS streams — including Big Buck Bunny, test streams, anything you host |
| **P2P screen share** | browser `getDisplayMedia` → WebRTC mesh → everyone sees your screen in real time; host is the source, viewers peer-connect |
| **shared queue** | everyone (or just the controller, your call) can add to the queue; vote up items; drag to reorder; play anything with one click |
| **one-remote control model** | one person holds the remote at a time — host-only, request mode (raise your hand), or chaos mode (anyone can drive); emergency pause is always available to everyone |
| **chat + activity log** | persistent chat with emoji reactions floating up over the stage; activity log with kind filters so you can see the media/sesh/people history |
| **sesh mode social layer** | the couch's social ritual layer — blunt rotation tracker, spark countdown, status vibes (rolling, sparking, hitting, couchlocked, needs-water…), snack votes, pass-the-vibe, water checks, bathroom breaks, vibe checks |
| **ready checks** | "is everyone ready to start?" — synced ready check; auto-starts when the last person locks in |
| **spark countdown** | hit the spark button, a big synchronized countdown ticks on every screen from the server clock; when it hits zero, everyone's in it together |
| **blunt rotation** | join the rotation, see whose turn it is, pass left or right, or set an auto-advance timer so the couch moves itself |

> sesh mode features are cozy social ritual flavor. no substance advice, no consumption guidance, no procurement info. ever.

---

## quickstart

```bash
npm install
cp .env.example .env.local
npm run dev:all
```

that starts the Next.js app on **:3000** and the PartyKit room server on **:1999** concurrently.

if you prefer two terminals:

```bash
# terminal 1
npm run dev

# terminal 2
npm run dev:party
```

`.env.local` just needs one line (already in `.env.example`):

```
NEXT_PUBLIC_PARTYKIT_HOST=127.0.0.1:1999
```

---

## try it in two tabs (the 90-second walkthrough)

1. open `http://localhost:3000` in tab 1
2. click **"roll up a room"** — give it a name if you want, leave password blank for now
3. you land in the room. click the join code chip in the top bar — it copies the invite link to your clipboard (`http://localhost:3000/r/WORD-NNN`)
4. open that link in tab 2, pick a different name/avatar, slide onto the couch
5. in either tab, open the queue panel and click **"add to queue"**
6. paste the sample MP4 into the direct URL tab:
   ```
   https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_640x360.m4v
   ```
   or use the quick-add buttons in the empty queue state — they're right there
7. hit **▶ play now** — both tabs should start at the exact same moment
8. watch the **sync indicator** in the bottom bar: `synced 🟢` means you're within 150ms; `slight drift 🟡` means it's nudging your playback rate; `resyncing 🔄` means it's hard-seeking you back

**sample URLs (verbatim):**

```
# mp4
https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_640x360.m4v

# hls stream
https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8

# youtube
https://www.youtube.com/watch?v=aqz-KE-bpKQ
```

or hit `/demo` for a pre-seeded room with all three already in the queue.

---

## architecture

### the big picture

```
browser                                    PartyKit (workerd)
┌─────────────────────────────┐            ┌──────────────────────┐
│  Next.js 15 App Router      │ WebSocket  │  party/index.ts      │
│  React 19 + Tailwind v4     │◄──────────►│  (room logic)        │
│                             │            │                      │
│  lib/realtime/              │  HTTP      │  party/lobby.ts      │
│    connection.ts            │◄──────────►│  (code → roomId map) │
│    room-context.tsx         │            └──────────────────────┘
│                             │
│  lib/sync/sync-engine.ts    │  WebRTC (P2P, no relay)
│                             │◄──────────────────────────────────►
│  lib/media/                 │            other browsers
│    youtube.ts               │
│    direct-url.ts            │
│    screen-share.ts          │
└─────────────────────────────┘
```

### authoritative sync model

the PartyKit room server owns all `MediaState`. every play/pause/seek bumps a `seq` counter; the server timestamps every command in its own clock. clients compute the authoritative position as:

```
position + max(0, now - updatedAtServerMs) / 1000 * playbackRate
```

drift correction thresholds (from `shared/constants.ts`):
- **< 150ms** (`DRIFT_SOFT_MS`): ignore it, close enough
- **150–750ms**: nudge playback rate by ±0.05 (`RATE_NUDGE`) to ease back in sync
- **> 750ms** (`DRIFT_HARD_MS`): hard seek to authoritative position

play commands are scheduled `450ms` in the future (`PLAY_LEAD_MS`) so every client can pre-seek and fire at the same server-clock moment.

the controller sends a heartbeat every `2500ms` (`HEARTBEAT_MS`) with its actual player position; the server adopts it if drift > 0.4s (without bumping `seq` — watchers see it as a silent anchor update, not a command).

### media adapters

all three adapters sit behind one `MediaAdapter` interface (`lib/media/adapter.ts`). the sync engine doesn't know or care which one is loaded:

| adapter | file | notes |
|---|---|---|
| `YouTubeAdapter` | `lib/media/youtube.ts` | YouTube IFrame API; singleton script loader |
| `DirectUrlAdapter` | `lib/media/direct-url.ts` | `<video>` tag; hls.js for `.m3u8` |
| `ScreenShareAdapter` | `lib/media/screen-share.ts` | `isLive=true`, `canSeek/canPause=false` |
| `HostedUploadAdapter` | `lib/media/hosted-upload-stub.ts` | stub — throws; see §future below |

### repo map

```
shared/
  protocol.ts          — all types, message unions, canControl helper
  constants.ts         — thresholds, limits, SAMPLE_VIDEOS, REACTION_EMOJIS
  join-codes.ts        — WORD-NNN generator + normalizer

party/
  index.ts             — PartyKit default export, connection routing
  room.ts              — all room logic: join, media, sesh, remote, rotation
  lobby.ts             — code→roomId HTTP-only party (single instance)
  rate-limit.ts        — sliding window rate limiter (per connection, per category)

lib/
  identity.ts          — localStorage identity: load/save/ensureIdentity
  utils.ts             — cn() for class merging
  realtime/
    types.ts           — ConnectionStatus, JoinPhase, RoomContextValue
    connection.ts      — PartySocket wrapper, ping/pong clock sync, lobby HTTP calls
    room-context.tsx   — RoomProvider + useRoom() hook
  sync/
    sync-engine.ts     — drift detection, heartbeat, scheduled play, rate nudge
  media/
    adapter.ts         — MediaAdapter interface
    youtube.ts         — YouTubeAdapter
    url-parse.ts       — parseYouTubeUrl, classifyDirectUrl, isProbablyMediaUrl
    direct-url.ts      — DirectUrlAdapter (video tag + hls.js)
    screen-share.ts    — ScreenShareAdapter
    hosted-upload-stub.ts — HostedUploadAdapter stub + roadmap notes
  webrtc/
    mesh.ts            — ScreenShareMesh: WebRTC mesh, ICE, peer state tracking

components/
  ui/                  — shadcn-style: Button, Card, Dialog, Input, Tabs, Tooltip…
  avatars/             — six hand-drawn SVG creatures (goblin, frog, cat, chinchilla, sprout, blanket)
  landing/             — CreateRoomCard, JoinRoomCard
  room/
    RoomShell.tsx      — layout wrapper + RoomProvider
    TopBar.tsx         — room name, join code chip, sesh toggle, connection health
    JoinGate.tsx       — name/avatar/password porch
    MediaStage.tsx     — the TV: player selection, SyncEngine wiring, overlays
    players/           — YouTubePlayer, DirectUrlPlayer, ScreenSharePlayer
    QueuePanel.tsx     — queue list, vote, reorder, add dialog
    SidePanel.tsx      — Chat + Activity Log tabs
    RemoteControls.tsx — play/pause/scrub/rate, remote ownership, emergency pause
    SeshControls.tsx   — rotation, spark, status quick-set, room actions
    ParticipantCircle.tsx — the couch row
    …and more

app/
  page.tsx             — landing
  r/[code]/page.tsx    — room page
  about/page.tsx       — what it is, honest limitations
  demo/page.tsx        — demo room with sample content seeded
  globals.css          — Tailwind v4 @theme tokens (couch/ember/moss/haze)
  layout.tsx           — fonts, TooltipProvider, metadata
```

---

## deployment

### frontend (Next.js)

deploy to **Vercel** or **Cloudflare Pages** like any Next.js app. set the environment variable:

```
NEXT_PUBLIC_PARTYKIT_HOST=your-party-name.your-username.partykit.dev
```

### realtime server (PartyKit)

```bash
npm run deploy:party
# which runs: partykit deploy
```

PartyKit handles the WebSocket scaling. you don't manage infra.

> **important:** do NOT host the WebSocket room server inside serverless functions (Vercel Edge Functions, Lambda, etc.). WebSocket connections require a persistent process — that's exactly what PartyKit provides. the Next.js app and the PartyKit server are separate deployments.

---

## limitations & honest notes

### direct URL playback (CORS and format limits)

direct URL playback uses a `<video>` tag pointed at the URL you paste. this means:

- **the server must send CORS headers** (`Access-Control-Allow-Origin: *` or your domain). most CDNs and hosting services do. random web links usually don't. if playback fails, you'll see:
  > "this link can't be played directly by your browser. try a direct MP4/WebM/HLS link, or screen share instead."
- **supported formats:** MP4 (H.264/AAC), WebM, OGV, MOV, and HLS (`.m3u8`). proprietary containers, DRM'd streams, and adaptive dash manifests that need special handling won't work.
- **google drive / dropbox / onedrive links** almost certainly won't work — they redirect to a viewer page, not a raw media file. use "anyone with link" + direct download URLs if the service exposes them, or just screen share.

### P2P screen share

- uses STUN only (`stun.l.google.com`) — **no TURN relay**. if both peers are behind symmetric NAT (common in corporate networks, some mobile networks), the WebRTC connection will fail. the app tells you when a peer fails to connect; screen share still works for peers who CAN connect.
- quality depends entirely on the **host's upload bandwidth**. one host, N viewers, each getting a separate stream. above ~5 viewers (`MESH_COMFORT_LIMIT`) the app warns you the mesh is getting heavy.

### YouTube

- YouTube's embed restrictions apply. some videos (music videos, age-restricted content, certain live streams) block embedding. you'll see:
  > "this video can't be embedded — try another link"
- YouTube IFrame API controls are sandboxed — the sync engine can seek and rate-set, but the player is still governed by YouTube's own autoplay, ad injection, and quality policies.

### autoplay policy

modern browsers block `video.play()` until the user has gestured on the page. joining and clicking anything counts as a gesture, but if you land in a room and the video is already playing, you might see a **"tap to sync up"** overlay. tap it — the sync engine will resume and seek you into the right position.

### rooms are ephemeral

room state lives in PartyKit's in-memory store with a throttled `room.storage` snapshot for restart resilience (rooms survive short restarts if < 6h old). there is **no database**. if the PartyKit process cold-boots and the snapshot is gone, the room is gone. for the hobbyist use case this is fine; for anything more serious, treat a restart as a hard reset.

### join codes are short

`WORD-NNN` codes are designed for humans to type and share verbally. they're not secret by themselves — there are only a few thousand combinations per word, and the wordlist is not secret. if you want a private room, **use the optional password**. the lobby never lists rooms, there's no directory, and room IDs are UUIDs — so the room itself is unguessable even if someone knows the code format.

---

## security and abuse posture

- **unguessable room IDs** behind short human codes via the lobby — no room directory, no listing endpoint, no server-side URL proxying
- **optional password** per room — stored as private server state, never in `RoomState`, never broadcast
- **rate limits** on every operation category (chat 5/5s, media commands 10/3s, queue ops 10/10s, reactions 10/5s, join 5/10s, room actions 4/5s)
- **sanitized chat:** control chars stripped, 500 char cap, empty messages dropped; names capped at 24 chars; URLs validated as `http(s)` and capped at 2000 chars
- no recording, no server-side media proxying, no URL fetching on behalf of clients
- `dangerouslySetInnerHTML` is never used anywhere — user text is always React text nodes

---

## AUTHORIZED MEDIA ONLY

CouchCircle is a tool for watching content you have the right to watch. it does not:

- circumvent DRM
- bypass geographic restrictions
- proxy or cache third-party media through its servers
- work with Netflix, Disney+, Hulu, or any service that requires a proprietary player

by design, direct URL playback requires the media server to serve the file with permissive CORS headers — which proprietary streaming services deliberately do not do. **Netflix won't work and we're not pretending it will.**

use CouchCircle for:
- content you own or host yourself
- legitimately embeddable YouTube videos
- public domain or creative commons media
- your own screen (via screen share) for anything you're authorized to view

---

## future: hosted upload adapter (roadmap)

the codebase has a stub at `lib/media/hosted-upload-stub.ts` and a `hosted-upload-stub` queue item type in the protocol. the intended future design is:

1. **uploader gets a signed URL** from a backend (not yet built) pointing to object storage
2. they upload the file directly — the server doesn't proxy it
3. a **ready gate** waits for the upload to complete before the item becomes playable
4. **everyone streams from the same hosted object** — no CORS issues, no peer dependency
5. the object has a **TTL** (e.g. 24h) and a size cap; after expiry it's gone

this solves the "I have a file on my laptop" use case without requiring screen share quality or CORS luck. it's marked clearly as not-built in the UI (a disabled card in the Add to Queue dialog with a "coming later" label). the protocol types are already wired so the feature can be added without breaking changes.

---

## sesh mode

sesh mode is a **social ritual layer**. it tracks whose turn it is, counts down a synchronized moment, lets you log your status on the couch (rolling, sparking, couchlocked, needs-water, etc.), vote on snack runs, and do the collective things a room does together.

it does not provide substance advice, dosing information, procurement guidance, or anything of the kind. it's vibes. it's a tracker for couch rituals that happen to be social. use it for anything — passing the aux cord, synchronized tea ceremonies, the ceremonial opening of the chips bag, or whatever your couch does.

---

## stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript strict**
- **Tailwind CSS v4** — CSS-first `@theme` config in `app/globals.css`; no `tailwind.config.*`
- **PartyKit** for the realtime room server (`party/`)
- **partysocket** for the client WebSocket connection
- **framer-motion** for animations
- **hls.js** (dynamically imported) for HLS stream playback
- **Radix UI** primitives wrapped in `components/ui/`
- **lucide-react** icons
- **nanoid** for IDs

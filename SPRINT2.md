# Sprint 2 — contracts addendum (binding, extends CONCEPTS.md + ARCHITECTURE.md)

New concepts: **theater mode** (chrome melts away, TV goes full-bleed), **the projector**
(companion second-screen window showing ONLY the movie), **explore** (a channel browser of
strictly legal free sources), **share quality presets**, **first-class mobile**. Canon
vocabulary additions: second screen = "the projector" / "throw it to the big screen";
explore = "channel surf"; theater = "theater mode".

## 1. Projector (companion / dual screen)

- Protocol: `room:join` gains `role?: 'crew' | 'projector'` (default crew).
  Server: projector joins create NO participant entry, don't count toward
  MAX_PARTICIPANTS, receive `joined` + every broadcast, and their conn→id mapping IS
  registered so webrtc relays (`screen:viewer-ready`, offers/ice) reach them.
  `RoomState` gains `projectorCount: number` (server-maintained, broadcast).
- Route `app/r/[code]/screen/page.tsx` → `ProjectorView`: RoomProvider with
  `role="projector"` prop (provider passes role through join; projector identity =
  `{ id: 'prj_'+nanoid(), name: 'the projector', avatar: 'blanket', accent: any }`,
  never persisted). Renders: full-bleed black stage, the active player + own SyncEngine
  (non-controller path = existing drift correction), big centered "tap to roll"
  start overlay (autoplay), minimal floating status (couch name, code, sync pill,
  crew count), cursor auto-hides. No couch, no panels, no remote.
- Main-window handoff: TopBar gains a "throw to the big screen 📽️" button →
  `window.open('/r/CODE/screen', 'couchprojector', 'popup')`; keeps the handle in a
  ref. While its own projector window is open, the main window's MediaStage swaps the
  player for a "🎬 rolling on the projector" placeholder card and calls
  `engine.setAdapter(null)` (no double audio); closing the projector (poll handle
  .closed each 2s) restores the local player. Button shows "close the projector" while open.

## 2. Theater mode

- `lib/theater.tsx`: `TheaterProvider` + `useTheater(): { theater: boolean; toggle(): void; chromeVisible: boolean }`.
  chromeVisible = false after 3s without mousemove/touch while theater && playing.
- In theater: RoomShell hides TopBar, side column, seating, sesh tray; MediaStage goes
  full-bleed (still bezel-less letterbox on the wall, vignette); RemoteControls becomes
  a floating pill bottom-center that fades with chromeVisible; chat lives as ephemeral
  overlay toasts (last 3 messages, right edge, fade after 6s). Toggle: TopBar button +
  double-click on the TV + `t` key; Esc exits; optional browser Fullscreen API on the
  stage element (best-effort, with toggle).

## 3. Explore (channel surf) — strictly legal sources only

- `lib/explore/registry.ts`:
  ```ts
  export interface Channel { id: string; title: string; blurb: string;
    kind: 'film' | 'live'; type: 'direct-url' | 'youtube'; source: string;
    poster?: string; runtimeMin?: number; license: string; }
  export interface ExploreSection { id: string; title: string; tagline: string; channels: Channel[]; }
  export const EXPLORE_SECTIONS: ExploreSection[];
  ```
  Sections: "open movies" (Blender Foundation films — BBB, Sintel, Tears of Steel,
  Elephants Dream, + more if URLs verify), "midnight classics" (Internet Archive public
  domain features — e.g. Night of the Living Dead, Nosferatu, The General, Plan 9,
  His Girl Friday, Detour…, direct .mp4 file URLs from archive.org), "live channels"
  (NASA TV public HLS + 2-3 other unambiguous free-and-legal streams). EVERY url must
  be curl-verified at build time by the author (200 + video/* or HLS manifest); include
  `license` string per entry. No scraping, no DRM, nothing gray.
- `components/room/ExplorePanel.tsx` (zero-prop + `{ open, onClose }` dialog variant):
  poster-grid channel browser (sections, hover lift, license footnote), buttons
  "queue it" (queue:add) / "play now" (queue:add + queue:play when canControl).
  Entry points: a tab inside AddToQueueDialog AND idle-TV button "channel surf 📺".

## 4. Add drill-down (YouTube / remote URL)

- Lobby endpoint `GET /parties/lobby/index?yt=<11-char-id>`: server-side fetch of
  `https://www.youtube.com/oembed?url=…&format=json`, 1h cache in lobby storage,
  rate-limited with the existing limiter, STRICT id validation (this is not a proxy).
  → `{ title, author, thumbnail }` (404 on unknown).
- AddToQueueDialog: pasting a URL debounce-resolves a PREVIEW CARD before adding —
  youtube: oEmbed title/author/thumb; direct: classified kind chip (mp4/webm/hls) +
  filename-derived title (editable input). Queue items therefore carry real titles.

## 5. Screen share: quality presets + adaptive bitrate

- `ScreenShareMesh.startSharing(opts: { preset: SharePreset })`,
  `export type SharePreset = 'crisp' | 'smooth' | 'saver'`:
  - crisp: ideal 2560×1440@15, contentHint 'detail', degradation 'maintain-resolution'
  - smooth: ideal 1280×720@30, contentHint 'motion', degradation 'maintain-framerate'
  - saver: ideal 960×540@12, contentHint 'detail', maxBitrate hard-low
- Per-sender `setParameters({ encodings: [{ maxBitrate }] })` where maxBitrate =
  preset base (crisp 3_500_000 / smooth 2_200_000 / saver 700_000) scaled by viewer
  count (×1 for ≤2 viewers, ×0.6 for 3-5, ×0.35 above) — re-applied on every viewer
  join/leave. `setCodecPreferences` preferring VP9 where supported.
- `mesh.getShareStats(): Promise<{ width: number; height: number; fps: number; kbpsUp: number; viewers: number } | null>`
  (getStats sampling); viewer side `getViewerStats(): Promise<{ kbpsDown: number } | null>`.
- ScreenSharePlayer host UI: preset segmented control BEFORE start + live stats chip
  ("1440p · 15fps · 2.1 Mbps · 3 watching"); viewer chip shows inbound kbps. Copy:
  "sharper than discord, lighter on your upload".

## 6. PWA (first-class, not crammed)

- `app/manifest.ts` (Next metadata route): name CouchCircle, display 'standalone',
  background `#181210`-family, theme ember, icons 192/512 + maskable from
  `public/icons/` (author generates real PNGs — headless-chrome screenshot of an SVG
  couch mark is acceptable), start_url '/'.
- Minimal `public/sw.js`: precache app shell + offline fallback ("the couch needs
  wifi 🛋️"), network-first for pages, NEVER intercept /parties/ or websockets;
  registered from a tiny client component in layout. iOS meta (apple-touch-icon,
  status-bar style). No push, no background sync.
- True mobile room layout (Workflow B): portrait = TV letterboxed top, horizontal
  seat strip (the same scene, compressed single row), swipeable bottom sheet with
  tabs (up next / chat / activity), thumb-reach remote bar, safe-area insets.

## 7. Mass parties + room hygiene

- `scripts/load-test.mjs <host> [n=12]`: spawn n WS clients → join one room → storm:
  staggered chat (within rate limits), presence churn, reactions; one controller doing
  scheduled play + heartbeats. Measure join→state latency + broadcast fan-out p50/p95,
  print per-client drift of authoritative position. Assert: client #13 refused
  room-full; after all leave + grace, server state resets.
- Server: when the LAST participant is removed (post-grace), reset state to
  uninitialized + `storage.deleteAll()` + cancel every timer (rotation/countdown/
  snack/grace table sweep). Heartbeat-driven `room:state` broadcasts may skip
  re-serializing when nothing but lastSeen changed (micro-opt allowed, optional).

## Boundaries (unchanged)

No DRM circumvention, no gray-area sources in explore, no arbitrary proxying (the
oEmbed endpoint is id-validated, cached, rate-limited), sesh layer stays social-only.

## 8. Circle rituals + synchronized "moments" (the sesh filters)

The rotation generalizes to **the circle**, with a kind: `'toke' | 'drink'`.
- `SeshState` gains `circleKind: 'toke' | 'drink'` (default toke; host/controller sets) and
  `toast?: { startedById: string; endsAt: number; raised: string[] }`.
- New messages: `sesh:circle:kind {kind}`; `sesh:toast:start` (circle members; opens a
  10s window); `sesh:toast:raise` (members raise one 🥂 — dedup). When ALL circle
  members raise (or window ends with ≥2), server emits the clink: event
  "🥂 CLINK — the whole couch raised one" + everyone in the circle gets status
  'laughing' for flavor. Drink-kind copy sweeps the circle UI (join the circle,
  pass left/right, "raise one 🥂" replaces "hit now 💨", spark = "toast in 5").
- **MomentLayer** (`components/room/MomentLayer.tsx`, zero-prop, mounted in RoomShell
  above everything incl. theater): diffs `state.events` (existing seen-ids pattern) and
  plays full-viewport, GPU-cheap (opacity/transform only) 2–4s ambient filter moments:
  - spark hits zero → slow smoke haze wash + ember bloom
  - toast clink → warm amber flash + floating 🥂 burst
  - everyone's ready → soft golden pulse
  - pass-the-vibe → the existing seat glow wave ALSO ripples the viewport edge
  Subtle > loud; never blocks input (pointer-events-none); respects prefers-reduced-motion.
- During a moment, every crew avatar plays its synchronized pose (hit / raise / cheer).
  Social ritual only — flavor, never consumption instruction.

## 9. Theater peanut gallery

In theater mode the crew never disappears — they become the back row:
- A silhouette strip along the bottom edge (≤10% height, in the letterbox when there
  is one): small dark avatar silhouettes of connected crew in seat order, ~35-45%
  opacity, idle sway preserved.
- Chat messages pop as speech bubbles above the speaker's silhouette (canon bubble
  style, ~6s fade, max 3 concurrent). Reactions float up from their sender's
  silhouette. Sesh moments (§8) play over everything.
- Vibe changes flash the status emoji briefly above the silhouette.
- chromeVisible=false hides the remote pill but NEVER the gallery (the gallery IS the
  cozy). A gallery toggle lives in the floating pill for purists.

## 10. The remote — one consolidated concept

The remote is a single physical object. Exactly one holder, or **up for grabs**.
- States: held by you / held by {name} / up for grabs (controllerId undefined).
- Modes change HOW it moves, never what it is: host-only (it stays home), request
  (ask → holder grants), chaos (anyone just grabs it — "grab the remote" replaces ask).
- When up for grabs: ONE-CLICK take for anyone, any mode ("grab the remote 🫳").
  Server: new message `remote:grab` — succeeds only when controllerId is unset/invalid
  OR mode is chaos; sets holder, event "🎮 {name} grabbed the remote".
- Single source of truth chip in the remote bar; the holder's couch avatar carries 📺;
  requests visible only to the holder (+ host); host always has "snag it back".
- UX law: any control requiring the remote, when you lack it, renders the SAME
  affordance everywhere — enabled-looking but amber-ghost, click = sends remote:request
  (or grab in chaos/up-for-grabs) with a "asked for the remote ✋" toast — never a dead
  disabled button. Implement once as a small wrapper (e.g. <NeedsRemote> in
  components/room/needs-remote.tsx) and use it in RemoteControls, QueuePanel, SeshControls.

## 11. CI/CD (robust, boring, trustworthy)

- `.github/workflows/ci.yml` — on PR + push to main: install (npm ci, cache),
  `tsc --noEmit`, `next build`, boot `partykit dev` in the job and run
  `scripts/load-test.mjs 127.0.0.1:1999 8` (smaller n for CI), plus a secret scan
  step (gitleaks action or a grep-based guard). Fail loud, < 5 min total.
- `.github/workflows/deploy.yml` — on push to main (after CI passes, `needs`):
  deploy partykit (`partykit deploy --var ALLOWED_ORIGINS=...` using `PARTYKIT_TOKEN`
  secret) then Vercel prod (`vercel deploy --prebuilt --prod` or `vercel deploy --prod`
  with `VERCEL_TOKEN`/`VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` secrets), then a smoke step:
  curl the lobby create + the deployed / for 200s. Skip deploy gracefully (warn, not
  fail) when secrets are absent so forks stay green.
- Secrets: set via `gh secret set` from locally-authed CLI credentials where they can
  be minted non-interactively; document the rest in README ("deploying your own couch").
- Branch hygiene: enable branch protection on main requiring the CI check (gh api),
  light CONTRIBUTING.md note. No release theater — main deploys.

## 12. The Ritual System (the consolidation) + chat games

Every social mechanic in CouchCircle is a **ritual** with one anatomy:
**trigger → participation window → synchronized payoff** (a Moment §8 + event line +
avatar animation). Ready check, spark countdown, toast, snack vote, and now GAMES are
all the same grammar — one server pattern (windowed state + timer + tally), one UI
grammar (a single anchored RitualCard + big action button + thin countdown bar), one
payoff pipeline. Nothing gets its own bespoke chrome ever again.

- Games live behind ONE "games 🎲" button in the sesh tray; an active game renders as
  a pinned **RitualCard at the top of chat** (chat is the table) + payoff Moments.
- `SeshState.game?: { kind: GameKind; startedById: string; endsAt?: number; … }`,
  `type GameKind = 'roulette' | 'most-likely' | 'movie-bingo'`. Generic messages:
  `sesh:game:start {kind}`, `sesh:game:action {action: string; value?: string}`,
  `sesh:game:stop`. One server reducer per kind, all windowed like snackVote.
  - **sip roulette** 🎲: spin → server picks a random CONNECTED crew member →
    suspense moment (roulette sweep across the couch avatars) → "fate says {name}
    takes a sip 🎲". Repeatable, rate-limited.
  - **most likely to…** 🗳️: prompt from a static deck ("most likely to fall asleep
    before the credits"), 20s vote window (everyone picks a crew member via the
    RitualCard), tally → winner's avatar crowned + "the couch has spoken: {name} sips".
  - **movie bingo** 🍿: start deals the room 5 shared triggers from a deck ("someone
    says the movie title", "unnecessary explosion", "they kiss", "obvious product
    placement"…). ANYONE smashes "IT HAPPENED" on a trigger → confirmation needs one
    second crew member within 10s → payoff moment + "🍿 BINGO: {trigger} — everybody
    sips" + trigger gets checked off. All five → big finale moment.
- Decks: `lib/rituals/decks.ts`, static, canon voice, ~16 prompts/triggers per deck.
- Boundaries: sips are always optional flavor ("sips are self-serve — hydrate, legend"
  appears as the card's footnote); NO quantity pressure (never "finish your drink"),
  no targeting harassment (most-likely votes are anonymous, only the tally shows),
  water check stays one tap away inside every RitualCard. Social ritual, never
  consumption instruction.
- Implementation note for wave B: refactor ReadyCheck + snack vote + toast rendering
  INTO the RitualCard grammar (components/room/rituals/RitualCard.tsx + per-kind
  bodies) so the system ships consolidated, not as a sixth pattern. Server keeps
  per-kind state but the reducers share the window/tally/timer helpers.

## 13. THE VIEW SYSTEM (supersedes §1 naming + §2; wave C implements)

Step-back ruling: view modes use the grammar every streaming site already taught
people. No invented nouns, no lore. "The projector" concept is DEAD as a concept;
the underlying role mechanism survives as a plain **popout player**.

Four view states + per-panel visibility, all orthogonal:
1. **default** — everything visible.
2. **theater mode** (`t`, YouTube-style): side column collapses, seating compresses to
   a slim strip, sesh tray stays (slim), TV gets big. Still normal page chrome
   (top bar stays). This is NOT fullscreen.
3. **fullscreen** (`f`, double-click TV): real browser fullscreen on the stage;
   auto-hiding overlay controls (3s idle); the peanut gallery (§9) lives here —
   silhouettes + speech bubbles along the bottom. Esc exits to whatever mode you
   were in.
4. **popout player**: TopBar button "pop out the video ⧉" opens the bare-video
   window (the existing /screen route + role:'projector' machinery — rename ALL
   user-facing copy: window title/status say "couchcircle — video", main window
   placeholder says "video popped out ⧉ (click to bring it back)"). No
   personality, it's a utility.
- **Panel visibility**: every panel individually collapsible with persisted
  preference (localStorage `couchcircle:panels`): queue, chat/activity, seating,
  sesh tray. Chevron affordance in each panel's header + a single compact "view"
  popover in the TopBar (checkboxes for each panel + theater/fullscreen entries with
  their shortcuts). Collapsed side panels become a slim rail of icons (click =
  re-open). Seating collapse = slim presence strip (dots+names), never fully gone.
- useTheater() generalizes to useView(): { mode: 'default'|'theater'|'fullscreen';
  setMode; chromeVisible; panels: Record<'queue'|'chat'|'seating'|'sesh', boolean>;
  togglePanel }. Keyboard: t theater, f fullscreen, esc back.
- Concept hygiene sweep with this change: hunt remaining cutesy-but-confusing copy.
  KEEP (earned): the couch, crew, creature, glow, vibe, the remote, up next, sesh
  mode, rituals. KILL (cruft): "the projector", any "channel surf" phrasing that
  obscures what explore does (panel title becomes "explore — free stuff to watch",
  button "browse free movies & tv 📺").

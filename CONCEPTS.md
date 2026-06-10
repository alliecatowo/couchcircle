# CouchCircle — Concepts (the product bible, v1)

This file is the **single source of truth for what CouchCircle *is***. Every screen,
string, and parameter traces back to here. When code and this file disagree, this file
wins. ARCHITECTURE.md governs *how*; this governs *what and why*.

## 1. The five core concepts

Everything in the product maps to exactly one of these. If a feature doesn't, it
doesn't ship.

1. **The Room is a living room.** Not a dashboard, not a channel — a physical place.
   Surfaces are walls, panels are furniture, light comes from lamps and the TV.
   Chrome that can't be diegetic should at least be warm.
2. **One TV, one remote.** The TV is the single shared screen (whatever the source —
   YouTube, a direct link, someone's screen). The remote is the single control token.
   Holding it means driving; passing it is a social act. Nobody fights the TV — you
   ask for the remote.
3. **The crew on the couch.** People are creatures with vibes, seated in the room by
   arrival. Presence is spatial and alive (idle motion, status bubbles, speech
   bubbles) — never a user list.
4. **The ritual layer (Sesh Mode).** Optional, explicit, social: the rotation, the
   spark countdown, snack runs, vibe checks. Rituals synchronize *people*, the way the
   sync engine synchronizes *media*. Social flavor only — never consumption advice.
5. **Nothing persists.** Rooms dissolve when everyone drifts off. No accounts, no
   history, no recordings. The ephemerality is a feature; say it proudly.

## 2. Vocabulary (canon — use these words, never synonyms)

| Concept | Canonical term | Notes / usage |
|---|---|---|
| A room | **the couch** / a couch | default room name "the couch"; "rooms" only in technical docs |
| Join code | **couch code** | format `WORD-NNN`, e.g. `MOSS-420` |
| Invite link | **invite** | "copy invite" |
| Participants | **the crew** | counter: "4 on the couch" |
| Avatar | **creature** | picker: "your couch creature" |
| Accent color | **glow** | picker: "your glow" |
| Status | **vibe** | "click your avatar to change your vibe" |
| Control token | **the remote** | request / pass / snag ("take it back" = host snag) |
| Controller | **whoever has the remote** | chip: "🎮 you've got the remote" / "📺 {name} has it" |
| Queue | **up next** | panel header; items are "queued" |
| Playback sync state | **synced / drifting / resyncing** | the pill in the remote bar |
| Sesh layer | **sesh mode** | toggle; "the rotation", "spark", "snack run", "vibe check" |
| Ready check | **everyone ready?** | "locked in" = ready |
| Leaving/ephemeral | **dissolve into the haze** | empty/expired room copy |

## 3. Voice & copy rules

- lowercase by default; `CouchCircle` is the only proper noun. Sentence case never.
- Short, sly, warm. One joke per surface, max. Never explain the same thing twice.
- No exclamation marks except genuine celebration ("🟢 everyone's ready").
- Emoji are seasoning (≤1 per string), never decoration rows in copy.
- Errors are kind and specific: say what happened + the one next step. Never blame.
- Empty states invite action, never apologize ("the queue is empty… someone do
  something 👀").
- Buttons are verbs in the room's language: "roll up a couch", "flop on in",
  "slide onto the couch", "pass the remote", "spark in 5".
- Never: "users", "settings saved!", "oops!", "something went wrong" (alone),
  corporate we ("we're working on it").

## 4. The seating system (answers "what happens when a lot of people join")

The room is a **fixed seat map of 12**, arranged like a real living room facing the
TV. Seats are filled in order; every seat is intentional — nobody is "overflow".

```
                [ T V ]
  loveseat(2)   couch(3)    armchair(1)     ← furniture row, slight inward angles
   bean bag  cushion  pouf  cushion  bean bag  rug spot   ← floor arc, in front
        (lamp + side table on the right; rug under the floor arc)
```

- **Seat order (join order):** couch L→R (1–3), loveseat (4–5), armchair (6), floor
  arc L→R (7–12: bean bag, cushion, pouf, cushion, bean bag, rug spot).
- **Seat stickiness:** your seat is yours for the life of your participant (reconnects
  keep it). No musical chairs mid-movie: when someone leaves for good, the seat opens
  and the *next new joiner* takes the lowest open seat. Existing crew never move.
- **Capacity:** 13th joiner gets "the couch is full (12 max) — start another couch".
  MAX_PARTICIPANTS stays 12 because the seat map is the cap, not an arbitrary number.
- **Density behavior:** the scene is composed for 12; with 2 it should feel cozy (the
  furniture is still there, empty seats read as *invitations*, maybe one cushion has a
  sleeping cat). Never stretch furniture to fill space.
- **Responsive:** below lg the scene compresses (smaller sprites, tighter arc);
  below md it becomes two clean rows (furniture row, floor row) — still seats, never
  a list.
- Flourishes ride on seats: rotation turn = ember ring at the seat, ready = ✅ chip,
  controller = 📺 chip, disconnected = translucent + 💤, speech bubbles above heads.

## 5. Parameters (the numbers are part of the design)

| Parameter | Value | Why |
|---|---|---|
| MAX_PARTICIPANTS | 12 | the seat map (§4) |
| MESH_COMFORT_LIMIT | 5 | P2P mesh quality cliff; warn above |
| PLAY_LEAD_MS | 450 | scheduled-start lead so everyone starts together |
| HEARTBEAT_MS | 2500 | controller truth cadence |
| DRIFT_SOFT_MS / HARD_MS | 150 / 750 | imperceptible / annoying thresholds |
| RATE_NUDGE | 0.05 | gentle catch-up; inaudible pitch change |
| SPARK_DEFAULT_SECONDS | 5 | long enough to inhale, short enough to stay funny |
| SNACK_VOTE_WINDOW_MS | 30s | a vote, not a meeting |
| DISCONNECT_GRACE_MS | 60s | refresh ≠ leaving |
| MAX_CHAT / MAX_EVENTS | 100 / 80 | a vibe, not a archive |
| Room TTL (lobby mapping) | 24h | rooms dissolve |

Tuning rule: parameters change *here first*, then in `shared/constants.ts`, never the
reverse.

## 6. Surface map (what each region is, in room terms)

- **Top bar** — the doorframe: couch name, couch code, lock, sesh switch, connection,
  settings. Nothing else, ever.
- **The TV** — contained 16:9 bezel on a lit wall. Only media + media overlays
  (spark countdown, sync curtains, unmute pill) may cover it.
- **The floor** — the seating scene (§4). People things only.
- **The sesh tray** — slides out under the floor when sesh mode is on.
- **The side table (right column)** — up next (top) + chat/activity (bottom).
- **The remote (bottom bar)** — transport, remote ownership, volume, sync pill,
  emergency pause. It *is* the remote: one bar, three clusters, no drawer menus.

## 7. Hard boundaries (unchanged, restated)

No accounts. No history. No recording. No DRM circumvention or scraping. No public
room discovery. No consumption/dosing content — sesh is ritual, not instruction.
Authorized/user-provided media only.

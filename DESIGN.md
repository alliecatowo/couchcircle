# CouchCircle — Design System (v2)

> **late-night living room.** One lamp on, the TV flickering, smoke drifting,
> friends melted into a couch. Deep warm browns and inks, amber glow, a little
> moss green, a faint purple haze. Analog, soft, a bit funny. Never a sterile
> SaaS dashboard. Never a blue/purple startup gradient.

This is the binding **style** contract for every UI agent — tokens, motion,
surfaces, and how the room is composed. If you're building anything that
renders, read it top to bottom.

- **What the product *is*** (vocabulary, the seat map, the surface map,
  parameters) lives in **CONCEPTS.md** — that file wins over this one.
- **Copy voice** lives in **CONCEPTS.md §3** — this doc does **not** restate the
  rules; see §8 below for the one-line pointer.
- Tokens live in `app/globals.css` (Tailwind v4 `@theme`); UI primitives live in
  `components/ui/*`. **There is no `tailwind.config` file** — never make one.

---

## 1. Palette

All colors are tokens. **Never hardcode hex in a component** — use the Tailwind
utility (`bg-couch-800`, `text-ember-400`) or the CSS var
(`var(--color-moss-500)`). Participant `accent` strings from the protocol are
the one exception (they're user-chosen runtime values; apply via inline style).

### Surfaces — `couch` (deep warm brown/ink)

| Token | Hex | Usage |
|---|---|---|
| `couch-950` | `#100b09` | the dark behind everything, overlays, deepest wells, the TV screen well |
| `couch-900` | `#181210` | **app background** (set on `<body>`) |
| `couch-850` | `#1f1815` | base panels, inputs, dialog/popover surfaces |
| `couch-800` | `#261d19` | **raised panel / Card** surface |
| `couch-750` | `#2f2420` | hover surface, active menu item |
| `couch-700` | `#3a2d27` | **borders, dividers** (the default edge) |
| `couch-650` | `#4a3a32` | strong border / muted edge (the TV bezel ring) |
| `couch-600` | `#5d4a40` | disabled foreground, faint muted text |

### Accent — `ember` (lamp-amber glow, the warm light)

| Token | Hex | Usage |
|---|---|---|
| `ember-950`–`ember-700` | `#2a1505`…`#95501a` | deep amber wells, pressed states |
| `ember-600` | `#c06d25` | accent hover-dark |
| `ember-500` | `#e08b34` | **primary accent** (buttons, focus ring, active) |
| `ember-400` | `#f2a850` | bright accent, glow core, icon highlights |
| `ember-300` | `#f8c178` | accent text on dark chips, the spark count |
| `ember-200` | `#fbd9a8` | softest amber tint |

### Moss — sage green (calm, "go", ready, plants)

| Token | Hex | Usage |
|---|---|---|
| `moss-900`–`moss-600` | `#16241a`…`#3d6347` | moss wells/borders |
| `moss-500` | `#56855f` | **primary moss** (ready states, success) |
| `moss-400` | `#79a97f` | bright moss, ready glow, "synced" |
| `moss-300` | `#a3cba6` | moss text on dark |

### Haze — faint purple (smoke, dusk, ambient tint)

| Token | Hex | Usage |
|---|---|---|
| `haze-900`–`haze-600` | `#1c1622`…`#4d3a5e` | haze wells, subtle tints, "buffering" pill |
| `haze-500` | `#6a5280` | **haze accent** (rare; sesh flavor, smoke) |
| `haze-400` | `#8d72a4` | bright haze, smoke puffs |
| `haze-300` | `#b39fc6` | haze text |

> Haze is a **seasoning**, not a main color. A whisper of purple in a shadow or
> a smoke particle — never a haze-filled panel.

### Text — `cream` (warm neutral; never pure white `#fff`)

| Token | Hex | Usage |
|---|---|---|
| `cream-50` | `#f7eee2` | **primary text** on dark |
| `cream-100` | `#ece0d0` | body text on cards |
| `cream-200` | `#d9c8b4` | labels, secondary emphasis |
| `cream-300` | `#bfac95` | **secondary text** |
| `cream-400` | `#9c886f` | **muted text**, captions, placeholders |

### Alert — warm coral-red (never a cold/pure red)

| Token | Hex | Usage |
|---|---|---|
| `coal-red` | `#e5564b` | LIVE badge, danger button, emergency pause, "tap to sync" |
| `coal-red-soft` | `#b8463d` | pressed/darker danger |

### Semantic aliases (already mapped in `@theme`)

`--color-background` → couch-900, `--color-foreground` → cream-50,
`--color-muted` → couch-800, `--color-muted-foreground` → cream-400,
`--color-border` → couch-700, `--color-ring`/`--color-accent` → ember-500,
`--color-accent-foreground` → couch-950. Use the named scales above in
components; these aliases exist for shadcn muscle memory (`bg-background`,
`text-muted-foreground`, `border-border` all work).

### Participant accents (`ACCENT_COLORS`)

The protocol gives each participant an `accent` hex from a warm 8-swatch set
(owned by the constants task, matched to this palette): ember orange `#ff9d3d`,
marigold `#ffc24b`, clay coral `#ff7a59`, rose `#f56a8c`, lilac haze `#bd93f5`,
fresh moss `#79c98a`, teal sage `#5fc7bb`, sand cream `#e7c79a`. Apply as an
inline `style={{ color: accent }}` / `style={{ '--accent': accent }}` — it's
runtime data, so it's the one place a non-token color is legitimate.

---

## 2. Typography

| Role | Family | Token / class | Notes |
|---|---|---|---|
| Display | **Fraunces** (serif) | `font-display` | headings, hero, big numbers (the spark countdown). Soft, warm, a little WONK. |
| Body | **Nunito** (sans) | `font-body` | everything else. Rounded, friendly. Body default on `<body>`. |

Both are loaded via `next/font/google` in `app/layout.tsx` and exposed as
`--font-fraunces` / `--font-nunito`, wired into `--font-display` / `--font-body`
in `@theme`. **Don't import fonts anywhere else.**

- `h1/h2/h3` default to `font-display` via base styles — you usually don't need
  to set it. For other display moments (counts, room name) add `font-display`.
- Headings get a slight negative tracking (`-0.01em`) by default.
- Scale: hero `text-4xl`/`text-5xl`, section title `text-xl`/`text-2xl`, card
  title `text-lg`, body `text-sm`/`text-base`, captions/meta `text-xs`.
- The spark count sizes off its **container** (`cqmin`), not the viewport, so it
  stays centered in the TV bezel and never clips on short windows.
- Keep line length comfy; lean on `cream-300`/`cream-400` for secondary text to
  build hierarchy instead of stacking font sizes.

---

## 3. Spacing, radius, shadow

**Radius — cozy means round.** Default to generous corners.

| Use | Class | Value |
|---|---|---|
| chips, small controls, inputs | `rounded-xl` | 1.25rem |
| **cards, panels, popovers, the TV bezel** | `rounded-2xl` | 1.5rem |
| dialogs, hero surfaces | `rounded-3xl` | 2rem |
| avatars, dots, pills, the sync pill | `rounded-full` | — |

> Tokens: `--radius-lg: 1rem`, `--radius-xl: 1.25rem`, `--radius-2xl: 1.5rem`,
> `--radius-3xl: 2rem`. Nothing in this app should have a sharp 90° corner
> except full-bleed media (`<video>`/iframe) — and that sits inside a rounded,
> clipped frame so the corners still read round.

**Spacing.** Standard Tailwind scale. Panels pad `p-4`/`p-5`, dialogs `p-6`,
gaps `gap-2`/`gap-3`. Give things room — cramped is the opposite of cozy.

**Shadow.** Soft, layered, warm. Use the tokens, not ad-hoc `shadow-lg`:

| Token | Class form | Usage |
|---|---|---|
| `--shadow-couch` | `shadow-[var(--shadow-couch)]` | resting cards/panels, the wall |
| `--shadow-lifted` | `shadow-[var(--shadow-lifted)]` | dialogs, popovers, menus, the TV set |
| `--shadow-ember` | `shadow-[var(--shadow-ember)]` | amber-lit emphasis |
| `--shadow-moss` | `shadow-[var(--shadow-moss)]` | green-lit emphasis |

For interactive glows prefer the **utility classes** `.glow-ember` /
`.glow-moss` (see §5) — they include a hairline ring + halo.

---

## 4. Motion

Cozy, springy, **never frantic**. UI transitions live in **200–400ms**. Easings:

| Token | Curve | Use |
|---|---|---|
| `--ease-cozy` | `cubic-bezier(0.22, 1, 0.36, 1)` | most transitions (settle in) |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | pops, toggles, "alive" bounces |

- Hover/focus transitions: `transition-* duration-200`.
- Use `framer-motion` for entrance/exit of dynamic things (reactions, list
  items, avatars reacting to events, the spark count). Keep spring stiffness
  gentle.
- **Always honor `prefers-reduced-motion`** — globals.css already disables the
  ambient loop animations (`float-bob`, `sway`, `flicker`, `puff`, `pulse-glow`,
  `blink`, `live-pulse`, the `tv-glow` flicker) under that query. If you add a
  custom looping animation, gate it too. (One-shot transitions like `pop-in`
  stay — they're not ambient noise.)
- **Ambient life is mandatory.** Avatars, the lamp glow, and the smoke should
  *always* be subtly moving so the room never feels frozen. Randomize
  per-instance `animation-delay`/`duration` via inline style so nothing moves in
  lockstep.

### Animation catalog

Each is available as a `--animate-*` theme token (→ `animate-<name>` utility,
e.g. `animate-float-bob`) **and** as an explicit utility class. They're
equivalent — pick whichever reads better.

| Name | What it does | Where to use |
|---|---|---|
| `float-bob` | gentle vertical bob (±6px, 4.5s) | idle avatars, the lamp, floating cards, the blocked-curtain 👆 |
| `sway` | slow rotate ±2.5° (6s) | plants, blanket person, hanging things |
| `flicker` | irregular brightness/opacity (3.2s) | TV glow, the lamp pool, the idle "tv's off" screen |
| `pulse-glow` | breathing amber box-shadow (2.4s) | now-playing item, active CTA |
| `puff` | smoke rises + fades + drifts (3.6s) | smoke particles incl. the spark countdown (set per-instance `left`/`animation-delay`) |
| `wiggle` | quick ±7° shake (0.5s, one-shot) | error nudge, "hey!" reactions |
| `pop-in` | scale+fade entrance (0.32s, one-shot) | newly added queue items, toasts, badges, the sync/blocked pills |
| `blink` | brief eye-close (4s loop) | avatar eyes |
| `live-pulse` | expanding red ring | LIVE badge (`Badge variant="live"` does this for you) |

Radix enter/exit helpers (no extra dependency): `animate-overlay-in` /
`animate-overlay-out` for overlays, `animate-pop-content` /
`animate-pop-content-out` for popovers/menus/tooltips, `animate-dialog-in` /
`animate-dialog-out` for centered dialogs. The `components/ui/*` wrappers apply
these via Radix `data-[state=…]`, so you rarely touch them.

---

## 5. Utility classes (analog texture + glow)

Defined in `app/globals.css`. Documented here for everyone:

| Class | Effect | How to use |
|---|---|---|
| `.grain` | film-grain noise overlay on the element (sets `position: relative`, paints noise via `::before`, `mix-blend: overlay`, ~5% opacity at `z-0`) | add to any surface you want to feel analog — cards, the stage wall, the couch. Keep real content above it (`relative z-10`). |
| `.grain-fixed` | same noise but `position: fixed` (covers the viewport) | the single page-level grain layer (RoomShell mounts `<div className="grain-fixed pointer-events-none fixed inset-0 z-0" />`). |
| `.glow-ember` | warm amber halo + hairline ring | accent buttons, now-playing, the lamp, focused CTAs, the unmute pill |
| `.glow-moss` | calm green halo + hairline ring | ready states, moss-positive moments |
| `.tv-glow` | flickering amber/haze radial glow behind the element (`::after`, `z-index:-1`, `border-radius: inherit`) | the MediaStage bezel and the idle TV-off screen. Element needs a non-static position + `border-radius`. |

> **Grain gotcha:** `.grain::before` is at `z-0`, so wrap real content to stack
> above it (`relative z-10`). Button/Card don't apply grain themselves — opt in
> where you want the texture.

---

## 6. The room, composed (where the surfaces live)

CONCEPTS §6 defines the **surface map** in room terms; this is how it renders.
The room is one full-height, **never-page-scrolling** shell (`h-[100dvh]`,
`overflow-hidden`) — inner panels scroll on their own.

```
┌──────────────────────────────────────────────────────────┐
│ TopBar — the doorframe (name · code · lock · sesh · conn) │
├───────────────────────────────┬──────────────────────────┤
│  STAGE COLUMN (flex-1)         │  side table (380px, lg+) │
│   ┌─────────────────────────┐  │   ┌────────────────────┐ │
│   │ the WALL + the TV        │  │   │ up next (~45%)     │ │
│   │  min-h-[40%] flex-1      │  │   ├────────────────────┤ │
│   └─────────────────────────┘  │   │ chat / activity    │ │
│   the couch row   (flex-none)  │   │ (flex-1)           │ │
│   the sesh tray   (flex-none)  │   └────────────────────┘ │
├───────────────────────────────┴──────────────────────────┤
│ RemoteControls — the remote (transport · ownership · sync)│
└──────────────────────────────────────────────────────────┘
```

**The stage column compresses from the bottom up.** The TV section is `flex-1`
floored at `min-h-[40%]` so at short window heights (~700px and below) it can't
be crushed to a strip; the couch row and sesh tray are `flex-none` and give up
height first (the couch row runs its own internal responsive compression).
RotationPanel docks absolute into the stage column's bottom-left so it never
covers the picture. The side table drops beneath the stage below `lg`.

### The TV (CONCEPTS §6 "the TV")

A contained 16:9 set on a **lit wall**, not a full-bleed void:

- **The wall** — `bg-gradient-to-b from-couch-900 to-couch-950` + `.grain`,
  with a flickering ember **lamp pool** (upper-left), a whisper of **haze**
  (lower-right), a faint top vignette, and a baseboard line. These read as a
  light source even with a bright picture playing — keep them at `z-0` behind
  the set.
- **The bezel** — `aspect-video` block, `rounded-2xl`, `bg-couch-950` with a
  `p-1.5` frame, a `ring-1 ring-couch-650` hairline edge, `--shadow-lifted`, and
  `.tv-glow` pooling behind it. Consistent across **every** adapter (YouTube,
  direct URL, screen share, idle).
- **The picture** — fills the bezel inside the `p-1.5` frame, `overflow-hidden`,
  `rounded-xl`. A transparent **click-shield** sits above the player so viewers
  can't drive the embed and desync — everyone uses the remote. Only media
  overlays (spark countdown, sync curtains/banner, unmute pill, error panel,
  sync pill top-right) cover the picture.
- **Idle ("tv's off")** — a cozy dark warm screen *inside* the bezel: flickering
  standby sheen, "the tv's off / queue something to start the night", and (for
  whoever can drive) sample quick-adds. Never a blank rectangle.

### Sync pill labels (CONCEPTS §2 canon)

SyncIndicator reads `useSyncStatus().health` → one pill, canon labels:
**synced** 🟢 (moss) · **drifting** 🟡 (ember) · **resyncing** 🔄 (ember,
spinner) · **buffering** 🌀 (haze, spinner) · **live** 🔴 (`Badge variant="live"`)
· **tap to sync** ⚠️ (coal-red) when autoplay is blocked. The tooltip exposes
the measured drift in ms.

### The couch row (CONCEPTS §4 scene direction)

The seating is a **fixed seat map of 12** arranged like a real living room
facing the TV — never a user list. Furniture row (couch ×3, loveseat ×2,
armchair ×1) over a floor arc (bean bag, cushion, pouf, cushion, bean bag, rug
spot), with a lamp + side table on the right and a rug underneath. Seats fill in
join order and are sticky for a participant's life; empty seats read as
*invitations* (compose for 12, stay cozy at 2 — never stretch furniture to fill
space). Below `lg` the scene compresses (smaller sprites, tighter arc); below
`md` it becomes two clean rows — still seats. Flourishes ride on seats: rotation
turn = ember ring, ready = ✅ chip, controller = 📺 chip, disconnected =
translucent + 💤, speech bubbles above heads.

---

## 7. UI primitives (`components/ui/*`)

shadcn-style API shapes so muscle memory works. **Every component forwards
`className` through `cn()`** — pass Tailwind classes to tweak per-use. Import
from `@/components/ui/<name>`.

### Button — `button.tsx`

```tsx
import { Button } from '@/components/ui/button';

<Button variant="accent" size="lg">roll up a couch</Button>
<Button variant="ghost" size="icon"><Settings /></Button>
<Button variant="danger" onClick={emergencyPause}>🚨 pause</Button>
<Button asChild><Link href="/about">about</Link></Button> // Slot
```

- `variant`: `default` (couch chip) · `accent` (**ember glow CTA**) · `ghost`
  (text only) · `outline` (bordered) · `danger` (coral-red).
- `size`: `sm` · `md` (default) · `lg` · `icon` (square).
- `asChild` renders the child via Radix `Slot` (wrap `next/link`, etc.).
- Has focus ring, `active:scale-[0.97]` press, auto-sizes lucide `svg` to 1rem.
- The **accent** variant is your primary "do the thing" button. Don't stack two
  accent buttons next to each other — one hero action per cluster.

### Card — `card.tsx`

`Card`, `CardHeader`, `CardTitle`, `CardContent`, `CardFooter` (+ exported
`CardDescription`). Raised couch surface, `rounded-2xl`, soft shadow, subtle
backdrop blur.

```tsx
<Card>
  <CardHeader>
    <CardTitle>up next</CardTitle>
    <CardDescription>someone do something</CardDescription>
  </CardHeader>
  <CardContent>…</CardContent>
  <CardFooter><Button variant="accent">add to queue</Button></CardFooter>
</Card>
```

### Dialog — `dialog.tsx` (Radix)

`Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`,
`DialogDescription`, `DialogFooter`, `DialogClose` (+ `DialogPortal`,
`DialogOverlay`). `DialogContent` includes a built-in top-right close button;
pass `hideClose` to remove it. Centered, `rounded-3xl`, blurred overlay.

> For a controlled dialog driven by parent state (e.g. RoomSettings
> `{ open, onClose }`), use `open` + `onOpenChange={(o) => !o && onClose()}`.

### Input / Label — `input.tsx`, `label.tsx`

Native `<input>` / `<label>` wrappers. Sunken couch field, warm amber focus
ring. Pair with `htmlFor`.

### Badge — `badge.tsx`

`variant`: `default` · `accent` (ember tint) · `outline` · `live` (coral-red
with a pulsing ring — for LIVE / screen-share). Auto-sizes inner `svg` to 0.75rem.

### Tabs — `tabs.tsx` (Radix)

`Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`. Active trigger gets an ember
tint + inset ring. Used by SidePanel (chat / activity) and AddToQueueDialog.

### Tooltip — `tooltip.tsx` (Radix)

`TooltipProvider` (**already mounted once in `app/layout.tsx`** — don't add
another), `Tooltip`, `TooltipTrigger`, `TooltipContent`. Use for disabled-state
explanations ("ask for the remote"). A disabled button doesn't fire pointer
events — wrap it in a focusable `span` if you need a tooltip on it.

### Switch / Slider — `switch.tsx`, `slider.tsx` (Radix)

Switch: on = ember, off = couch surface, spring thumb (boolean settings).
Slider: ember fill on a couch track, glowing round thumb, one thumb per value
(the scrubber + the local volume slider).

### Dropdown / Popover / Separator (Radix)

`dropdown-menu.tsx` (full set — "pass the remote", rate menu), `popover.tsx`
(StatusPicker grid, pending-request lists), `separator.tsx` (thin warm divider,
`orientation="horizontal" | "vertical"`).

---

## 8. Copy voice — see CONCEPTS §3

**Copy rules are owned by CONCEPTS.md §2 (vocabulary) and §3 (voice).** This doc
does not restate them — read them there and use the canon words: *couch code,
crew, creature, glow, vibe, the remote, up next, sesh mode, dissolve into the
haze.* In one line: lowercase, sly, warm, ≤1 emoji per string, kind specific
errors, never corporate. When copy and CONCEPTS disagree, CONCEPTS wins.

---

## 9. Do / Don't

**Do**
- Use tokens for every color (`bg-couch-800`, `text-ember-400`).
- Round generously (`rounded-2xl`+), pad comfortably, layer soft shadows.
- Keep ambient things gently alive; randomize per-instance timing.
- Forward `className` and compose with `cn()`.
- Respect `prefers-reduced-motion`.
- Use the `components/ui/*` wrappers — don't hand-roll a raw Radix primitive.
- Compose depth by stacking surfaces (900 → 850 → 800 → 750), not bright jumps.

**Don't**
- ❌ Hardcode hex in components (except participant `accent` runtime values).
- ❌ Use pure white `#fff` for text — use `cream-50`.
- ❌ Ship blue/indigo/violet startup gradients or a sterile white SaaS look.
- ❌ Create a `tailwind.config` file — tokens are CSS-first in `@theme`.
- ❌ Add a second `TooltipProvider` (one lives in the layout).
- ❌ Animate faster than ~200ms or slower than ~400ms for UI transitions.
- ❌ Cover everything in glows — emphasis loses meaning if it's everywhere.
- ❌ Import Google fonts anywhere but `app/layout.tsx`.
- ❌ Let the page scroll — the shell is `h-[100dvh] overflow-hidden`; panels
  scroll internally.

---

## 10. Quick reference

```
bg:      bg-couch-900            text:    text-cream-50 / -300 / -400
panel:   bg-couch-800           border:  border-couch-700  (edge: couch-650)
accent:  bg-ember-500 / text-ember-400   ready:  moss-400/500
live:    coal-red               radius:  rounded-2xl (panels/bezel) / rounded-3xl (dialogs)
shadow:  shadow-[var(--shadow-couch)]    glow:   .glow-ember / .glow-moss
fonts:   font-display (Fraunces) / font-body (Nunito)
motion:  duration-200..400, ease-[var(--ease-cozy)] / ease-[var(--ease-spring)]
texture: .grain (+ relative z-10 content) / .tv-glow
anims:   animate-float-bob / -sway / -flicker / -pulse-glow / -puff / -wiggle / -pop-in / -blink
shell:   h-[100dvh] overflow-hidden · TV min-h-[40%] flex-1 · couch+sesh flex-none
voice:   CONCEPTS §2 (vocab) + §3 (voice) — lowercase, sly, ≤1 emoji, never corporate
```

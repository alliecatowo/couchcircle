# CouchCircle — Design System

> **late-night living room.** One lamp on, the TV flickering, smoke drifting,
> friends melted into a couch. Deep warm browns and inks, amber glow, a little
> moss green, a faint purple haze. Analog, soft, a bit funny. Never a sterile
> SaaS dashboard. Never a blue/purple startup gradient.

This is the binding style contract for every UI agent. If you're building
anything that renders, read this top to bottom. The tokens live in
`app/globals.css` (Tailwind v4 `@theme`) and the components live in
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
| `couch-950` | `#100b09` | the dark behind everything, overlays, deepest wells |
| `couch-900` | `#181210` | **app background** (set on `<body>`) |
| `couch-850` | `#1f1815` | base panels, inputs, dialog/popover surfaces |
| `couch-800` | `#261d19` | **raised panel / Card** surface |
| `couch-750` | `#2f2420` | hover surface, active menu item |
| `couch-700` | `#3a2d27` | **borders, dividers** (the default edge) |
| `couch-650` | `#4a3a32` | strong border / muted edge |
| `couch-600` | `#5d4a40` | disabled foreground, faint muted text |

### Accent — `ember` (lamp-amber glow, the warm light)

| Token | Hex | Usage |
|---|---|---|
| `ember-950`–`ember-700` | `#2a1505`…`#95501a` | deep amber wells, pressed states |
| `ember-600` | `#c06d25` | accent hover-dark |
| `ember-500` | `#e08b34` | **primary accent** (buttons, focus ring, active) |
| `ember-400` | `#f2a850` | bright accent, glow core, icon highlights |
| `ember-300` | `#f8c178` | accent text on dark chips |
| `ember-200` | `#fbd9a8` | softest amber tint |

### Moss — sage green (calm, "go", ready, plants)

| Token | Hex | Usage |
|---|---|---|
| `moss-900`–`moss-600` | `#16241a`…`#3d6347` | moss wells/borders |
| `moss-500` | `#56855f` | **primary moss** (ready states, success) |
| `moss-400` | `#79a97f` | bright moss, ready glow |
| `moss-300` | `#a3cba6` | moss text on dark |

### Haze — faint purple (smoke, dusk, ambient tint)

| Token | Hex | Usage |
|---|---|---|
| `haze-900`–`haze-600` | `#1c1622`…`#4d3a5e` | haze wells, subtle tints |
| `haze-500` | `#6a5280` | **haze accent** (rare; sesh flavor, smoke) |
| `haze-400` | `#8d72a4` | bright haze |
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
| `coal-red` | `#e5564b` | LIVE badge, danger button, emergency pause |
| `coal-red-soft` | `#b8463d` | pressed/darker danger |

### Semantic aliases (already mapped in `@theme`)

`--color-background` → couch-900, `--color-foreground` → cream-50,
`--color-muted` → couch-800, `--color-muted-foreground` → cream-400,
`--color-border` → couch-700, `--color-ring`/`--color-accent` → ember-500.
Use the named scales above in components; these aliases exist for shadcn muscle
memory (`bg-background`, `text-muted-foreground`, `border-border` all work).

### Participant accents (`ACCENT_COLORS`)

The protocol gives each participant an `accent` hex from a warm 8-swatch set
(owned by the constants task, matched to this palette). Apply it as an inline
`style={{ color: accent }}` / `style={{ '--accent': accent }}` — it's runtime
data, so it's the one place a non-token color is legitimate.

---

## 2. Typography

| Role | Family | Token / class | Notes |
|---|---|---|---|
| Display | **Fraunces** (serif) | `font-display` | headings, hero, big numbers (spark countdown). Soft, warm, a little WONK. |
| Body | **Nunito** (sans) | `font-body` | everything else. Rounded, friendly. Body default on `<body>`. |

Both are loaded via `next/font/google` in `app/layout.tsx` and exposed as
`--font-fraunces` / `--font-nunito`, wired into `--font-display` / `--font-body`
in `@theme`. **Don't import fonts anywhere else.**

- `h1/h2/h3` default to `font-display` via base styles — you usually don't need
  to set it. For other display moments (counts, room name) add `font-display`.
- Headings get a slight negative tracking (`-0.01em`) by default.
- Scale: hero `text-4xl`/`text-5xl`, section title `text-xl`/`text-2xl`, card
  title `text-lg`, body `text-sm`/`text-base`, captions/meta `text-xs`.
- Keep line length comfy; lean on `cream-300`/`cream-400` for secondary text to
  build hierarchy instead of stacking font sizes.

---

## 3. Spacing, radius, shadow

**Radius — cozy means round.** Default to generous corners.

| Use | Class | Value |
|---|---|---|
| chips, small controls, inputs | `rounded-xl` | 1.25rem-ish (see token) |
| **cards, panels, popovers** | `rounded-2xl` | 1.5rem |
| dialogs, hero surfaces | `rounded-3xl` | 2rem |
| avatars, dots, pills | `rounded-full` | — |

> Tokens: `--radius-lg: 1rem`, `--radius-xl: 1.25rem`, `--radius-2xl: 1.5rem`,
> `--radius-3xl: 2rem`. Nothing in this app should have a sharp 90° corner
> except full-bleed media (`<video>`/iframe inside a rounded, clipped frame).

**Spacing.** Standard Tailwind scale. Panels pad `p-4`/`p-5`, dialogs `p-6`,
gaps `gap-2`/`gap-3`. Give things room — cramped is the opposite of cozy.

**Shadow.** Soft, layered, warm. Use the tokens, not ad-hoc `shadow-lg`:

| Token | Class form | Usage |
|---|---|---|
| `--shadow-couch` | `shadow-[var(--shadow-couch)]` | resting cards/panels |
| `--shadow-lifted` | `shadow-[var(--shadow-lifted)]` | dialogs, popovers, menus |
| `--shadow-ember` | `shadow-[var(--shadow-ember)]` | amber-lit emphasis |
| `--shadow-moss` | `shadow-[var(--shadow-moss)]` | green-lit emphasis |

For interactive glows prefer the **utility classes** `.glow-ember` /
`.glow-moss` (see §5) — they include a hairline ring + halo.

---

## 4. Motion

Cozy, springy, **never frantic**. Durations live in **200–400ms**. Easings:

| Token | Curve | Use |
|---|---|---|
| `--ease-cozy` | `cubic-bezier(0.22, 1, 0.36, 1)` | most transitions (settle in) |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | pops, toggles, "alive" bounces |

- Hover/focus transitions: `transition-* duration-200`.
- Use `framer-motion` for entrance/exit of dynamic things (reactions, list
  items, avatars reacting to events). Keep spring stiffness gentle.
- **Always honor `prefers-reduced-motion`** — globals.css already disables the
  ambient loop animations under that query. If you add a custom looping
  animation, gate it too.
- Ambient life: avatars and the lamp/smoke should *always* be subtly moving
  (`float-bob`, `sway`, `flicker`) so the room never feels frozen. Randomize
  per-instance `animation-delay`/`duration` via inline style so they don't move
  in lockstep.

### Animation catalog

Each is available as a `--animate-*` theme token (→ `animate-<name>` utility,
e.g. `animate-float-bob`) **and** as an explicit utility class. Pick whichever
reads better; they're equivalent.

| Name | What it does | Where to use |
|---|---|---|
| `float-bob` | gentle vertical bob (±6px, 4.5s) | idle avatars, the lamp, floating cards |
| `sway` | slow rotate ±2.5° (6s) | plants, blanket person, hanging things |
| `flicker` | irregular brightness/opacity (3.2s) | TV glow, candle, "live" screen |
| `pulse-glow` | breathing amber box-shadow (2.4s) | now-playing item, active CTA |
| `puff` | smoke rises + fades + drifts (3.6s) | smoke particles (set per-instance `left`/`animation-delay`) |
| `wiggle` | quick ±7° shake (0.5s, one-shot) | error nudge, "hey!" reactions |
| `pop-in` | scale+fade entrance (0.32s, one-shot) | newly added queue items, toasts, badges |
| `blink` | brief eye-close (4s loop) | avatar eyes |
| `live-pulse` | expanding red ring | LIVE badge (`Badge variant="live"` does this for you) |

Radix enter/exit helpers (no extra dependency): `animate-overlay-in` /
`animate-overlay-out` for overlays, `animate-pop-content` /
`animate-pop-content-out` for popovers/menus/tooltips, `animate-dialog-in` /
`animate-dialog-out` for centered dialogs. The `components/ui/*` wrappers
already apply these via Radix `data-[state=…]`, so you rarely touch them.

---

## 5. Utility classes (analog texture + glow)

Defined in `app/globals.css`. Document for everyone:

| Class | Effect | How to use |
|---|---|---|
| `.grain` | film-grain noise overlay on the element (sets `position: relative`, paints noise via `::before`, `mix-blend: overlay`, ~5% opacity) | add to any surface you want to feel analog — cards, the stage, the couch. Make sure real content sits at `z-10`+ since the noise is `z-0`. |
| `.grain-fixed` | same noise but `position: fixed` (covers the viewport) | a single page-level grain layer (e.g. a `<div className="grain-fixed pointer-events-none fixed inset-0" />`). |
| `.glow-ember` | warm amber halo + hairline ring | accent buttons, now-playing, the lamp, focused CTAs |
| `.glow-moss` | calm green halo + hairline ring | ready states, moss-positive moments |
| `.tv-glow` | flickering amber/haze radial glow behind the element (`::after`, `z-index:-1`) | the MediaStage frame and the TV-off screen. Element should have a non-static position + `border-radius` (the glow inherits it). |

> **Grain gotcha:** because `.grain::before` is absolutely positioned at `z-0`,
> wrap your actual content so it stacks above it (e.g. give the inner content
> `relative z-10`). The Button/Card components don't apply grain themselves —
> opt in where you want the texture.

---

## 6. Components (`components/ui/*`)

shadcn-style API shapes so muscle memory works. **Every component forwards
`className` through `cn()`** — pass Tailwind classes to tweak per-use. Import
from `@/components/ui/<name>`.

### Button — `button.tsx`

```tsx
import { Button } from '@/components/ui/button';

<Button variant="accent" size="lg">roll up a room</Button>
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
    <CardTitle>the queue</CardTitle>
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

```tsx
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>room settings</DialogTitle>
      <DialogDescription>tweak the vibe</DialogDescription>
    </DialogHeader>
    …
    <DialogFooter><Button variant="accent">save</Button></DialogFooter>
  </DialogContent>
</Dialog>
```

> For a controlled dialog driven by parent state (e.g. RoomSettings
> `{ open, onClose }`), use `open` + `onOpenChange={(o) => !o && onClose()}`.

### Input / Label — `input.tsx`, `label.tsx`

Native `<input>` / `<label>` wrappers. Sunken couch field, warm amber focus
ring. Pair with `htmlFor`.

```tsx
<Label htmlFor="name">what do we call you</Label>
<Input id="name" placeholder="Blanket Wizard" maxLength={24} />
```

### Badge — `badge.tsx`

`variant`: `default` · `accent` (ember tint) · `outline` · `live` (coral-red
with a pulsing ring — for LIVE / screen-share). Auto-sizes inner `svg` to 0.75rem.

```tsx
<Badge variant="live">🔴 LIVE</Badge>
<Badge variant="accent">📺 you have the remote</Badge>
```

### Tabs — `tabs.tsx` (Radix)

`Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`. Active trigger gets an ember
tint + inset ring. Used by SidePanel (Chat/Activity) and AddToQueueDialog.

```tsx
<Tabs defaultValue="chat">
  <TabsList>
    <TabsTrigger value="chat">chat</TabsTrigger>
    <TabsTrigger value="activity">activity</TabsTrigger>
  </TabsList>
  <TabsContent value="chat">…</TabsContent>
  <TabsContent value="activity">…</TabsContent>
</Tabs>
```

### Tooltip — `tooltip.tsx` (Radix)

`TooltipProvider` (**already mounted once in `app/layout.tsx`** — don't add
another), `Tooltip`, `TooltipTrigger`, `TooltipContent`. Use for disabled-state
explanations ("ask for the remote").

```tsx
<Tooltip>
  <TooltipTrigger asChild><span tabIndex={0}><Button disabled>pass</Button></span></TooltipTrigger>
  <TooltipContent>you need the remote first</TooltipContent>
</Tooltip>
```

> A disabled button doesn't fire pointer events — wrap it in a focusable span if
> you need a tooltip on a disabled control.

### Switch — `switch.tsx` (Radix)

On = ember, off = couch surface, spring thumb. For boolean settings
(guests-can-add-to-queue, Sesh Mode where a switch fits).

```tsx
<Switch checked={value} onCheckedChange={setValue} />
```

### Slider — `slider.tsx` (Radix)

Ember fill on a couch track, glowing round thumb. Renders one thumb per value
(supports range). For the scrubber and the local volume slider.

```tsx
<Slider value={[posSec]} max={durationSec} step={1} onValueChange={([v]) => seek(v)} />
<Slider value={[volume]} max={1} step={0.01} onValueChange={([v]) => setVolume(v)} />
```

### Dropdown menu — `dropdown-menu.tsx` (Radix)

Full set: `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`,
`DropdownMenuItem`, `DropdownMenuCheckboxItem`, `DropdownMenuRadioGroup`,
`DropdownMenuRadioItem`, `DropdownMenuLabel`, `DropdownMenuSeparator`,
`DropdownMenuShortcut`, `DropdownMenuSub`/`SubTrigger`/`SubContent`,
`DropdownMenuGroup`, `DropdownMenuPortal`. For "pass the remote", rate menu, etc.

### Popover — `popover.tsx` (Radix)

`Popover`, `PopoverTrigger`, `PopoverContent` (+ `PopoverAnchor`,
`PopoverClose`). For the StatusPicker grid, pending-request lists, etc.

### Separator — `separator.tsx` (Radix)

Thin warm divider; `orientation="horizontal" | "vertical"`.

---

## 7. Layout & composition patterns

- Page background is `couch-900` (set on body). Build depth by **stacking
  surfaces**: 900 (bg) → 850 (base panel) → 800 (card) → 750 (hover). Don't
  jump straight from 900 to a bright surface.
- Borders are almost always `border-couch-700`. Hover edges go `couch-650`.
- The room is desktop-first (see §12 of ARCHITECTURE). Use a single accent
  moment per region — the eye should know where to look.
- Add `.grain` to large surfaces (the stage, the couch, hero cards) for analog
  texture; keep content above it (`relative z-10`).
- Glows are emphasis, not decoration-everywhere. Reserve `.glow-ember` for the
  truly active thing (now-playing, the primary CTA, the lamp).

---

## 8. Copywriting voice

Cozy, funny, lowercase-friendly, a little gremlin energy. **Never corporate.**

- Lowercase is welcome for casual UI copy ("roll up a room", "slide onto the
  couch", "someone do something"). Sentence case is fine for longer help text.
- Warm metaphors: couch, lamp, haze, drift, flop, melt, the room.
- Be honest and a little self-aware about limits ("Netflix won't work and we're
  not pretending it will").
- Emoji as seasoning, not decoration-spam. The protocol gives you specific ones
  (🛋️ 🔥 💨 🍿 💚 📺 🟢). Match the event's energy.
- Errors are gentle, never blamey: "this room dissolved into the haze" beats
  "404 Not Found". "reconnecting to the couch…" beats "WebSocket error".
- **Sesh Mode is social ritual flavor only** — never consumption/procurement
  advice. Countdown, rotation, snack votes are bits, not instructions.

Sample lines: "watch together, actually together" · "queue something to start
the night" · "the queue is empty… someone do something" · "you have the remote
🎮" · "tap to sync up" · "best for small rooms — quality depends on the host's
upload" · "copied 🛋️".

---

## 9. Do / Don't

**Do**
- Use tokens for every color (`bg-couch-800`, `text-ember-400`).
- Round generously (`rounded-2xl`+), pad comfortably, layer soft shadows.
- Keep ambient things gently alive; randomize per-instance timing.
- Forward `className` and compose with `cn()`.
- Respect `prefers-reduced-motion`.
- Use the `components/ui/*` wrappers — don't hand-roll a raw Radix primitive.

**Don't**
- ❌ Hardcode hex in components (except participant `accent` runtime values).
- ❌ Use pure white `#fff` for text — use `cream-50`.
- ❌ Ship blue/indigo/violet startup gradients or a sterile white SaaS look.
- ❌ Create a `tailwind.config` file — tokens are CSS-first in `@theme`.
- ❌ Add a second `TooltipProvider` (one lives in the layout).
- ❌ Animate faster than ~200ms or slower than ~400ms for UI transitions.
- ❌ Cover everything in glows — emphasis loses meaning if it's everywhere.
- ❌ Import Google fonts anywhere but `app/layout.tsx`.

---

## 10. Quick reference

```
bg:      bg-couch-900            text:    text-cream-50 / -300 / -400
panel:   bg-couch-800           border:  border-couch-700
accent:  bg-ember-500 / text-ember-400   ready: moss-400/500
live:    coal-red               radius:  rounded-2xl (panels) / rounded-3xl (dialogs)
shadow:  shadow-[var(--shadow-couch)]    glow: .glow-ember / .glow-moss
fonts:   font-display (Fraunces) / font-body (Nunito)
motion:  duration-200..400, ease-[var(--ease-cozy)] / ease-[var(--ease-spring)]
texture: .grain (+ relative z-10 content) / .tv-glow
anims:   animate-float-bob / -sway / -flicker / -pulse-glow / -puff / -wiggle / -pop-in / -blink
```

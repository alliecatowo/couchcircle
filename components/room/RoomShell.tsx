'use client';

import { useState } from 'react';
import { RoomProvider } from '@/lib/realtime/room-context';
// Theater mode (SPRINT2 §2) — sibling-owned. Contract:
//   TheaterProvider wraps the shell; useTheater(): { theater, chromeVisible }.
// This file is being written alongside lib/theater; a missing-module error here
// is expected and not ours to fix.
import { TheaterProvider, useTheater } from '@/lib/theater';

import { TopBar } from '@/components/room/TopBar';
import { JoinGate } from '@/components/room/JoinGate';
import { ErrorBanner } from '@/components/room/ErrorBanner';

// Concurrent sibling components — imported per their §12 contracts. These files
// may be written by other agents right now; missing-module errors here are
// expected and not ours to fix.
import { MediaStage } from '@/components/room/MediaStage';
import { ParticipantCircle } from '@/components/room/ParticipantCircle';
import { SeshControls } from '@/components/room/SeshControls';
import { QueuePanel } from '@/components/room/QueuePanel';
import { SidePanel } from '@/components/room/SidePanel';
import { RemoteControls } from '@/components/room/RemoteControls';
import { ReadyCheck } from '@/components/room/ReadyCheck';
import { RotationPanel } from '@/components/room/RotationPanel';
import { RoomSettings } from '@/components/room/RoomSettings';
// Synchronized "moments" filter layer (§8) — zero-prop, mounted above EVERYTHING
// (incl. theater). Sibling-owned.
import { MomentLayer } from '@/components/room/MomentLayer';

// First-class mobile (§6) — portrait shell pieces we own.
import { SeatStrip } from '@/components/room/mobile/SeatStrip';
import { BottomSheet } from '@/components/room/mobile/BottomSheet';

import { cn } from '@/lib/utils';

/**
 * RoomShell — the room's skeleton. Wraps everything in <RoomProvider> +
 * <TheaterProvider> and renders THREE coordinated layouts:
 *
 *   ┌ desktop (md+, NOT theater) ───────────────────────────────────────┐
 *   │ TopBar / [stage column + 380px side table] / RemoteControls bar    │
 *   └────────────────────────────────────────────────────────────────────┘
 *   ┌ theater (any size) ───────────────────────────────────────────────┐
 *   │ chrome melts away; MediaStage full-bleed; RemoteControls floats as  │
 *   │ a bottom-center pill that fades with chromeVisible (§2).            │
 *   └────────────────────────────────────────────────────────────────────┘
 *   ┌ portrait mobile (<md, NOT theater) ───────────────────────────────┐
 *   │ TopBar / TV letterboxed top / SeatStrip / RemoteControls bar       │
 *   │ + a swipeable BottomSheet (up next / chat / activity) over it (§6) │
 *   └────────────────────────────────────────────────────────────────────┘
 *
 * The desktop branch is the original layout, untouched. The MomentLayer mounts
 * once, above all of them.
 */
export function RoomShell({ code }: { code: string }) {
  return (
    <RoomProvider code={code}>
      <TheaterProvider>
        <RoomShellInner />
      </TheaterProvider>
    </RoomProvider>
  );
}

/**
 * Inner shell — lives inside both providers so it can read useTheater() and
 * useRoom() (via children). Holds the settings-dialog open state (§12 lift).
 */
function RoomShellInner() {
  const { theater, chromeVisible } = useTheater();

  // Settings dialog open state lives here so TopBar's gear and the dialog stay
  // in sync (the §12 "tiny local state lift").
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-couch-900 text-cream-100">
      {/* page-level analog grain */}
      <div className="grain-fixed pointer-events-none fixed inset-0 z-0" aria-hidden />

      {/* ════════════════════════════════════════════════════════════════
          THEATER (§2) — chrome melts away, the TV goes full-bleed. The crew
          peanut-gallery + chat overlays live inside MediaStage; here we only
          float the remote as a fading bottom-center pill.
          ════════════════════════════════════════════════════════════════ */}
      {theater ? (
        <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center">
          {/* full-bleed stage — MediaStage handles its own theater letterbox */}
          <MediaStage />

          {/* floating remote pill — fades out with chromeVisible (§2) */}
          <div
            className={cn(
              'pointer-events-none fixed inset-x-0 bottom-safe z-40 flex justify-center pb-3 transition-opacity duration-300',
              chromeVisible ? 'opacity-100' : 'opacity-0',
            )}
          >
            <div
              className={cn(
                'pointer-events-auto w-[min(880px,calc(100vw-1.5rem))]',
                'overflow-hidden rounded-full border border-couch-650/80',
                'shadow-[var(--shadow-lifted)] backdrop-blur-md',
                // a self-contained pill — RemoteControls brings its own tray bg
                !chromeVisible && 'pointer-events-none',
              )}
            >
              <RemoteControls />
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* ════════════════════════════════════════════════════════════
              SHARED CHROME (desktop + portrait mobile)
              ════════════════════════════════════════════════════════════ */}
          <div className="pt-safe">
            <TopBar onOpenSettings={() => setSettingsOpen(true)} />
          </div>

          {/* ── DESKTOP / TABLET (md+) — the original grid, untouched ──── */}
          <div className="relative z-10 hidden min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 md:flex lg:flex-row">
            {/* stage column */}
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-3">
              <div className="relative z-0 flex min-h-[40%] flex-1 items-center justify-center px-2 py-2 sm:px-4 sm:py-3 lg:px-6 lg:py-4">
                <MediaStage />
              </div>
              <div className="relative z-10 flex-none">
                <ParticipantCircle />
              </div>
              <div className="relative z-10 flex-none">
                <SeshControls />
              </div>
              <div className="pointer-events-none absolute bottom-2 left-2 z-20 [&>*]:pointer-events-auto">
                <RotationPanel />
              </div>
            </div>

            {/* right column: queue over chat/activity */}
            <div className="flex min-h-0 w-full shrink-0 flex-col gap-3 lg:h-full lg:w-[380px]">
              <div className="flex min-h-0 flex-col lg:h-[45%] lg:overflow-hidden">
                <QueuePanel />
              </div>
              <div className="flex min-h-0 flex-1 flex-col lg:overflow-hidden">
                <SidePanel />
              </div>
            </div>
          </div>

          {/* ── PORTRAIT MOBILE (<md) — first-class layout (§6) ──────────
              TV letterboxed at top · horizontal seat strip · swipeable bottom
              sheet (up next / chat / activity) floating OVER the whole region ·
              thumb-reach remote bar pinned to the bottom.

              This whole region is the bottom-sheet's positioning context (and
              travel area): the TV + strip + sesh sit in normal flow, and the
              sheet is an absolute overlay spanning the FULL region so it has
              real room to rise (covering the strip and most of the TV at full)
              regardless of how tall the picture is. pointer-events pass through
              the sheet's travel container except on the sheet itself. */}
          <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden md:hidden">
            {/* the TV — letterboxed at the top, safe-area aware on the sides.
                MediaStage is h-full/w-full, so we give it a DEFINITE box: a
                16:9 frame off the (safe-area-padded) width, capped at ~38dvh so
                a tall phone still leaves room for the strip + sheet below. */}
            <div className="px-safe relative z-0 shrink-0 px-2 pt-2 pb-1">
              <div className="relative mx-auto aspect-video max-h-[38dvh] w-full">
                <MediaStage />
              </div>
            </div>

            {/* horizontal single-row seat strip under the TV */}
            <div className="relative z-10 shrink-0 px-safe">
              <SeatStrip />
            </div>

            {/* sesh strip (renders nothing when sesh is off) */}
            <div className="relative z-10 shrink-0 px-safe">
              <SeshControls />
            </div>

            {/* filler so the flow column reserves the rest of the height; the
                sheet's peek lives at the very bottom of this region. */}
            <div className="min-h-0 flex-1" aria-hidden />

            {/* swipeable bottom sheet — spans the ENTIRE mobile region so its
                travel reaches just under the TopBar at full. Its own internal
                pointer-events keep the TV/strip behind it tappable at peek. */}
            <BottomSheet />

            {/* rotation card docks bottom-left, clearing the sheet peek. */}
            <div className="pointer-events-none absolute bottom-28 left-2 z-40 [&>*]:pointer-events-auto">
              <RotationPanel />
            </div>
          </div>

          {/* thumb-reach remote bar — pinned bottom, safe-area padded. On
              portrait the sheet floats ABOVE this; on desktop it's the classic
              bottom transport bar. */}
          <div className="relative z-40 shrink-0 pb-safe">
            <RemoteControls />
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════
          GLOBAL OVERLAYS — above every layout, theater included.
          ════════════════════════════════════════════════════════════════ */}

      {/* synchronized moments filter (§8) — full-viewport, pointer-events-none */}
      <MomentLayer />

      <ReadyCheck />
      <ErrorBanner />
      <RoomSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* covers everything until you've joined */}
      <JoinGate />
    </div>
  );
}

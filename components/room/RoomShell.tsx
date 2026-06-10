'use client';

import { useState } from 'react';
import { RoomProvider } from '@/lib/realtime/room-context';

import { TopBar } from '@/components/room/TopBar';
import { JoinGate } from '@/components/room/JoinGate';
import { ErrorBanner } from '@/components/room/ErrorBanner';

// Concurrent sibling components — imported per their §12 contracts. These files
// are being written by other agents right now; missing-module errors here are
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

/**
 * RoomShell — the room's skeleton. Wraps everything in <RoomProvider> and lays
 * out the desktop-first grid:
 *
 *   TopBar  (h-15)
 *   ─────────────────────────────────────────────
 *   stage column (flex-1)        │  right column (380px)
 *     MediaStage (the WALL+TV)   │    QueuePanel  (~45%)
 *     ParticipantCircle (couch)  │    SidePanel   (chat / activity)
 *     SeshControls (when on)     │
 *   ─────────────────────────────────────────────
 *   RemoteControls (bottom bar)
 *
 * The stage column is a vertical flex with three rows that must coexist without
 * ever page-scrolling:
 *   - the TV section: `flex-1` to take the slack, but floored at `min-h-[40%]`
 *     of the column so at short window heights (~700px and below) it can't get
 *     crushed to a sliver by the seating band + sesh tray below it.
 *   - the seating band (`flex-none`): keeps its intrinsic height but runs its
 *     OWN responsive compression internally (sibling agent) — it gives up height
 *     before the TV does.
 *   - the sesh tray (`flex-none`): renders nothing when sesh is off.
 * Nothing floats on top of the TV picture anymore. The RotationPanel docks into
 * the stage column's bottom-left (it self-positions absolute and we anchor it
 * here so it never covers the screen).
 *
 * On < lg the right column drops beneath the stage. The JoinGate overlay covers
 * everything until `joinPhase === 'joined'`; the other overlays float above the
 * grid.
 */
export function RoomShell({ code }: { code: string }) {
  // Settings dialog open state lives here so TopBar's gear and the dialog stay
  // in sync (the §12 "tiny local state lift").
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <RoomProvider code={code}>
      <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-couch-900 text-cream-100">
        {/* page-level analog grain */}
        <div className="grain-fixed pointer-events-none fixed inset-0 z-0" aria-hidden />

        <TopBar onOpenSettings={() => setSettingsOpen(true)} />

        {/* main row: stage column + right column. Stacks on < lg.
            overflow-hidden here is intentional — the shell must never page-scroll;
            inner panels (QueuePanel list, SidePanel chat/activity) scroll on their own. */}
        <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 lg:flex-row">
          {/* stage column — min-h-0 lets the flex child shrink below its content
              size so the TV block can flex-shrink to fit the available height.
              `relative` makes this the positioning context the RotationPanel
              docks against (bottom-left, clear of the TV). */}
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            {/* the WALL + contained TV — takes the column's slack (flex-1) but is
                floored at min-h-[40%] so the seating band + sesh tray can never
                squeeze it into a thin strip on short windows. The percentage is
                resolved against the stage column's definite height (min-h-0 on
                the column lets that height be the row's, not the content's). The
                seating band compresses first because it's flex-none with its own
                internal responsive treatment. It's a centering flex box so the
                MediaStage can letterbox-fit the available area. */}
            <div className="relative z-0 flex min-h-[40%] flex-1 items-center justify-center px-2 py-2 sm:px-4 sm:py-3 lg:px-6 lg:py-4">
              <MediaStage />
            </div>
            {/* the couch band — sits below the TV, never on top of it */}
            <div className="relative z-10 flex-none">
              <ParticipantCircle />
            </div>
            {/* SeshControls renders nothing when sesh is off */}
            <div className="relative z-10 flex-none">
              <SeshControls />
            </div>

            {/* floating, sesh-only rotation card — docked into the stage column's
                bottom-left so it clears the TV picture (renders nothing when
                rotation is inactive). It self-positions absolute; this wrapper is
                the anchor. */}
            <div className="pointer-events-none absolute bottom-2 left-2 z-20 [&>*]:pointer-events-auto">
              <RotationPanel />
            </div>
          </div>

          {/* right column: queue (top ~45%) over the chat/activity side panel.
              min-h-0 is required so the column can shrink inside the flex row. */}
          <div className="flex min-h-0 w-full shrink-0 flex-col gap-3 lg:h-full lg:w-[380px]">
            <div className="flex min-h-0 flex-col lg:h-[45%] lg:overflow-hidden">
              <QueuePanel />
            </div>
            <div className="flex min-h-0 flex-1 flex-col lg:overflow-hidden">
              <SidePanel />
            </div>
          </div>
        </div>

        {/* bottom transport bar */}
        <div className="relative z-20 shrink-0">
          <RemoteControls />
        </div>

        {/* overlays */}
        <ReadyCheck />
        <ErrorBanner />
        <RoomSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />

        {/* covers everything until you've joined */}
        <JoinGate />
      </div>
    </RoomProvider>
  );
}

'use client';

/**
 * ProjectorView — the companion big-screen window (SPRINT2 §1).
 *
 * This is what `/r/CODE/screen` renders. It is a pure VIEWER: full-bleed black,
 * the active player driven by its OWN {@link SyncEngine} (non-controller path —
 * the projector is never the controller, so it only ever follows + drift-corrects
 * the room's authoritative position). No couch, no panels, no remote.
 *
 * Over the picture:
 *  - a big centered "tap to roll 🎬" overlay covers the screen until the first
 *    gesture (browsers block audible autoplay; the tap runs resume/unmute and
 *    then melts away).
 *  - a minimal floating status (couch name + code, the sync pill, crew count)
 *    that auto-hides with the cursor after a few idle seconds.
 *  - the §9 peanut gallery along the bottom — the back row is always present.
 *
 * The projector mounts its own {@link TheaterProvider} so {@link TheaterGallery}
 * (and useTheater) have a context; theater mode itself is irrelevant here (the
 * picture is already full-bleed), but the gallery toggle lives in the status bar.
 */

import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useRoom } from '@/lib/realtime/room-context';
import { useTheater, TheaterProvider } from '@/lib/theater';
import {
  SyncEngine,
  useSyncStatus,
  unmuteAndSync,
} from '@/lib/sync/sync-engine';
import type { QueueItem } from '@/shared/protocol';
import { cn } from '@/lib/utils';
import { YouTubePlayer } from './players/YouTubePlayer';
import { DirectUrlPlayer } from './players/DirectUrlPlayer';
import { ScreenSharePlayer } from './players/ScreenSharePlayer';
import { SyncIndicator } from './SyncIndicator';
import { TheaterGallery } from './TheaterGallery';

// ---------------------------------------------------------------------------
// Idle "nothing rolling yet" screen — cozy, not a void
// ---------------------------------------------------------------------------

function ProjectorIdle() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black px-8 text-center">
      <div
        className="animate-flicker pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(240,139,52,0.07),transparent_60%)]"
        aria-hidden
      />
      <span className="relative z-10 text-5xl opacity-80" aria-hidden>
        📽️
      </span>
      <p className="relative z-10 font-display text-2xl text-cream-200">
        nothing rolling yet
      </p>
      <p className="relative z-10 font-body text-sm text-cream-400">
        whoever has the remote picks the night — this screen follows along
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Player router — keyed by item id so item changes remount cleanly (matches the
// main-window StagePlayer contract). Reuses the media-stage player components.
// ---------------------------------------------------------------------------

function ProjectorPlayer({
  engine,
  item,
  adapter,
}: {
  engine: SyncEngine;
  item: QueueItem;
  adapter: string;
}) {
  if (adapter === 'youtube') return <YouTubePlayer key={item.id} engine={engine} item={item} />;
  if (adapter === 'direct-url') return <DirectUrlPlayer key={item.id} engine={engine} item={item} />;
  if (adapter === 'screen-share') return <ScreenSharePlayer key={item.id} engine={engine} item={item} />;
  return null;
}

// ---------------------------------------------------------------------------
// "tap to roll 🎬" — the start overlay. Covers the screen until the first
// gesture; the tap runs the autoplay-resume + unmute path so audible playback
// can begin (browsers block audible autoplay on a fresh window).
// ---------------------------------------------------------------------------

function TapToRoll({ onRoll }: { onRoll: () => void }) {
  return (
    <button
      type="button"
      onClick={onRoll}
      className={cn(
        'absolute inset-0 z-50 flex flex-col items-center justify-center gap-3',
        'bg-black/80 backdrop-blur-sm transition-colors duration-200 hover:bg-black/70',
      )}
    >
      <span className="animate-float-bob text-6xl" aria-hidden>
        🎬
      </span>
      <span className="font-display text-3xl text-cream-50">tap to roll</span>
      <span className="font-body text-sm text-cream-400">
        one tap and the big screen joins the couch — sound on
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Floating status — couch name + code, the sync pill, crew count. Cursor-hides.
// ---------------------------------------------------------------------------

function ProjectorStatus({ visible }: { visible: boolean }) {
  const { state } = useRoom();
  const { galleryVisible, toggleGallery } = useTheater();

  const roomName = state?.settings.roomName?.trim() || 'the couch';
  const joinCode = state?.joinCode ?? '';
  const crewCount = state
    ? Object.values(state.participants).filter((p) => p.connected).length
    : 0;

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-x-0 top-0 z-40 flex items-start justify-between gap-3 p-4 sm:p-6',
        'transition-opacity duration-500',
        visible ? 'opacity-100' : 'opacity-0',
      )}
    >
      {/* couch identity */}
      <div className="flex min-w-0 items-center gap-2 rounded-full border border-couch-700/70 bg-couch-900/70 px-3.5 py-1.5 shadow-[var(--shadow-couch)] backdrop-blur-sm">
        <span className="text-base leading-none" aria-hidden>
          🛋️
        </span>
        <span className="truncate font-display text-base leading-none text-cream-50">
          {roomName}
        </span>
        {joinCode && (
          <span className="rounded-full bg-ember-500/15 px-2 py-0.5 font-mono text-xs leading-none text-ember-300">
            {joinCode}
          </span>
        )}
        {crewCount > 0 && (
          <span className="text-xs leading-none text-cream-400 tabular-nums">
            · {crewCount} on the couch
          </span>
        )}
      </div>

      {/* sync pill + gallery toggle */}
      <div className="pointer-events-auto flex items-center gap-2">
        <button
          type="button"
          onClick={toggleGallery}
          className="flex items-center gap-1.5 rounded-full border border-couch-700/70 bg-couch-900/70 px-3 py-1.5 text-xs font-semibold text-cream-300 shadow-[var(--shadow-couch)] backdrop-blur-sm transition-colors hover:bg-couch-800/80 [&_svg]:size-3.5"
          aria-label={galleryVisible ? 'hide the back row' : 'show the back row'}
        >
          {galleryVisible ? <Eye /> : <EyeOff />}
          <span className="hidden sm:inline">the back row</span>
        </button>
        <SyncIndicator />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The stage — owns the SyncEngine, renders the player, gallery, overlays
// ---------------------------------------------------------------------------

function ProjectorStage() {
  const room = useRoom();
  const { state } = room;

  // ---- refs that always hold the latest values (avoid stale closures) ----
  const roomRef = React.useRef(room);
  roomRef.current = room;

  // ---- this projector's own SyncEngine. A projector is never the controller,
  // so isController() is hard-false: it only ever follows + drift-corrects. ----
  const [engine, setEngine] = React.useState<SyncEngine | null>(null);

  React.useEffect(() => {
    const eng = new SyncEngine({
      serverNow: () => roomRef.current.serverNow(),
      isController: () => false,
      send: (msg) => roomRef.current.send(msg),
    });
    setEngine(eng);
    return () => {
      eng.destroy();
      setEngine(null);
    };
    // create exactly once for the life of the projector
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- feed the engine every room:state ----
  React.useEffect(() => {
    if (engine && state) engine.applyMediaState(state.media);
  }, [engine, state]);

  // ---- "tap to roll" gate: covers the screen until the first gesture ----
  const [rolled, setRolled] = React.useState(false);
  const handleRoll = React.useCallback(() => {
    setRolled(true);
    // best-effort resume + unmute so audible playback can start
    engine?.resumePlayback().catch(() => {});
    unmuteAndSync();
  }, [engine]);

  // ---- cursor / status auto-hide (a few idle seconds) ----
  const [chromeUp, setChromeUp] = React.useState(true);
  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const arm = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setChromeUp(false), 3_000);
    };
    const wake = (): void => {
      setChromeUp(true);
      arm();
    };
    arm();
    window.addEventListener('mousemove', wake, { passive: true });
    window.addEventListener('touchstart', wake, { passive: true });
    window.addEventListener('keydown', wake);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('mousemove', wake);
      window.removeEventListener('touchstart', wake);
      window.removeEventListener('keydown', wake);
    };
  }, []);

  // ---- which player (if any) to show ----
  const media = state?.media;
  const currentItem = React.useMemo<QueueItem | undefined>(() => {
    if (media?.queueItemId == null) return undefined;
    return state?.queue.find((q) => q.id === media.queueItemId);
  }, [state?.queue, media?.queueItemId]);

  const adapter = media?.adapter ?? 'idle';
  const showPlayer =
    adapter !== 'idle' && adapter !== 'hosted-upload' && !!currentItem && !!engine;

  return (
    <div
      className={cn(
        'relative h-[100dvh] w-screen overflow-hidden bg-black',
        chromeUp ? 'cursor-default' : 'cursor-none',
      )}
    >
      {/* the picture — full-bleed, letterboxed by object-contain inside players */}
      <div className="absolute inset-0">
        {showPlayer && currentItem && engine ? (
          <ProjectorPlayer engine={engine} item={currentItem} adapter={adapter} />
        ) : (
          <ProjectorIdle />
        )}
      </div>

      {/* the peanut gallery — always present on the projector (§9) */}
      <TheaterGallery />

      {/* floating status */}
      <ProjectorStatus visible={chromeUp} />

      {/* tap-to-roll start overlay */}
      {!rolled && <TapToRoll onRoll={handleRoll} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProjectorView — public component for the /screen route
// ---------------------------------------------------------------------------

export function ProjectorView() {
  return (
    <TheaterProvider>
      <ProjectorStage />
    </TheaterProvider>
  );
}

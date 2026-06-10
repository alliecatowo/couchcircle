'use client';

/**
 * MediaStage — the shared TV (§12 MediaStage block + §9/§10 client wiring).
 *
 * This component owns exactly ONE {@link SyncEngine} for the room view. The
 * engine is created once in a `useEffect` with closures that read the LATEST
 * room context via refs (so it never goes stale), fed `applyMediaState` on every
 * room:state, and destroyed on unmount.
 *
 * The stage is no longer a full-bleed void: it's an actual living-room wall with
 * a contained television. The TV is a centered, height-capped 16:9 block in a
 * warm bezel with an ambient glow pooling behind it and a faint shadow "stand"
 * underneath. The player surface is covered by a transparent CLICK-SHIELD so
 * nobody can drive the embedded YouTube/video UI and desync the room — everyone
 * uses the shared remote. Our own overlays (countdown, blocked curtain, error
 * panel, unmute pill, sync pill) render ABOVE the shield.
 */

import * as React from 'react';
import { Film, Link2, Volume2 } from 'lucide-react';
import { useRoom } from '@/lib/realtime/room-context';
import {
  SyncEngine,
  useSyncStatus,
  // Module-level export from sync-core: performs the user-gesture unmute and
  // re-syncs the adapter to the room (§contract).
  unmuteAndSync,
} from '@/lib/sync/sync-engine';
import type { QueueItem, NewQueueItem } from '@/shared/protocol';
import { SAMPLE_VIDEOS } from '@/shared/constants';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { YouTubePlayer } from './players/YouTubePlayer';
import { DirectUrlPlayer } from './players/DirectUrlPlayer';
import { ScreenSharePlayer } from './players/ScreenSharePlayer';
import { SyncIndicator } from './SyncIndicator';
import { SparkCountdown } from './SparkCountdown';
import { ReactionLayer } from './ReactionLayer';

// ---------------------------------------------------------------------------
// Quick-add catalog for the idle screen
// ---------------------------------------------------------------------------

interface QuickAdd {
  key: string;
  label: string;
  icon: React.ReactNode;
  item: NewQueueItem;
}

const QUICK_ADDS: QuickAdd[] = [
  {
    key: 'mp4',
    label: 'bunny movie (mp4)',
    icon: <Link2 />,
    item: { type: 'direct-url', source: SAMPLE_VIDEOS.mp4, title: 'Big Buck Bunny (MP4)' },
  },
  {
    key: 'hls',
    label: 'test stream (hls)',
    icon: <Link2 />,
    item: { type: 'direct-url', source: SAMPLE_VIDEOS.hls, title: 'Mux test stream (HLS)' },
  },
  {
    key: 'youtube',
    label: 'bunny on youtube',
    icon: <Film />,
    item: { type: 'youtube', source: SAMPLE_VIDEOS.youtube, title: 'Big Buck Bunny (YouTube)' },
  },
];

// ---------------------------------------------------------------------------
// Idle "TV off" screen — cozy dark warm panel INSIDE the bezel (not a void)
// ---------------------------------------------------------------------------

function IdleScreen({
  canControl,
  onQuickAdd,
}: {
  canControl: boolean;
  onQuickAdd: (item: NewQueueItem) => void;
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-couch-950 px-6 text-center">
      {/* very dark warm screen with a faint standby sheen + reflection */}
      <div
        className="animate-flicker pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(154,127,196,0.10),transparent_62%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-[linear-gradient(180deg,rgba(247,238,226,0.05),transparent)]"
        aria-hidden
      />
      <div className="relative z-10 space-y-1.5">
        <p className="font-display text-xl text-cream-200">the tv&apos;s off</p>
        <p className="font-body text-sm text-cream-400">queue something to start the night</p>
      </div>

      {canControl && (
        <div className="relative z-10 flex flex-col items-center gap-2.5">
          <div className="flex flex-wrap items-center justify-center gap-2">
            {QUICK_ADDS.map((qa) => (
              <Button
                key={qa.key}
                variant="outline"
                size="sm"
                onClick={() => onQuickAdd(qa.item)}
              >
                {qa.icon}
                {qa.label}
              </Button>
            ))}
          </div>
          <p className="font-body text-xs text-cream-500">
            we&apos;ll roll it the second it lands in the queue
          </p>
        </div>
      )}

      {!canControl && (
        <p className="relative z-10 font-body text-xs text-cream-500">
          waiting on whoever has the remote 📺
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Autoplay-blocked curtain
// ---------------------------------------------------------------------------

function BlockedCurtain({ onResume }: { onResume: () => void }) {
  return (
    <button
      type="button"
      onClick={onResume}
      className={cn(
        'absolute inset-0 z-40 flex flex-col items-center justify-center gap-2',
        'bg-couch-950/75 backdrop-blur-sm transition-colors duration-200 hover:bg-couch-950/65',
      )}
    >
      <span className="animate-float-bob text-4xl" aria-hidden>
        👆
      </span>
      <span className="font-display text-lg text-cream-100">tap to sync up</span>
      <span className="font-body text-xs text-cream-400">
        your browser paused autoplay — one tap and we&apos;re all together
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Autoplay-blocked banner (YouTube only) — non-blocking pill at the TOP of the
// TV. YouTube refuses our IFrame API playVideo() under this environment's
// autoplay block; the ONLY gesture it honours is a click inside its own iframe
// (the embed's big ▶). So instead of a full curtain (which would need the
// click-shield down anyway) we drop a hint here and let the shield go
// pointer-events-none so taps reach that ▶. Pure pop-in, no dismiss button —
// it unmounts the instant health leaves 'blocked'.
// ---------------------------------------------------------------------------

function BlockedBanner() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-40 flex justify-center px-3">
      <span className="animate-pop-in max-w-full rounded-full border border-couch-650 bg-couch-900/90 px-3.5 py-1.5 text-center text-xs font-semibold text-cream-100 shadow-[var(--shadow-lifted)] backdrop-blur-sm">
        👆 hit the ▶ on the video to sync up — your browser is being shy
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Click-shield — transparent layer that EATS clicks on the player surface so
// viewers can't drive YouTube's own play/scrubber and desync. A tap flashes a
// tiny "use the remote" hint. Sits ABOVE the iframe/video, BELOW our overlays.
// ---------------------------------------------------------------------------

function ClickShield({ disabled = false }: { disabled?: boolean }) {
  const [hint, setHint] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const flash = React.useCallback(() => {
    setHint(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setHint(false), 1000);
  }, []);

  return (
    <div
      // eats every pointer event so the embedded player UI is untouchable —
      // EXCEPT when `disabled` (YouTube autoplay-blocked): then we go
      // pointer-events-none so taps reach the iframe's own ▶ button, the only
      // gesture YouTube will honour to start playback.
      className={cn(
        'absolute inset-0 z-20 cursor-default',
        disabled && 'pointer-events-none',
      )}
      onClick={flash}
      role="presentation"
      aria-hidden
    >
      {hint && (
        <span className="animate-pop-in pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-couch-650 bg-couch-900/90 px-3 py-1 text-xs font-semibold text-cream-100 shadow-[var(--shadow-lifted)]">
          use the remote 📺
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ClickShieldGate — reads the live sync health and disables the shield only
// for a YouTube player while autoplay is blocked, so the tap reaches the
// embed's own ▶. The instant health leaves 'blocked' the shield re-engages.
// Pure conditional rendering off `health` — no new state.
// ---------------------------------------------------------------------------

function ClickShieldGate({ adapter }: { adapter: string }) {
  const { health } = useSyncStatus();
  const disabled = adapter === 'youtube' && health === 'blocked';
  return <ClickShield disabled={disabled} />;
}

// ---------------------------------------------------------------------------
// Unmute pill — bottom-center of the TV when sync-core says we need a gesture
// to unmute. Calls the module-level unmuteAndSync().
// ---------------------------------------------------------------------------

function UnmutePill() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-40 flex justify-center">
      <Button
        variant="accent"
        size="sm"
        onClick={() => unmuteAndSync()}
        className="animate-pop-in glow-ember pointer-events-auto gap-1.5 rounded-full"
      >
        <Volume2 />
        tap to unmute
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MediaStage
// ---------------------------------------------------------------------------

export function MediaStage() {
  const room = useRoom();
  const { state, canControl, send } = room;

  // ---- refs that always hold the latest values (avoid stale closures) ----
  const roomRef = React.useRef(room);
  roomRef.current = room;

  // ---- the single SyncEngine for this room view ----
  const [engine, setEngine] = React.useState<SyncEngine | null>(null);

  React.useEffect(() => {
    const eng = new SyncEngine({
      serverNow: () => roomRef.current.serverNow(),
      isController: () => {
        const s = roomRef.current.state;
        return !!s && s.remote.controllerId === roomRef.current.selfId;
      },
      send: (msg) => roomRef.current.send(msg),
    });
    setEngine(eng);
    return () => {
      eng.destroy();
      setEngine(null);
    };
    // create exactly once for the life of the stage
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- feed the engine every room:state ----
  React.useEffect(() => {
    if (engine && state) engine.applyMediaState(state.media);
  }, [engine, state]);

  // ---- quick-add → auto-play once the new item shows up (pending ref) ----
  // Holds the `source` we just queued so we can match the new item across the
  // next room:state(s) and (if media is idle + we can control) auto-play it.
  const pendingPlayRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const pending = pendingPlayRef.current;
    if (!pending || !state) return;
    if (!canControl) {
      pendingPlayRef.current = null;
      return;
    }
    const match = state.queue.find((q) => q.source === pending);
    if (match) {
      pendingPlayRef.current = null;
      if (state.media.adapter === 'idle') {
        send({ type: 'queue:play', itemId: match.id });
      }
    }
  }, [state, canControl, send]);

  function handleQuickAdd(item: NewQueueItem) {
    pendingPlayRef.current = item.source;
    send({ type: 'queue:add', item });
  }

  const media = state?.media;
  // Memoize so that room:state broadcasts which don't change the actual item
  // don't produce a new object reference (controller heartbeats arrive every
  // ~2–3 s and would otherwise cause a new `item` prop on every render).
  // The players are also keyed by item.id and depend on `item.id` not the full
  // object, so this is a belt-and-suspenders guard; the player-side itemRef fix
  // is the real line of defence.
  const currentItem = React.useMemo<QueueItem | undefined>(() => {
    if (media?.queueItemId == null) return undefined;
    return state?.queue.find((q) => q.id === media.queueItemId);
    // Re-derive only when the active item id changes or the queue list itself
    // changes (new items added / removed). `state?.queue` is a new array ref on
    // each broadcast, but we accept that cost here rather than deep-comparing —
    // the player-side itemRef is what prevents the effect storm.
  }, [state?.queue, media?.queueItemId]);

  // adapter says we should be showing a player, but the item is gone → idle.
  const adapter = media?.adapter ?? 'idle';
  const showPlayer = adapter !== 'idle' && adapter !== 'hosted-upload' && !!currentItem;

  return (
    <section
      aria-label="the shared screen"
      className={cn(
        'grain relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl',
        // the WALL: a vertical gradient, not a void
        'bg-gradient-to-b from-couch-900 to-couch-950',
        'border border-couch-700 shadow-[var(--shadow-couch)]',
      )}
    >
      {/* soft ember lamp-glow radial in the upper-left corner */}
      <div
        className="pointer-events-none absolute -left-16 -top-20 z-0 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(240,139,52,0.20),transparent_65%)] blur-2xl"
        aria-hidden
      />
      {/* faint baseboard line along the bottom of the wall */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-10 border-t border-couch-700/60 bg-gradient-to-t from-couch-950 to-transparent"
        aria-hidden
      />

      {/* centering frame — fills the wall, centers the TV. This gives the bezel
          a definite parent box so its max-h-full/max-w-full caps resolve. */}
      <div className="relative z-10 flex h-full w-full items-center justify-center p-4">
        {/* ---- the contained TV, in a bezel ----
            aspect-video drives a 16:9 box off w-full (a definite width basis),
            and max-h-full caps its height against this now-definite parent so it
            letterbox-fits: as wide as fits, never taller than the area. No
            percentage/auto-width collapse. */}
        <div
          className={cn(
            'tv-glow relative aspect-video max-h-full w-full max-w-full overflow-hidden rounded-2xl',
            // the bezel
            'bg-couch-950 p-1 ring-1 ring-couch-650',
            'shadow-[0_24px_60px_-18px_rgba(0,0,0,0.85)]',
          )}
        >
          {/* ambient glow pooling behind the set */}
          <div
            className="pointer-events-none absolute -inset-6 -z-10 rounded-[2.75rem] bg-[radial-gradient(ellipse_at_center,rgba(240,139,52,0.14),transparent_70%)] blur-2xl"
            aria-hidden
          />

          {/* the picture — fills the bezel inside its p-1 frame (inset-1 matches
              the bezel padding so the warm ring stays visible); slight scale
              crop hides the YT branding row edges */}
          <div className="absolute inset-1 overflow-hidden rounded-xl bg-couch-950">
            <div className="absolute inset-0 z-0 scale-[1.01]">
              {engine && showPlayer && currentItem ? (
                <StagePlayer engine={engine} item={currentItem} adapter={adapter} />
              ) : (
                <IdleScreen canControl={canControl} onQuickAdd={handleQuickAdd} />
              )}
            </div>

            {/* click-shield — only over a live player (idle screen wants its
                quick-add buttons clickable). For a YouTube player it drops to
                pointer-events-none while autoplay is blocked so the tap can
                reach the embed's own ▶ (see ClickShieldGate). */}
            {showPlayer && <ClickShieldGate adapter={adapter} />}

            {/* overlays — all ABOVE the shield */}
            <ReactionLayer />
            <SparkCountdown />
            {engine && <AutoplayGate engine={engine} adapter={adapter} />}
            <UnmuteGate />

            {/* sync pill, tucked into the top-right of the screen */}
            <div className="pointer-events-auto absolute right-3 top-3 z-30">
              <SyncIndicator />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Player router — keyed by item id so item changes remount cleanly
// ---------------------------------------------------------------------------

function StagePlayer({
  engine,
  item,
  adapter,
}: {
  engine: SyncEngine;
  item: QueueItem;
  adapter: string;
}) {
  if (adapter === 'youtube') {
    return <YouTubePlayer key={item.id} engine={engine} item={item} />;
  }
  if (adapter === 'direct-url') {
    return <DirectUrlPlayer key={item.id} engine={engine} item={item} />;
  }
  if (adapter === 'screen-share') {
    return <ScreenSharePlayer key={item.id} engine={engine} item={item} />;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Autoplay gate — only rendered when sync health is 'blocked'
// ---------------------------------------------------------------------------

function AutoplayGate({ engine, adapter }: { engine: SyncEngine; adapter: string }) {
  const { health } = useSyncStatus();
  if (health !== 'blocked') return null;
  // YouTube under autoplay-block: the IFrame API playVideo() is refused no
  // matter what gesture we delegate, so a full curtain + resumePlayback() can
  // never recover. Show a non-blocking banner instead; the click-shield goes
  // pointer-events-none (see render) so the tap lands on YouTube's own ▶.
  if (adapter === 'youtube') return <BlockedBanner />;
  // direct-url (native <video>) and everything else: page-level gesture works,
  // keep the full curtain + resumePlayback().
  return <BlockedCurtain onResume={() => engine.resumePlayback()} />;
}

// ---------------------------------------------------------------------------
// Unmute gate — renders the floating unmute pill when the engine reports a
// muted-autoplay state needing a user gesture (`needsUnmute`, sync-core).
// Read defensively so this compiles before sync-core adds the field.
// ---------------------------------------------------------------------------

function UnmuteGate() {
  const { needsUnmute } = useSyncStatus();
  if (!needsUnmute) return null;
  return <UnmutePill />;
}

'use client';

/**
 * ExplorePanel — "channel surf" (SPRINT2 §3).
 *
 * A poster-grid browser over the strictly-legal {@link EXPLORE_SECTIONS} catalog.
 * Two exports:
 *
 *  - {@link ExploreGrid} — the embeddable grid. Pure UI: renders the sections as
 *    poster cards (hover lift + ember glow, runtime chip, license footnote) and
 *    calls `onPick(channel, playNow)` when a tile's "queue it" / "play now"
 *    button is hit. A sibling embeds this inside the AddToQueueDialog's explore
 *    tab; it owns no queue wiring of its own.
 *  - {@link ExplorePanel} — the standalone Dialog wrapper `{ open, onClose }`.
 *    Wraps the grid, owns the `onPick` → `queue:add` (+ `queue:play` when
 *    `playNow && canControl`) wiring, and is opened from the idle-TV
 *    "channel surf 📺" button.
 *
 * onPick maps a channel onto the queue protocol: `type` is the channel's type,
 * `source` its media URL, `title` its title, `thumbnail` its poster.
 */

import * as React from 'react';
import { Tv, Plus, Play, Radio } from 'lucide-react';
import { useRoom } from '@/lib/realtime/room-context';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { EXPLORE_SECTIONS, type Channel } from '@/lib/explore/registry';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** "1h 36m" / "12m" — compact runtime for the chip. */
function formatRuntime(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// ---------------------------------------------------------------------------
// poster card
// ---------------------------------------------------------------------------

function ChannelCard({
  channel,
  canControl,
  onPick,
}: {
  channel: Channel;
  canControl: boolean;
  onPick: (channel: Channel, playNow: boolean) => void;
}) {
  const [posterFailed, setPosterFailed] = React.useState(false);
  const showPoster = !!channel.poster && !posterFailed;
  const isLive = channel.kind === 'live';

  return (
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl',
        'border border-couch-700 bg-couch-800 text-left',
        'shadow-[var(--shadow-couch)] transition-all duration-200 ease-[var(--ease-cozy)]',
        'hover:-translate-y-1 hover:border-couch-650 hover:shadow-[var(--shadow-ember)]',
      )}
    >
      {/* poster (or a styled title-card when no art / on load error) */}
      <div className="relative aspect-video w-full overflow-hidden bg-couch-950">
        {showPoster ? (
          // eslint-disable-next-line @next/next/no-img-element -- external poster hotlink, no Next optimization wanted
          <img
            src={channel.poster}
            alt=""
            loading="lazy"
            onError={() => setPosterFailed(true)}
            className="h-full w-full object-cover transition-transform duration-300 ease-[var(--ease-cozy)] group-hover:scale-[1.04]"
          />
        ) : (
          // title-card tile: a cozy gradient with the title set big, no art needed
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-couch-800 to-couch-950 p-4">
            <span className="font-display text-base leading-tight text-cream-200">
              {channel.title}
            </span>
          </div>
        )}

        {/* a soft bottom scrim so chips + the hover actions stay legible on art */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-couch-950/85 to-transparent"
          aria-hidden
        />

        {/* runtime / live chip, top-left */}
        <div className="absolute left-2 top-2">
          {isLive ? (
            <Badge variant="live" className="gap-1">
              <Radio />
              live
            </Badge>
          ) : channel.runtimeMin != null ? (
            <Badge variant="default" className="bg-couch-900/85 backdrop-blur-sm">
              {formatRuntime(channel.runtimeMin)}
            </Badge>
          ) : null}
        </div>

        {/* hover actions — slide up over the poster bottom */}
        <div
          className={cn(
            'absolute inset-x-0 bottom-0 flex items-center gap-2 p-2.5',
            'translate-y-1 opacity-0 transition-all duration-200 ease-[var(--ease-cozy)]',
            'group-hover:translate-y-0 group-hover:opacity-100 focus-within:translate-y-0 focus-within:opacity-100',
          )}
        >
          <Button
            type="button"
            variant="default"
            size="sm"
            className="flex-1 gap-1.5 bg-couch-900/90 backdrop-blur-sm"
            onClick={() => onPick(channel, false)}
          >
            <Plus />
            queue it
          </Button>
          {canControl && (
            <Button
              type="button"
              variant="accent"
              size="sm"
              className="flex-1 gap-1.5"
              onClick={() => onPick(channel, true)}
            >
              <Play />
              play now
            </Button>
          )}
        </div>
      </div>

      {/* meta — title, blurb, license footnote */}
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="font-display text-sm leading-tight text-cream-100">{channel.title}</p>
        <p className="line-clamp-2 text-xs leading-snug text-cream-400">{channel.blurb}</p>
        <p className="mt-auto pt-1.5 text-[0.65rem] leading-tight text-cream-400/60">
          {channel.license}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExploreGrid — the embeddable grid (no dialog chrome)
// ---------------------------------------------------------------------------

export interface ExploreGridProps {
  /** fired when a tile is picked; `playNow` requests immediate playback */
  onPick: (channel: Channel, playNow: boolean) => void;
  className?: string;
}

export function ExploreGrid({ onPick, className }: ExploreGridProps) {
  // gate the "play now" button on local control so guests only ever queue
  const { canControl } = useRoom();

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      {EXPLORE_SECTIONS.map((section) => (
        <section key={section.id} className="flex flex-col gap-3">
          <div className="space-y-0.5">
            <h3 className="font-display text-lg leading-tight text-cream-100">{section.title}</h3>
            <p className="text-xs text-cream-400">{section.tagline}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {section.channels.map((channel) => (
              <ChannelCard
                key={channel.id}
                channel={channel}
                canControl={canControl}
                onPick={onPick}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExplorePanel — standalone Dialog wrapper, owns the queue wiring
// ---------------------------------------------------------------------------

export interface ExplorePanelProps {
  open: boolean;
  onClose: () => void;
}

export function ExplorePanel({ open, onClose }: ExplorePanelProps) {
  const { send, canControl, state } = useRoom();

  // Holds the `source` we just queued with "play now" so we can match the new
  // item across the next room:state and fire queue:play on it (so "play now"
  // works even when something is already on the TV — the server assigns the
  // queue id, so we can't play *this* item by id synchronously).
  const pendingPlayRef = React.useRef<string | null>(null);

  const handlePick = React.useCallback(
    (channel: Channel, playNow: boolean) => {
      send({
        type: 'queue:add',
        item: {
          type: channel.type,
          source: channel.source,
          title: channel.title,
          thumbnail: channel.poster,
        },
      });
      if (playNow && canControl) {
        pendingPlayRef.current = channel.source;
      }
      onClose();
    },
    [send, canControl, onClose],
  );

  React.useEffect(() => {
    const pending = pendingPlayRef.current;
    if (!pending || !state) return;
    if (!canControl) {
      pendingPlayRef.current = null;
      return;
    }
    // newest matching item wins (channels can be queued more than once)
    const match = [...state.queue].reverse().find((q) => q.source === pending);
    if (match) {
      pendingPlayRef.current = null;
      send({ type: 'queue:play', itemId: match.id });
    }
  }, [state, canControl, send]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tv className="size-5 text-ember-400" />
            channel surf
          </DialogTitle>
          <DialogDescription>
            strictly-legal free picks — open movies, public-domain classics, live channels
          </DialogDescription>
        </DialogHeader>

        <ExploreGrid onPick={handlePick} />
      </DialogContent>
    </Dialog>
  );
}

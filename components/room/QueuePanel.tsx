'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Film,
  Monitor,
  ChevronUp,
  ChevronDown,
  Play,
  X,
  Plus,
  TriangleIcon,
  ListVideo,
} from 'lucide-react';
import { useRoom } from '@/lib/realtime/room-context';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn, formatDuration } from '@/lib/utils';
import { SAMPLE_VIDEOS } from '@/shared/constants';
import type { QueueItem } from '@/shared/protocol';
import {
  parseYouTubeUrl,
  youTubeThumbnail,
} from '@/lib/media/url-parse';
import { AddToQueueDialog } from './AddToQueueDialog';

// ---------------------------------------------------------------------------
// Animated equalizer — tiny bouncing bars shown for the now-playing item
// ---------------------------------------------------------------------------

function EqualizerBars() {
  const bars = [
    { delay: 0, maxH: 14 },
    { delay: 0.15, maxH: 20 },
    { delay: 0.3, maxH: 10 },
  ];

  return (
    <span
      className="inline-flex items-end gap-[2px] h-5"
      aria-label="now playing"
      aria-hidden="false"
    >
      {bars.map((b, i) => (
        <motion.span
          key={i}
          className="w-[3px] rounded-full bg-ember-400"
          animate={{ height: [4, b.maxH, 4] }}
          transition={{
            repeat: Infinity,
            duration: 0.75,
            delay: b.delay,
            ease: 'easeInOut',
          }}
          style={{ display: 'block' }}
        />
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Thumbnail — resolves stored thumbnail, falls back to YouTube derivation or icon
// ---------------------------------------------------------------------------

function QueueItemThumbnail({ item }: { item: QueueItem }) {
  // Prefer stored thumbnail (oEmbed-resolved for YT, or whatever was passed in);
  // fall back to deriving the YT thumbnail from the source URL.
  let thumbSrc: string | null = item.thumbnail ?? null;

  if (!thumbSrc && item.type === 'youtube') {
    const parsed = parseYouTubeUrl(item.source);
    if (parsed) {
      thumbSrc = youTubeThumbnail(parsed.videoId);
    }
  }

  if (thumbSrc) {
    return (
      <div className="relative w-16 h-10 shrink-0 rounded-lg overflow-hidden bg-couch-750 ring-1 ring-couch-650/60">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbSrc}
          alt=""
          className="object-cover w-full h-full"
          loading="lazy"
          decoding="async"
        />
      </div>
    );
  }

  const Icon = item.type === 'screen-share' ? Monitor : Film;
  return (
    <div className="w-16 h-10 shrink-0 rounded-lg bg-couch-750 ring-1 ring-couch-650/60 flex items-center justify-center text-cream-400">
      <Icon className="size-4" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual queue row
// ---------------------------------------------------------------------------

interface QueueRowProps {
  item: QueueItem;
  index: number;
  totalItems: number;
  isNowPlaying: boolean;
  selfId: string;
  canControlRoom: boolean;
  selfVoted: boolean;
  onPlay: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onVote: () => void;
}

function QueueRow({
  item,
  index,
  totalItems,
  isNowPlaying,
  selfId,
  canControlRoom,
  selfVoted,
  onPlay,
  onMoveUp,
  onMoveDown,
  onRemove,
  onVote,
}: QueueRowProps) {
  const canRemove = canControlRoom || item.addedById === selfId;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'group relative flex items-center gap-3 rounded-xl px-3 py-2.5',
        'transition-all duration-200',
        isNowPlaying
          ? [
              'bg-ember-500/10',
              'shadow-[inset_0_0_0_1px_rgba(224,139,52,0.22)]',
              'animate-pulse-glow',
            ]
          : 'hover:bg-couch-750/70 hover:shadow-[var(--shadow-couch)]',
      )}
    >
      {/* Left ember bar for now-playing */}
      {isNowPlaying && (
        <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-ember-400/80 shadow-[0_0_8px_2px_rgba(242,168,80,0.5)]" />
      )}

      {/* Thumbnail */}
      <div className={cn(isNowPlaying && 'ml-1')}>
        <QueueItemThumbnail item={item} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span
          className={cn(
            'text-sm font-medium truncate leading-tight',
            isNowPlaying ? 'text-ember-200' : 'text-cream-100',
          )}
        >
          {item.title}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-cream-400 truncate">
            {item.addedByName}
          </span>
          {item.duration != null && (
            <span className="text-xs text-cream-400 tabular-nums shrink-0">
              {formatDuration(item.duration)}
            </span>
          )}
        </div>
      </div>

      {/* Vote button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={onVote}
            className={cn(
              'h-8 w-auto min-w-8 gap-1 px-2 text-xs shrink-0',
              selfVoted
                ? 'text-ember-400 hover:text-ember-300'
                : 'text-cream-400 hover:text-cream-200',
            )}
            aria-label={selfVoted ? 'remove vote' : 'upvote'}
          >
            <TriangleIcon
              className={cn('size-3', selfVoted && 'fill-ember-400')}
            />
            <span>{item.votes.length}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {selfVoted ? 'remove your vote' : 'upvote this one'}
        </TooltipContent>
      </Tooltip>

      {/* Control actions — appear on hover */}
      <div
        className={cn(
          'flex items-center gap-0.5 shrink-0',
          'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
          isNowPlaying && 'opacity-100', // always show equalizer when playing
        )}
      >
        {isNowPlaying ? (
          <EqualizerBars />
        ) : (
          <>
            {canControlRoom && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={onPlay}
                      className="h-7 w-7 text-ember-400/70 hover:text-ember-300"
                      aria-label="play now"
                    >
                      <Play className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>play now</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={onMoveUp}
                      disabled={index === 0}
                      className="h-7 w-7 text-cream-400/70 hover:text-cream-200 disabled:opacity-30"
                      aria-label="move up"
                    >
                      <ChevronUp className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>move up</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={onMoveDown}
                      disabled={index === totalItems - 1}
                      className="h-7 w-7 text-cream-400/70 hover:text-cream-200 disabled:opacity-30"
                      aria-label="move down"
                    >
                      <ChevronDown className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>move down</TooltipContent>
                </Tooltip>
              </>
            )}

            {canRemove && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onRemove}
                    className="h-7 w-7 text-cream-400/70 hover:text-coal-red hover:bg-coal-red/10"
                    aria-label="remove"
                  >
                    <X className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>remove</TooltipContent>
              </Tooltip>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Empty state — cozy, not void
// ---------------------------------------------------------------------------

function EmptyState() {
  const { send, state, canControl } = useRoom();

  if (!state) return null;

  const { settings } = state;
  const canAdd = settings.guestsCanAddToQueue || canControl;

  function quickAdd(type: 'mp4' | 'hls' | 'youtube') {
    if (!canAdd) return;
    const entries: Array<{
      type: 'youtube' | 'direct-url';
      source: string;
      title: string;
      thumbnail?: string;
    }> = [
      {
        type: 'direct-url',
        source: SAMPLE_VIDEOS.mp4,
        title: 'Big Buck Bunny (MP4)',
      },
      {
        type: 'direct-url',
        source: SAMPLE_VIDEOS.hls,
        title: 'Mux Test Stream (HLS)',
      },
      {
        type: 'youtube',
        source: SAMPLE_VIDEOS.youtube,
        title: 'Big Buck Bunny (YouTube)',
        thumbnail: (() => {
          const parsed = parseYouTubeUrl(SAMPLE_VIDEOS.youtube);
          return parsed ? youTubeThumbnail(parsed.videoId) : undefined;
        })(),
      },
    ];
    const entry = type === 'mp4' ? entries[0] : type === 'hls' ? entries[1] : entries[2];
    send({ type: 'queue:add', item: entry });
  }

  return (
    <div className="flex flex-col items-center gap-5 py-10 px-4 text-center">
      {/* Cozy doodle */}
      <div className="text-4xl leading-none select-none" aria-hidden>
        📺
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-cream-300">
          the queue is empty…
        </p>
        <p className="text-xs text-cream-400">
          someone do something 👀
        </p>
      </div>

      {canAdd ? (
        <div className="flex flex-wrap gap-2 justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => quickAdd('mp4')}
            className="text-xs border-couch-650 text-cream-300 hover:border-ember-500/40 hover:text-ember-300 hover:bg-ember-500/8 transition-all duration-200"
          >
            🐰 Big Buck Bunny
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => quickAdd('hls')}
            className="text-xs border-couch-650 text-cream-300 hover:border-ember-500/40 hover:text-ember-300 hover:bg-ember-500/8 transition-all duration-200"
          >
            📡 Mux HLS stream
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => quickAdd('youtube')}
            className="text-xs border-couch-650 text-cream-300 hover:border-ember-500/40 hover:text-ember-300 hover:bg-ember-500/8 transition-all duration-200"
          >
            ▶️ YouTube sample
          </Button>
        </div>
      ) : (
        <p className="text-xs text-cream-400/70 italic">
          the host turned off guest adds
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// QueuePanel — the main export
// ---------------------------------------------------------------------------

export function QueuePanel() {
  const { state, selfId, canControl, send } = useRoom();
  const [dialogOpen, setDialogOpen] = React.useState(false);

  if (!state) return null;

  const { queue, media, settings } = state;
  const canAdd = settings.guestsCanAddToQueue || canControl;

  return (
    <>
      <Card className="flex flex-col h-full overflow-hidden border-couch-650 shadow-[var(--shadow-lifted)]">
        {/* Header */}
        <CardHeader className="flex-row items-center justify-between py-3 px-4 border-b border-couch-700 shrink-0 gap-0">
          <div className="flex items-center gap-2.5">
            {/* Icon in a small tinted circle */}
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-ember-500/12 text-ember-400 shrink-0">
              <ListVideo className="size-3.5" />
            </div>
            <CardTitle className="text-sm font-semibold font-display tracking-wide text-cream-100">
              up next
            </CardTitle>
            {queue.length > 0 && (
              <Badge
                variant="outline"
                className="h-5 min-w-5 px-1.5 text-[10px] tabular-nums border-couch-650 text-cream-400 font-normal"
              >
                {queue.length}
              </Badge>
            )}
          </div>

          {/* Add button */}
          {canAdd ? (
            <Button
              variant="accent"
              size="sm"
              onClick={() => setDialogOpen(true)}
              className="gap-1.5 h-7 px-3 text-xs"
            >
              <Plus className="size-3" />
              add
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>
                  <Button
                    variant="accent"
                    size="sm"
                    disabled
                    className="gap-1.5 h-7 px-3 text-xs pointer-events-none"
                  >
                    <Plus className="size-3" />
                    add
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>the host turned off guest adds</TooltipContent>
            </Tooltip>
          )}
        </CardHeader>

        {/* Scrollable list */}
        <CardContent className="flex-1 overflow-y-auto p-2 min-h-0">
          {queue.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="flex flex-col gap-0.5 py-1">
              <AnimatePresence initial={false}>
                {queue.map((item, index) => {
                  const isNowPlaying = item.id === media.queueItemId;
                  const selfVoted = item.votes.includes(selfId);

                  return (
                    <QueueRow
                      key={item.id}
                      item={item}
                      index={index}
                      totalItems={queue.length}
                      isNowPlaying={isNowPlaying}
                      selfId={selfId}
                      canControlRoom={canControl}
                      selfVoted={selfVoted}
                      onPlay={() =>
                        send({ type: 'queue:play', itemId: item.id })
                      }
                      onMoveUp={() =>
                        send({
                          type: 'queue:move',
                          itemId: item.id,
                          toIndex: index - 1,
                        })
                      }
                      onMoveDown={() =>
                        send({
                          type: 'queue:move',
                          itemId: item.id,
                          toIndex: index + 1,
                        })
                      }
                      onRemove={() =>
                        send({ type: 'queue:remove', itemId: item.id })
                      }
                      onVote={() =>
                        send({ type: 'queue:vote', itemId: item.id })
                      }
                    />
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </CardContent>
      </Card>

      <AddToQueueDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}

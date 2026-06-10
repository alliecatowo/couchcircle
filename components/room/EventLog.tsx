'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRoom } from '@/lib/realtime/room-context';
import type { RoomEventKind } from '@/shared/protocol';
import { cn, formatRelativeTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// ─── Filter config ──────────────────────────────────────────────────────────

type FilterId = 'all' | 'media' | 'sesh' | 'people';

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'all' },
  { id: 'media', label: 'media' },
  { id: 'sesh', label: 'sesh' },
  { id: 'people', label: 'people' },
];

/**
 * "people" = join + leave + status + ready + remote
 * "media"  = media + queue
 * "sesh"   = sesh
 * "all"    = everything
 */
const KIND_TO_FILTER: Record<RoomEventKind, FilterId> = {
  join: 'people',
  leave: 'people',
  status: 'people',
  ready: 'people',
  remote: 'people',
  media: 'media',
  queue: 'media',
  sesh: 'sesh',
  system: 'all',
};

function matchesFilter(kind: RoomEventKind, filter: FilterId): boolean {
  if (filter === 'all') return true;
  // 'system' events only appear under the 'all' filter
  if (kind === 'system') return false;
  return KIND_TO_FILTER[kind] === filter;
}

// ─── Default emoji by kind ───────────────────────────────────────────────────

const KIND_EMOJI: Record<RoomEventKind, string> = {
  join: '🛋️',
  leave: '🌙',
  status: '😌',
  ready: '🟢',
  remote: '📺',
  media: '🎬',
  queue: '📋',
  sesh: '🔥',
  system: '💬',
};

// Tinted circle bg class per kind
const KIND_BG: Record<RoomEventKind, string> = {
  join: 'bg-moss-900/60',
  leave: 'bg-haze-900/60',
  status: 'bg-couch-750/60',
  ready: 'bg-moss-900/60',
  remote: 'bg-ember-900/40',
  media: 'bg-ember-900/40',
  queue: 'bg-couch-750/60',
  sesh: 'bg-haze-900/60',
  system: 'bg-couch-750/60',
};

// ─── Component ───────────────────────────────────────────────────────────────

export function EventLog() {
  const { state, serverNow } = useRoom();
  const [filter, setFilter] = React.useState<FilterId>('all');

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [isStuck, setIsStuck] = React.useState(true);
  const [showJumpChip, setShowJumpChip] = React.useState(false);
  const prevEventCountRef = React.useRef(0);

  const events = state?.events ?? [];

  const filtered = React.useMemo(
    () => events.filter((e) => matchesFilter(e.kind, filter)),
    [events, filter],
  );

  // Detect new events when unstuck
  React.useEffect(() => {
    const newCount = filtered.length;
    if (newCount > prevEventCountRef.current && !isStuck) {
      setShowJumpChip(true);
    }
    prevEventCountRef.current = newCount;
  }, [filtered.length, isStuck]);

  // Auto-scroll when stuck
  React.useEffect(() => {
    if (isStuck && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered, isStuck]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setIsStuck(atBottom);
    if (atBottom) setShowJumpChip(false);
  }

  function jumpToBottom() {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
    setShowJumpChip(false);
    setIsStuck(true);
  }

  // For relative time ticking — re-render every 30s
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Suppress unused warning — serverNow is imported per contract
  void serverNow;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Filter chips — small rounded toggles */}
      <div className="flex shrink-0 gap-1.5 px-3 pb-2 pt-2.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              'rounded-full px-2.5 py-1 text-[11px] font-medium',
              'transition-all duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-500',
              filter === f.id
                ? 'bg-ember-500/20 text-ember-300 shadow-[inset_0_0_0_1px_rgba(240,139,52,0.35)]'
                : 'text-cream-400 bg-couch-800/60 border border-couch-700/60 hover:bg-couch-750 hover:text-cream-200',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Scroll area */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex h-full flex-col gap-px overflow-y-auto px-2 pb-3 scrollbar-thin"
        >
          {filtered.length === 0 && (
            <p className="mt-8 text-center text-xs text-cream-400/50">
              nothing here yet… the night is young
            </p>
          )}

          <AnimatePresence initial={false}>
            {filtered.map((event) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="group flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-couch-750/40 transition-colors duration-150"
              >
                {/* Emoji in a small tinted circle */}
                <div
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-xs',
                    KIND_BG[event.kind] ?? 'bg-couch-750/60',
                  )}
                  aria-hidden
                >
                  {event.emoji ?? KIND_EMOJI[event.kind] ?? '•'}
                </div>

                {/* Text + time */}
                <div className="min-w-0 flex-1 flex items-baseline gap-1.5 flex-wrap">
                  <span className="break-words text-xs leading-relaxed text-cream-300">
                    {event.text}
                  </span>
                  {/* Timestamp — visible on hover only */}
                  <span className="text-[10px] text-cream-400/40 opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0">
                    {formatRelativeTime(event.ts)}
                  </span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Jump-to-bottom chip */}
        <AnimatePresence>
          {showJumpChip && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-4 left-0 right-0 flex justify-center"
            >
              <Button
                variant="default"
                size="sm"
                onClick={jumpToBottom}
                className="h-7 rounded-full border-couch-650 px-3 text-xs shadow-[var(--shadow-lifted)]"
              >
                new activity ↓
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

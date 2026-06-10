'use client';

/**
 * BottomSheet — the portrait-mobile side table (SPRINT2 §6, Workflow B).
 *
 * On desktop the "up next" queue and the chat/activity panel live in a right-hand
 * side column. On a phone there's no room for that — so they become a SWIPEABLE
 * bottom sheet that the thumb drags between three snap points:
 *
 *   peek  — a grab handle + the active tab's header peeking over the remote bar
 *   half  — half the screen (read chat while half-watching)
 *   full  — nearly full screen (browse the queue, scroll activity)
 *
 * Pure framer-motion drag (no extra deps): the sheet is a fixed panel translated
 * up from the bottom; dragging on the handle/header moves it, and on release it
 * snaps to the nearest point (with a velocity flick override). Tapping the handle
 * cycles peek → half → full → peek so it's usable without a precise drag.
 *
 * Tabs: up next (QueuePanel) · chat (ChatPanel) · activity (EventLog). All are
 * zero-prop sibling components rendered inside — importing siblings is expected.
 */

import * as React from 'react';
import {
  motion,
  useMotionValue,
  animate,
  type PanInfo,
} from 'framer-motion';
import { ListVideo, MessageSquare, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRoom } from '@/lib/realtime/room-context';
import { QueuePanel } from '@/components/room/QueuePanel';
import { ChatPanel } from '@/components/room/ChatPanel';
import { EventLog } from '@/components/room/EventLog';

type Snap = 'peek' | 'half' | 'full';
type SheetTab = 'queue' | 'chat' | 'activity';

// How tall the sheet is at each snap, as a fraction of its travel container.
// `peek` leaves only the handle + tab bar visible above the remote bar.
const SNAP_FRACTION: Record<Snap, number> = {
  peek: 0.0,
  half: 0.5,
  full: 0.92,
};

const SNAP_ORDER: Snap[] = ['peek', 'half', 'full'];

/** Spring used for snapping — cozy, never frantic (DESIGN §4). */
const SNAP_SPRING = { type: 'spring' as const, stiffness: 420, damping: 38 };

// The peek height (px): handle + tab bar. The sheet body lives below this and is
// what `full`/`half` reveal. Kept generous so tap targets clear 44px.
const PEEK_PX = 96;

interface TabDef {
  id: SheetTab;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const TABS: TabDef[] = [
  { id: 'queue', label: 'up next', Icon: ListVideo },
  { id: 'chat', label: 'chat', Icon: MessageSquare },
  { id: 'activity', label: 'activity', Icon: Activity },
];

export function BottomSheet() {
  const { state } = useRoom();

  const [snap, setSnap] = React.useState<Snap>('peek');
  const [tab, setTab] = React.useState<SheetTab>('chat');

  // Travel space: the sheet can rise up to (containerHeight - PEEK_PX). We
  // translate the panel by a negative Y from its resting (peek) position.
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [travel, setTravel] = React.useState(0);
  const y = useMotionValue(0); // 0 = peek (resting); negative = raised

  // Measure the travel area so snap fractions resolve to real pixels.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const h = el.clientHeight;
      setTravel(Math.max(0, h - PEEK_PX));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Target Y (negative) for a given snap point.
  const snapY = React.useCallback(
    (s: Snap) => -travel * SNAP_FRACTION[s],
    [travel],
  );

  // Animate to a snap whenever the snap state or travel changes.
  React.useEffect(() => {
    const controls = animate(y, snapY(snap), SNAP_SPRING);
    return controls.stop;
  }, [snap, snapY, y]);

  function nearestSnap(currentY: number, velocityY: number): Snap {
    // Velocity flick: a firm drag past threshold jumps a step in its direction.
    if (velocityY < -550) {
      const i = SNAP_ORDER.indexOf(snap);
      return SNAP_ORDER[Math.min(SNAP_ORDER.length - 1, i + 1)];
    }
    if (velocityY > 550) {
      const i = SNAP_ORDER.indexOf(snap);
      return SNAP_ORDER[Math.max(0, i - 1)];
    }
    // Otherwise snap to whichever point's Y is closest.
    let best: Snap = 'peek';
    let bestDist = Infinity;
    for (const s of SNAP_ORDER) {
      const d = Math.abs(currentY - snapY(s));
      if (d < bestDist) {
        bestDist = d;
        best = s;
      }
    }
    return best;
  }

  function handleDragEnd(_e: unknown, info: PanInfo) {
    const next = nearestSnap(y.get(), info.velocity.y);
    setSnap(next);
  }

  // Tapping the handle cycles peek → half → full → peek (no-drag affordance).
  function cycleSnap() {
    const i = SNAP_ORDER.indexOf(snap);
    setSnap(SNAP_ORDER[(i + 1) % SNAP_ORDER.length]);
  }

  // Picking a tab while collapsed gently raises the sheet so content is visible.
  function pickTab(next: SheetTab) {
    setTab(next);
    if (snap === 'peek') setSnap('half');
  }

  // Unread dots: compare current counts to last-seen when this tab was open.
  const chatCount = state?.chat.length ?? 0;
  const eventCount = state?.events.length ?? 0;
  const seenChat = React.useRef(chatCount);
  const seenEvents = React.useRef(eventCount);
  const [unreadChat, setUnreadChat] = React.useState(false);
  const [unreadActivity, setUnreadActivity] = React.useState(false);
  const visible = snap !== 'peek';

  React.useEffect(() => {
    if (tab === 'chat' && visible) {
      seenChat.current = chatCount;
      setUnreadChat(false);
    } else if (chatCount > seenChat.current) {
      setUnreadChat(true);
    }
  }, [chatCount, tab, visible]);

  React.useEffect(() => {
    if (tab === 'activity' && visible) {
      seenEvents.current = eventCount;
      setUnreadActivity(false);
    } else if (eventCount > seenEvents.current) {
      setUnreadActivity(true);
    }
  }, [eventCount, tab, visible]);

  return (
    // Travel container — absolutely fills the mobile content area. The sheet's
    // resting position pins its handle + tabs PEEK_PX above the bottom; dragging
    // raises it. pointer-events only on the sheet itself so the TV stays tappable.
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 z-30 overflow-hidden"
      aria-hidden={false}
    >
      <motion.div
        style={{ y, top: `calc(100% - ${PEEK_PX}px)`, height: '100%' }}
        drag="y"
        dragConstraints={{ top: -travel, bottom: 0 }}
        dragElastic={0.04}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        className={cn(
          'pointer-events-auto absolute inset-x-0',
          'flex flex-col rounded-t-3xl border-t border-x border-couch-650',
          'bg-couch-850/95 backdrop-blur-md shadow-[var(--shadow-lifted)]',
        )}
      >
        {/* ── grab handle (drag + tap-to-cycle) ───────────────────────── */}
        <button
          type="button"
          onClick={cycleSnap}
          className="flex w-full shrink-0 cursor-grab touch-none flex-col items-center gap-2 pb-1 pt-2.5 active:cursor-grabbing"
          aria-label={`bottom sheet — ${snap}, tap to expand`}
        >
          <span className="h-1.5 w-10 rounded-full bg-couch-600 animate-handle-hint" />
        </button>

        {/* ── tab bar ─────────────────────────────────────────────────── */}
        <div className="shrink-0 px-3 pb-2">
          <div className="flex gap-1 rounded-2xl border border-couch-700/60 bg-couch-900/70 p-1">
            {TABS.map(({ id, label, Icon }) => {
              const active = tab === id;
              const showDot =
                (id === 'chat' && unreadChat && !(tab === 'chat' && visible)) ||
                (id === 'activity' &&
                  unreadActivity &&
                  !(tab === 'activity' && visible));
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => pickTab(id)}
                  className={cn(
                    'relative flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2',
                    'text-sm font-medium transition-colors duration-200',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-500',
                    active
                      ? 'bg-couch-750 text-cream-100 shadow-[inset_0_0_0_1px_rgba(240,139,52,0.2)]'
                      : 'text-cream-400 hover:text-cream-200',
                  )}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className="size-4" />
                  <span>{label}</span>
                  {showDot && (
                    <span
                      className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-ember-400 shadow-[0_0_4px_1px_rgba(242,168,80,0.7)]"
                      aria-hidden
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── tab content — each fills the revealed body, scrolls itself ── */}
        <div className="min-h-0 flex-1 overflow-hidden px-2 pb-2">
          <div className={cn('h-full', tab === 'queue' ? 'block' : 'hidden')}>
            <QueuePanel />
          </div>
          <div
            className={cn(
              'h-full flex-col',
              tab === 'chat' ? 'flex' : 'hidden',
            )}
          >
            <ChatPanel />
          </div>
          <div
            className={cn(
              'h-full flex-col',
              tab === 'activity' ? 'flex' : 'hidden',
            )}
          >
            <EventLog />
          </div>
        </div>

        {/* home-indicator clearance */}
        <div className="h-safe-bottom shrink-0" aria-hidden />
      </motion.div>
    </div>
  );
}

'use client';

/**
 * TheaterGallery — the peanut gallery / the back row (SPRINT2 §9).
 *
 * In theater mode (and always on the projector) the crew never disappears: they
 * become a silhouette strip along the bottom edge — small dark avatars of the
 * CONNECTED crew, in seat order, at low opacity with their idle sway preserved.
 * Over those silhouettes we layer the living-room signals:
 *
 *  - chat → a canon speech bubble pops above the speaker's silhouette (~6s fade,
 *    ≤3 concurrent across the whole gallery)
 *  - reactions → the emoji floats up from its sender's silhouette
 *  - a vibe change → the new status emoji flashes briefly above the silhouette
 *
 * Sesh moments (§8) play over everything else (handled by MomentLayer, not here).
 *
 * The strip honours `galleryVisible` from {@link useTheater} (a purist can hide
 * it via the floating pill) but is NEVER hidden by `chromeVisible` — the gallery
 * IS the cozy. Pointer-events are off so it can sit over a full-bleed picture
 * without stealing taps from the stage.
 */

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRoom } from '@/lib/realtime/room-context';
import { useTheater } from '@/lib/theater';
import { orderByJoin } from '@/components/room/seating/seat-map';
import { AvatarSprite, statusToMood } from '@/components/avatars';
import { STATUS_META } from '@/shared/constants';
import { cn } from '@/lib/utils';
import type { ChatMessage, Participant } from '@/shared/protocol';

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

/** A chat bubble lingers this long above the silhouette before fading (§9). */
const CHAT_VISIBLE_MS = 6_000;
/** Never show more than this many bubbles at once (§9). */
const MAX_BUBBLES = 3;
/** A bubble's text is clipped to this many chars. */
const BUBBLE_CAP = 80;
/** A vibe-change emoji flashes for this long above the silhouette. */
const VIBE_FLASH_MS = 1_800;

// ---------------------------------------------------------------------------
// Speech bubbles — last few chat lines, keyed to their author's silhouette
// ---------------------------------------------------------------------------

interface ActiveBubble {
  id: string; // chat message id
  authorId: string;
  text: string;
  firstSeen: number;
}

/**
 * Track the newest chat messages and surface up to {@link MAX_BUBBLES} of them as
 * speech bubbles. Bubbles age out after {@link CHAT_VISIBLE_MS}; we keep a
 * first-seen map so a message that arrived in a prior render still expires on
 * time (and so re-renders don't reset the clock).
 */
function useGalleryBubbles(chat: readonly ChatMessage[]): ActiveBubble[] {
  const firstSeenRef = React.useRef(new Map<string, number>());
  const [, forceTick] = React.useState(0);

  // Mark first-seen for any new message ids.
  React.useEffect(() => {
    const now = Date.now();
    let added = false;
    for (const msg of chat) {
      if (!firstSeenRef.current.has(msg.id)) {
        firstSeenRef.current.set(msg.id, now);
        added = true;
      }
    }
    if (added) forceTick((n) => n + 1);
  }, [chat]);

  // Tick so bubbles fade on schedule even without new chat / state.
  React.useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 1_000);
    return () => clearInterval(t);
  }, []);

  return React.useMemo(() => {
    const now = Date.now();
    const fresh: ActiveBubble[] = [];
    for (const msg of chat) {
      const firstSeen = firstSeenRef.current.get(msg.id);
      if (firstSeen == null) continue;
      if (now - firstSeen >= CHAT_VISIBLE_MS) continue;
      const text =
        msg.text.length > BUBBLE_CAP ? `${msg.text.slice(0, BUBBLE_CAP - 1)}…` : msg.text;
      fresh.push({ id: msg.id, authorId: msg.authorId, text, firstSeen });
    }
    // newest first, capped
    fresh.sort((a, b) => b.firstSeen - a.firstSeen);
    return fresh.slice(0, MAX_BUBBLES);
    // recompute on chat changes and on the tick (forceTick re-renders the hook)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat]);
}

// ---------------------------------------------------------------------------
// Vibe-change flashes — diff each participant's status, flash the new emoji
// ---------------------------------------------------------------------------

interface VibeFlash {
  key: string;
  participantId: string;
  emoji: string;
}

function useVibeFlashes(connected: Participant[]): VibeFlash[] {
  const prevStatus = React.useRef(new Map<string, string>());
  const [flashes, setFlashes] = React.useState<VibeFlash[]>([]);

  React.useEffect(() => {
    const next: VibeFlash[] = [];
    for (const p of connected) {
      const prev = prevStatus.current.get(p.id);
      if (prev !== undefined && prev !== p.status) {
        next.push({
          key: `${p.id}:${p.status}:${Date.now()}`,
          participantId: p.id,
          emoji: STATUS_META[p.status].emoji,
        });
      }
      prevStatus.current.set(p.id, p.status);
    }
    // prune ids that left
    const live = new Set(connected.map((p) => p.id));
    for (const id of [...prevStatus.current.keys()]) {
      if (!live.has(id)) prevStatus.current.delete(id);
    }
    if (next.length === 0) return;
    setFlashes((cur) => [...cur, ...next]);
    const timer = setTimeout(() => {
      setFlashes((cur) => cur.filter((f) => !next.some((n) => n.key === f.key)));
    }, VIBE_FLASH_MS);
    return () => clearTimeout(timer);
  }, [connected]);

  return flashes;
}

// ---------------------------------------------------------------------------
// One silhouette in the back row
// ---------------------------------------------------------------------------

function Silhouette({
  participant,
  bubble,
  reactions,
  vibe,
}: {
  participant: Participant;
  bubble: ActiveBubble | undefined;
  reactions: { key: string; emoji: string }[];
  vibe: VibeFlash | undefined;
}) {
  const mood = statusToMood(participant.status);

  return (
    <div className="relative flex shrink-0 flex-col items-center justify-end">
      {/* stuff that floats ABOVE the head: bubble + vibe flash + reactions */}
      <div className="pointer-events-none absolute bottom-full left-1/2 mb-1 flex w-0 -translate-x-1/2 flex-col items-center justify-end">
        {/* reactions rise from the silhouette */}
        <AnimatePresence>
          {reactions.map((r) => (
            <motion.span
              key={r.key}
              className="absolute bottom-0 select-none text-xl drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
              initial={{ opacity: 0, y: 6, scale: 0.6 }}
              animate={{ opacity: [0, 1, 1, 0], y: -90, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2.8, ease: [0.22, 1, 0.36, 1] }}
            >
              {r.emoji}
            </motion.span>
          ))}
        </AnimatePresence>

        {/* vibe-change emoji flash */}
        <AnimatePresence>
          {vibe && (
            <motion.span
              key={vibe.key}
              className="absolute bottom-6 select-none text-base"
              initial={{ opacity: 0, scale: 0.4, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.4, y: -4 }}
              transition={{ duration: 0.22, ease: [0.34, 1.56, 0.64, 1] }}
            >
              {vibe.emoji}
            </motion.span>
          )}
        </AnimatePresence>

        {/* speech bubble — canon style (rounded, tail bottom-left) */}
        <AnimatePresence>
          {bubble && (
            <motion.div
              key={bubble.id}
              initial={{ opacity: 0, scale: 0.85, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                'mb-1 max-w-[10rem] whitespace-normal break-words rounded-xl rounded-bl-sm px-2.5 py-1.5',
                'bg-couch-800/95 border border-couch-650 shadow-[var(--shadow-lifted)] backdrop-blur-sm',
                'text-[11px] font-body leading-snug text-cream-100',
              )}
            >
              <span
                className="mr-1 font-semibold"
                style={{ color: participant.accent }}
              >
                {participant.name}
              </span>
              {bubble.text}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* the silhouette itself — dark, low opacity, idle sway preserved by
          AvatarSprite. A near-black tint sits over it so it reads as a
          back-of-the-room shadow, not a bright sprite. */}
      <div className="relative opacity-40 [filter:brightness(0.32)_saturate(0.7)]">
        <AvatarSprite
          avatar={participant.avatar}
          accent={participant.accent}
          mood={mood}
          size={44}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TheaterGallery
// ---------------------------------------------------------------------------

export function TheaterGallery() {
  const { state, reactions } = useRoom();
  const { galleryVisible } = useTheater();

  // connected crew in seat order (join order === seat order, §4)
  const connected = React.useMemo<Participant[]>(() => {
    if (!state) return [];
    return orderByJoin(state.participants).filter((p) => p.connected);
  }, [state]);

  const chat = state?.chat ?? [];
  const bubbles = useGalleryBubbles(chat);
  const vibeFlashes = useVibeFlashes(connected);

  // index reactions + bubbles + vibe flashes by participant id
  const reactionsByAuthor = React.useMemo(() => {
    const map = new Map<string, { key: string; emoji: string }[]>();
    for (const r of reactions) {
      const arr = map.get(r.fromId) ?? [];
      arr.push({ key: r.key, emoji: r.emoji });
      map.set(r.fromId, arr);
    }
    return map;
  }, [reactions]);

  const bubbleByAuthor = React.useMemo(() => {
    const map = new Map<string, ActiveBubble>();
    // bubbles are newest-first; keep the newest per author
    for (const b of bubbles) {
      if (!map.has(b.authorId)) map.set(b.authorId, b);
    }
    return map;
  }, [bubbles]);

  const vibeByAuthor = React.useMemo(() => {
    const map = new Map<string, VibeFlash>();
    for (const v of vibeFlashes) map.set(v.participantId, v);
    return map;
  }, [vibeFlashes]);

  if (!galleryVisible || connected.length === 0) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex max-h-[16%] items-end justify-center gap-2 px-3 pb-1 sm:gap-4"
    >
      {/* a faint gradient floor so the silhouettes feel rooted to the bottom
          letterbox edge rather than floating */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-full bg-gradient-to-t from-couch-950/70 to-transparent"
        aria-hidden
      />
      {connected.map((p) => (
        <Silhouette
          key={p.id}
          participant={p}
          bubble={bubbleByAuthor.get(p.id)}
          reactions={reactionsByAuthor.get(p.id) ?? []}
          vibe={vibeByAuthor.get(p.id)}
        />
      ))}
    </div>
  );
}

'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useRoom } from '@/lib/realtime/room-context';
import { STATUS_META } from '@/shared/constants';
import { StatusPicker } from './StatusPicker';
import type { Participant, ChatMessage, RoomEvent } from '@/shared/protocol';
// AvatarSprite and statusToMood come from the avatars sibling task (§13 contract).
import { AvatarSprite, statusToMood } from '@/components/avatars';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParticipantAvatarProps {
  participant: Participant;
  size?: 'sm' | 'md' | 'lg';
}

// ---------------------------------------------------------------------------
// Size map
// ---------------------------------------------------------------------------

const SIZE_PX: Record<'sm' | 'md' | 'lg', number> = {
  sm: 56,
  md: 88,
  lg: 104,
};

// Milliseconds a chat snippet remains visible
const CHAT_VISIBLE_MS = 6_000;
// Character cap for the speech bubble
const CHAT_BUBBLE_CAP = 60;

// ---------------------------------------------------------------------------
// Local chat tracking
// We keep a module-level map so multiple avatar instances can all share the
// same first-seen timestamps without a React context.
// ---------------------------------------------------------------------------
const chatFirstSeen = new Map<string, number>();

function useChatSnippet(participantId: string): string | null {
  const { state } = useRoom();
  const [snippet, setSnippet] = React.useState<string | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (!state) return;

    // Find the most recent chat message from this participant
    let latest: ChatMessage | null = null;
    for (const msg of state.chat) {
      if (msg.authorId === participantId) {
        if (!latest || msg.ts > latest.ts) latest = msg;
      }
    }

    if (!latest) {
      setSnippet(null);
      return;
    }

    // Record the first local time we ever saw this message id
    if (!chatFirstSeen.has(latest.id)) {
      chatFirstSeen.set(latest.id, Date.now());
    }

    const firstSeen = chatFirstSeen.get(latest.id)!;
    const age = Date.now() - firstSeen;

    if (age >= CHAT_VISIBLE_MS) {
      setSnippet(null);
      return;
    }

    const text = latest.text.length > CHAT_BUBBLE_CAP
      ? latest.text.slice(0, CHAT_BUBBLE_CAP - 1) + '…'
      : latest.text;

    setSnippet(text);

    // Schedule auto-hide
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setSnippet(null), CHAT_VISIBLE_MS - age);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state, participantId]);

  return snippet;
}

// ---------------------------------------------------------------------------
// Synchronized ritual poses (SPRINT2 §8 + §12)
//
// On a ritual payoff event the crew plays a brief overlay emote above each head:
//   hit (toke spark)  → 💨   on the rotation members
//   raise (drink/clink) → 🥂  on everyone in the circle
//   cheer (bingo / ready) → 🎉 on everyone
// We diff state.events by id at the module level (shared across all avatar
// instances) and stamp a per-participant pose with a TTL the components read.
// ---------------------------------------------------------------------------

type Pose = 'hit' | 'raise' | 'cheer';

const POSE_EMOTE: Record<Pose, string> = {
  hit: '💨',
  raise: '🥂',
  cheer: '🎉',
};

const POSE_TTL_MS = 1500;

// participantId → { pose, until } — module-level so every avatar shares the stamp.
const poseStamps = new Map<string, { pose: Pose; until: number }>();
// events we've already turned into poses.
const seenPoseEventIds = new Set<string>();
let poseInitialized = false;
// subscribers re-render when a new pose lands.
const poseListeners = new Set<() => void>();

function notifyPoses() {
  for (const l of poseListeners) l();
}

function stampPose(id: string, pose: Pose) {
  poseStamps.set(id, { pose, until: Date.now() + POSE_TTL_MS });
}

/**
 * Turn a fresh event into ritual poses across the relevant crew. Returns true when
 * anything was stamped (so the caller can notify + schedule a clear).
 */
function applyEventPoses(evt: RoomEvent, connectedIds: string[]): boolean {
  const text = evt.text ?? '';
  const lower = text.toLowerCase();
  const emoji = evt.emoji ?? '';

  // toke spark zero → everyone who sparked hits — "💨 BLAZE IT …"
  if (text.includes('BLAZE IT') || emoji === '💨') {
    for (const id of connectedIds) stampPose(id, 'hit');
    return true;
  }
  // individual hit — "💨 {name} is hitting it" (actorId present)
  if (evt.kind === 'sesh' && emoji === '💨' && evt.actorId) {
    stampPose(evt.actorId, 'hit');
    return true;
  }
  // toast clink → the whole circle raises — "🥂 CLINK …"
  if (text.includes('CLINK') || (emoji === '🥂' && lower.includes('raised'))) {
    for (const id of connectedIds) stampPose(id, 'raise');
    return true;
  }
  // everyone's ready → cheer
  if (lower.includes('ready') && lower.includes('everyone')) {
    for (const id of connectedIds) stampPose(id, 'cheer');
    return true;
  }
  // movie bingo → cheer
  if (text.includes('BINGO')) {
    for (const id of connectedIds) stampPose(id, 'cheer');
    return true;
  }
  return false;
}

/** Subscribe one avatar instance to its own current pose (or null). */
function useRitualPose(participantId: string): Pose | null {
  const { state } = useRoom();
  const [, force] = React.useReducer((n: number) => n + 1, 0);

  // Drive event diffing from a single shared place — every instance runs it, but
  // the seen-set + initialized guard make it idempotent.
  React.useEffect(() => {
    if (!state) return;
    const listener = () => force();
    poseListeners.add(listener);

    const connectedIds = Object.values(state.participants)
      .filter((p) => p.connected)
      .map((p) => p.id);

    if (!poseInitialized) {
      for (const evt of state.events) seenPoseEventIds.add(evt.id);
      poseInitialized = true;
      return () => {
        poseListeners.delete(listener);
      };
    }

    let stamped = false;
    for (const evt of state.events) {
      if (seenPoseEventIds.has(evt.id)) continue;
      seenPoseEventIds.add(evt.id);
      if (applyEventPoses(evt, connectedIds)) stamped = true;
    }
    if (stamped) {
      notifyPoses();
      // clear after the TTL so the emote fades
      window.setTimeout(notifyPoses, POSE_TTL_MS + 50);
    }

    return () => {
      poseListeners.delete(listener);
    };
  }, [state]);

  const stamp = poseStamps.get(participantId);
  if (stamp && stamp.until > Date.now()) return stamp.pose;
  return null;
}

// ---------------------------------------------------------------------------
// StatusBubble — small pill shown above the avatar
// ---------------------------------------------------------------------------

function StatusBubble({ status, accent }: { status: Participant['status']; accent: string }) {
  const meta = STATUS_META[status];
  return (
    // Key on status so AnimatePresence gives us a pop-in each time it changes
    <AnimatePresence mode="wait">
      <motion.div
        key={status}
        initial={{ opacity: 0, scale: 0.5, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.5, y: 6 }}
        transition={{ duration: 0.24, ease: [0.34, 1.56, 0.64, 1] }}
        className={cn(
          'flex items-center gap-1 rounded-full px-2 py-0.5',
          'bg-couch-800/95 border',
          'text-[10px] font-body font-medium text-cream-200 leading-none whitespace-nowrap',
          'shadow-[var(--shadow-couch)]',
          // gentle float so the chip feels alive
          'animate-float-bob',
        )}
        style={{
          borderColor: accent,
          animationDuration: '3.8s',
        }}
      >
        <span className="text-xs leading-none" aria-hidden="true">{meta.emoji}</span>
        <span className="leading-none">{meta.label}</span>
      </motion.div>
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// ChatBubble — ephemeral speech bubble
// ---------------------------------------------------------------------------

function ChatBubble({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 2 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'max-w-[120px] rounded-xl rounded-bl-sm px-2 py-1',
        'bg-couch-750 border border-couch-650 shadow-[var(--shadow-couch)]',
        'text-[10px] font-body text-cream-200 leading-snug break-words',
      )}
    >
      {text}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// PoseEmote — the synchronized ritual emote that pops above the head
// ---------------------------------------------------------------------------

function PoseEmote({ pose }: { pose: Pose }) {
  return (
    <motion.span
      className="pointer-events-none absolute -top-2 z-30 select-none text-xl leading-none"
      initial={{ opacity: 0, scale: 0.5, y: 4 }}
      animate={{ opacity: [0, 1, 1, 0], scale: [0.5, 1.25, 1, 1], y: [4, -6, -8, -12] }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 1.4, times: [0, 0.25, 0.7, 1], ease: 'easeOut' }}
      aria-hidden
    >
      {POSE_EMOTE[pose]}
    </motion.span>
  );
}

// ---------------------------------------------------------------------------
// ParticipantAvatar
// ---------------------------------------------------------------------------

export function ParticipantAvatar({ participant, size = 'md' }: ParticipantAvatarProps) {
  const { selfId } = useRoom();
  const isSelf = participant.id === selfId;
  const pxSize = SIZE_PX[size];
  const mood = statusToMood(participant.status);
  const chatSnippet = useChatSnippet(participant.id);
  const ritualPose = useRitualPose(participant.id);
  const isDisconnected = !participant.connected;

  // Randomize bob animation timing per-instance so avatars don't move in sync
  const bobDelay = React.useRef(`${(Math.random() * 2).toFixed(2)}s`);
  const bobDuration = React.useRef(`${(4 + Math.random() * 1.5).toFixed(2)}s`);

  const avatarEl = (
    <motion.div
      layout
      className={cn(
        'relative flex flex-col items-center gap-1',
        isDisconnected && 'opacity-60',
        isSelf && 'cursor-pointer',
      )}
      style={{ width: pxSize + 24 }}
      title={isSelf ? 'click to change your vibe' : participant.name}
    >
      {/* Chat speech bubble — fades out automatically */}
      <div className="h-8 flex items-end justify-center">
        <AnimatePresence>
          {chatSnippet && <ChatBubble key={chatSnippet} text={chatSnippet} />}
        </AnimatePresence>
      </div>

      {/* Status bubble */}
      <StatusBubble status={participant.status} accent={participant.accent} />

      {/* Synchronized ritual pose — a brief emote pop above the head on a payoff */}
      <AnimatePresence>
        {ritualPose && !isDisconnected && (
          <PoseEmote key={ritualPose} pose={ritualPose} />
        )}
      </AnimatePresence>

      {/* Disconnected zzz indicator */}
      {isDisconnected && (
        <motion.span
          className="absolute top-7 -right-1 text-base select-none pointer-events-none z-30"
          animate={{ y: [0, -5, 0], opacity: [0.7, 1, 0.7] }}
          transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
          aria-label="disconnected"
        >
          💤
        </motion.span>
      )}

      {/* Avatar sprite — gentle idle bob (per-instance timing) */}
      <div
        className="animate-float-bob -mb-1"
        style={{
          animationDelay: bobDelay.current,
          animationDuration: bobDuration.current,
        }}
      >
        <AvatarSprite
          avatar={participant.avatar}
          accent={participant.accent}
          mood={mood}
          size={pxSize}
        />
      </div>

      {/* Name tag — rounded chip below the avatar, accent text + accent ring */}
      <span
        className={cn(
          'rounded-full px-2 py-0.5 max-w-full truncate text-center',
          'bg-couch-800/90 border',
          'text-[11px] font-body font-semibold leading-none',
          'shadow-[var(--shadow-couch)]',
        )}
        style={{
          color: participant.accent,
          borderColor: participant.accent,
          maxWidth: pxSize + 24,
        }}
      >
        {participant.name}
      </span>
    </motion.div>
  );

  // Only the self avatar wraps in StatusPicker
  if (isSelf) {
    return (
      <StatusPicker currentStatus={participant.status}>
        {avatarEl}
      </StatusPicker>
    );
  }

  return avatarEl;
}

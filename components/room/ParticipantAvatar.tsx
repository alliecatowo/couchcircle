'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useRoom } from '@/lib/realtime/room-context';
import { STATUS_META } from '@/shared/constants';
import { StatusPicker } from './StatusPicker';
import type { Participant, ChatMessage } from '@/shared/protocol';
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
// ParticipantAvatar
// ---------------------------------------------------------------------------

export function ParticipantAvatar({ participant, size = 'md' }: ParticipantAvatarProps) {
  const { selfId } = useRoom();
  const isSelf = participant.id === selfId;
  const pxSize = SIZE_PX[size];
  const mood = statusToMood(participant.status);
  const chatSnippet = useChatSnippet(participant.id);
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
      title={isSelf ? 'click to set your status' : participant.name}
    >
      {/* Chat speech bubble — fades out automatically */}
      <div className="h-8 flex items-end justify-center">
        <AnimatePresence>
          {chatSnippet && <ChatBubble key={chatSnippet} text={chatSnippet} />}
        </AnimatePresence>
      </div>

      {/* Status bubble */}
      <StatusBubble status={participant.status} accent={participant.accent} />

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

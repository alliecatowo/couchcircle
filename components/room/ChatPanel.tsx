'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send } from 'lucide-react';
import { useRoom } from '@/lib/realtime/room-context';
import type { ChatMessage } from '@/shared/protocol';
import { REACTION_EMOJIS } from '@/shared/constants';
import { cn, formatRelativeTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ActiveRitualCard } from './rituals/ActiveRitualCard';

// ─── Constants ───────────────────────────────────────────────────────────────

const CHAR_CAP = 500;
const CHAR_WARN = 400;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Two consecutive messages are "grouped" when same author within 90 seconds. */
function isGrouped(prev: ChatMessage | undefined, curr: ChatMessage): boolean {
  if (!prev) return false;
  return prev.authorId === curr.authorId && curr.ts - prev.ts < 90_000;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ChatPanel() {
  const { state, selfId, send } = useRoom();

  const [text, setText] = React.useState('');
  const [isStuck, setIsStuck] = React.useState(true);
  const [showJumpChip, setShowJumpChip] = React.useState(false);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const prevChatLenRef = React.useRef(0);

  const messages = state?.chat ?? [];

  // Detect new messages while not stuck
  React.useEffect(() => {
    const newLen = messages.length;
    if (newLen > prevChatLenRef.current && !isStuck) {
      setShowJumpChip(true);
    }
    prevChatLenRef.current = newLen;
  }, [messages.length, isStuck]);

  // Auto-scroll when stuck
  React.useEffect(() => {
    if (isStuck && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isStuck]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
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

  function sendMessage() {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > CHAR_CAP) return;
    send({ type: 'chat:message', text: trimmed });
    setText('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function sendReaction(emoji: string) {
    send({ type: 'reaction:send', emoji });
  }

  // For relative time ticking
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const charCount = text.length;
  const overWarn = charCount >= CHAR_WARN;
  const overCap = charCount > CHAR_CAP;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Pinned ritual card — chat is the table; the active ritual (game / toast /
          ready / snack) lives at the top of the scroll area, above the messages.
          Renders null when no ritual is live. */}
      <div className="shrink-0 px-3 pt-3 empty:hidden">
        <ActiveRitualCard />
      </div>

      {/* Message list */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex h-full flex-col overflow-y-auto px-3 py-3 scrollbar-thin"
        >
          {messages.length === 0 && (
            <div className="flex flex-col items-center gap-3 mt-8 text-center">
              {/* Soft speech-bubble illustration */}
              <div className="text-3xl leading-none select-none opacity-40" aria-hidden>
                💬
              </div>
              <p className="text-xs text-cream-400/60">
                say something nice 🛋️
              </p>
            </div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((msg, idx) => {
              const prev = messages[idx - 1];
              const grouped = isGrouped(prev, msg);
              const isSelf = msg.authorId === selfId;

              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className={cn(
                    'group flex items-start gap-2',
                    grouped ? 'mt-0.5' : 'mt-3',
                    isSelf && 'flex-row-reverse',
                  )}
                >
                  {/* Author dot */}
                  {!grouped ? (
                    <div
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full shadow-[0_0_5px_1px_currentColor] opacity-90"
                      style={{ backgroundColor: msg.authorAccent, color: msg.authorAccent }}
                      aria-hidden
                    />
                  ) : (
                    <div className="h-2 w-2 shrink-0" aria-hidden />
                  )}

                  {/* Bubble */}
                  <div
                    className={cn(
                      'min-w-0 max-w-[80%] rounded-2xl px-3 py-2',
                      isSelf
                        ? 'bg-ember-500/15 shadow-[inset_0_0_0_1px_rgba(240,139,52,0.2)]'
                        : 'bg-couch-750/80 shadow-[inset_0_0_0_1px_rgba(74,58,50,0.5)]',
                    )}
                  >
                    {/* Author name (only on first in group) */}
                    {!grouped && (
                      <div className="mb-0.5 flex items-center gap-1.5">
                        <span
                          className="text-xs font-semibold leading-none"
                          style={{ color: msg.authorAccent }}
                        >
                          {msg.authorName}
                        </span>
                        {isSelf && (
                          <span className="text-[10px] text-cream-400/50">(you)</span>
                        )}
                      </div>
                    )}

                    {/* Text */}
                    <p className="break-words text-sm leading-relaxed text-cream-100">
                      {msg.text}
                    </p>

                    {/* Relative time (on hover) */}
                    <div className="mt-0.5 h-3 overflow-hidden opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                      <span className="text-[10px] text-cream-400/60">
                        {formatRelativeTime(msg.ts)}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Bottom padding to ensure last message isn't clipped */}
          <div className="h-2 shrink-0" />
        </div>

        {/* New messages jump chip */}
        <AnimatePresence>
          {showJumpChip && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-2 left-0 right-0 flex justify-center"
            >
              <Button
                variant="accent"
                size="sm"
                onClick={jumpToBottom}
                className="h-7 rounded-full px-3 text-xs"
              >
                new messages ↓
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom input area — raised surface */}
      <div className="shrink-0 border-t border-couch-700 bg-couch-850/60 px-3 pb-3 pt-2.5">
        {/* Reaction bar */}
        <div className="mb-2.5 flex items-center gap-1 flex-wrap">
          {REACTION_EMOJIS.map((emoji) => (
            <ReactionButton
              key={emoji}
              emoji={emoji}
              onSend={() => sendReaction(emoji)}
            />
          ))}
        </div>

        {/* Input row */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, CHAR_CAP))}
              onKeyDown={handleKeyDown}
              placeholder="say something nice…"
              maxLength={CHAR_CAP}
              className={cn(
                'pr-12 text-sm bg-couch-800 border-couch-650 focus-visible:border-ember-500/50',
                overCap && 'border-coal-red/60 focus-visible:border-coal-red/70',
              )}
              aria-label="chat message"
            />
            {/* Char counter (shown past WARN threshold) */}
            {overWarn && (
              <span
                className={cn(
                  'absolute right-3 top-1/2 -translate-y-1/2 text-[10px] transition-colors duration-200',
                  overCap ? 'text-coal-red' : 'text-cream-400',
                )}
              >
                {CHAR_CAP - charCount}
              </span>
            )}
          </div>

          <Button
            variant="accent"
            size="icon"
            onClick={sendMessage}
            disabled={!text.trim() || overCap}
            aria-label="send message"
            className="shrink-0 glow-ember"
          >
            <Send aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── ReactionButton ───────────────────────────────────────────────────────────

function ReactionButton({
  emoji,
  onSend,
}: {
  emoji: string;
  onSend: () => void;
}) {
  const [popped, setPopped] = React.useState(false);

  function handleClick() {
    onSend();
    setPopped(true);
    setTimeout(() => setPopped(false), 350);
  }

  return (
    <motion.button
      onClick={handleClick}
      animate={popped ? { scale: [1, 1.55, 0.9, 1] } : { scale: 1 }}
      transition={
        popped
          ? { duration: 0.32, times: [0, 0.4, 0.7, 1], ease: 'easeOut' }
          : {}
      }
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-full text-sm',
        'border border-couch-700 bg-couch-800 transition-all duration-150',
        'hover:border-ember-500/30 hover:bg-couch-750 hover:scale-110',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-500',
        'active:scale-90',
      )}
      aria-label={`react with ${emoji}`}
    >
      {emoji}
    </motion.button>
  );
}

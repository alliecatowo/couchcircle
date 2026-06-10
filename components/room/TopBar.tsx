'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Lock, Settings, Sparkles, Check } from 'lucide-react';
import { useRoom } from '@/lib/realtime/room-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { ConnectionHealth } from '@/components/room/ConnectionHealth';

/**
 * TopBar — the slim shelf across the top of the room: room name, the join-code
 * chip (click to copy the invite link), a lock when the room is password-gated,
 * the Sesh Mode toggle (host/controller only), connection health, and the
 * settings gear. Receives `onOpenSettings` from RoomShell's local state lift.
 */
export function TopBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { state, canControl, isHost, isController, send } = useRoom();

  const roomName = state?.settings.roomName?.trim() || 'the couch';
  const joinCode = state?.joinCode ?? '';
  const passwordEnabled = state?.passwordEnabled ?? false;
  const seshEnabled = state?.sesh.enabled ?? false;
  // Sesh Mode can only be toggled by whoever's holding the remote (or the host).
  const canToggleSesh = isHost || isController || canControl;

  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const copyInvite = useCallback(() => {
    if (!joinCode) return;
    const link = `${location.origin}/r/${joinCode}`;
    void navigator.clipboard?.writeText(link).catch(() => {
      /* clipboard may be blocked; the flourish still confirms intent */
    });
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1500);
  }, [joinCode]);

  const onSeshChange = useCallback(
    (next: boolean) => {
      if (!canToggleSesh) return;
      send({ type: 'sesh:enable', enabled: next });
    },
    [canToggleSesh, send],
  );

  return (
    <header className="relative z-30 flex h-[3.75rem] shrink-0 items-center gap-3 border-b border-ember-950/60 bg-couch-850/80 px-3 shadow-[0_1px_0_0_rgba(240,139,52,0.10)] backdrop-blur sm:px-4">
      {/* room identity */}
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-base leading-none" aria-hidden>
          🛋️
        </span>
        <span className="truncate font-display text-xl leading-none text-cream-50">
          {roomName}
        </span>
        {passwordEnabled && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex items-center text-ember-300" aria-label="password protected">
                <Lock className="size-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent>this room is password-locked</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* join-code chip → copy invite link */}
      <button
        type="button"
        onClick={copyInvite}
        disabled={!joinCode}
        className="group relative inline-flex items-center disabled:opacity-50"
        aria-label="copy invite link"
      >
        <Badge
          variant="accent"
          className="cursor-pointer gap-1.5 px-3 py-1 font-mono transition-colors group-hover:bg-ember-500/25"
        >
          {copied ? <Check className="size-3" /> : null}
          {copied ? 'copied 🛋️' : joinCode || '…'}
        </Badge>
        <AnimatePresence>
          {copied && (
            <motion.span
              key="copied-flourish"
              initial={{ y: 4, opacity: 0, scale: 0.9 }}
              animate={{ y: -2, opacity: 1, scale: 1 }}
              exit={{ y: -8, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap text-[0.7rem] text-ember-300"
            >
              invite link copied
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {/* spacer */}
      <div className="flex-1" />

      {/* Sesh Mode toggle */}
      <div className="flex items-center gap-2">
        {canToggleSesh ? (
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-cream-300">
            <Sparkles
              className={
                'size-3.5 transition-colors ' +
                (seshEnabled ? 'text-ember-400' : 'text-cream-400')
              }
            />
            <span className="hidden sm:inline">sesh mode</span>
            <Switch
              checked={seshEnabled}
              onCheckedChange={onSeshChange}
              aria-label="toggle sesh mode"
            />
          </label>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                tabIndex={0}
                className="flex items-center gap-1.5 text-xs text-cream-400"
                aria-label="sesh mode (need the remote)"
              >
                <Sparkles className="size-3.5 text-cream-500" />
                <span className="hidden sm:inline">sesh mode</span>
                <Switch checked={seshEnabled} disabled aria-label="toggle sesh mode" />
              </span>
            </TooltipTrigger>
            <TooltipContent>ask whoever has the remote</TooltipContent>
          </Tooltip>
        )}
      </div>

      <ConnectionHealth />

      {/* settings gear */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenSettings}
            aria-label="room settings"
          >
            <Settings />
          </Button>
        </TooltipTrigger>
        <TooltipContent>tweak the vibe</TooltipContent>
      </Tooltip>
    </header>
  );
}

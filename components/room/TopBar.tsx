'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Lock, Settings, Sparkles, Check, MonitorPlay } from 'lucide-react';
import { useRoom } from '@/lib/realtime/room-context';
import { useProjectorOpen, setProjectorOpen } from '@/lib/theater';
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
  const { state, canControl, isHost, isController, send, connectionStatus } = useRoom();

  const roomName = state?.settings.roomName?.trim() || 'the couch';
  const joinCode = state?.joinCode ?? '';
  const passwordEnabled = state?.passwordEnabled ?? false;
  const seshEnabled = state?.sesh.enabled ?? false;
  // crew = connected participants only
  const crewCount = state
    ? Object.values(state.participants).filter((p) => p.connected).length
    : 0;
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

  // ---- the projector (§1): throw the movie to a companion big-screen window ----
  const projectorOpen = useProjectorOpen();
  // Handle to the popup window so we can re-focus it and poll for .closed.
  const projectorWin = useRef<Window | null>(null);
  const projectorPoll = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopProjectorPoll = useCallback(() => {
    if (projectorPoll.current) {
      clearInterval(projectorPoll.current);
      projectorPoll.current = null;
    }
  }, []);

  const toggleProjector = useCallback(() => {
    // already open → close it (the poll below will also catch a manual close)
    if (projectorWin.current && !projectorWin.current.closed) {
      projectorWin.current.close();
      projectorWin.current = null;
      stopProjectorPoll();
      setProjectorOpen(false);
      return;
    }
    if (!joinCode) return;
    const win = window.open(
      `/r/${joinCode}/screen`,
      'couchprojector',
      'popup,width=1280,height=720',
    );
    if (!win) {
      // popup blocked — leave the main player as-is; nothing to coordinate
      return;
    }
    projectorWin.current = win;
    setProjectorOpen(true);
    // poll for the window being closed (user hits ✕) every 2s and restore.
    stopProjectorPoll();
    projectorPoll.current = setInterval(() => {
      if (!projectorWin.current || projectorWin.current.closed) {
        projectorWin.current = null;
        stopProjectorPoll();
        setProjectorOpen(false);
      }
    }, 2_000);
  }, [joinCode, stopProjectorPoll]);

  // On unmount, close the projector + clear the store so we never strand the
  // main window in the "rolling on the projector" placeholder.
  useEffect(
    () => () => {
      stopProjectorPoll();
      if (projectorWin.current && !projectorWin.current.closed) {
        projectorWin.current.close();
      }
      projectorWin.current = null;
      setProjectorOpen(false);
    },
    [stopProjectorPoll],
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

      {/* couch-code chip → copy invite link */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={copyInvite}
          disabled={!joinCode}
          className="group relative inline-flex items-center disabled:opacity-50"
          aria-label="copy couch code invite link"
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
        {/* crew counter — only when we have data and are connected */}
        {crewCount > 0 && connectionStatus === 'connected' && (
          <span className="text-xs text-cream-400 tabular-nums">
            {crewCount} on the couch
          </span>
        )}
      </div>

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

      {/* throw it to the big screen — opens the companion projector window */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={projectorOpen ? 'accent' : 'ghost'}
            size="sm"
            onClick={toggleProjector}
            disabled={!joinCode}
            className="gap-1.5"
            aria-label={projectorOpen ? 'close the projector' : 'throw it to the big screen'}
          >
            <MonitorPlay />
            <span className="hidden md:inline">
              {projectorOpen ? 'close the projector' : 'big screen 📽️'}
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {projectorOpen
            ? 'the movie is rolling on the projector window'
            : 'throw it to the big screen 📽️'}
        </TooltipContent>
      </Tooltip>

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

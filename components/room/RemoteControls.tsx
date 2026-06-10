'use client';

/**
 * RemoteControls — the bottom-bar shared remote (§12 of ARCHITECTURE.md, §10 of SPRINT2.md).
 *
 * Three clusters in a raised warm tray (bg-couch-800, top border, inner glow):
 *   LEFT   — transport (BIG circular ember play/pause, scrubber, time, rate)
 *   CENTER — remote ownership chip (three §10 states) + request/grant/pass/revoke/grab
 *   RIGHT  — compact local volume, SyncIndicator, round red emergency pause
 *
 * §10 chip states:
 *   1. "🎮 you've got the remote" — isController
 *   2. "📺 {name} has it" — someone else holds it
 *   3. "🛋️ up for grabs — grab it" — controllerId is undefined/absent
 *
 * Transport (play/pause/scrub/rate) is wrapped in <NeedsRemote> so the §10 UX
 * law is enforced: amber-ghost, never dead disabled.
 *
 * Requests are visible only to the holder + host per §10.
 *
 * pl-14 (≥56px) keeps controls clear of the Next.js dev badge (bottom-left).
 */

import * as React from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  AlertOctagon,
  Check,
  X,
  ChevronDown,
} from 'lucide-react';
import { useRoom } from '@/lib/realtime/room-context';
import { useSyncStatus, setLocalVolume } from '@/lib/sync/sync-engine';
import { SyncIndicator } from '@/components/room/SyncIndicator';
import { NeedsRemote } from '@/components/room/needs-remote';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';
import { cn, formatDuration } from '@/lib/utils';
import type { ClientMessage } from '@/shared/protocol';

// ---------------------------------------------------------------------------
// Playback rate options
// ---------------------------------------------------------------------------

const RATE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function RemoteControls() {
  const { state, selfId, canControl, isHost, send } = useRoom();

  const sync = useSyncStatus();

  // Local scrubber drag: track value while dragging so the 4Hz sync-engine
  // updates don't fight the user's drag gesture.
  const [scrubbing, setScrubbing] = React.useState(false);
  const [scrubValue, setScrubValue] = React.useState(0);

  // Local volume (0..1).
  const [localVolume, setVolumeState] = React.useState(1);

  // Track which pending-request chips the controller has locally dismissed
  // (cosmetic local hide — no message needed per spec).
  const [dismissedRequests, setDismissedRequests] = React.useState<Set<string>>(
    new Set(),
  );

  // Reset dismissed set when controllerId changes (new holder = fresh slate).
  const prevControllerId = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    if (!state) return;
    if (state.remote.controllerId !== prevControllerId.current) {
      setDismissedRequests(new Set());
      prevControllerId.current = state.remote.controllerId;
    }
  }, [state]);

  // --------------------------------------------------------------------------
  // Guard: render skeleton before join
  // --------------------------------------------------------------------------

  if (!state) {
    return (
      <div
        className={cn(
          'grain relative flex h-16 items-center',
          'border-t border-couch-700 bg-couch-800',
          'shadow-[inset_0_1px_0_rgba(224,139,52,0.06)]',
        )}
      />
    );
  }

  // --------------------------------------------------------------------------
  // Derived values
  // --------------------------------------------------------------------------

  const media = state.media;
  const remote = state.remote;

  const isPlaying = media.status === 'playing';
  const isMediaIdle = media.status === 'idle' || media.adapter === 'idle';

  const positionSec = sync.positionSec;
  const durationSec = sync.durationSec;
  const isLive = sync.isLive;
  const canSeek = sync.canSeek;
  const canPause = sync.canPause;

  // Remote ownership
  const controllerId = remote.controllerId;
  const controllerParticipant = controllerId ? state.participants[controllerId] : null;
  const isController = selfId === controllerId;
  const isUpForGrabs = !controllerId;
  const isHostOnly = remote.mode === 'host-only';
  const isChaos = remote.mode === 'chaos';

  // Other connected participants (for pass-remote dropdown)
  const otherParticipants = Object.values(state.participants).filter(
    (p) => p.id !== selfId && p.connected,
  );

  // Pending requests — only the holder + host may see them per §10.
  const canSeePendingRequests = isController || isHost;
  const visiblePendingRequests = canSeePendingRequests
    ? remote.pendingRequests.filter((id) => !dismissedRequests.has(id))
    : [];

  // Has self already requested?
  const selfHasRequested = remote.pendingRequests.includes(selfId);

  // --------------------------------------------------------------------------
  // Event handlers
  // --------------------------------------------------------------------------

  function handlePlayPause() {
    if (!canControl) return;
    if (isPlaying) {
      send({ type: 'media:pause' });
    } else {
      send({ type: 'media:play' });
    }
  }

  function handleScrubChange(values: number[]) {
    setScrubbing(true);
    setScrubValue(values[0] ?? 0);
  }

  function handleScrubCommit(values: number[]) {
    setScrubbing(false);
    const pos = values[0] ?? 0;
    setScrubValue(pos);
    send({ type: 'media:seek', position: pos });
  }

  function handleRateChange(rate: string) {
    const parsed = parseFloat(rate);
    if (Number.isFinite(parsed)) {
      send({ type: 'media:rate', rate: parsed });
    }
  }

  function handleVolumeChange(values: number[]) {
    const v = values[0] ?? 1;
    setVolumeState(v);
    setLocalVolume(v);
  }

  function handleGrantRequest(toId: string) {
    send({ type: 'remote:grant', toId });
  }

  function handleDismissRequest(id: string) {
    setDismissedRequests((prev) => new Set([...prev, id]));
  }

  function handlePassRemote(toId: string) {
    send({ type: 'remote:pass', toId });
  }

  function handleRevokeRemote() {
    send({ type: 'remote:revoke' });
  }

  function handleEmergencyPause() {
    send({ type: 'room:action', kind: 'emergency-pause' });
  }

  function handleGrab() {
    // remote:grab — SPRINT2 addition; cast while party-server task adds the type.
    send({ type: 'remote:grab' } as unknown as ClientMessage);
  }

  // --------------------------------------------------------------------------
  // Current scrubber display value
  // --------------------------------------------------------------------------

  const displayPos = scrubbing ? scrubValue : positionSec;

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  return (
    <div
      className={cn(
        'grain relative flex items-center gap-3 px-4 py-3',
        'border-t border-couch-700 bg-couch-800',
        'shadow-[inset_0_1px_0_rgba(224,139,52,0.10),var(--shadow-couch)]',
      )}
    >
      {/* ------------------------------------------------------------------ */}
      {/* LEFT — Transport cluster (wrapped in NeedsRemote per §10)            */}
      {/* pl-14 (56px) keeps controls clear of the Next.js dev badge           */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex min-w-0 flex-1 items-center gap-3 pl-10 sm:pl-14">
        {/* BIG circular ember play/pause */}
        <NeedsRemote>
          <Button
            size="icon"
            variant={isMediaIdle || !canPause ? 'default' : 'accent'}
            onClick={handlePlayPause}
            disabled={canControl && (isMediaIdle || !canPause)}
            aria-label={isPlaying ? 'pause' : 'play'}
            className={cn(
              'h-11 w-11 shrink-0 rounded-full',
              !isMediaIdle && canPause && canControl && 'glow-ember',
            )}
          >
            {isPlaying ? (
              <Pause className="size-5" />
            ) : (
              <Play className="size-5" />
            )}
          </Button>
        </NeedsRemote>

        {/* Scrubber region */}
        {isMediaIdle ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="min-w-0 flex-1">
                <Slider
                  value={[0]}
                  max={1}
                  min={0}
                  step={1}
                  disabled
                  className="pointer-events-none min-w-0 flex-1 opacity-20"
                  aria-label="nothing playing"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>nothing playing — queue something 🛋️</TooltipContent>
          </Tooltip>
        ) : isLive ? (
          <Badge
            variant="live"
            className="shrink-0 animate-flicker cursor-default"
          >
            ● LIVE
          </Badge>
        ) : !canSeek ? (
          <Badge
            variant="default"
            className="shrink-0 text-cream-400"
          >
            no seek
          </Badge>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {/* Scrubber Slider wrapped in NeedsRemote */}
            <NeedsRemote className="min-w-0 flex-1">
              <Slider
                value={[displayPos]}
                max={durationSec ?? 0}
                min={0}
                step={1}
                className={cn(
                  'min-w-0 flex-1 transition-transform hover:scale-y-[1.3]',
                  !canControl && 'pointer-events-none',
                )}
                onValueChange={canControl ? handleScrubChange : undefined}
                onValueCommit={canControl ? handleScrubCommit : undefined}
                aria-label="seek"
              />
            </NeedsRemote>

            {/* Time readout */}
            <span className="shrink-0 font-mono text-xs tabular-nums text-cream-400 leading-none">
              {formatDuration(displayPos)}
              <span className="mx-0.5 text-couch-600">/</span>
              {formatDuration(durationSec)}
            </span>
          </div>
        )}

        {/* Playback-rate menu — hidden when live, wrapped in NeedsRemote */}
        {!isLive && (
          <NeedsRemote>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0 gap-0.5 text-xs text-cream-300"
                  aria-label="playback speed"
                  disabled={!canControl}
                >
                  {media.playbackRate === 1 ? '1×' : `${media.playbackRate}×`}
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              {canControl && (
                <DropdownMenuContent align="start" side="top">
                  <DropdownMenuLabel>speed</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={String(media.playbackRate)}
                    onValueChange={handleRateChange}
                  >
                    {RATE_OPTIONS.map((r) => (
                      <DropdownMenuRadioItem key={r} value={String(r)}>
                        {r === 1 ? 'normal (1×)' : `${r}×`}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              )}
            </DropdownMenu>
          </NeedsRemote>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* CENTER — Remote ownership chip (three §10 states) + actions          */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex shrink-0 flex-col items-center gap-2">
        {/* §10 chip — three states only */}
        {isUpForGrabs ? (
          /* State 3: up for grabs — one-click grab for anyone */
          <button
            onClick={handleGrab}
            className={cn(
              'inline-flex max-w-[220px] items-center gap-1.5 truncate rounded-full px-3 py-1 text-xs font-semibold',
              'border border-ember-500/30 bg-ember-950/40 text-ember-300',
              'transition-all duration-200 hover:bg-ember-950/70 hover:border-ember-500/60',
              'cursor-pointer glow-ember',
              'animate-pulse-glow',
            )}
            aria-label="grab the remote"
          >
            <span className="truncate">🛋️ up for grabs — grab it</span>
          </button>
        ) : (
          /* State 1 or 2: held */
          <div
            className={cn(
              'inline-flex max-w-[200px] items-center gap-1.5 truncate rounded-full px-3 py-1 text-xs font-semibold',
              isController
                ? 'border border-ember-600/40 bg-ember-950/60 text-ember-300'
                : 'border border-couch-700 bg-couch-850 text-cream-400',
            )}
          >
            <span className="truncate">
              {isController
                ? "🎮 you've got the remote"
                : `📺 ${controllerParticipant?.name ?? '…'} has it`}
            </span>
          </div>
        )}

        {/* Action pills */}
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {/* Non-controller, non-up-for-grabs: request or chaos-grab */}
          {!isController && !isUpForGrabs && (
            <>
              {isHostOnly ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      tabIndex={0}
                      className="inline-flex items-center rounded-full border border-couch-700 bg-couch-850 px-3 py-1 text-xs text-cream-500 cursor-not-allowed"
                    >
                      ask for the remote ✋
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>host-only room — only the host drives</TooltipContent>
                </Tooltip>
              ) : isChaos ? (
                /* chaos mode: anyone can grab even if someone holds it */
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleGrab}
                  className="rounded-full text-xs"
                >
                  grab the remote 🫳
                </Button>
              ) : selfHasRequested ? (
                <span className="inline-flex items-center rounded-full border border-couch-700 bg-couch-850 px-3 py-1 text-xs text-cream-400">
                  asked ✋
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => send({ type: 'remote:request' })}
                  className="rounded-full text-xs"
                >
                  ask for the remote ✋
                </Button>
              )}
            </>
          )}

          {/* Controller: pending requests (visible only to holder + host per §10) */}
          {canSeePendingRequests && visiblePendingRequests.map((reqId) => {
            const requester = state.participants[reqId];
            if (!requester) return null;
            return (
              <span
                key={reqId}
                className="inline-flex items-center gap-1 rounded-full border border-couch-650 bg-couch-800 px-2 py-0.5 text-xs text-cream-200"
              >
                <span className="max-w-[72px] truncate">{requester.name}</span>
                {/* Grant */}
                <button
                  onClick={() => handleGrantRequest(reqId)}
                  className="ml-0.5 rounded p-0.5 text-moss-400 transition-colors hover:bg-moss-900/40"
                  aria-label={`grant remote to ${requester.name}`}
                >
                  <Check className="size-3" />
                </button>
                {/* Dismiss (local only) */}
                <button
                  onClick={() => handleDismissRequest(reqId)}
                  className="rounded p-0.5 text-cream-500 transition-colors hover:bg-couch-750"
                  aria-label={`dismiss request from ${requester.name}`}
                >
                  <X className="size-3" />
                </button>
              </span>
            );
          })}

          {/* Controller: pass the remote dropdown */}
          {isController && otherParticipants.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1 rounded-full text-xs">
                  pass the remote
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" side="top">
                <DropdownMenuLabel>pass to…</DropdownMenuLabel>
                {otherParticipants.map((p) => (
                  <DropdownMenuItem
                    key={p.id}
                    onClick={() => handlePassRemote(p.id)}
                  >
                    <span
                      className="mr-1 size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: p.accent }}
                    />
                    {p.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Host or controller: start a ready check */}
          {(isHost || isController) && !state.readyCheck?.active && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="hidden rounded-full text-xs sm:inline-flex"
                  onClick={() => send({ type: 'ready:start' })}
                >
                  everyone ready?
                </Button>
              </TooltipTrigger>
              <TooltipContent>rally the couch</TooltipContent>
            </Tooltip>
          )}

          {/* Host (not controller): "snag it back" */}
          {isHost && !isController && controllerId && (
            <Button
              size="sm"
              variant="ghost"
              className="rounded-full text-xs text-cream-400 hover:text-cream-200"
              onClick={handleRevokeRemote}
            >
              snag it back
            </Button>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* RIGHT — Volume + SyncIndicator + Emergency pause                    */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex shrink-0 items-center gap-3">
        {/* Local volume slider — compact */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex w-20 items-center gap-1.5">
              {localVolume === 0 ? (
                <VolumeX className="size-3.5 shrink-0 text-cream-500" />
              ) : (
                <Volume2 className="size-3.5 shrink-0 text-cream-500" />
              )}
              <Slider
                value={[localVolume]}
                max={1}
                min={0}
                step={0.01}
                className="flex-1"
                onValueChange={handleVolumeChange}
                aria-label="your volume"
              />
            </div>
          </TooltipTrigger>
          <TooltipContent>your volume only</TooltipContent>
        </Tooltip>

        {/* Sync indicator */}
        <SyncIndicator />

        {/* Emergency pause — anyone, red, wiggles on hover */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="danger"
              onClick={handleEmergencyPause}
              aria-label="emergency pause"
              className={cn(
                'h-9 w-9 shrink-0 rounded-full',
                'hover:animate-wiggle',
              )}
            >
              <AlertOctagon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">pause, i&apos;m dying 🚨</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

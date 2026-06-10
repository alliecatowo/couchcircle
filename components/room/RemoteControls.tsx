'use client';

/**
 * RemoteControls — the bottom-bar shared remote (§12 of ARCHITECTURE.md).
 *
 * Three clusters in a raised warm tray (bg-couch-800, top border, inner glow):
 *   LEFT   — transport (BIG circular ember play/pause, scrubber, time, rate)
 *   CENTER — remote ownership chip + request/grant/pass/revoke/ready controls
 *   RIGHT  — compact local volume, SyncIndicator, round red emergency pause
 *
 * LEFT cluster starts at pl-14 (≥56px) so nothing sits under the Next.js dev
 * badge in the bottom-left corner of the viewport.
 *
 * All media/remote commands go through the room `send()`. Local volume is
 * adapter-local via `setLocalVolume` from the sync engine (not synced to others).
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

// ---------------------------------------------------------------------------
// Playback rate options
// ---------------------------------------------------------------------------

const RATE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wrap a disabled button with a Tooltip so the message still shows. */
function DisabledTooltipButton({
  tip,
  children,
  ...btnProps
}: React.ComponentProps<typeof Button> & { tip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* span keeps pointer events alive so the tooltip fires even when disabled */}
        <span tabIndex={0} className="inline-flex">
          <Button disabled {...btnProps}>
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function RemoteControls() {
  const { state, selfId, canControl, isHost, send } = useRoom();

  const sync = useSyncStatus();

  // Local scrubber drag: we track our own value while dragging so the 4Hz
  // sync-engine updates don't fight the user's drag gesture.
  const [scrubbing, setScrubbing] = React.useState(false);
  const [scrubValue, setScrubValue] = React.useState(0);

  // Local volume (0..1). Default to 1 on mount; sync engine handles the actual call.
  const [localVolume, setVolumeState] = React.useState(1);

  // Track which pending-request chips the controller has locally dismissed (no
  // message needed per spec — just cosmetic local hide).
  const [dismissedRequests, setDismissedRequests] = React.useState<Set<string>>(
    new Set(),
  );

  // Reset dismissed set when the room state remote changes (e.g. new session).
  const prevControllerId = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    if (!state) return;
    if (state.remote.controllerId !== prevControllerId.current) {
      setDismissedRequests(new Set());
      prevControllerId.current = state.remote.controllerId;
    }
  }, [state]);

  // --------------------------------------------------------------------------
  // Guard: render nothing meaningful before join
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
  // Derive values from state
  // --------------------------------------------------------------------------

  const media = state.media;
  const remote = state.remote;

  const isPlaying = media.status === 'playing';
  const isMediaIdle = media.status === 'idle' || media.adapter === 'idle';

  // Use sync engine's position estimate for the scrubber (updated ~4Hz).
  const positionSec = sync.positionSec;
  const durationSec = sync.durationSec;
  const isLive = sync.isLive;
  const canSeek = sync.canSeek;
  const canPause = sync.canPause;

  // Remote ownership
  const controllerId = remote.controllerId;
  const controllerParticipant = controllerId ? state.participants[controllerId] : null;
  const isController = selfId === controllerId;
  const isHostOnly = remote.mode === 'host-only';

  // Other connected participants (for pass-remote dropdown)
  const otherParticipants = Object.values(state.participants).filter(
    (p) => p.id !== selfId && p.connected,
  );

  // Pending requests visible to this controller (filter locally-dismissed ones)
  const visiblePendingRequests = remote.pendingRequests.filter(
    (id) => !dismissedRequests.has(id),
  );

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

  function handleRequestRemote() {
    send({ type: 'remote:request' });
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
        // Raised warm tray: bg-couch-800 sits above the couch-900 page bg
        'grain relative flex items-center gap-3 px-4 py-3',
        'border-t border-couch-700 bg-couch-800',
        // Inner top glow — a faint ember shimmer along the raised edge
        'shadow-[inset_0_1px_0_rgba(224,139,52,0.10),var(--shadow-couch)]',
      )}
    >
      {/* ------------------------------------------------------------------ */}
      {/* LEFT — Transport cluster                                             */}
      {/* pl-14 (56px) keeps controls clear of the Next.js dev badge          */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex min-w-0 flex-1 items-center gap-3 pl-10 sm:pl-14">
        {/* BIG circular ember play/pause — primary control */}
        {canControl ? (
          <Button
            size="icon"
            variant={isMediaIdle || !canPause ? 'default' : 'accent'}
            onClick={handlePlayPause}
            disabled={isMediaIdle || !canPause}
            aria-label={isPlaying ? 'pause' : 'play'}
            className={cn(
              'h-11 w-11 shrink-0 rounded-full',
              // Ember glow when active and playing
              !isMediaIdle && canPause && 'glow-ember',
            )}
          >
            {isPlaying ? (
              <Pause className="size-5" />
            ) : (
              <Play className="size-5" />
            )}
          </Button>
        ) : (
          <DisabledTooltipButton
            size="icon"
            variant="default"
            tip="ask for the remote ✋"
            aria-label={isPlaying ? 'pause' : 'play'}
            className="h-11 w-11 shrink-0 rounded-full"
          >
            {isPlaying ? (
              <Pause className="size-5" />
            ) : (
              <Play className="size-5" />
            )}
          </DisabledTooltipButton>
        )}

        {/* Scrubber region — hidden when idle, live, or no seek */}
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
            {/* Scrubber Slider — ember fill, cream thumb, hover:scale on track */}
            {canControl ? (
              <Slider
                value={[displayPos]}
                max={durationSec ?? 0}
                min={0}
                step={1}
                className="min-w-0 flex-1 transition-transform hover:scale-y-[1.3]"
                onValueChange={handleScrubChange}
                onValueCommit={handleScrubCommit}
                aria-label="seek"
              />
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="min-w-0 flex-1">
                    <Slider
                      value={[displayPos]}
                      max={durationSec ?? 0}
                      min={0}
                      step={1}
                      className="pointer-events-none min-w-0 flex-1 opacity-40"
                      aria-label="seek (disabled)"
                    />
                  </span>
                </TooltipTrigger>
                <TooltipContent>ask for the remote ✋</TooltipContent>
              </Tooltip>
            )}

            {/* Time readout — mono-ish, small */}
            <span className="shrink-0 font-mono text-xs tabular-nums text-cream-400 leading-none">
              {formatDuration(displayPos)}
              <span className="mx-0.5 text-couch-600">/</span>
              {formatDuration(durationSec)}
            </span>
          </div>
        )}

        {/* Playback-rate menu — hidden when live */}
        {!isLive && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {canControl ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0 gap-0.5 text-xs text-cream-300"
                  aria-label="playback speed"
                >
                  {media.playbackRate === 1 ? '1×' : `${media.playbackRate}×`}
                  <ChevronDown className="size-3" />
                </Button>
              ) : (
                <span tabIndex={0} className="inline-flex">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0 gap-0.5 text-xs text-cream-400 opacity-50"
                    disabled
                    aria-label="playback speed (disabled)"
                  >
                    {media.playbackRate === 1 ? '1×' : `${media.playbackRate}×`}
                    <ChevronDown className="size-3" />
                  </Button>
                </span>
              )}
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
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* CENTER — Remote ownership chip + action pills                        */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex shrink-0 flex-col items-center gap-2">
        {/* Controller chip — styled as a little badge */}
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
              ? '🎮 you\'ve got the remote'
              : controllerParticipant
                ? `📺 ${controllerParticipant.name} has it`
                : '📺 up for grabs'}
          </span>
        </div>

        {/* Action pills */}
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {/* Non-controller: request button */}
          {!isController && (
            <>
              {isHostOnly ? (
                <DisabledTooltipButton
                  size="sm"
                  variant="outline"
                  tip="host-only room — only the host drives"
                  className="rounded-full text-xs"
                >
                  ask for the remote ✋
                </DisabledTooltipButton>
              ) : selfHasRequested ? (
                <span className="inline-flex items-center rounded-full border border-couch-700 bg-couch-850 px-3 py-1 text-xs text-cream-400">
                  asked ✋
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRequestRemote}
                  className="rounded-full text-xs"
                >
                  ask for the remote ✋
                </Button>
              )}
            </>
          )}

          {/* Controller: pending requests + pass menu */}
          {isController && (
            <>
              {/* Pending request chips */}
              {visiblePendingRequests.map((reqId) => {
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

              {/* Pass the remote dropdown */}
              {otherParticipants.length > 0 && (
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
            </>
          )}

          {/* Host or controller: start a ready check (hidden when one is already active) */}
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

        {/* Sync indicator (zero-prop sibling component) */}
        <SyncIndicator />

        {/* Emergency pause — anyone can trigger, wiggles on hover */}
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

'use client';

/**
 * SeshControls — the Sesh Mode action strip (§12 ARCHITECTURE.md).
 *
 * Renders null unless state.sesh.enabled.
 * Three clusters of compact cozy buttons:
 *   1. Rotation — join/leave, start/stop, spark countdown, hit now, pass left/right
 *   2. Vibes    — water check, snack run (with live vote chip), bathroom, pass the vibe, vibe check
 *   3. Status   — quick-set pills: rolling / sparking / couchlocked / locked-in
 *
 * Social ritual flavor only. Zero consumption/dosing advice.
 */

import * as React from 'react';
import { motion } from 'framer-motion';
import { useRoom } from '@/lib/realtime/room-context';
import { SPARK_DEFAULT_SECONDS, STATUS_META } from '@/shared/constants';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Thin helper: tooltip-wrapped disabled button
// ---------------------------------------------------------------------------

function DisabledTip({
  tip,
  children,
}: {
  tip: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* span makes the disabled button still receive pointer events for tooltip */}
        <span tabIndex={0} className="cursor-not-allowed">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Live snack-vote chip
// ---------------------------------------------------------------------------

function SnackVoteChip() {
  const { state, selfId, send, serverNow } = useRoom();
  const vote = state?.sesh.snackVote;
  const [now, setNow] = React.useState(() => serverNow());

  React.useEffect(() => {
    if (!vote) return;
    const id = setInterval(() => setNow(serverNow()), 250);
    return () => clearInterval(id);
  }, [vote, serverNow]);

  if (!vote) return null;

  const remaining = Math.max(0, vote.endsAt - now);
  const total = vote.endsAt - (vote.endsAt - 30_000); // SNACK_VOTE_WINDOW_MS=30s
  const progress = Math.max(0, Math.min(1, remaining / 30_000));

  const myVote: 'yes' | 'no' | null = vote.yes.includes(selfId)
    ? 'yes'
    : vote.no.includes(selfId)
    ? 'no'
    : null;

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-couch-700 bg-couch-850 px-3 py-2">
      {/* tally row */}
      <div className="flex items-center gap-2 text-xs text-cream-300">
        <span className="text-base">🍿</span>
        <span className="font-semibold">
          {vote.yes.length}–{vote.no.length}
        </span>
        <Button
          size="sm"
          variant={myVote === 'yes' ? 'accent' : 'outline'}
          className="h-6 px-2 text-xs"
          onClick={() => send({ type: 'sesh:snack-vote', vote: 'yes' })}
        >
          yes
        </Button>
        <Button
          size="sm"
          variant={myVote === 'no' ? 'default' : 'ghost'}
          className={cn(
            'h-6 px-2 text-xs',
            myVote === 'no' && 'bg-couch-750 text-cream-200',
          )}
          onClick={() => send({ type: 'sesh:snack-vote', vote: 'no' })}
        >
          nah
        </Button>
      </div>
      {/* countdown bar */}
      <div className="h-0.5 w-full overflow-hidden rounded-full bg-couch-700">
        <div
          className="h-full rounded-full bg-ember-400 transition-all duration-200"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SeshControls() {
  const { state, selfId, isHost, isController, send } = useRoom();

  if (!state || !state.sesh.enabled) return null;

  const sesh = state.sesh;
  const participants = state.participants;

  // Is self in the rotation?
  const inRotation = sesh.rotationIds.includes(selfId);
  // Is self the current holder?
  const currentHolderId =
    sesh.rotationActive && sesh.rotationIds.length > 0
      ? sesh.rotationIds[sesh.currentRotationIndex]
      : null;
  const isCurrentHolder = currentHolderId === selfId;
  // Is self a rotation member OR controller/host?
  const canPassOrCount = inRotation || isController || isHost;
  const canStartStop = isController || isHost;
  const hasMembers = sesh.rotationIds.length > 0;

  // Shared compact button style — outline variant for clear visibility on the dark tray
  const btnSm = cn(
    'h-8 px-3 text-xs rounded-xl gap-1',
    'border-couch-650 text-cream-200 hover:border-ember-600/60 hover:text-cream-50',
    'transition-colors duration-200',
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.28, ease: [0.34, 1.56, 0.64, 1] }}
      className={cn(
        // cozy raised tray — warm translucent surface with subtle border
        'relative mx-3 mb-2 overflow-hidden rounded-2xl grain',
        'bg-couch-800/90 backdrop-blur-md',
        'border border-couch-650',
        'shadow-[var(--shadow-couch)]',
        // soft ember glow along the top edge
        'before:pointer-events-none before:absolute before:inset-x-0 before:top-0',
        'before:h-px before:bg-gradient-to-r before:from-transparent before:via-ember-600/40 before:to-transparent',
      )}
      role="toolbar"
      aria-label="sesh mode controls"
    >
      {/* inner content sits above the grain layer */}
      <div className="relative z-10 flex flex-wrap items-center gap-2 px-3 py-2">
        {/* ── sesh label chip ─────────────────────────────────────── */}
        <span className="flex shrink-0 items-center gap-1 rounded-xl border border-haze-700/60 bg-haze-900/60 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-haze-300">
          🌿 sesh
        </span>

        <Separator orientation="vertical" className="h-5 bg-couch-700" />

        {/* ── Rotation cluster ──────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Join / Leave */}
          {inRotation ? (
            <Button
              size="sm"
              variant="outline"
              className={btnSm}
              onClick={() => send({ type: 'sesh:rotation:leave' })}
            >
              leave rotation
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className={cn(btnSm, 'border-moss-600/70 text-moss-300 hover:border-moss-500 hover:text-moss-200')}
              onClick={() => send({ type: 'sesh:rotation:join' })}
            >
              join rotation 🍃
            </Button>
          )}

          {/* Start / Stop */}
          {canStartStop && (
            <>
              {sesh.rotationActive ? (
                <Button
                  size="sm"
                  variant="outline"
                  className={cn(btnSm, 'text-cream-400 hover:text-cream-200')}
                  onClick={() => send({ type: 'sesh:rotation:stop' })}
                >
                  stop rotation
                </Button>
              ) : !hasMembers ? (
                <DisabledTip tip="need at least one person in the rotation 🍃">
                  <Button size="sm" variant="outline" className={cn(btnSm, 'pointer-events-none opacity-40')}>
                    start rotation
                  </Button>
                </DisabledTip>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className={cn(btnSm, 'border-moss-600/70 text-moss-300 hover:border-moss-500 hover:text-moss-200')}
                  onClick={() => send({ type: 'sesh:rotation:start' })}
                >
                  start rotation
                </Button>
              )}
            </>
          )}

          {/* Spark in 5 🔥 */}
          {canPassOrCount ? (
            <Button
              size="sm"
              variant="outline"
              className={cn(btnSm, 'border-ember-700/60 text-ember-300 hover:border-ember-500 hover:text-ember-200')}
              onClick={() =>
                send({ type: 'sesh:countdown:start', seconds: SPARK_DEFAULT_SECONDS })
              }
            >
              spark in 5 🔥
            </Button>
          ) : (
            <DisabledTip tip="join the rotation first 🍃">
              <Button size="sm" variant="outline" className={cn(btnSm, 'pointer-events-none opacity-40')}>
                spark in 5 🔥
              </Button>
            </DisabledTip>
          )}

          {/* Hit now 💨 */}
          {inRotation ? (
            <Button
              size="sm"
              variant="outline"
              className={cn(btnSm, 'border-haze-600/60 text-haze-300 hover:border-haze-500 hover:text-haze-200')}
              onClick={() => send({ type: 'sesh:rotation:hit' })}
            >
              hit now 💨
            </Button>
          ) : (
            <DisabledTip tip="join the rotation first 🍃">
              <Button size="sm" variant="outline" className={cn(btnSm, 'pointer-events-none opacity-40')}>
                hit now 💨
              </Button>
            </DisabledTip>
          )}

          {/* Pass ← / → */}
          {isCurrentHolder || canStartStop ? (
            <div className="flex overflow-hidden rounded-xl border border-couch-650">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 rounded-none rounded-l-xl border-r border-couch-650 px-2.5 text-xs text-cream-200 hover:text-cream-50"
                onClick={() =>
                  send({ type: 'sesh:rotation:pass', direction: 'right' })
                }
              >
                ← pass
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 rounded-none rounded-r-xl px-2.5 text-xs text-cream-200 hover:text-cream-50"
                onClick={() =>
                  send({ type: 'sesh:rotation:pass', direction: 'left' })
                }
              >
                pass →
              </Button>
            </div>
          ) : (
            <DisabledTip tip="not your turn to pass 🍃">
              <div className="flex cursor-not-allowed overflow-hidden rounded-xl border border-couch-700 opacity-40">
                <span className="flex h-8 items-center border-r border-couch-700 px-2.5 text-xs text-cream-400">
                  ← pass
                </span>
                <span className="flex h-8 items-center px-2.5 text-xs text-cream-400">
                  pass →
                </span>
              </div>
            </DisabledTip>
          )}
        </div>

        {/* ── divider ───────────────────────────────────────────────── */}
        <Separator orientation="vertical" className="h-5 bg-couch-700" />

        {/* ── Vibes cluster ─────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Water check */}
          <Button
            size="sm"
            variant="outline"
            className={btnSm}
            onClick={() => send({ type: 'room:action', kind: 'water-check' })}
          >
            water check 💧
          </Button>

          {/* Snack run / live vote chip */}
          {sesh.snackVote ? (
            <SnackVoteChip />
          ) : (
            <Button
              size="sm"
              variant="outline"
              className={btnSm}
              onClick={() => send({ type: 'sesh:snack-vote', vote: 'yes' })}
            >
              snack run 🍿
            </Button>
          )}

          {/* Bathroom */}
          <Button
            size="sm"
            variant="outline"
            className={btnSm}
            onClick={() => send({ type: 'room:action', kind: 'bathroom' })}
          >
            bathroom 🚽
          </Button>

          {/* Pass the vibe */}
          <Button
            size="sm"
            variant="outline"
            className={btnSm}
            onClick={() => send({ type: 'room:action', kind: 'pass-the-vibe' })}
          >
            pass the vibe ✨
          </Button>

          {/* Vibe check */}
          <Button
            size="sm"
            variant="outline"
            className={btnSm}
            onClick={() => send({ type: 'room:action', kind: 'vibe-check' })}
          >
            vibe check 🌡️
          </Button>
        </div>

        {/* ── divider ───────────────────────────────────────────────── */}
        <Separator orientation="vertical" className="h-5 bg-couch-700" />

        {/* ── Status quick-set cluster ──────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-1">
          {(
            [
              'rolling',
              'sparking',
              'couchlocked',
              'locked-in',
            ] as const
          ).map((s) => {
            const meta = STATUS_META[s];
            const isActive =
              (participants[selfId]?.status ?? 'chilling') === s;
            return (
              <button
                key={s}
                onClick={() => send({ type: 'sesh:status', status: s })}
                className={cn(
                  'h-7 rounded-full border px-2.5 text-xs font-medium',
                  'outline-none transition-all duration-200',
                  'focus-visible:ring-2 focus-visible:ring-ember-500',
                  isActive
                    ? 'border-ember-500/60 bg-ember-500/20 text-ember-200'
                    : 'border-couch-650 bg-couch-750/50 text-cream-300 hover:border-ember-700/50 hover:bg-couch-750 hover:text-cream-100',
                )}
                aria-pressed={isActive}
              >
                {meta.emoji} {meta.label.toLowerCase()}
              </button>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

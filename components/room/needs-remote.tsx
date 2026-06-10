'use client';

/**
 * NeedsRemote — the single source of the §10 UX law.
 *
 * Wraps any control that requires the remote. When this client canControl,
 * renders children normally. Otherwise renders an amber-ghost variant whose
 * click fires remote:request (or remote:grab in chaos/up-for-grabs) and shows
 * a transient toast. One wrapper, one policy, everywhere.
 *
 * Exports:
 *   - remoteAffordance(state, selfId): 'has' | 'grab' | 'ask' | 'host-only'
 *   - NeedsRemote (render-prop or children wrapper)
 */

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRoom } from '@/lib/realtime/room-context';
import { cn } from '@/lib/utils';
import type { RoomState } from '@/shared/protocol';
import type { ClientMessage } from '@/shared/protocol';

// ---------------------------------------------------------------------------
// remoteAffordance — single source of the grab-vs-request decision
// ---------------------------------------------------------------------------

/**
 * Compute what interaction this participant has with the remote right now.
 *
 * - 'has'       — this participant is the controller (or chaos mode); show normal controls
 * - 'grab'      — remote is up for grabs OR mode is chaos; one-click take
 * - 'ask'       — remote is held; send remote:request (user asks politely)
 * - 'host-only' — mode is host-only and this participant is not the host
 */
export function remoteAffordance(
  state: RoomState,
  selfId: string,
): 'has' | 'grab' | 'ask' | 'host-only' {
  const { remote, hostId } = state;

  // chaos mode: anyone can drive freely
  if (remote.mode === 'chaos') return 'has';

  // host always has it
  if (selfId === hostId) return 'has';

  // current controller
  if (remote.controllerId === selfId) return 'has';

  // host-only mode and not the host → locked out
  if (remote.mode === 'host-only') return 'host-only';

  // up for grabs (no controller) → one-click grab
  if (!remote.controllerId) return 'grab';

  // someone else holds it → ask
  return 'ask';
}

// ---------------------------------------------------------------------------
// Toast — a tiny inline transient toast anchored above the trigger
// ---------------------------------------------------------------------------

interface ToastBurst {
  id: number;
  text: string;
}

let _toastSeq = 0;

function RemoteToast({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.88 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 z-50',
        'whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-medium',
        'bg-ember-950/90 border border-ember-600/30 text-ember-200',
        'shadow-[var(--shadow-lifted)] backdrop-blur-sm',
      )}
      role="status"
      aria-live="polite"
    >
      {text}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// NeedsRemote props
// ---------------------------------------------------------------------------

export interface NeedsRemoteProps {
  /**
   * Render-prop API: child receives `{ affordance, trigger }`.
   * Or plain children — wrapped automatically with the ghost overlay.
   */
  children: React.ReactNode | ((props: { affordance: ReturnType<typeof remoteAffordance> }) => React.ReactNode);

  /**
   * When host-only mode applies to this element's action (default true).
   * Set to false if the action is still allowed when host-only (e.g. a host-only button
   * that non-hosts should see but never click — still shows ghost).
   */
  hostOnlyBlocks?: boolean;

  /** Extra className applied to the ghost wrapper div. */
  className?: string;
}

// ---------------------------------------------------------------------------
// NeedsRemote — the wrapper
// ---------------------------------------------------------------------------

/**
 * Wrap any interactive control that requires the remote with NeedsRemote.
 *
 * When canControl:
 *   Renders children as-is (passthrough, zero cost).
 *
 * When the remote is needed:
 *   Renders children inside an amber-ghost container. The element *looks*
 *   enabled (never a dead disabled button) but intercepts clicks to fire the
 *   appropriate remote message and show a transient toast. Reduced saturation +
 *   amber ring on hover per §10 spec.
 *
 * Supports render-prop if you need the affordance value in the child:
 *   <NeedsRemote>{({ affordance }) => <button>…</button>}</NeedsRemote>
 */
export function NeedsRemote({ children, className }: NeedsRemoteProps) {
  const { state, selfId, canControl, send } = useRoom();

  const [toasts, setToasts] = React.useState<ToastBurst[]>([]);

  // Derive the affordance. Without state we can't know — render passthrough.
  const affordance: ReturnType<typeof remoteAffordance> =
    state ? remoteAffordance(state, selfId) : 'has';

  // If already has control, render children normally.
  const resolvedChildren =
    typeof children === 'function'
      ? (children as (p: { affordance: ReturnType<typeof remoteAffordance> }) => React.ReactNode)({ affordance })
      : children;

  if (canControl || affordance === 'has') {
    return <>{resolvedChildren}</>;
  }

  // --- Ghost variant ---

  function fireRemoteAction(e: React.MouseEvent | React.KeyboardEvent) {
    // Eat the event so the child's own handler never fires.
    e.stopPropagation();
    e.preventDefault();

    if (affordance === 'host-only') {
      // Nothing to send — just hint.
      addToast('host-only mode ✋');
      return;
    }

    if (affordance === 'grab') {
      // remote:grab is a SPRINT2 addition; cast through unknown while sibling
      // party-server task adds it to the ClientMessage union.
      send({ type: 'remote:grab' } as unknown as ClientMessage);
      addToast('grabbed the remote 🫳');
    } else {
      // ask
      send({ type: 'remote:request' });
      addToast('asked for the remote ✋');
    }
  }

  function addToast(text: string) {
    const id = ++_toastSeq;
    setToasts((prev) => [...prev, { id, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2200);
  }

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    fireRemoteAction(e);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      fireRemoteAction(e);
    }
  }

  return (
    <div
      className={cn(
        // Positioning anchor for the toast
        'relative inline-flex',
        className,
      )}
    >
      {/* Toast bursts */}
      <AnimatePresence>
        {toasts.map((t) => (
          <RemoteToast key={t.id} text={t.text} />
        ))}
      </AnimatePresence>

      {/*
       * Ghost overlay wrapper:
       * - pointer-events-auto so we catch clicks
       * - cursor-pointer so it looks interactive
       * - reduced saturation on children via filter
       * - amber ring on hover per §10
       */}
      <div
        role="button"
        tabIndex={0}
        aria-label={
          affordance === 'grab'
            ? 'grab the remote'
            : affordance === 'host-only'
              ? 'host-only mode'
              : 'ask for the remote'
        }
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={cn(
          'relative cursor-pointer select-none outline-none',
          // Reduced saturation + slight opacity to signal "not yours yet"
          'transition-all duration-200',
          '[&_*]:pointer-events-none', // children never receive events directly
          // Amber ghost visual: desaturate + dim baseline
          'opacity-70 saturate-50',
          // On hover: restore a bit, add amber ring
          'hover:opacity-90 hover:saturate-75',
          'hover:ring-2 hover:ring-ember-500/40 hover:ring-offset-1 hover:ring-offset-transparent',
          'rounded-xl',
          // host-only: extra dim, different cursor
          affordance === 'host-only' && 'cursor-not-allowed opacity-40',
        )}
      >
        {resolvedChildren}
      </div>
    </div>
  );
}

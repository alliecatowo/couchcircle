'use client';

/**
 * RitualCard — the ONE anatomy every social mechanic wears (SPRINT2 §12).
 *
 * trigger → participation window → synchronized payoff. Ready check, snack vote,
 * toast, and the three chat games all render through this single shell so nothing
 * gets its own bespoke chrome ever again:
 *
 *   ┌─────────────────────────────────────────┐
 *   │ <emoji>  title                  <aside>  │   ← title row
 *   │ ─────────────────────────────────────── │   ← thin serverNow()-driven bar
 *   │  body slot (per-kind)                    │
 *   │  [   ONE primary action button   ]       │   ← exactly one hero action
 *   │  footnote · 💧 water check               │   ← self-serve hydration, one tap
 *   └─────────────────────────────────────────┘
 *
 * The card is anchored (pinned) at the top of the chat scroll area by ChatPanel.
 * Bodies live in `./bodies` and are wired up by `ActiveRitualCard`.
 */

import * as React from 'react';
import { useRoom } from '@/lib/realtime/room-context';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { RITUAL_WATER_FOOTNOTE } from '@/lib/rituals/decks';

// ---------------------------------------------------------------------------
// useServerCountdown — a serverNow()-driven 0..1 progress + ms remaining
// ---------------------------------------------------------------------------

/**
 * Drive the thin countdown bar off the server clock. `endsAt` and `windowMs` are
 * server-ms; returns remaining ms and 0..1 progress (full → empty). Ticks at 4Hz
 * only while a window is live, and self-cleans.
 */
export function useServerCountdown(
  endsAt: number | undefined,
  windowMs: number,
): { remainingMs: number; progress: number } {
  const { serverNow } = useRoom();
  const [now, setNow] = React.useState(() => serverNow());

  React.useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(serverNow()), 250);
    return () => clearInterval(id);
  }, [endsAt, serverNow]);

  if (!endsAt) return { remainingMs: 0, progress: 0 };
  const remainingMs = Math.max(0, endsAt - now);
  const progress = windowMs > 0 ? Math.max(0, Math.min(1, remainingMs / windowMs)) : 0;
  return { remainingMs, progress };
}

// ---------------------------------------------------------------------------
// Tone — the accent each ritual leans on (matches DESIGN tokens)
// ---------------------------------------------------------------------------

export type RitualTone = 'ember' | 'moss' | 'haze';

const TONE_RING: Record<RitualTone, string> = {
  ember: 'border-ember-600/40',
  moss: 'border-moss-600/50',
  haze: 'border-haze-600/45',
};

const TONE_BAR: Record<RitualTone, string> = {
  ember: 'bg-ember-400',
  moss: 'bg-moss-400',
  haze: 'bg-haze-400',
};

const TONE_GLOW: Record<RitualTone, string> = {
  ember: 'shadow-[inset_0_1px_0_rgba(224,139,52,0.10),var(--shadow-couch)]',
  moss: 'shadow-[inset_0_1px_0_rgba(86,133,95,0.12),var(--shadow-couch)]',
  haze: 'shadow-[inset_0_1px_0_rgba(141,114,164,0.12),var(--shadow-couch)]',
};

// ---------------------------------------------------------------------------
// RitualCard — the shared shell
// ---------------------------------------------------------------------------

export interface RitualCardProps {
  /** title-row emoji. */
  emoji: string;
  /** title-row name (lowercase canon). */
  title: string;
  /** small right-aligned aside in the title row (a tally, n/m, "20s"…). */
  aside?: React.ReactNode;
  /** the per-kind body. */
  children: React.ReactNode;
  /** the single hero action. Omit for read-only states (e.g. payoff flash). */
  action?: {
    label: React.ReactNode;
    onClick: () => void;
    variant?: 'accent' | 'outline' | 'default' | 'ghost' | 'danger';
    disabled?: boolean;
    className?: string;
  };
  /** countdown bar 0..1 (full→empty). Omit to hide the bar entirely. */
  progress?: number;
  /** accent tone. */
  tone?: RitualTone;
  /**
   * Override the standing self-serve footnote. Defaults to the canon water line;
   * games/toast keep it. Pass `null` to drop it (rare).
   */
  footnote?: React.ReactNode | null;
  /** optional small dismiss handler (controller/host stop) shown as ✕. */
  onDismiss?: () => void;
  className?: string;
}

export function RitualCard({
  emoji,
  title,
  aside,
  children,
  action,
  progress,
  tone = 'ember',
  footnote,
  onDismiss,
  className,
}: RitualCardProps) {
  const showFootnote = footnote !== null;
  const footnoteNode = footnote ?? <DefaultFootnote />;

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border p-3',
        'bg-couch-800/95 backdrop-blur-sm',
        TONE_RING[tone],
        TONE_GLOW[tone],
        className,
      )}
      role="group"
      aria-label={`${title} ritual`}
    >
      {/* grain texture — content stays above z-10 */}
      <div className="grain pointer-events-none absolute inset-0" aria-hidden />

      <div className="relative z-10 flex flex-col gap-2">
        {/* title row */}
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-base leading-none" aria-hidden>
            {emoji}
          </span>
          <p className="min-w-0 flex-1 truncate font-display text-sm font-semibold leading-tight text-cream-50">
            {title}
          </p>
          {aside != null && (
            <span className="shrink-0 font-mono text-[11px] text-cream-300">{aside}</span>
          )}
          {onDismiss && (
            <button
              onClick={onDismiss}
              aria-label="stop"
              className="-mr-0.5 shrink-0 rounded-lg px-1 text-xs text-cream-400 transition-colors hover:text-cream-100"
            >
              ✕
            </button>
          )}
        </div>

        {/* thin countdown bar */}
        {progress != null && (
          <div className="h-0.5 w-full overflow-hidden rounded-full bg-couch-700">
            <div
              className={cn('h-full rounded-full transition-all duration-200', TONE_BAR[tone])}
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        )}

        {/* body slot */}
        <div className="min-w-0">{children}</div>

        {/* one primary action */}
        {action && (
          <Button
            variant={action.variant ?? 'accent'}
            size="md"
            disabled={action.disabled}
            onClick={action.onClick}
            className={cn('w-full', action.className)}
          >
            {action.label}
          </Button>
        )}

        {/* footnote — self-serve hydration, one tap away */}
        {showFootnote && (
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <span className="min-w-0 truncate text-[10px] leading-tight text-cream-400/70">
              {footnoteNode}
            </span>
            <WaterCheckButton />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DefaultFootnote — the canon self-serve line
// ---------------------------------------------------------------------------

function DefaultFootnote() {
  return <>{RITUAL_WATER_FOOTNOTE}</>;
}

// ---------------------------------------------------------------------------
// WaterCheckButton — one-tap hydration, in every card
// ---------------------------------------------------------------------------

function WaterCheckButton() {
  const { send } = useRoom();
  const [tapped, setTapped] = React.useState(false);

  function handleClick() {
    send({ type: 'room:action', kind: 'water-check' });
    setTapped(true);
    setTimeout(() => setTapped(false), 1400);
  }

  return (
    <button
      onClick={handleClick}
      aria-label="water check"
      className={cn(
        'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none',
        'transition-colors duration-200',
        tapped
          ? 'border-moss-500/60 bg-moss-500/15 text-moss-200'
          : 'border-couch-650 bg-couch-850/80 text-cream-300 hover:border-haze-600/50 hover:text-cream-100',
      )}
    >
      {tapped ? 'hydrated 💧' : 'water 💧'}
    </button>
  );
}

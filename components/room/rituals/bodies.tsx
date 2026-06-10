'use client';

/**
 * Per-kind RitualCard bodies (SPRINT2 §12). Each body is the inner content of the
 * shared {@link RitualCard} shell — never its own chrome. They consume `useRoom()`
 * and the local ritual readers/senders.
 *
 *   ReadyBody     — everyone ready? n/m locked-in pips
 *   ToastBody     — raise one 🥂; the clink lands when the circle all-raises
 *   SnackBody     — snack run vote (yes/nah tally)
 *   RouletteBody  — sip roulette spin; fate picks a connected crew member
 *   MostLikelyBody— anonymous crew picker grid; only the tally shows
 *   BingoBody     — 5 trigger rows, IT HAPPENED → second-crew confirm states
 */

import * as React from 'react';
import { useRoom } from '@/lib/realtime/room-context';
import { cn } from '@/lib/utils';
import { AvatarSprite } from '@/components/avatars';
import type { Participant } from '@/shared/protocol';
import {
  readToast,
  readGame,
  readCircleKind,
  sendRitual,
  circleCopy,
  type GameState,
} from './types';

// ---------------------------------------------------------------------------
// Shared — connected crew, in seat (join) order
// ---------------------------------------------------------------------------

function useConnectedCrew(): Participant[] {
  const { state } = useRoom();
  return React.useMemo(() => {
    const all = Object.values(state?.participants ?? {});
    return all
      .filter((p) => p.connected)
      .sort((a, b) => a.joinedAt - b.joinedAt);
  }, [state]);
}

// ---------------------------------------------------------------------------
// CrewPickGrid — anonymous tap-to-pick grid (most-likely)
// ---------------------------------------------------------------------------

function CrewPickGrid({
  crew,
  selectedId,
  onPick,
}: {
  crew: Participant[];
  selectedId: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {crew.map((p) => {
        const picked = p.id === selectedId;
        return (
          <button
            key={p.id}
            onClick={() => onPick(p.id)}
            aria-pressed={picked}
            className={cn(
              'flex flex-col items-center gap-0.5 rounded-xl border p-1.5',
              'transition-all duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-500',
              picked
                ? 'border-ember-500/60 bg-ember-500/15'
                : 'border-couch-700 bg-couch-850/60 hover:border-ember-700/50 hover:bg-couch-750',
            )}
          >
            <AvatarSprite avatar={p.avatar} accent={p.accent} mood="idle" size={30} />
            <span
              className="max-w-full truncate text-[9px] font-medium leading-none"
              style={{ color: p.accent }}
            >
              {p.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReadyBody — everyone ready? (locked-in pips)
// ---------------------------------------------------------------------------

export function ReadyBody({
  crew,
  readyCount,
  allReady,
}: {
  crew: Participant[];
  readyCount: number;
  allReady: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {crew.slice(0, 12).map((p) => {
        const isReady = p.isReady;
        return (
          <div
            key={p.id}
            title={`${p.name}${isReady ? ' · locked in' : ''}`}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-all duration-300',
              isReady ? 'bg-moss-400' : 'bg-couch-650',
            )}
          />
        );
      })}
      <span
        className={cn(
          'ml-1 shrink-0 text-[10px] leading-none',
          allReady ? 'text-moss-300' : 'text-cream-400',
        )}
      >
        {readyCount}/{crew.length}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ToastBody — raise one 🥂; the circle clinks when all raise
// ---------------------------------------------------------------------------

export function ToastBody() {
  const { state, selfId } = useRoom();
  const toast = readToast(state);
  const crew = useConnectedCrew();

  // who's already raised
  const raised = new Set(toast?.raised ?? []);
  const raisedCount = raised.size;

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] leading-snug text-cream-300">
        glasses up — the couch is calling a toast.
      </p>
      <div className="flex items-center gap-1.5">
        {crew.slice(0, 12).map((p) => {
          const has = raised.has(p.id);
          const isSelf = p.id === selfId;
          return (
            <span
              key={p.id}
              title={`${p.name}${has ? ' · raised' : ''}`}
              className={cn(
                'text-sm leading-none transition-all duration-300',
                has ? 'opacity-100' : 'opacity-25 grayscale',
                isSelf && has && 'drop-shadow-[0_0_4px_rgba(242,168,80,0.6)]',
              )}
              aria-hidden
            >
              🥂
            </span>
          );
        })}
        <span className="ml-auto shrink-0 text-[10px] text-ember-300">
          {raisedCount}/{crew.length}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SnackBody — snack run vote tally
// ---------------------------------------------------------------------------

export function SnackBody({ yes, no }: { yes: number; no: number }) {
  const total = Math.max(1, yes + no);
  const yesPct = (yes / total) * 100;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] leading-snug text-cream-300">
        someone wants to raid the kitchen. the couch decides.
      </p>
      <div className="flex items-center gap-2 text-xs">
        <span className="font-semibold text-moss-300">{yes} yes</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-couch-700">
          <div
            className="h-full rounded-full bg-moss-400 transition-all duration-300"
            style={{ width: `${yesPct}%` }}
          />
        </div>
        <span className="font-semibold text-cream-400">{no} nah</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RouletteBody — sip roulette; spin picks a connected crew member
// ---------------------------------------------------------------------------

export function RouletteBody() {
  const crew = useConnectedCrew();
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] leading-snug text-cream-300">
        spin the wheel — fate picks one of the {crew.length} on the couch.
      </p>
      <div className="flex items-center gap-1">
        {crew.slice(0, 12).map((p) => (
          <AvatarSprite key={p.id} avatar={p.avatar} accent={p.accent} mood="idle" size={24} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MostLikelyBody — anonymous crew picker; only the tally shows
// ---------------------------------------------------------------------------

export function MostLikelyBody({ game }: { game: GameState }) {
  const { selfId, send } = useRoom();
  const crew = useConnectedCrew();

  const myVote = game.votes?.[selfId] ?? null;
  const totalVotes = game.votes ? Object.keys(game.votes).length : 0;

  function pick(id: string) {
    // votes are anonymous: send the chosen crew id as the action value.
    sendRitual(send, { type: 'sesh:game:action', action: 'vote', value: id });
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="font-display text-[13px] leading-snug text-cream-100">{game.prompt}</p>
      <CrewPickGrid crew={crew} selectedId={myVote} onPick={pick} />
      <p className="text-[10px] leading-none text-cream-400/70">
        {myVote
          ? 'locked your pick — votes are anonymous, only the tally shows'
          : 'tap a creature · anonymous'}
        {totalVotes > 0 && <span className="ml-1 text-cream-400">· {totalVotes} in</span>}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BingoBody — 5 trigger rows; IT HAPPENED → second-crew confirm
// ---------------------------------------------------------------------------

export function BingoBody({ game }: { game: GameState }) {
  const { selfId, send, serverNow } = useRoom();
  const triggers = game.triggers ?? [];
  const checked = new Set(game.checked ?? []);
  const pending = game.pending;

  // tick for the confirm window countdown
  const [, setNow] = React.useState(() => serverNow());
  React.useEffect(() => {
    if (!pending) return;
    const id = setInterval(() => setNow(serverNow()), 250);
    return () => clearInterval(id);
  }, [pending, serverNow]);

  function smash(trigger: string) {
    sendRitual(send, { type: 'sesh:game:action', action: 'call', value: trigger });
  }
  function confirm(trigger: string) {
    sendRitual(send, { type: 'sesh:game:action', action: 'confirm', value: trigger });
  }

  const pendingRemaining =
    pending != null ? Math.max(0, Math.ceil((pending.endsAt - serverNow()) / 1000)) : 0;

  return (
    <div className="flex flex-col gap-1">
      <p className="mb-0.5 text-[10px] leading-none text-cream-400/70">
        smash one when it happens on screen · one more crew confirms
      </p>
      {triggers.map((t) => {
        const isChecked = checked.has(t);
        const isPending = pending?.trigger === t;
        const pendingByMe = isPending && pending?.by === selfId;
        return (
          <div
            key={t}
            className={cn(
              'flex items-center gap-2 rounded-xl border px-2 py-1.5 transition-all duration-200',
              isChecked
                ? 'border-moss-600/40 bg-moss-500/10'
                : isPending
                  ? 'border-ember-500/50 bg-ember-500/10 animate-pulse-glow'
                  : 'border-couch-700 bg-couch-850/50',
            )}
          >
            <span
              className={cn(
                'shrink-0 text-xs leading-none',
                isChecked ? 'opacity-100' : 'opacity-40',
              )}
              aria-hidden
            >
              {isChecked ? '🍿' : '⬜'}
            </span>
            <span
              className={cn(
                'min-w-0 flex-1 text-[11px] leading-snug',
                isChecked ? 'text-moss-200 line-through opacity-80' : 'text-cream-200',
              )}
            >
              {t}
            </span>
            {!isChecked && !isPending && (
              <button
                onClick={() => smash(t)}
                className="shrink-0 rounded-full border border-ember-600/50 bg-ember-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ember-200 transition-colors hover:border-ember-500 hover:text-ember-100"
              >
                it happened
              </button>
            )}
            {isPending && !pendingByMe && (
              <button
                onClick={() => confirm(t)}
                className="shrink-0 rounded-full border border-ember-500/60 bg-ember-500/20 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ember-100 transition-colors hover:bg-ember-500/30"
              >
                confirm {pendingRemaining}s
              </button>
            )}
            {isPending && pendingByMe && (
              <span className="shrink-0 text-[9px] uppercase tracking-wide text-ember-300/80">
                need a 2nd · {pendingRemaining}s
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CircleHint — tiny readout of the active circle kind (toke/drink) for cards
// that flavor their copy off it. Exposed so ToastBody-adjacent surfaces share it.
// ---------------------------------------------------------------------------

export function useCircleCopy() {
  const { state } = useRoom();
  const kind = readCircleKind(state);
  return circleCopy(kind);
}

// re-export the game reader for the wiring module
export { readGame };

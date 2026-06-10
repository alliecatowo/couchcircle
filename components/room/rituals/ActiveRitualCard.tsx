'use client';

/**
 * ActiveRitualCard — picks the ONE active ritual and renders it through the shared
 * {@link RitualCard} shell (SPRINT2 §12). Pinned at the top of the chat scroll area
 * by ChatPanel (chat is the table).
 *
 * Priority (only one card at a time): game > toast > ready > snack.
 *   - game  → roulette / most-likely / movie-bingo bodies + per-kind action
 *   - toast → raise one 🥂 (circle-kind aware copy)
 *   - ready → everyone ready? locked-in toggle (+ controller start anyway)
 *   - snack → snack run yes/nah
 *
 * Renders null when no ritual is live. Server keeps per-kind state; this is the one
 * UI grammar over all of it.
 */

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRoom } from '@/lib/realtime/room-context';
import { SNACK_VOTE_WINDOW_MS } from '@/shared/constants';
import { RitualCard, useServerCountdown, type RitualTone } from './RitualCard';
import {
  ReadyBody,
  ToastBody,
  SnackBody,
  RouletteBody,
  MostLikelyBody,
  BingoBody,
  useCircleCopy,
} from './bodies';
import {
  readToast,
  readGame,
  sendRitual,
  type GameKind,
} from './types';

// Toast window is 10s per §8; most-likely vote window is 20s per §12.
const TOAST_WINDOW_MS = 10_000;
const MOST_LIKELY_WINDOW_MS = 20_000;

type RitualSlot = 'game' | 'toast' | 'ready' | 'snack' | null;

function pickSlot(args: {
  hasGame: boolean;
  hasToast: boolean;
  hasReady: boolean;
  hasSnack: boolean;
}): RitualSlot {
  if (args.hasGame) return 'game';
  if (args.hasToast) return 'toast';
  if (args.hasReady) return 'ready';
  if (args.hasSnack) return 'snack';
  return null;
}

export function ActiveRitualCard() {
  const { state, self, isHost, isController } = useRoom();

  const game = readGame(state);
  const toast = readToast(state);
  const readyCheck = state?.readyCheck;
  const snack = state?.sesh.snackVote;

  const slot = pickSlot({
    hasGame: !!game,
    hasToast: !!toast,
    hasReady: !!readyCheck?.active,
    hasSnack: !!snack,
  });

  return (
    <AnimatePresence mode="wait">
      {slot && (
        <motion.div
          key={slot + (game?.kind ?? '')}
          initial={{ opacity: 0, y: -8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 460, damping: 36 }}
        >
          {slot === 'game' && game && <GameCard />}
          {slot === 'toast' && toast && <ToastCard />}
          {slot === 'ready' && readyCheck?.active && (
            <ReadyCard selfReady={self?.isReady ?? false} canControl={isController || isHost} />
          )}
          {slot === 'snack' && snack && <SnackCard />}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// GameCard — roulette / most-likely / movie-bingo
// ---------------------------------------------------------------------------

const GAME_META: Record<GameKind, { emoji: string; title: string; tone: RitualTone }> = {
  roulette: { emoji: '🎲', title: 'sip roulette', tone: 'ember' },
  'most-likely': { emoji: '🗳️', title: 'most likely to…', tone: 'haze' },
  'movie-bingo': { emoji: '🍿', title: 'movie bingo', tone: 'moss' },
};

function GameCard() {
  const { state, isHost, isController, send } = useRoom();
  const game = readGame(state);
  const meta = game ? GAME_META[game.kind] : null;

  // most-likely has a 20s vote window; the bar tracks it.
  const { progress } = useServerCountdown(
    game?.kind === 'most-likely' ? game.endsAt : undefined,
    MOST_LIKELY_WINDOW_MS,
  );

  if (!game || !meta) return null;
  const canStop = isController || isHost;

  let body: React.ReactNode = null;
  let action: React.ComponentProps<typeof RitualCard>['action'];
  let aside: React.ReactNode;

  if (game.kind === 'roulette') {
    body = <RouletteBody />;
    action = {
      label: 'spin 🎲',
      onClick: () => sendRitual(send, { type: 'sesh:game:action', action: 'spin' }),
    };
  } else if (game.kind === 'most-likely') {
    body = <MostLikelyBody game={game} />;
    aside = game.votes ? `${Object.keys(game.votes).length} in` : undefined;
    // the vote IS the picker tap; no separate hero action.
    action = undefined;
  } else {
    // movie-bingo
    const got = (game.checked ?? []).length;
    const all = (game.triggers ?? []).length || 5;
    body = <BingoBody game={game} />;
    aside = `${got}/${all}`;
  }

  return (
    <RitualCard
      emoji={meta.emoji}
      title={meta.title}
      tone={meta.tone}
      aside={aside}
      action={action}
      progress={game.kind === 'most-likely' ? progress : undefined}
      onDismiss={canStop ? () => sendRitual(send, { type: 'sesh:game:stop' }) : undefined}
    >
      {body}
    </RitualCard>
  );
}

// ---------------------------------------------------------------------------
// ToastCard — raise one 🥂
// ---------------------------------------------------------------------------

function ToastCard() {
  const { state, selfId, send } = useRoom();
  const toast = readToast(state);
  const copy = useCircleCopy();
  const { progress } = useServerCountdown(toast?.endsAt, TOAST_WINDOW_MS);

  if (!toast) return null;
  const alreadyRaised = toast.raised.includes(selfId);

  return (
    <RitualCard
      emoji="🥂"
      title="raise one"
      tone="ember"
      progress={progress}
      action={{
        label: alreadyRaised ? 'glass up 🥂' : copy.act,
        variant: alreadyRaised ? 'outline' : 'accent',
        disabled: alreadyRaised,
        onClick: () => sendRitual(send, { type: 'sesh:toast:raise' }),
        className: alreadyRaised ? 'border-ember-600/50 text-ember-200' : '',
      }}
    >
      <ToastBody />
    </RitualCard>
  );
}

// ---------------------------------------------------------------------------
// ReadyCard — everyone ready?
// ---------------------------------------------------------------------------

function ReadyCard({ selfReady, canControl }: { selfReady: boolean; canControl: boolean }) {
  const { state, send } = useRoom();

  const crew = React.useMemo(
    () => Object.values(state?.participants ?? {}).filter((p) => p.connected),
    [state],
  );
  const readyCount = crew.filter((p) => p.isReady).length;
  const allReady = crew.length > 0 && readyCount === crew.length;

  function startAnyway() {
    send({ type: 'ready:cancel' });
    send({ type: 'media:play' });
  }

  return (
    <RitualCard
      emoji={allReady ? '🟢' : '👀'}
      title={allReady ? "everyone's ready" : 'everyone ready?'}
      tone={allReady ? 'moss' : 'ember'}
      aside={`${readyCount}/${crew.length}`}
      footnote={
        canControl ? (
          <button
            onClick={startAnyway}
            className="text-[10px] text-moss-300 underline-offset-2 hover:underline"
          >
            start anyway ▶
          </button>
        ) : null
      }
      action={{
        label: selfReady ? 'actually wait ✋' : 'locked in 🟢',
        variant: selfReady ? 'outline' : 'accent',
        onClick: () => send({ type: 'ready:set', ready: !selfReady }),
        className: selfReady ? 'border-moss-600/60 text-moss-300' : '',
      }}
    >
      <ReadyBody crew={crew} readyCount={readyCount} allReady={allReady} />
    </RitualCard>
  );
}

// ---------------------------------------------------------------------------
// SnackCard — snack run vote
// ---------------------------------------------------------------------------

function SnackCard() {
  const { state, selfId, send } = useRoom();
  const snack = state?.sesh.snackVote;
  const { progress } = useServerCountdown(snack?.endsAt, SNACK_VOTE_WINDOW_MS);

  if (!snack) return null;
  const myVote: 'yes' | 'no' | null = snack.yes.includes(selfId)
    ? 'yes'
    : snack.no.includes(selfId)
      ? 'no'
      : null;

  return (
    <RitualCard
      emoji="🍿"
      title="snack run?"
      tone="moss"
      aside={`${snack.yes.length}–${snack.no.length}`}
      progress={progress}
      action={{
        label: myVote === 'yes' ? "you're in 🍿" : 'i want snacks 🍿',
        variant: myVote === 'yes' ? 'outline' : 'accent',
        onClick: () => send({ type: 'sesh:snack-vote', vote: 'yes' }),
        className: myVote === 'yes' ? 'border-moss-600/60 text-moss-300' : '',
      }}
      footnote={
        <button
          onClick={() => send({ type: 'sesh:snack-vote', vote: 'no' })}
          className={cnNah(myVote === 'no')}
        >
          {myVote === 'no' ? 'voted nah' : 'nah, stay put'}
        </button>
      }
    >
      <SnackBody yes={snack.yes.length} no={snack.no.length} />
    </RitualCard>
  );
}

function cnNah(active: boolean): string {
  return active
    ? 'text-[10px] text-cream-200'
    : 'text-[10px] text-cream-400 underline-offset-2 hover:underline';
}

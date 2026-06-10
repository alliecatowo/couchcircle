'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Wifi } from 'lucide-react';
import { useRoom } from '@/lib/realtime/room-context';
import type { ErrorCode } from '@/shared/protocol';

/** Cozy, never-blamey copy for the short-lived error toasts. */
function errorCopy(code: ErrorCode, fallback: string): string {
  switch (code) {
    case 'rate-limited':
      return 'whoa, slow down ☕';
    case 'not-allowed':
      return "you don't have the remote for that";
    case 'room-full':
      return 'the couch is full (12 max)';
    case 'wrong-password':
      return "that's not the secret knock";
    case 'password-required':
      return 'this room wants the secret knock';
    case 'invalid-message':
      return 'that one got lost in the haze';
    case 'room-not-found':
      return 'this room dissolved into the haze';
    default:
      return fallback || 'something got a little hazy';
  }
}

/**
 * ErrorBanner — slides down from the top whenever the couch hits a snag:
 * a transient `lastError` from the server, or a wobbly connection. Auto-tidies
 * itself when the underlying state clears (lastError auto-expires in the
 * provider; connection banners vanish once we're 'connected' again).
 */
export function ErrorBanner() {
  const { lastError, connectionStatus } = useRoom();

  // Connection trouble takes the banner first — it's the louder, stickier signal.
  const connectionTrouble =
    connectionStatus === 'reconnecting' || connectionStatus === 'disconnected';

  let kind: 'connection' | 'error' | null = null;
  if (connectionTrouble) kind = 'connection';
  else if (lastError) kind = 'error';

  const connectionText =
    connectionStatus === 'reconnecting'
      ? 'reconnecting to the couch…'
      : 'lost the couch — trying to find our way back…';

  const text =
    kind === 'connection'
      ? connectionText
      : lastError
        ? errorCopy(lastError.code, lastError.message)
        : '';

  // A stable key so the banner re-animates when the message actually changes.
  const bannerKey =
    kind === 'connection'
      ? `conn-${connectionStatus}`
      : lastError
        ? `err-${lastError.code}-${lastError.ts}`
        : 'none';

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-4 pt-3">
      <AnimatePresence>
        {kind && (
          <motion.div
            key={bannerKey}
            initial={{ y: -64, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -64, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className={
              'pointer-events-auto flex items-center gap-2.5 rounded-2xl border px-4 py-2.5 ' +
              'text-sm font-medium shadow-[var(--shadow-lifted)] backdrop-blur ' +
              (kind === 'connection'
                ? 'border-ember-500/30 bg-couch-850/90 text-ember-200'
                : 'border-coal-red/40 bg-couch-850/90 text-cream-100')
            }
            role="status"
            aria-live="polite"
          >
            {kind === 'connection' ? (
              <Wifi className="size-4 animate-pulse text-ember-400" />
            ) : (
              <AlertTriangle className="size-4 text-coal-red" />
            )}
            <span>{text}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

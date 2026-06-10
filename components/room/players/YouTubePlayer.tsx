'use client';

/**
 * YouTubePlayer — mounts a {@link YouTubeAdapter} into the stage and hands it to
 * the room's {@link SyncEngine} (§12).
 *
 * Lifecycle (per §12 contract): create a container div, instantiate the adapter
 * against it, `await adapter.load(item)`, then `engine.setAdapter(adapter)`. On
 * unmount (or when the keyed item changes and this remounts) we detach from the
 * engine and destroy the adapter. Errors surface a friendly panel with a
 * "skip it" escape hatch for whoever holds the remote.
 */

import * as React from 'react';
import { useRoom } from '@/lib/realtime/room-context';
import { YouTubeAdapter } from '@/lib/media/youtube';
import type { SyncEngine } from '@/lib/sync/sync-engine';
import type { QueueItem } from '@/shared/protocol';
import { MediaErrorPanel } from './player-shared';

export function YouTubePlayer({ engine, item }: { engine: SyncEngine; item: QueueItem }) {
  const { isController, send } = useRoom();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Keep the latest controller flag + send fn in a ref so the (item-keyed,
  // run-once) effect's onEnded reports natural end without re-subscribing.
  const endedRef = React.useRef({ isController, send });
  endedRef.current = { isController, send };

  // Always hold the freshest item so the load effect can read current data
  // without item object identity being in the dep array (which would retrigger
  // on every room:state broadcast that returns a new object reference).
  const itemRef = React.useRef(item);
  itemRef.current = item;

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // `cancelled` flips in cleanup; `registered` tracks whether THIS effect's
    // adapter is the one currently handed to the engine. Under React 19's
    // dev-mode double-invoke (mount → unmount → remount) the first effect's
    // async load can resolve AFTER its own cleanup ran — these flags ensure a
    // cancelled effect never registers its (now destroyed) adapter, and that
    // cleanup only detaches the engine when this effect actually owns the
    // registered adapter (so it can't clobber a sibling effect's live one).
    let adapter: YouTubeAdapter | null = null;
    let cancelled = false;
    let registered = false;

    const events = {
      onStatus: () => {},
      onEnded: () => {
        // Only the controller reports natural end so the server advances the
        // queue exactly once (every viewer sees 'ended' too).
        if (endedRef.current.isController) {
          endedRef.current.send({ type: 'media:ended' });
        }
      },
      onError: (message: string) => setError(message),
    };

    (async () => {
      try {
        const a = new YouTubeAdapter(container, events);
        adapter = a;
        // Read itemRef.current so we get the freshest metadata (url, title,
        // startAt) at load time, without putting the whole item object in deps.
        const currentItem = itemRef.current;
        console.debug(`[sync] YouTubePlayer effect created item=${currentItem.id}`);
        await a.load(currentItem);
        console.debug(`[sync] YouTubePlayer load-done item=${currentItem.id} cancelled=${cancelled} status=${a.getStatus()}`);
        // Bail if cleanup ran while we were loading: destroy the orphan adapter
        // and NEVER register it with the engine.
        if (cancelled) {
          console.debug('[sync] YouTubePlayer cancelled-orphan → destroy (never registered)');
          a.destroy();
          return;
        }
        engine.setAdapter(a);
        registered = true;
        console.debug('[sync] YouTubePlayer registered adapter with engine');
      } catch (err) {
        // Tear down a partially-built adapter so a failed load can't leak one.
        console.debug(`[sync] YouTubePlayer load threw: ${err instanceof Error ? err.message : String(err)}`);
        adapter?.destroy();
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "couldn't load this youtube video");
        }
      }
    })();

    return () => {
      cancelled = true;
      console.debug(`[sync] YouTubePlayer cleanup-destroy item=${itemRef.current.id} registered=${registered}`);
      // Only detach the engine if THIS effect's adapter is the registered one,
      // so we never null out a sibling/remounted effect's live adapter.
      if (registered) engine.setAdapter(null);
      adapter?.destroy();
      adapter = null;
    };
    // Depend ONLY on stable primitives: item.id (the component is also keyed by
    // item.id in StagePlayer so a real item change causes a full remount anyway)
    // and engine. The full item object is intentionally NOT in deps — it creates
    // a new reference on every room:state broadcast and would retrigger the load
    // every ~2–3 s. itemRef.current supplies fresh data without that cost.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, item.id]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full [&_iframe]:h-full [&_iframe]:w-full" />
      {error && <MediaErrorPanel message={error} itemId={item.id} />}
    </div>
  );
}

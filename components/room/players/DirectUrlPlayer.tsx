'use client';

/**
 * DirectUrlPlayer — mounts a {@link DirectUrlAdapter} (mp4/webm/HLS) into the
 * stage and hands it to the room's {@link SyncEngine} (§12).
 *
 * Same lifecycle as the YouTube player: a real `<video>` element, adapter built
 * against it, `await adapter.load(item)`, `engine.setAdapter(adapter)`, then
 * detach + destroy on unmount/item change. Errors surface the shared friendly
 * panel with a "skip it" escape hatch for the remote-holder.
 */

import * as React from 'react';
import { useRoom } from '@/lib/realtime/room-context';
import { DirectUrlAdapter } from '@/lib/media/direct-url';
import type { SyncEngine } from '@/lib/sync/sync-engine';
import type { QueueItem } from '@/shared/protocol';
import { MediaErrorPanel } from './player-shared';

export function DirectUrlPlayer({ engine, item }: { engine: SyncEngine; item: QueueItem }) {
  const { isController, send } = useRoom();
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
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
    const video = videoRef.current;
    if (!video) return;

    // `cancelled` flips in cleanup; `registered` tracks whether THIS effect's
    // adapter is the one currently handed to the engine. Under React 19's
    // dev-mode double-invoke (mount → unmount → remount) the first effect's
    // async load can resolve AFTER its own cleanup ran — these flags ensure a
    // cancelled effect never registers its (now destroyed) adapter, and that
    // cleanup only detaches the engine when this effect actually owns the
    // registered adapter (so it can't clobber a sibling effect's live one).
    let adapter: DirectUrlAdapter | null = null;
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
        const a = new DirectUrlAdapter(video, events);
        adapter = a;
        // Read itemRef.current so we get the freshest metadata (url, title,
        // startAt) at load time, without putting the whole item object in deps.
        const currentItem = itemRef.current;
        await a.load(currentItem);
        // Bail if cleanup ran while we were loading: destroy the orphan adapter
        // and NEVER register it with the engine.
        if (cancelled) {
          a.destroy();
          return;
        }
        engine.setAdapter(a);
        registered = true;
      } catch (err) {
        // Tear down a partially-built adapter so a failed load can't leak one.
        adapter?.destroy();
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "couldn't load this link");
        }
      }
    })();

    return () => {
      cancelled = true;
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
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        className="h-full w-full bg-couch-950 object-contain"
        playsInline
      />
      {error && <MediaErrorPanel message={error} itemId={item.id} />}
    </div>
  );
}

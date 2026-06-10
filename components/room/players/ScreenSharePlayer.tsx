'use client';

/**
 * ScreenSharePlayer — the P2P mesh screen share, host + viewer sides (§12, §10.4,
 * SPRINT2 §5).
 *
 * The sharer is `state.media.sharerId`. If that's us we're the HOST: we own one
 * {@link ScreenShareMesh}, pick a quality preset, capture our screen via
 * `getDisplayMedia`, preview it locally (muted), and tell the room `screen:start`.
 * We surface a per-viewer connection-state row from `onPeerStates` plus a live
 * stats chip (resolution · fps · up-kbps · watcher count). Everyone else is a
 * VIEWER: we ask to view, attach the remote stream when it arrives, and show our
 * own connection state chip + an inbound-kbps chip with honest copy about mesh
 * limits.
 *
 * Honest about the MVP: STUN-only, no TURN relay — when a peer can't punch
 * through we say so plainly rather than spinning forever.
 */

import * as React from 'react';
import { MonitorUp, MonitorOff, Loader2, Wifi, WifiOff, AlertTriangle, Gauge } from 'lucide-react';
import { useRoom } from '@/lib/realtime/room-context';
import {
  ScreenShareAdapter,
  SHARE_PRESETS,
  DEFAULT_SHARE_PRESET,
  type SharePreset,
} from '@/lib/media/screen-share';
import {
  ScreenShareMesh,
  type PeerConnState,
  type ShareStats,
  type ViewerStats,
} from '@/lib/webrtc/mesh';
import type { SyncEngine } from '@/lib/sync/sync-engine';
import type { QueueItem } from '@/shared/protocol';
import { MESH_COMFORT_LIMIT } from '@/shared/constants';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Connection-state chip
// ---------------------------------------------------------------------------

function PeerStateChip({ state, label }: { state: PeerConnState; label?: string }) {
  const map: Record<PeerConnState, { text: string; icon: React.ReactNode; cls: string }> = {
    connecting: {
      text: 'connecting…',
      icon: <Loader2 className="animate-spin" />,
      cls: 'border-ember-600/40 bg-ember-950/40 text-ember-300',
    },
    connected: {
      text: 'connected',
      icon: <Wifi />,
      cls: 'border-moss-600/50 bg-moss-900/40 text-moss-300',
    },
    failed: {
      text: "couldn't connect",
      icon: <AlertTriangle />,
      cls: 'border-coal-red/40 bg-coal-red/15 text-cream-100',
    },
    disconnected: {
      text: 'dropped',
      icon: <WifiOff />,
      cls: 'border-couch-700 bg-couch-800/70 text-cream-400',
    },
  };
  const m = map[state];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5',
        'text-xs font-semibold leading-none [&_svg]:size-3 [&_svg]:shrink-0',
        m.cls,
      )}
    >
      {m.icon}
      {label ? `${label}: ${m.text}` : m.text}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Stats chip — small telemetry readout (host: full; viewer: down-kbps)
// ---------------------------------------------------------------------------

/** "1.4 Mbps" / "640 kbps" from a kbps figure. */
function fmtBitrate(kbps: number): string {
  if (kbps <= 0) return '— kbps';
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(1)} Mbps`;
  return `${kbps} kbps`;
}

function StatsChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-couch-700 bg-couch-800/70 px-2.5 py-0.5',
        'font-body text-xs font-semibold leading-none text-cream-200 [&_svg]:size-3 [&_svg]:shrink-0 [&_svg]:text-ember-300',
      )}
    >
      <Gauge />
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Preset segmented control (host, before start)
// ---------------------------------------------------------------------------

const PRESET_ORDER: SharePreset[] = ['crisp', 'smooth', 'saver'];

function PresetPicker({
  value,
  onChange,
}: {
  value: SharePreset;
  onChange: (p: SharePreset) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="share quality"
      className="flex w-full max-w-md gap-1 rounded-2xl border border-couch-700 bg-couch-850/80 p-1"
    >
      {PRESET_ORDER.map((p) => {
        const spec = SHARE_PRESETS[p];
        const active = p === value;
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(p)}
            className={cn(
              'flex flex-1 flex-col items-center gap-0.5 rounded-xl px-3 py-2 text-center',
              'transition-colors duration-200 ease-[var(--ease-cozy)]',
              active
                ? 'bg-ember-500/15 text-cream-50 ring-1 ring-ember-500/60 glow-ember'
                : 'text-cream-400 hover:bg-couch-750 hover:text-cream-200',
            )}
          >
            <span className="font-display text-sm leading-none">{spec.label}</span>
            <span className="text-[0.65rem] leading-tight text-cream-400">{spec.blurb}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Host side
// ---------------------------------------------------------------------------

function HostShare({ engine }: { engine: SyncEngine }) {
  const { selfId, connection, send, state } = useRoom();
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const meshRef = React.useRef<ScreenShareMesh | null>(null);
  const adapterRef = React.useRef<ScreenShareAdapter | null>(null);

  const [sharing, setSharing] = React.useState(false);
  const [preset, setPreset] = React.useState<SharePreset>(DEFAULT_SHARE_PRESET);
  const [peerStates, setPeerStates] = React.useState<Record<string, PeerConnState>>({});
  const [stats, setStats] = React.useState<ShareStats | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Keep a stable place to read participant names for the per-viewer row.
  const participants = state?.participants;

  React.useEffect(() => {
    if (!connection) return;

    const mesh = new ScreenShareMesh({
      selfId,
      connection,
      onRemoteStream: () => {}, // host doesn't consume a remote stream
      onPeerStates: (states) => setPeerStates(states),
      onLocalEnded: () => {
        // User hit the browser's native "Stop sharing".
        stopSharing();
      },
    });
    meshRef.current = mesh;

    const video = videoRef.current;
    if (video) {
      const adapter = new ScreenShareAdapter(
        video,
        { onStatus: () => {}, onEnded: () => {}, onError: (m) => setError(m) },
        { isLocal: true },
      );
      adapterRef.current = adapter;
      engine.setAdapter(adapter);
    }

    return () => {
      mesh.destroy();
      meshRef.current = null;
      engine.setAdapter(null);
      adapterRef.current?.destroy();
      adapterRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, selfId, engine]);

  // Live stats chip: poll getShareStats every 3s while sharing.
  React.useEffect(() => {
    if (!sharing) {
      setStats(null);
      return;
    }
    let alive = true;
    const sample = async () => {
      const s = await meshRef.current?.getShareStats();
      if (alive) setStats(s ?? null);
    };
    void sample();
    const id = window.setInterval(() => void sample(), 3000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [sharing]);

  async function startSharing() {
    const mesh = meshRef.current;
    if (!mesh) return;
    setError(null);
    try {
      const stream = await mesh.startSharing({ preset });
      adapterRef.current?.attachStream(stream);
      setSharing(true);
      send({ type: 'screen:start' });
    } catch (err) {
      // Most commonly: the user dismissed the picker or denied permission.
      const denied =
        err instanceof DOMException &&
        (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
      setError(
        denied
          ? "you didn't let us grab your screen — no worries, try again whenever"
          : err instanceof Error
            ? err.message
            : "couldn't start the screen share",
      );
      send({ type: 'screen:stop' });
    }
  }

  function stopSharing() {
    meshRef.current?.stopSharing();
    adapterRef.current?.attachStream(null);
    setSharing(false);
    setPeerStates({});
    setStats(null);
    send({ type: 'screen:stop' });
  }

  const viewerEntries = Object.entries(peerStates);
  const watching = stats?.viewers ?? viewerEntries.length;

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="relative flex-1">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video ref={videoRef} className="h-full w-full bg-couch-950 object-contain" playsInline muted />
        {!sharing && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-couch-950/80 px-6 text-center backdrop-blur-sm">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-couch-800 text-ember-300 [&_svg]:size-7">
              <MonitorUp />
            </div>
            <p className="max-w-sm font-body text-sm text-cream-300">
              you&apos;re the one sharing — pick a quality, then grab a tab or window
            </p>
            <PresetPicker value={preset} onChange={setPreset} />
            <p className="max-w-sm font-body text-xs text-cream-400">
              sharper than discord, lighter on your upload
            </p>
            <Button variant="accent" size="lg" onClick={startSharing}>
              <MonitorUp />
              start sharing your screen
            </Button>
            {error && <p className="max-w-sm font-body text-xs text-coal-red">{error}</p>}
          </div>
        )}
      </div>

      {sharing && (
        <div className="flex flex-wrap items-center gap-2 border-t border-couch-700 bg-couch-850/90 px-4 py-2.5">
          <Badge variant="live">🔴 you&apos;re sharing</Badge>
          {stats && (
            <StatsChip>
              {stats.height}p · {stats.fps}fps · {fmtBitrate(stats.kbpsUp)} · {watching} watching
            </StatsChip>
          )}
          {viewerEntries.length === 0 ? (
            <span className="font-body text-xs text-cream-400">
              waiting for the couch to tune in…
            </span>
          ) : (
            viewerEntries.map(([viewerId, st]) => (
              <PeerStateChip
                key={viewerId}
                state={st}
                label={participants?.[viewerId]?.name ?? 'someone'}
              />
            ))
          )}
          <Button
            variant="danger"
            size="sm"
            className="ml-auto"
            onClick={stopSharing}
          >
            <MonitorOff />
            stop sharing
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Viewer side
// ---------------------------------------------------------------------------

function ViewerShare({ engine, sharerId }: { engine: SyncEngine; sharerId: string }) {
  const { selfId, connection, state } = useRoom();
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const meshRef = React.useRef<ScreenShareMesh | null>(null);
  const adapterRef = React.useRef<ScreenShareAdapter | null>(null);

  const [connState, setConnState] = React.useState<PeerConnState>('connecting');
  const [hasStream, setHasStream] = React.useState(false);
  const [stats, setStats] = React.useState<ViewerStats | null>(null);

  React.useEffect(() => {
    if (!connection) return;
    const video = videoRef.current;

    const adapter = video
      ? new ScreenShareAdapter(
          video,
          { onStatus: () => {}, onEnded: () => {}, onError: () => {} },
          { isLocal: false },
        )
      : null;
    adapterRef.current = adapter;
    if (adapter) engine.setAdapter(adapter);

    const mesh = new ScreenShareMesh({
      selfId,
      connection,
      onRemoteStream: (stream) => {
        adapterRef.current?.attachStream(stream);
        setHasStream(!!stream);
      },
      onPeerStates: (states) => {
        const st = states[sharerId];
        if (st) setConnState(st);
      },
      onLocalEnded: () => {},
    });
    meshRef.current = mesh;
    mesh.becomeViewer(sharerId);

    return () => {
      mesh.destroy();
      meshRef.current = null;
      engine.setAdapter(null);
      adapterRef.current?.destroy();
      adapterRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, selfId, sharerId, engine]);

  // Inbound-kbps chip: poll getViewerStats every 3s once a stream is flowing.
  React.useEffect(() => {
    if (!hasStream) {
      setStats(null);
      return;
    }
    let alive = true;
    const sample = async () => {
      const s = await meshRef.current?.getViewerStats();
      if (alive) setStats(s ?? null);
    };
    void sample();
    const id = window.setInterval(() => void sample(), 3000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [hasStream]);

  const connectedCount = state
    ? Object.values(state.participants).filter((p) => p.connected).length
    : 0;
  const crowded = connectedCount > MESH_COMFORT_LIMIT;
  const sharerName = state?.participants?.[sharerId]?.name ?? 'the host';

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="relative flex-1">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          className="h-full w-full bg-couch-950 object-contain"
          autoPlay
          playsInline
        />
        {!hasStream && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-couch-950/80 px-6 text-center backdrop-blur-sm">
            {connState === 'failed' ? (
              <>
                <div className="flex size-12 items-center justify-center rounded-2xl bg-couch-800 text-coal-red [&_svg]:size-6">
                  <WifiOff />
                </div>
                <p className="font-display text-base text-cream-100">
                  p2p couldn&apos;t punch through
                </p>
                <p className="max-w-sm font-body text-xs text-cream-400">
                  no relay server in the MVP — sometimes networks just won&apos;t shake
                  hands. ask {sharerName} to retry, or try a different connection.
                </p>
              </>
            ) : (
              <>
                <Loader2 className="size-7 animate-spin text-ember-300" />
                <p className="font-body text-sm text-cream-300">
                  tuning into {sharerName}&apos;s screen…
                </p>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-couch-700 bg-couch-850/90 px-4 py-2.5">
        <PeerStateChip state={connState} />
        {stats && <StatsChip>{fmtBitrate(stats.kbpsDown)} down</StatsChip>}
        <span className="font-body text-xs text-cream-400">
          sharper than discord, lighter on your upload
        </span>
        {crowded && (
          <Badge variant="live" className="ml-auto gap-1">
            <AlertTriangle />
            big room — mesh may get choppy
          </Badge>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

export function ScreenSharePlayer({ engine, item }: { engine: SyncEngine; item: QueueItem }) {
  const { selfId, state } = useRoom();
  // Prefer the live sharerId from media state; fall back to the item source.
  const sharerId = state?.media.sharerId ?? item.source;

  if (sharerId === selfId) {
    return <HostShare engine={engine} />;
  }
  return <ViewerShare engine={engine} sharerId={sharerId} />;
}

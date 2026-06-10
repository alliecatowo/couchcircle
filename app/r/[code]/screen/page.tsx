'use client';

/**
 * The projector route — `/r/CODE/screen` (SPRINT2 §1).
 *
 * The companion big-screen window. It mounts a {@link RoomProvider} in the
 * `projector` role (auto-joins as a pure viewer with an ephemeral, never-
 * persisted identity — no JoinGate, no seat) and renders {@link ProjectorView}:
 * full-bleed black, the active player on its own SyncEngine, "tap to roll 🎬",
 * a minimal cursor-hiding status, and the §9 peanut gallery.
 */

import { use } from 'react';
import { normalizeJoinCode } from '@/shared/join-codes';
import { RoomProvider } from '@/lib/realtime/room-context';
import { ProjectorView } from '@/components/room/ProjectorView';

export default function ProjectorPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const normalized = normalizeJoinCode(decodeURIComponent(code));
  return (
    <RoomProvider code={normalized} role="projector">
      <ProjectorView />
    </RoomProvider>
  );
}

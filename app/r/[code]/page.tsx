'use client';

import { use } from 'react';
import { normalizeJoinCode } from '@/shared/join-codes';
import { RoomShell } from '@/components/room/RoomShell';

/**
 * The room route. Next 15 hands `params` as a Promise, so we unwrap it with
 * React's `use()` inside this client component, normalize the code, and let
 * <RoomShell> stand up the provider and the cozy join experience.
 */
export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const normalized = normalizeJoinCode(decodeURIComponent(code));
  return <RoomShell code={normalized} />;
}

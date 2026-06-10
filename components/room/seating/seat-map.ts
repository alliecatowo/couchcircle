/**
 * seat-map — the fixed living-room seat map of 12 (CONCEPTS.md §4).
 *
 * The room is a real living room facing the TV: a 3-seat couch in the center, a
 * 2-seat loveseat on the left (angled slightly inward), a 1-seat armchair on the
 * right (angled inward), and a floor arc of 6 spots in front (bean bag, cushion,
 * pouf, cushion, bean bag, rug spot). Every seat is intentional — nobody is
 * "overflow".
 *
 * ── Seat order (§4) ───────────────────────────────────────────────────────────
 *   0–2  couch         L→R
 *   3–4  loveseat      L→R   (left of the couch, angled inward)
 *   5    armchair             (right of the couch, angled inward)
 *   6–11 floor arc     L→R   bean bag · cushion · pouf · cushion · bean bag · rug
 *
 * ── No musical chairs (the sticky-seat property) ─────────────────────────────
 *   A participant keeps the SAME seat for the entire life of their participant
 *   record, including reconnects (same id ⇒ same seat). When someone leaves for
 *   good their seat frees up, and the *next new joiner* takes the lowest open
 *   seat. Existing crew never move.
 *
 *   We get this for free by ordering participants by `joinedAt` (server clock —
 *   identical on every client, so the assignment is deterministic everywhere)
 *   and walking that order into seats. Because `joinedAt` is fixed per
 *   participant and a leaver is removed from the record entirely, the relative
 *   order of everyone who stays is preserved: a newcomer always sorts AFTER the
 *   existing crew (they joined later), so they slot into the lowest seat that the
 *   existing crew don't occupy — never displacing anyone. (`id` breaks the rare
 *   exact-tie so the order is total and stable across clients.)
 */

import type { Participant } from '@/shared/protocol';
import { MAX_PARTICIPANTS } from '@/shared/constants';

// ---------------------------------------------------------------------------
// Seat anatomy
// ---------------------------------------------------------------------------

/** Which kind of furniture a seat belongs to — drives the sprite + sit pose. */
export type SeatFurniture =
  | 'couch'
  | 'loveseat'
  | 'armchair'
  | 'beanbag'
  | 'cushion'
  | 'pouf'
  | 'rug';

/** Sitting up on furniture vs sitting low on the floor — drives avatar offset. */
export type SeatPose = 'sit' | 'floor';

/**
 * One seat in the map. Coordinates are on a normalized 0..100 stage where the TV
 * is at the top; the scene component maps these onto its own pixel box so the
 * same anchors work at every breakpoint. `angle` is a gentle inward lean in
 * degrees (+ leans right, − leans left) for the flanking furniture.
 */
export interface Seat {
  index: number;
  furniture: SeatFurniture;
  pose: SeatPose;
  /** 0..100 across the stage (left→right). */
  x: number;
  /** 0..100 down the stage (TV at 0). */
  y: number;
  /** gentle inward lean, degrees. */
  angle: number;
}

// ---------------------------------------------------------------------------
// The 12 seats (§4 layout). Coordinates compose the scene for the full room;
// empty seats read as invitations, never as gaps.
// ---------------------------------------------------------------------------

/**
 * The canonical, frozen seat map. Index === seat order from §4.
 *
 *   furniture row (y ≈ 40): loveseat(3,4) · couch(0,1,2) · armchair(5)
 *   floor arc     (y ≈ 78): beanbag(6) cushion(7) pouf(8) cushion(9) beanbag(10) rug(11)
 */
export const SEAT_MAP: readonly Seat[] = Object.freeze([
  // ── couch (center, 3 seats) ──
  { index: 0, furniture: 'couch', pose: 'sit', x: 40, y: 41, angle: 0 },
  { index: 1, furniture: 'couch', pose: 'sit', x: 50, y: 40, angle: 0 },
  { index: 2, furniture: 'couch', pose: 'sit', x: 60, y: 41, angle: 0 },
  // ── loveseat (left, 2 seats, angled inward → leans right) ──
  { index: 3, furniture: 'loveseat', pose: 'sit', x: 14, y: 44, angle: 12 },
  { index: 4, furniture: 'loveseat', pose: 'sit', x: 24, y: 43, angle: 9 },
  // ── armchair (right, 1 seat, angled inward → leans left) ──
  { index: 5, furniture: 'armchair', pose: 'sit', x: 84, y: 44, angle: -13 },
  // ── floor arc (front, 6 spots, L→R) ──
  { index: 6, furniture: 'beanbag', pose: 'floor', x: 18, y: 80, angle: 6 },
  { index: 7, furniture: 'cushion', pose: 'floor', x: 31, y: 83, angle: 3 },
  { index: 8, furniture: 'pouf', pose: 'floor', x: 44, y: 85, angle: 0 },
  { index: 9, furniture: 'cushion', pose: 'floor', x: 57, y: 85, angle: 0 },
  { index: 10, furniture: 'beanbag', pose: 'floor', x: 70, y: 83, angle: -3 },
  { index: 11, furniture: 'rug', pose: 'floor', x: 83, y: 80, angle: -6 },
]);

/** Total seats in the room === the participant cap (§4: the map IS the cap). */
export const SEAT_COUNT = SEAT_MAP.length; // 12 === MAX_PARTICIPANTS

// A friendly compile-time-ish assertion that the map matches the cap. The seat
// map is the source of truth for capacity (§4), so they must agree.
if (SEAT_COUNT !== MAX_PARTICIPANTS) {
  // eslint-disable-next-line no-console
  console.warn(
    `[seat-map] SEAT_COUNT (${SEAT_COUNT}) !== MAX_PARTICIPANTS (${MAX_PARTICIPANTS})`,
  );
}

// ---------------------------------------------------------------------------
// Stable assignment
// ---------------------------------------------------------------------------

/**
 * Order participants into a STABLE join order: by `joinedAt` ascending, breaking
 * ties by `id` so the ordering is total and identical on every client (both
 * fields come from the server). Exported for the scene to reuse the same order.
 */
export function orderByJoin(
  participants: Record<string, Participant>,
): Participant[] {
  return Object.values(participants).sort(
    (a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/**
 * Assign each participant a stable seat index (§4).
 *
 * Returns a map of participantId → seatIndex. Participants are walked in join
 * order into seats 0..SEAT_COUNT-1. Because a leaver is gone from the record and
 * everyone who stays keeps their `joinedAt`, the surviving crew keep their exact
 * relative order — so nobody who stays ever changes seat (no musical chairs), and
 * the next new joiner naturally lands in the lowest open seat.
 *
 * (Anyone beyond seat 11 — only possible if MAX_PARTICIPANTS is ever raised
 * above the seat map — is omitted; the seat map is the cap, so in practice every
 * participant gets a seat.)
 */
export function assignSeats(
  participants: Record<string, Participant>,
): Record<string, number> {
  const ordered = orderByJoin(participants);
  const out: Record<string, number> = {};
  for (let i = 0; i < ordered.length && i < SEAT_COUNT; i++) {
    out[ordered[i].id] = i;
  }
  return out;
}

/** A participant paired with the seat it sits in. */
export interface SeatedParticipant {
  participant: Participant;
  seat: Seat;
}

/**
 * Convenience: the seated crew (participant + its Seat), in seat order, plus the
 * list of seat indices that are currently empty (rendered as inviting furniture).
 */
export function seatRoom(participants: Record<string, Participant>): {
  seated: SeatedParticipant[];
  emptySeatIndices: number[];
} {
  const assignment = assignSeats(participants);
  const seated: SeatedParticipant[] = [];
  const taken = new Set<number>();

  for (const p of orderByJoin(participants)) {
    const idx = assignment[p.id];
    if (idx === undefined) continue;
    seated.push({ participant: p, seat: SEAT_MAP[idx] });
    taken.add(idx);
  }

  const emptySeatIndices: number[] = [];
  for (let i = 0; i < SEAT_COUNT; i++) {
    if (!taken.has(i)) emptySeatIndices.push(i);
  }

  return { seated, emptySeatIndices };
}

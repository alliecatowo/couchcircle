'use client';

/**
 * SeatingScene — the full living-room seat map (§4) rendered as one warm scene.
 *
 * The 12 seats sit on a normalized 0..100 stage (see seat-map.ts). This component
 * maps those anchors onto a responsive pixel box:
 *
 *   lg     → full scene, ~210px tall, furniture row + floor arc + lamp/table/rug.
 *   md     → same scene, compressed (smaller sprites, tighter arc, shorter box).
 *   < md   → handled by the parent (ParticipantCircle) as two clean rows; this
 *            component is the absolutely-positioned scene used at md and up.
 *
 * Furniture is drawn behind; seated avatars and empty-seat sprites are positioned
 * at their seat anchors on top. Empty seats read as inviting furniture; with ≤3
 * crew one empty cushion gets a sleeping cat (the §4 easter egg).
 *
 * This component renders ONLY furniture + empty-seat sprites + the lamp/rug decor.
 * The seated avatars (with all their flourishes) are rendered by the parent so the
 * event-diffing logic stays in one place; the parent positions them using the
 * same SEAT_MAP anchors via `seatStyle()` exported here.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import {
  SEAT_MAP,
  type Seat,
  type SeatFurniture,
} from './seat-map';
import {
  FurnitureDefs,
  LampDefs,
  CouchSprite,
  LoveseatSprite,
  ArmchairSprite,
  BeanbagSprite,
  PoufSprite,
  CushionSprite,
  RugSpotSprite,
  LampSideTable,
  SleepingCat,
} from './furniture';

// Scene geometry (local SVG units; the box scales these to fit its width).
const STAGE_W = 600;
const STAGE_H = 230;

/** Map a normalized 0..100 seat x to local stage px. */
function sx(x: number): number {
  return (x / 100) * STAGE_W;
}
/** Map a normalized 0..100 seat y to local stage px. */
function sy(y: number): number {
  return (y / 100) * STAGE_H;
}

/**
 * Absolute-position style for an element anchored AT a seat, in percentages so it
 * tracks the responsive box. Used by the parent to drop avatars onto seats.
 *
 * The avatar element is a tall column (chat-bubble reserve → status bubble →
 * creature sprite → name chip), so its *sit line* (where the creature meets the
 * cushion) is far below the element's geometric middle. We anchor the seat point
 * near the bottom of the column and lift by a hair more for the floor pose so
 * floor-sitters nestle low into their bean bags/cushions instead of hovering.
 */
export function seatStyle(seat: Seat): React.CSSProperties {
  // Fraction of the avatar element's height that sits ABOVE the anchor. The
  // avatar column carries a tall chat-bubble reserve + status bubble above the
  // sprite, so the creature's sit line sits low in the column — we lift it ~¾ of
  // its height so the seat point lands on the cushion. Floor poses lift less so
  // they nestle low INTO the bean bag/cushion rather than perch above it.
  const lift = seat.pose === 'floor' ? 48 : 66;
  return {
    position: 'absolute',
    left: `${seat.x}%`,
    top: `${seat.y}%`,
    transform: `translate(-50%, -${lift}%) rotate(${seat.angle}deg)`,
    transformOrigin: 'bottom center',
  };
}

// ---------------------------------------------------------------------------
// One furniture sprite, picked by seat type and sized for the seat.
// ---------------------------------------------------------------------------

function FurnitureForSeat({ furniture, altBean }: { furniture: SeatFurniture; altBean?: boolean }) {
  switch (furniture) {
    case 'couch':
      return <CouchSprite />;
    case 'loveseat':
      return <LoveseatSprite />;
    case 'armchair':
      return <ArmchairSprite />;
    case 'beanbag':
      return <BeanbagSprite alt={altBean} />;
    case 'cushion':
      return <CushionSprite />;
    case 'pouf':
      return <PoufSprite />;
    case 'rug':
      return <RugSpotSprite />;
  }
}

// The couch furniture sprite spans 3 seats; loveseat spans 2. To avoid drawing
// them 3×/2×, the big multi-seat pieces are drawn once at their group center.
const MULTI_SEAT_PIECES: { furniture: SeatFurniture; seats: number[]; sprite: React.ReactNode; width: number }[] = [
  { furniture: 'couch', seats: [0, 1, 2], sprite: <CouchSprite width={200} />, width: 200 },
  { furniture: 'loveseat', seats: [3, 4], sprite: <LoveseatSprite width={134} />, width: 134 },
];

function groupCenterX(seatIndices: number[]): number {
  const xs = seatIndices.map((i) => SEAT_MAP[i].x);
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function groupY(seatIndices: number[]): number {
  const ys = seatIndices.map((i) => SEAT_MAP[i].y);
  return ys.reduce((a, b) => a + b, 0) / ys.length;
}

interface SeatingSceneProps {
  /** seat indices with nobody in them — drawn as inviting empty furniture. */
  emptySeatIndices: number[];
  /** total crew on the couch — drives the sleeping-cat easter egg (≤3). */
  crewCount: number;
  /** compressed sprites/arc for the md breakpoint. */
  compact?: boolean;
}

/**
 * The furniture + decor layer. Avatars are layered on top by the parent.
 */
export function SeatingScene({ emptySeatIndices, crewCount, compact = false }: SeatingSceneProps) {
  const emptySet = React.useMemo(() => new Set(emptySeatIndices), [emptySeatIndices]);

  // Easter egg: with ≤3 crew, curl a sleeping cat on the first empty cushion seat.
  const catSeatIndex = React.useMemo(() => {
    if (crewCount > 3) return null;
    const cushion = SEAT_MAP.find((s) => s.furniture === 'cushion' && emptySet.has(s.index));
    return cushion ? cushion.index : null;
  }, [crewCount, emptySet]);

  return (
    <svg
      viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
      preserveAspectRatio="xMidYMid meet"
      className={cn('absolute inset-0 h-full w-full overflow-visible', compact && 'opacity-100')}
      aria-hidden="true"
    >
      <FurnitureDefs />
      <LampDefs />
      <defs>
        <radialGradient id="sceneRug" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#3a2f1a" stopOpacity="0.85" />
          <stop offset="70%" stopColor="#241d12" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#1a140c" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* rug under the floor arc */}
      <ellipse cx={sx(50)} cy={sy(83)} rx={STAGE_W * 0.42} ry={36} fill="url(#sceneRug)" />
      <ellipse
        cx={sx(50)}
        cy={sy(83)}
        rx={STAGE_W * 0.34}
        ry={27}
        fill="none"
        stroke="#4a3a24"
        strokeWidth={1.5}
        strokeDasharray="5 7"
        opacity={0.5}
      />

      {/* big multi-seat furniture (couch, loveseat) drawn once at group center */}
      {MULTI_SEAT_PIECES.map((piece) => {
        const cx = sx(groupCenterX(piece.seats));
        const cy = sy(groupY(piece.seats));
        // top-of-furniture y so the seat line lands near the seats' anchor
        return (
          <g key={piece.furniture} transform={`translate(${cx - piece.width / 2}, ${cy - 26})`}>
            {piece.sprite}
          </g>
        );
      })}

      {/* armchair (single seat 5) */}
      {(() => {
        const s = SEAT_MAP[5];
        return (
          <g transform={`translate(${sx(s.x) - 39}, ${sy(s.y) - 26}) rotate(${s.angle} 39 34)`}>
            <ArmchairSprite />
          </g>
        );
      })()}

      {/* floor arc pieces (6..11) — always drawn (furniture is always there) */}
      {SEAT_MAP.filter((s) => s.pose === 'floor').map((s) => {
        const half = floorHalfWidth(s.furniture);
        return (
          <g
            key={`floor-${s.index}`}
            transform={`translate(${sx(s.x) - half}, ${sy(s.y) - 14}) rotate(${s.angle} ${half} ${half})`}
          >
            <FloorPiece seat={s} hasCat={catSeatIndex === s.index} />
          </g>
        );
      })}

      {/* lamp + side table on the right */}
      <g transform={`translate(${sx(94)}, ${sy(36)})`}>
        <LampSideTable />
      </g>

      {/* a soft sleeping cat note rendered above as part of cushion piece */}
      {/* (empty seat invitations are subtle — the furniture itself is the invite) */}
      {!compact && emptySet.size >= SEAT_MAP.length - 1 && (
        <text x={sx(50)} y={sy(58)} textAnchor="middle" fontSize={11} fill="#9c886f" opacity={0.55}>
          plenty of room — pull up a seat
        </text>
      )}
    </svg>
  );
}

// Floor sprite half-widths so we can center them on the anchor.
function floorHalfWidth(furniture: SeatFurniture): number {
  switch (furniture) {
    case 'beanbag':
      return 40;
    case 'pouf':
      return 33;
    case 'cushion':
      return 35;
    case 'rug':
      return 38;
    default:
      return 35;
  }
}

function FloorPiece({ seat, hasCat }: { seat: Seat; hasCat: boolean }) {
  const altBean = seat.index === 10; // second bean bag uses the alt tone
  return (
    <g>
      <FurnitureForSeat furniture={seat.furniture} altBean={altBean} />
      {hasCat && (
        <g transform="translate(16, -4)">
          <SleepingCat />
        </g>
      )}
    </g>
  );
}

export { STAGE_W, STAGE_H };

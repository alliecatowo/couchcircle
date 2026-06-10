'use client';

/**
 * furniture — hand-drawn-feel SVG sprites for the living-room seat map (§4).
 *
 * Everything here matches the existing couch's warm plush style: mid-brown
 * fabric with a highlight sheen, darker piping, wooden feet. Bean bags are
 * squishy blobs, the pouf is round, cushions are flat. All colors here are
 * furniture-material values (not theme tokens) — the same exception the original
 * couch SVG already takes; theme tokens stay for chrome.
 *
 * Each piece is a self-contained <g> drawn around its own local origin (the seat
 * anchor sits at roughly the piece's seat line) so the scene can place it with a
 * single translate. Sizes are in the scene's local SVG units.
 *
 * One easter egg lives here: <SleepingCat>, dropped on a cushion when the room
 * is cozy-quiet (≤3 crew) by the scene.
 */

import * as React from 'react';

// Shared material palette — warm plush, wooden feet (mirrors ParticipantCircle).
const FABRIC = 'url(#furFabric)';
const CUSHION = 'url(#furCushion)';
const PIPING = '#3f2a1a';
const SHEEN = '#ffffff';
const WOOD = 'url(#furWood)';
const WOOD_HI = '#a8763c';

/**
 * Shared gradient/material defs. Mount ONCE inside the scene's <svg> (the scene
 * does this) so every furniture <g> can reference the same ids.
 */
export function FurnitureDefs() {
  return (
    <defs>
      <linearGradient id="furFabric" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#7a5236" />
        <stop offset="55%" stopColor="#6b4a32" />
        <stop offset="100%" stopColor="#503422" />
      </linearGradient>
      <linearGradient id="furCushion" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#8a6043" />
        <stop offset="100%" stopColor="#6b4a32" />
      </linearGradient>
      <linearGradient id="furWood" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#7a4a22" />
        <stop offset="100%" stopColor="#4a2c12" />
      </linearGradient>
      <radialGradient id="furBean" cx="42%" cy="30%" r="72%">
        <stop offset="0%" stopColor="#8a6043" />
        <stop offset="60%" stopColor="#6b4a32" />
        <stop offset="100%" stopColor="#4a3120" />
      </radialGradient>
      <radialGradient id="furBeanAlt" cx="42%" cy="30%" r="72%">
        <stop offset="0%" stopColor="#7e5a44" />
        <stop offset="60%" stopColor="#5f4530" />
        <stop offset="100%" stopColor="#412c1d" />
      </radialGradient>
    </defs>
  );
}

// A tiny plush highlight sheen reused across pieces.
function Sheen({
  cx,
  cy,
  rx,
  ry,
  opacity = 0.12,
}: {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  opacity?: number;
}) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={SHEEN} opacity={opacity} />;
}

// Two stubby wooden feet under a piece of furniture.
function WoodFeet({ leftX, rightX, topY, h = 12, w = 11 }: { leftX: number; rightX: number; topY: number; h?: number; w?: number }) {
  return (
    <>
      {[leftX, rightX].map((fx, i) => (
        <g key={i}>
          <rect x={fx} y={topY} width={w} height={h} rx={3} fill={WOOD} />
          <rect x={fx + 2} y={topY + 2} width={2.5} height={h - 4} rx={1.5} fill={WOOD_HI} opacity={0.7} />
        </g>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Couch — 3 seats, the centerpiece. Drawn ~190 units wide around local origin.
// ---------------------------------------------------------------------------

export function CouchSprite({ width = 190 }: { width?: number }) {
  const w = width;
  const armW = 22;
  const backH = 40;
  const seatH = 30;
  const innerX = armW;
  const innerW = w - armW * 2;
  const backY = 0;
  const seatY = backH;
  const bottom = seatY + seatH;
  const cushions = 3;
  const cushionW = innerW / cushions;

  return (
    <g>
      {/* contact shadow */}
      <ellipse cx={w / 2} cy={bottom + 12} rx={w * 0.46} ry={7} fill="rgba(0,0,0,0.4)" />
      {/* back */}
      <rect x={innerX - 3} y={backY} width={innerW + 6} height={backH} rx={14} fill={FABRIC} />
      <rect x={innerX - 3} y={backY} width={innerW + 6} height={5} rx={4} fill={PIPING} opacity={0.55} />
      {Array.from({ length: cushions }, (_, i) => {
        const bx = innerX + cushionW * i + 3;
        const bw = cushionW - 6;
        return (
          <g key={`cb-${i}`}>
            <Sheen cx={bx + bw / 2} cy={backY + 10} rx={bw / 2.4} ry={5} opacity={0.1} />
            {i > 0 && (
              <line x1={innerX + cushionW * i} y1={backY + 6} x2={innerX + cushionW * i} y2={backY + backH - 6} stroke={PIPING} strokeWidth={2} strokeLinecap="round" opacity={0.7} />
            )}
          </g>
        );
      })}
      {/* seat */}
      <rect x={innerX - 3} y={seatY} width={innerW + 6} height={seatH} rx={12} fill={FABRIC} />
      <rect x={innerX - 3} y={bottom - 6} width={innerW + 6} height={7} rx={4} fill={PIPING} opacity={0.5} />
      {Array.from({ length: cushions }, (_, i) => {
        const bx = innerX + cushionW * i + 4;
        const bw = cushionW - 8;
        return (
          <g key={`cs-${i}`}>
            <rect x={bx} y={seatY + 3} width={bw} height={seatH - 10} rx={9} fill={CUSHION} />
            <Sheen cx={bx + bw / 2} cy={seatY + 8} rx={bw / 2.3} ry={4} />
          </g>
        );
      })}
      {/* arms */}
      {[0, w - armW].map((ax, i) => (
        <g key={`arm-${i}`}>
          <rect x={ax} y={backY + 8} width={armW} height={backH + seatH - 8} rx={12} fill={FABRIC} />
          <ellipse cx={ax + armW / 2} cy={backY + 12} rx={armW / 2 - 1} ry={9} fill="#7a5236" />
          <Sheen cx={ax + armW / 2 - 2} cy={backY + 10} rx={armW / 3} ry={4} opacity={0.14} />
        </g>
      ))}
      <WoodFeet leftX={14} rightX={w - 25} topY={bottom} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Loveseat — 2 seats, like the couch but narrower.
// ---------------------------------------------------------------------------

export function LoveseatSprite({ width = 130 }: { width?: number }) {
  const w = width;
  const armW = 20;
  const backH = 38;
  const seatH = 28;
  const innerX = armW;
  const innerW = w - armW * 2;
  const seatY = backH;
  const bottom = seatY + seatH;
  const cushions = 2;
  const cushionW = innerW / cushions;

  return (
    <g>
      <ellipse cx={w / 2} cy={bottom + 11} rx={w * 0.46} ry={6} fill="rgba(0,0,0,0.4)" />
      <rect x={innerX - 3} y={0} width={innerW + 6} height={backH} rx={13} fill={FABRIC} />
      <rect x={innerX - 3} y={0} width={innerW + 6} height={5} rx={4} fill={PIPING} opacity={0.55} />
      {Array.from({ length: cushions }, (_, i) => {
        const bx = innerX + cushionW * i + 3;
        const bw = cushionW - 6;
        return (
          <g key={`lb-${i}`}>
            <Sheen cx={bx + bw / 2} cy={10} rx={bw / 2.4} ry={5} opacity={0.1} />
            {i > 0 && (
              <line x1={innerX + cushionW * i} y1={6} x2={innerX + cushionW * i} y2={backH - 6} stroke={PIPING} strokeWidth={2} strokeLinecap="round" opacity={0.7} />
            )}
          </g>
        );
      })}
      <rect x={innerX - 3} y={seatY} width={innerW + 6} height={seatH} rx={11} fill={FABRIC} />
      <rect x={innerX - 3} y={bottom - 6} width={innerW + 6} height={6} rx={4} fill={PIPING} opacity={0.5} />
      {Array.from({ length: cushions }, (_, i) => {
        const bx = innerX + cushionW * i + 4;
        const bw = cushionW - 8;
        return (
          <g key={`ls-${i}`}>
            <rect x={bx} y={seatY + 3} width={bw} height={seatH - 10} rx={8} fill={CUSHION} />
            <Sheen cx={bx + bw / 2} cy={seatY + 8} rx={bw / 2.3} ry={4} />
          </g>
        );
      })}
      {[0, w - armW].map((ax, i) => (
        <g key={`larm-${i}`}>
          <rect x={ax} y={8} width={armW} height={backH + seatH - 8} rx={11} fill={FABRIC} />
          <ellipse cx={ax + armW / 2} cy={12} rx={armW / 2 - 1} ry={8} fill="#7a5236" />
          <Sheen cx={ax + armW / 2 - 2} cy={10} rx={armW / 3} ry={3.5} opacity={0.14} />
        </g>
      ))}
      <WoodFeet leftX={13} rightX={w - 24} topY={bottom} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Armchair — 1 seat, chunky single.
// ---------------------------------------------------------------------------

export function ArmchairSprite({ width = 78 }: { width?: number }) {
  const w = width;
  const armW = 17;
  const backH = 40;
  const seatH = 28;
  const innerX = armW;
  const innerW = w - armW * 2;
  const seatY = backH;
  const bottom = seatY + seatH;

  return (
    <g>
      <ellipse cx={w / 2} cy={bottom + 11} rx={w * 0.5} ry={6} fill="rgba(0,0,0,0.4)" />
      <rect x={innerX - 3} y={0} width={innerW + 6} height={backH} rx={13} fill={FABRIC} />
      <rect x={innerX - 3} y={0} width={innerW + 6} height={5} rx={4} fill={PIPING} opacity={0.55} />
      <Sheen cx={w / 2} cy={10} rx={innerW / 2.4} ry={5} opacity={0.1} />
      <rect x={innerX - 3} y={seatY} width={innerW + 6} height={seatH} rx={11} fill={FABRIC} />
      <rect x={innerX - 1} y={seatY + 3} width={innerW + 2} height={seatH - 10} rx={8} fill={CUSHION} />
      <Sheen cx={w / 2} cy={seatY + 8} rx={innerW / 2.3} ry={4} />
      <rect x={innerX - 3} y={bottom - 6} width={innerW + 6} height={6} rx={4} fill={PIPING} opacity={0.5} />
      {[0, w - armW].map((ax, i) => (
        <g key={`aarm-${i}`}>
          <rect x={ax} y={8} width={armW} height={backH + seatH - 8} rx={10} fill={FABRIC} />
          <ellipse cx={ax + armW / 2} cy={12} rx={armW / 2 - 1} ry={8} fill="#7a5236" />
          <Sheen cx={ax + armW / 2 - 2} cy={10} rx={armW / 3} ry={3} opacity={0.14} />
        </g>
      ))}
      <WoodFeet leftX={11} rightX={w - 22} topY={bottom} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Floor pieces — bean bag (squishy), pouf (round), cushion (flat).
// Drawn around a local origin near the seat line so floor avatars sit low.
// ---------------------------------------------------------------------------

export function BeanbagSprite({ width = 80, alt = false }: { width?: number; alt?: boolean }) {
  const w = width;
  const fill = alt ? 'url(#furBeanAlt)' : 'url(#furBean)';
  // a squishy lumpy blob — irregular bezier so it reads hand-drawn
  const d = `M ${w * 0.08} ${w * 0.44}
    C ${w * 0.02} ${w * 0.24}, ${w * 0.22} ${w * 0.08}, ${w * 0.42} ${w * 0.1}
    C ${w * 0.6} ${w * 0.12}, ${w * 0.74} ${w * 0.04}, ${w * 0.88} ${w * 0.2}
    C ${w * 1.0} ${w * 0.34}, ${w * 0.98} ${w * 0.52}, ${w * 0.86} ${w * 0.6}
    C ${w * 0.7} ${w * 0.7}, ${w * 0.28} ${w * 0.72}, ${w * 0.14} ${w * 0.6}
    C ${w * 0.08} ${w * 0.55}, ${w * 0.08} ${w * 0.5}, ${w * 0.08} ${w * 0.44} Z`;
  return (
    <g>
      <ellipse cx={w / 2} cy={w * 0.66} rx={w * 0.42} ry={w * 0.09} fill="rgba(0,0,0,0.38)" />
      <path d={d} fill={fill} />
      {/* squish seams */}
      <path d={`M ${w * 0.3} ${w * 0.2} q ${w * 0.18} ${w * 0.2} ${w * 0.05} ${w * 0.4}`} stroke={PIPING} strokeWidth={1.4} fill="none" opacity={0.4} />
      <path d={`M ${w * 0.62} ${w * 0.16} q ${w * 0.1} ${w * 0.24} ${w * 0.02} ${w * 0.42}`} stroke={PIPING} strokeWidth={1.4} fill="none" opacity={0.35} />
      <Sheen cx={w * 0.4} cy={w * 0.24} rx={w * 0.18} ry={w * 0.08} opacity={0.16} />
    </g>
  );
}

export function PoufSprite({ width = 66 }: { width?: number }) {
  const w = width;
  const r = w / 2;
  return (
    <g>
      <ellipse cx={r} cy={w * 0.74} rx={r * 0.92} ry={w * 0.12} fill="rgba(0,0,0,0.38)" />
      {/* round drum pouf */}
      <ellipse cx={r} cy={w * 0.6} rx={r} ry={r * 0.62} fill="url(#furBean)" />
      <rect x={0} y={w * 0.34} width={w} height={w * 0.26} fill={FABRIC} />
      <ellipse cx={r} cy={w * 0.34} rx={r} ry={r * 0.55} fill={CUSHION} />
      {/* tufting button + radial seams */}
      <circle cx={r} cy={w * 0.34} r={2.4} fill={PIPING} opacity={0.7} />
      {[0, 45, 90, 135].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        return (
          <line
            key={deg}
            x1={r}
            y1={w * 0.34}
            x2={r + Math.cos(rad) * r * 0.92}
            y2={w * 0.34 + Math.sin(rad) * r * 0.5}
            stroke={PIPING}
            strokeWidth={1.2}
            opacity={0.3}
          />
        );
      })}
      <Sheen cx={r - r * 0.3} cy={w * 0.28} rx={r * 0.5} ry={r * 0.2} opacity={0.14} />
    </g>
  );
}

export function CushionSprite({ width = 70 }: { width?: number }) {
  const w = width;
  const h = w * 0.4;
  // a flat floor cushion seen at a slight angle (parallelogram-ish with round corners)
  return (
    <g>
      <ellipse cx={w / 2} cy={h * 1.5} rx={w * 0.46} ry={h * 0.28} fill="rgba(0,0,0,0.36)" />
      <rect x={2} y={h * 0.5} width={w - 4} height={h} rx={h * 0.5} fill={FABRIC} />
      <rect x={4} y={h * 0.4} width={w - 8} height={h * 0.85} rx={h * 0.45} fill={CUSHION} />
      {/* corner tassels + center tuft */}
      <circle cx={w / 2} cy={h * 0.82} r={2} fill={PIPING} opacity={0.6} />
      <Sheen cx={w / 2} cy={h * 0.6} rx={w * 0.32} ry={h * 0.22} />
      <circle cx={8} cy={h * 0.5} r={2.4} fill={PIPING} opacity={0.5} />
      <circle cx={w - 8} cy={h * 0.5} r={2.4} fill={PIPING} opacity={0.5} />
    </g>
  );
}

/**
 * Rug spot — a bare patch of rug (the 12th seat). Reads as "a spot on the floor
 * to flop", drawn as a soft woven oval with a dashed border like the scene rug.
 */
export function RugSpotSprite({ width = 76 }: { width?: number }) {
  const w = width;
  return (
    <g>
      <ellipse cx={w / 2} cy={w * 0.3} rx={w * 0.5} ry={w * 0.22} fill="#3a2f1a" opacity={0.55} />
      <ellipse cx={w / 2} cy={w * 0.3} rx={w * 0.4} ry={w * 0.16} fill="none" stroke="#6b5634" strokeWidth={1.4} strokeDasharray="4 5" opacity={0.6} />
      <ellipse cx={w / 2} cy={w * 0.28} rx={w * 0.22} ry={w * 0.08} fill={SHEEN} opacity={0.05} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Lamp + side table — drawn on the right of the furniture row. Glows warmly.
// (Decor, not a seat.)
// ---------------------------------------------------------------------------

export function LampSideTable({ width = 56 }: { width?: number }) {
  const w = width;
  const cx = w / 2;
  const tableTopY = 64;
  const bottom = 104;
  return (
    <g>
      {/* glow pool washing over the right side */}
      <ellipse cx={cx} cy={tableTopY - 22} rx={46} ry={40} fill="url(#furLampPool)" className="animate-flicker" />
      {/* side table */}
      <ellipse cx={cx} cy={tableTopY} rx={w / 2} ry={8} fill="#6b4a2c" />
      <ellipse cx={cx} cy={tableTopY - 2} rx={w / 2 - 3} ry={5.5} fill="#85613b" />
      <rect x={cx - w / 2 + 7} y={tableTopY} width={4.5} height={bottom - tableTopY} rx={2} fill="#4a2c12" />
      <rect x={cx + w / 2 - 11} y={tableTopY} width={4.5} height={bottom - tableTopY} rx={2} fill="#4a2c12" />
      {/* lamp stand + shade */}
      <rect x={cx - 2} y={tableTopY - 32} width={4} height={30} rx={2} fill="#8a6a44" />
      <path d={`M ${cx - 18} ${tableTopY - 32} L ${cx + 18} ${tableTopY - 32} L ${cx + 12} ${tableTopY - 54} L ${cx - 12} ${tableTopY - 54} Z`} fill="url(#furLampBulb)" className="animate-flicker" />
      {/* steaming mug */}
      <rect x={cx - 21} y={tableTopY - 11} width={10} height={8} rx={2.2} fill="#caa074" />
      <path d={`M ${cx - 11} ${tableTopY - 9} q 3.5 1 3.5 3.5 q 0 2.5 -3.5 2.5`} stroke="#caa074" strokeWidth={1.5} fill="none" />
      <path d={`M ${cx - 17} ${tableTopY - 13} q -2 -4 0 -6.5`} stroke="#cbb39a" strokeWidth={1.1} fill="none" opacity={0.5} className="animate-puff" />
    </g>
  );
}

/** Lamp gradient defs (separate so the scene can mount them once). */
export function LampDefs() {
  return (
    <defs>
      <radialGradient id="furLampPool" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#f8c178" stopOpacity="0.5" />
        <stop offset="45%" stopColor="#e08b34" stopOpacity="0.2" />
        <stop offset="100%" stopColor="#e08b34" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="furLampBulb" cx="50%" cy="35%" r="65%">
        <stop offset="0%" stopColor="#fff3d6" />
        <stop offset="60%" stopColor="#f8c178" />
        <stop offset="100%" stopColor="#e08b34" />
      </radialGradient>
    </defs>
  );
}

// ---------------------------------------------------------------------------
// Easter egg — a tiny sleeping cat curled on a cushion (≤3 crew).
// ---------------------------------------------------------------------------

export function SleepingCat({ width = 38 }: { width?: number }) {
  const w = width;
  return (
    <g aria-hidden="true">
      {/* curled body */}
      <ellipse cx={w / 2} cy={w * 0.5} rx={w * 0.46} ry={w * 0.3} fill="#6b4a32" />
      <ellipse cx={w / 2} cy={w * 0.45} rx={w * 0.4} ry={w * 0.24} fill="#7a5236" />
      {/* tail curling around */}
      <path d={`M ${w * 0.86} ${w * 0.52} q ${w * 0.12} ${w * 0.12} ${w * -0.06} ${w * 0.2}`} stroke="#6b4a32" strokeWidth={w * 0.12} strokeLinecap="round" fill="none" />
      {/* head tucked */}
      <circle cx={w * 0.28} cy={w * 0.42} r={w * 0.18} fill="#7a5236" />
      <path d={`M ${w * 0.18} ${w * 0.3} l ${w * 0.05} ${w * -0.1} l ${w * 0.07} ${w * 0.08} Z`} fill="#6b4a32" />
      <path d={`M ${w * 0.34} ${w * 0.28} l ${w * 0.05} ${w * -0.1} l ${w * 0.06} ${w * 0.09} Z`} fill="#6b4a32" />
      {/* closed eye */}
      <path d={`M ${w * 0.2} ${w * 0.42} q ${w * 0.05} ${w * 0.04} ${w * 0.1} 0`} stroke="#3f2a1a" strokeWidth={1.2} fill="none" strokeLinecap="round" />
      {/* little zzz */}
      <text x={w * 0.7} y={w * 0.18} fontSize={w * 0.22} fill="#bfac95" opacity={0.7} className="animate-float-bob" style={{ animationDuration: '3.4s' }}>
        z
      </text>
    </g>
  );
}

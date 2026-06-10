/**
 * Couch Goblin — lumpy body, comically large ears, half-sunken into couch.
 * Pure inline SVG, no images.
 */

import React from 'react';
import type { AvatarMood } from './index';

interface Props {
  accent: string;
  mood: AvatarMood;
  size: number;
}

export const GoblinAvatar: React.FC<Props> = ({ accent, mood, size }) => {
  const s = size;
  const cx = s / 2;

  // --- eyes based on mood ---
  const renderEyes = () => {
    if (mood === 'sleepy') {
      return (
        <>
          <line x1={cx - 8} y1={s * 0.38} x2={cx - 3} y2={s * 0.38} stroke="#100b09" strokeWidth="2" strokeLinecap="round" />
          <line x1={cx + 3} y1={s * 0.38} x2={cx + 8} y2={s * 0.38} stroke="#100b09" strokeWidth="2" strokeLinecap="round" />
        </>
      );
    }
    if (mood === 'buffering') {
      // spiral/swirl eyes — small arcs
      return (
        <>
          <path d={`M ${cx - 8} ${s * 0.37} a 3 3 0 1 1 2 3`} stroke="#100b09" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <path d={`M ${cx + 4} ${s * 0.37} a 3 3 0 1 1 2 3`} stroke="#100b09" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </>
      );
    }
    if (mood === 'melted') {
      // drooping eyes, half closed
      return (
        <>
          <ellipse cx={cx - 6} cy={s * 0.38} rx="3" ry="2.5" fill="#100b09" />
          <line x1={cx - 9} y1={s * 0.36} x2={cx - 3} y2={s * 0.39} stroke="#100b09" strokeWidth="1.5" strokeLinecap="round" />
          <ellipse cx={cx + 6} cy={s * 0.38} rx="3" ry="2.5" fill="#100b09" />
          <line x1={cx + 3} y1={s * 0.36} x2={cx + 9} y2={s * 0.39} stroke="#100b09" strokeWidth="1.5" strokeLinecap="round" />
        </>
      );
    }
    if (mood === 'focused') {
      // narrowed — thin ovals
      return (
        <>
          <ellipse cx={cx - 6} cy={s * 0.38} rx="3.5" ry="1.5" fill="#100b09" />
          <ellipse cx={cx + 6} cy={s * 0.38} rx="3.5" ry="1.5" fill="#100b09" />
        </>
      );
    }
    if (mood === 'hyped') {
      // sparkle eyes — stars
      return (
        <>
          <circle cx={cx - 6} cy={s * 0.38} r="3" fill={accent} />
          <circle cx={cx - 6} cy={s * 0.38} r="1.2" fill="#fff" />
          <circle cx={cx + 6} cy={s * 0.38} r="3" fill={accent} />
          <circle cx={cx + 6} cy={s * 0.38} r="1.2" fill="#fff" />
        </>
      );
    }
    if (mood === 'happy') {
      // wide open circles with a glint
      return (
        <>
          <circle cx={cx - 6} cy={s * 0.38} r="3.5" fill="#100b09" />
          <circle cx={cx - 5} cy={s * 0.37} r="1" fill="#f7eee2" />
          <circle cx={cx + 6} cy={s * 0.38} r="3.5" fill="#100b09" />
          <circle cx={cx + 7} cy={s * 0.37} r="1" fill="#f7eee2" />
        </>
      );
    }
    // default / idle / lit / away / thirsty
    return (
      <>
        <ellipse cx={cx - 6} cy={s * 0.38} rx="3" ry="3.5" fill="#100b09" className="animate-blink" style={{ transformOrigin: `${cx - 6}px ${s * 0.38}px` }} />
        <ellipse cx={cx + 6} cy={s * 0.38} rx="3" ry="3.5" fill="#100b09" className="animate-blink" style={{ transformOrigin: `${cx + 6}px ${s * 0.38}px` }} />
        <circle cx={cx - 5} cy={s * 0.37} r="0.9" fill="#f7eee2" />
        <circle cx={cx + 7} cy={s * 0.37} r="0.9" fill="#f7eee2" />
      </>
    );
  };

  // --- mouth based on mood ---
  const renderMouth = () => {
    if (mood === 'happy' || mood === 'hyped') {
      return <path d={`M ${cx - 6} ${s * 0.49} q 6 6 12 0`} stroke="#100b09" strokeWidth="1.8" fill="none" strokeLinecap="round" />;
    }
    if (mood === 'melted') {
      return <path d={`M ${cx - 4} ${s * 0.52} q 4 -2 8 0`} stroke="#100b09" strokeWidth="1.8" fill="none" strokeLinecap="round" />;
    }
    if (mood === 'sleepy') {
      return <line x1={cx - 4} y1={s * 0.5} x2={cx + 4} y2={s * 0.5} stroke="#100b09" strokeWidth="1.5" strokeLinecap="round" />;
    }
    // default small smile / neutral
    return <path d={`M ${cx - 4} ${s * 0.49} q 4 3 8 0`} stroke="#100b09" strokeWidth="1.5" fill="none" strokeLinecap="round" />;
  };

  // --- mood effects ---
  const renderEffects = () => {
    if (mood === 'sleepy') {
      return (
        <text x={cx + 10} y={s * 0.22} fontSize={s * 0.13} fill="#bfac95" fontFamily="sans-serif" opacity="0.85"
          style={{ animation: 'float-bob 3s ease-in-out infinite', display: 'inline' }}>zzz</text>
      );
    }
    if (mood === 'thirsty') {
      return (
        <ellipse cx={cx + 18} cy={s * 0.25} rx={s * 0.06} ry={s * 0.09} fill="#56855f" opacity="0.9" />
      );
    }
    if (mood === 'away') {
      // tiny "brb" flag
      return (
        <g opacity="0.9">
          <line x1={cx + 14} y1={s * 0.15} x2={cx + 14} y2={s * 0.3} stroke="#9c886f" strokeWidth="1.5" />
          <rect x={cx + 14} y={s * 0.15} width={s * 0.12} height={s * 0.07} rx="1" fill={accent} />
          <text x={cx + 15} y={s * 0.215} fontSize={s * 0.065} fill="#100b09" fontFamily="sans-serif">brb</text>
        </g>
      );
    }
    if (mood === 'lit') {
      return (
        <>
          {/* warm halo */}
          <circle cx={cx} cy={s * 0.35} r={s * 0.42} fill="none" stroke={accent} strokeWidth="3" opacity="0.25" />
          <circle cx={cx} cy={s * 0.35} r={s * 0.45} fill="none" stroke={accent} strokeWidth="1" opacity="0.15" />
          {/* drifting smoke puffs */}
          <circle cx={cx - 4} cy={s * 0.1} r="3" fill="#9c886f" opacity="0" style={{ animation: 'puff 3.6s ease-out infinite', animationDelay: '0s' }} />
          <circle cx={cx + 2} cy={s * 0.08} r="2.5" fill="#9c886f" opacity="0" style={{ animation: 'puff 3.6s ease-out infinite', animationDelay: '1.2s' }} />
          <circle cx={cx + 7} cy={s * 0.12} r="2" fill="#9c886f" opacity="0" style={{ animation: 'puff 3.6s ease-out infinite', animationDelay: '2.4s' }} />
        </>
      );
    }
    return null;
  };

  // slumped/melted posture changes the body
  const bodyY = mood === 'melted' ? s * 0.55 : s * 0.5;

  return (
    <svg
      width={s}
      height={s}
      viewBox={`0 0 ${s} ${s}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* soft contrast backing so the silhouette reads on a dark couch */}
      <ellipse cx={cx} cy={bodyY - s * 0.02} rx={s * 0.46} ry={s * 0.46} fill="#0d0907" opacity="0.24" />

      {/* big lumpy ears */}
      <ellipse cx={cx - 16} cy={s * 0.32} rx={s * 0.14} ry={s * 0.18} fill="#7a5f50" />
      <ellipse cx={cx - 16} cy={s * 0.32} rx={s * 0.09} ry={s * 0.12} fill={accent} />
      <ellipse cx={cx + 16} cy={s * 0.32} rx={s * 0.14} ry={s * 0.18} fill="#7a5f50" />
      <ellipse cx={cx + 16} cy={s * 0.32} rx={s * 0.09} ry={s * 0.12} fill={accent} />

      {/* lumpy body / hoodie */}
      <ellipse cx={cx} cy={bodyY} rx={s * 0.36} ry={s * 0.32} fill={accent} />
      {/* highlight sheen on top of the body */}
      <ellipse cx={cx - s * 0.08} cy={bodyY - s * 0.12} rx={s * 0.2} ry={s * 0.1} fill="#fff" opacity="0.18" />
      {/* body lumpiness */}
      <ellipse cx={cx - 10} cy={bodyY + 4} rx={s * 0.13} ry={s * 0.12} fill={accent} opacity="0.75" />
      <ellipse cx={cx + 10} cy={bodyY + 4} rx={s * 0.13} ry={s * 0.12} fill={accent} opacity="0.75" />

      {/* head */}
      <ellipse cx={cx} cy={s * 0.36} rx={s * 0.24} ry={s * 0.22} fill="#8a6a55" />

      {/* snout area */}
      <ellipse cx={cx} cy={s * 0.44} rx={s * 0.12} ry={s * 0.08} fill="#a07c64" />
      <circle cx={cx - 3} cy={s * 0.43} r="1.5" fill="#3a2d27" />
      <circle cx={cx + 3} cy={s * 0.43} r="1.5" fill="#3a2d27" />

      {/* eyes */}
      {renderEyes()}

      {/* mouth */}
      {renderMouth()}

      {/* tiny arms */}
      <ellipse cx={cx - 24} cy={bodyY + 2} rx={s * 0.1} ry={s * 0.07} fill={accent} opacity="0.92" transform={`rotate(-20 ${cx - 24} ${bodyY + 2})`} />
      <ellipse cx={cx + 24} cy={bodyY + 2} rx={s * 0.1} ry={s * 0.07} fill={accent} opacity="0.92" transform={`rotate(20 ${cx + 24} ${bodyY + 2})`} />

      {/* mood effects */}
      {renderEffects()}
    </svg>
  );
};

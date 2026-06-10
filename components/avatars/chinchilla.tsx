/**
 * Dusty Chinchilla — soft round body, small round ears, big dark eyes, dusty fur.
 * Pure inline SVG, no images.
 */

import React from 'react';
import type { AvatarMood } from './index';

interface Props {
  accent: string;
  mood: AvatarMood;
  size: number;
}

export const ChinchillaAvatar: React.FC<Props> = ({ accent, mood, size }) => {
  const s = size;
  const cx = s / 2;

  const renderEyes = () => {
    if (mood === 'sleepy') {
      return (
        <>
          <line x1={cx - 9} y1={s * 0.37} x2={cx - 3} y2={s * 0.37} stroke="#100b09" strokeWidth="2" strokeLinecap="round" />
          <line x1={cx + 3} y1={s * 0.37} x2={cx + 9} y2={s * 0.37} stroke="#100b09" strokeWidth="2" strokeLinecap="round" />
        </>
      );
    }
    if (mood === 'buffering') {
      return (
        <>
          <circle cx={cx - 6} cy={s * 0.37} r="4" fill="#100b09" />
          <path d={`M ${cx - 8} ${s * 0.35} a 3.5 3.5 0 1 1 2.5 4.5`} stroke="#f7eee2" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <circle cx={cx + 6} cy={s * 0.37} r="4" fill="#100b09" />
          <path d={`M ${cx + 4} ${s * 0.35} a 3.5 3.5 0 1 1 2.5 4.5`} stroke="#f7eee2" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </>
      );
    }
    if (mood === 'melted') {
      return (
        <>
          <circle cx={cx - 6} cy={s * 0.38} r="3.5" fill="#100b09" />
          <line x1={cx - 10} y1={s * 0.36} x2={cx - 2} y2={s * 0.4} stroke="#100b09" strokeWidth="2" strokeLinecap="round" />
          <circle cx={cx + 6} cy={s * 0.38} r="3.5" fill="#100b09" />
          <line x1={cx + 2} y1={s * 0.36} x2={cx + 10} y2={s * 0.4} stroke="#100b09" strokeWidth="2" strokeLinecap="round" />
        </>
      );
    }
    if (mood === 'focused') {
      return (
        <>
          <circle cx={cx - 6} cy={s * 0.37} r="4" fill="#100b09" />
          <ellipse cx={cx - 6} cy={s * 0.37} rx="1.5" ry="3.5" fill="#2f2420" />
          <circle cx={cx + 6} cy={s * 0.37} r="4" fill="#100b09" />
          <ellipse cx={cx + 6} cy={s * 0.37} rx="1.5" ry="3.5" fill="#2f2420" />
        </>
      );
    }
    if (mood === 'hyped') {
      return (
        <>
          <circle cx={cx - 6} cy={s * 0.37} r="4.5" fill="#100b09" />
          <circle cx={cx - 6} cy={s * 0.37} r="2.5" fill={accent} />
          <circle cx={cx - 5} cy={s * 0.36} r="1" fill="#f7eee2" />
          <circle cx={cx + 6} cy={s * 0.37} r="4.5" fill="#100b09" />
          <circle cx={cx + 6} cy={s * 0.37} r="2.5" fill={accent} />
          <circle cx={cx + 7} cy={s * 0.36} r="1" fill="#f7eee2" />
        </>
      );
    }
    if (mood === 'happy') {
      return (
        <>
          <circle cx={cx - 6} cy={s * 0.37} r="4.5" fill="#100b09" />
          <circle cx={cx - 5} cy={s * 0.36} r="1.5" fill="#f7eee2" />
          <circle cx={cx + 6} cy={s * 0.37} r="4.5" fill="#100b09" />
          <circle cx={cx + 7} cy={s * 0.36} r="1.5" fill="#f7eee2" />
        </>
      );
    }
    // idle default — big dark chinchilla eyes
    return (
      <>
        <circle cx={cx - 6} cy={s * 0.37} r="4.5" fill="#100b09" className="animate-blink" style={{ transformOrigin: `${cx - 6}px ${s * 0.37}px` }} />
        <circle cx={cx - 5} cy={s * 0.36} r="1.2" fill="#f7eee2" />
        <circle cx={cx + 6} cy={s * 0.37} r="4.5" fill="#100b09" className="animate-blink" style={{ transformOrigin: `${cx + 6}px ${s * 0.37}px` }} />
        <circle cx={cx + 7} cy={s * 0.36} r="1.2" fill="#f7eee2" />
      </>
    );
  };

  const renderMouth = () => {
    if (mood === 'happy' || mood === 'hyped') {
      return <path d={`M ${cx - 6} ${s * 0.5} q 6 5 12 0`} stroke="#100b09" strokeWidth="1.8" fill="none" strokeLinecap="round" />;
    }
    if (mood === 'melted') {
      return <path d={`M ${cx - 4} ${s * 0.53} q 4 -2 8 0`} stroke="#100b09" strokeWidth="1.5" fill="none" strokeLinecap="round" />;
    }
    if (mood === 'sleepy') {
      return <line x1={cx - 3} y1={s * 0.51} x2={cx + 3} y2={s * 0.51} stroke="#100b09" strokeWidth="1.5" strokeLinecap="round" />;
    }
    return <path d={`M ${cx - 4} ${s * 0.5} q 4 3 8 0`} stroke="#100b09" strokeWidth="1.5" fill="none" strokeLinecap="round" />;
  };

  const renderEffects = () => {
    if (mood === 'sleepy') {
      return <text x={cx + 11} y={s * 0.21} fontSize={s * 0.12} fill="#bfac95" fontFamily="sans-serif" opacity="0.85"
        style={{ animation: 'float-bob 3.3s ease-in-out infinite' }}>zzz</text>;
    }
    if (mood === 'thirsty') {
      return <ellipse cx={cx + 19} cy={s * 0.27} rx={s * 0.055} ry={s * 0.085} fill="#56855f" opacity="0.9" />;
    }
    if (mood === 'away') {
      return (
        <g opacity="0.9">
          <line x1={cx + 16} y1={s * 0.11} x2={cx + 16} y2={s * 0.26} stroke="#9c886f" strokeWidth="1.5" />
          <rect x={cx + 16} y={s * 0.11} width={s * 0.12} height={s * 0.07} rx="1" fill={accent} />
          <text x={cx + 17} y={s * 0.175} fontSize={s * 0.065} fill="#100b09" fontFamily="sans-serif">brb</text>
        </g>
      );
    }
    if (mood === 'lit') {
      return (
        <>
          <circle cx={cx} cy={s * 0.38} r={s * 0.44} fill="none" stroke={accent} strokeWidth="3" opacity="0.22" />
          <circle cx={cx} cy={s * 0.38} r={s * 0.48} fill="none" stroke={accent} strokeWidth="1" opacity="0.12" />
          <circle cx={cx - 3} cy={s * 0.06} r="3" fill="#9c886f" opacity="0" style={{ animation: 'puff 3.6s ease-out infinite', animationDelay: '0s' }} />
          <circle cx={cx + 4} cy={s * 0.04} r="2.5" fill="#9c886f" opacity="0" style={{ animation: 'puff 3.6s ease-out infinite', animationDelay: '1.4s' }} />
          <circle cx={cx + 9} cy={s * 0.08} r="2" fill="#9c886f" opacity="0" style={{ animation: 'puff 3.6s ease-out infinite', animationDelay: '2.7s' }} />
        </>
      );
    }
    return null;
  };

  // dusty fur texture spots
  const renderFur = () => (
    <>
      <circle cx={cx - 12} cy={s * 0.36} r="1.5" fill="#9c886f" opacity="0.25" />
      <circle cx={cx + 14} cy={s * 0.4} r="1" fill="#9c886f" opacity="0.2" />
      <circle cx={cx - 8} cy={s * 0.54} r="1.2" fill="#9c886f" opacity="0.2" />
      <circle cx={cx + 6} cy={s * 0.56} r="1" fill="#9c886f" opacity="0.18" />
    </>
  );

  const bodyY = mood === 'melted' ? s * 0.63 : s * 0.59;

  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* soft contrast backing so the silhouette reads on a dark couch */}
      <ellipse cx={cx} cy={bodyY - s * 0.06} rx={s * 0.46} ry={s * 0.46} fill="#0d0907" opacity="0.24" />

      {/* round ears */}
      <circle cx={cx - 13} cy={s * 0.22} r={s * 0.1} fill="#a98e76" />
      <circle cx={cx - 13} cy={s * 0.22} r={s * 0.065} fill={accent} />
      <circle cx={cx + 13} cy={s * 0.22} r={s * 0.1} fill="#a98e76" />
      <circle cx={cx + 13} cy={s * 0.22} r={s * 0.065} fill={accent} />

      {/* soft round body */}
      <ellipse cx={cx} cy={bodyY} rx={s * 0.3} ry={s * 0.27} fill="#a98e76" />
      {/* dusty belly */}
      <ellipse cx={cx} cy={bodyY + 3} rx={s * 0.18} ry={s * 0.15} fill="#d9c8b4" opacity="0.4" />
      {/* accent stripe/marking on body */}
      <path d={`M ${cx - 8} ${bodyY - s * 0.12} q 8 3 16 0`} stroke={accent} strokeWidth="2.5" fill="none" strokeLinecap="round" />

      {/* head */}
      <ellipse cx={cx} cy={s * 0.38} rx={s * 0.22} ry={s * 0.21} fill="#bfa488" />
      {/* highlight sheen on the head */}
      <ellipse cx={cx - s * 0.05} cy={s * 0.31} rx={s * 0.12} ry={s * 0.06} fill="#fff" opacity="0.18" />

      {/* fur texture */}
      {renderFur()}

      {/* tiny nose */}
      <ellipse cx={cx} cy={s * 0.46} rx="2" ry="1.2" fill="#3a2d27" />

      {/* eyes */}
      {renderEyes()}

      {/* mouth */}
      {renderMouth()}

      {/* fluffy tail */}
      <ellipse cx={cx + 22} cy={bodyY + 6} rx={s * 0.12} ry={s * 0.14} fill="#a98e76" opacity="0.95" />
      <ellipse cx={cx + 22} cy={bodyY + 6} rx={s * 0.08} ry={s * 0.09} fill="#d9c8b4" opacity="0.35" />

      {/* effects */}
      {renderEffects()}
    </svg>
  );
};

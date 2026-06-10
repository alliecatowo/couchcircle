/**
 * Window Cat — smug, half-lidded eyes, sharp ears, long tail curled around.
 * Pure inline SVG, no images.
 */

import React from 'react';
import type { AvatarMood } from './index';

interface Props {
  accent: string;
  mood: AvatarMood;
  size: number;
}

export const CatAvatar: React.FC<Props> = ({ accent, mood, size }) => {
  const s = size;
  const cx = s / 2;

  const renderEyes = () => {
    if (mood === 'sleepy') {
      return (
        <>
          <line x1={cx - 10} y1={s * 0.39} x2={cx - 3} y2={s * 0.39} stroke="#100b09" strokeWidth="2" strokeLinecap="round" />
          <line x1={cx + 3} y1={s * 0.39} x2={cx + 10} y2={s * 0.39} stroke="#100b09" strokeWidth="2" strokeLinecap="round" />
        </>
      );
    }
    if (mood === 'buffering') {
      return (
        <>
          <path d={`M ${cx - 10} ${s * 0.37} a 4 4 0 1 1 3 5`} stroke="#100b09" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <path d={`M ${cx + 3} ${s * 0.37} a 4 4 0 1 1 3 5`} stroke="#100b09" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </>
      );
    }
    if (mood === 'melted') {
      // very droopy — half-mast lids
      return (
        <>
          <ellipse cx={cx - 7} cy={s * 0.4} rx="3.5" ry="4" fill="#100b09" />
          <path d={`M ${cx - 11} ${s * 0.37} q 4 0 7 3`} stroke="#100b09" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <ellipse cx={cx + 7} cy={s * 0.4} rx="3.5" ry="4" fill="#100b09" />
          <path d={`M ${cx + 3} ${s * 0.37} q 4 0 7 3`} stroke="#100b09" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </>
      );
    }
    if (mood === 'focused') {
      // intense narrowed slit pupils
      return (
        <>
          <ellipse cx={cx - 7} cy={s * 0.39} rx="4" ry="4" fill="#100b09" />
          <ellipse cx={cx - 7} cy={s * 0.39} rx="1.2" ry="3" fill="#3a2d27" />
          <ellipse cx={cx + 7} cy={s * 0.39} rx="4" ry="4" fill="#100b09" />
          <ellipse cx={cx + 7} cy={s * 0.39} rx="1.2" ry="3" fill="#3a2d27" />
        </>
      );
    }
    if (mood === 'hyped') {
      return (
        <>
          <circle cx={cx - 7} cy={s * 0.39} r="4" fill="#100b09" />
          <circle cx={cx - 7} cy={s * 0.39} r="2.5" fill={accent} />
          <circle cx={cx - 6} cy={s * 0.38} r="1" fill="#f7eee2" />
          <circle cx={cx + 7} cy={s * 0.39} r="4" fill="#100b09" />
          <circle cx={cx + 7} cy={s * 0.39} r="2.5" fill={accent} />
          <circle cx={cx + 8} cy={s * 0.38} r="1" fill="#f7eee2" />
        </>
      );
    }
    if (mood === 'happy') {
      // curved happy eyes
      return (
        <>
          <path d={`M ${cx - 11} ${s * 0.41} q 4 -6 8 0`} stroke="#100b09" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d={`M ${cx + 3} ${s * 0.41} q 4 -6 8 0`} stroke="#100b09" strokeWidth="2" fill="none" strokeLinecap="round" />
        </>
      );
    }
    // default idle — signature smug half-lids
    return (
      <>
        <ellipse cx={cx - 7} cy={s * 0.4} rx="4" ry="4" fill="#100b09" className="animate-blink" style={{ transformOrigin: `${cx - 7}px ${s * 0.4}px` }} />
        <line x1={cx - 11} y1={s * 0.38} x2={cx - 3} y2={s * 0.38} stroke="#5d4a40" strokeWidth="2" strokeLinecap="round" />
        <circle cx={cx - 6.5} cy={s * 0.39} r="1" fill="#f7eee2" />
        <ellipse cx={cx + 7} cy={s * 0.4} rx="4" ry="4" fill="#100b09" className="animate-blink" style={{ transformOrigin: `${cx + 7}px ${s * 0.4}px` }} />
        <line x1={cx + 3} y1={s * 0.38} x2={cx + 11} y2={s * 0.38} stroke="#5d4a40" strokeWidth="2" strokeLinecap="round" />
        <circle cx={cx + 7.5} cy={s * 0.39} r="1" fill="#f7eee2" />
      </>
    );
  };

  const renderMouth = () => {
    if (mood === 'happy' || mood === 'hyped') {
      return (
        <>
          <path d={`M ${cx - 3} ${s * 0.51} l -4 4`} stroke="#100b09" strokeWidth="1.5" strokeLinecap="round" />
          <path d={`M ${cx + 3} ${s * 0.51} l 4 4`} stroke="#100b09" strokeWidth="1.5" strokeLinecap="round" />
          <path d={`M ${cx - 7} ${s * 0.53} q 7 5 14 0`} stroke="#100b09" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </>
      );
    }
    if (mood === 'melted') {
      return <path d={`M ${cx - 4} ${s * 0.54} q 4 -2 8 0`} stroke="#100b09" strokeWidth="1.5" fill="none" strokeLinecap="round" />;
    }
    if (mood === 'sleepy') {
      return <line x1={cx - 3} y1={s * 0.52} x2={cx + 3} y2={s * 0.52} stroke="#100b09" strokeWidth="1.5" strokeLinecap="round" />;
    }
    // default — tiny smug cat mouth
    return (
      <>
        <path d={`M ${cx - 3} ${s * 0.5} l -3 3`} stroke="#100b09" strokeWidth="1.5" strokeLinecap="round" />
        <path d={`M ${cx + 3} ${s * 0.5} l 3 3`} stroke="#100b09" strokeWidth="1.5" strokeLinecap="round" />
        <line x1={cx - 3} y1={s * 0.5} x2={cx + 3} y2={s * 0.5} stroke="#100b09" strokeWidth="1.5" strokeLinecap="round" />
      </>
    );
  };

  const renderWhiskers = () => (
    <>
      <line x1={cx - 18} y1={s * 0.47} x2={cx - 6} y2={s * 0.48} stroke="#9c886f" strokeWidth="1" strokeLinecap="round" opacity="0.7" />
      <line x1={cx - 18} y1={s * 0.5} x2={cx - 6} y2={s * 0.5} stroke="#9c886f" strokeWidth="1" strokeLinecap="round" opacity="0.7" />
      <line x1={cx + 6} y1={s * 0.48} x2={cx + 18} y2={s * 0.47} stroke="#9c886f" strokeWidth="1" strokeLinecap="round" opacity="0.7" />
      <line x1={cx + 6} y1={s * 0.5} x2={cx + 18} y2={s * 0.5} stroke="#9c886f" strokeWidth="1" strokeLinecap="round" opacity="0.7" />
    </>
  );

  const renderEffects = () => {
    if (mood === 'sleepy') {
      return <text x={cx + 12} y={s * 0.2} fontSize={s * 0.12} fill="#bfac95" fontFamily="sans-serif" opacity="0.85"
        style={{ animation: 'float-bob 3.2s ease-in-out infinite' }}>zzz</text>;
    }
    if (mood === 'thirsty') {
      return <ellipse cx={cx + 20} cy={s * 0.28} rx={s * 0.055} ry={s * 0.085} fill="#56855f" opacity="0.9" />;
    }
    if (mood === 'away') {
      return (
        <g opacity="0.9">
          <line x1={cx + 17} y1={s * 0.12} x2={cx + 17} y2={s * 0.27} stroke="#9c886f" strokeWidth="1.5" />
          <rect x={cx + 17} y={s * 0.12} width={s * 0.12} height={s * 0.07} rx="1" fill={accent} />
          <text x={cx + 18} y={s * 0.185} fontSize={s * 0.065} fill="#100b09" fontFamily="sans-serif">brb</text>
        </g>
      );
    }
    if (mood === 'lit') {
      return (
        <>
          <circle cx={cx} cy={s * 0.38} r={s * 0.44} fill="none" stroke={accent} strokeWidth="3" opacity="0.22" />
          <circle cx={cx} cy={s * 0.38} r={s * 0.48} fill="none" stroke={accent} strokeWidth="1" opacity="0.12" />
          <circle cx={cx - 4} cy={s * 0.06} r="3" fill="#9c886f" opacity="0" style={{ animation: 'puff 3.6s ease-out infinite', animationDelay: '0s' }} />
          <circle cx={cx + 2} cy={s * 0.04} r="2.5" fill="#9c886f" opacity="0" style={{ animation: 'puff 3.6s ease-out infinite', animationDelay: '1.1s' }} />
          <circle cx={cx + 8} cy={s * 0.08} r="2" fill="#9c886f" opacity="0" style={{ animation: 'puff 3.6s ease-out infinite', animationDelay: '2.3s' }} />
        </>
      );
    }
    return null;
  };

  const bodyY = mood === 'melted' ? s * 0.62 : s * 0.58;

  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* soft contrast backing so the silhouette reads on a dark couch */}
      <ellipse cx={cx} cy={bodyY - s * 0.06} rx={s * 0.46} ry={s * 0.46} fill="#0d0907" opacity="0.24" />

      {/* pointy ears */}
      <polygon points={`${cx - 15},${s * 0.26} ${cx - 19},${s * 0.1} ${cx - 7},${s * 0.22}`} fill="#9a7a64" />
      <polygon points={`${cx - 14},${s * 0.25} ${cx - 17},${s * 0.14} ${cx - 8},${s * 0.22}`} fill={accent} />
      <polygon points={`${cx + 7},${s * 0.22} ${cx + 19},${s * 0.1} ${cx + 15},${s * 0.26}`} fill="#9a7a64" />
      <polygon points={`${cx + 8},${s * 0.22} ${cx + 17},${s * 0.14} ${cx + 14},${s * 0.25}`} fill={accent} />

      {/* body with accent collar/markings */}
      <ellipse cx={cx} cy={bodyY} rx={s * 0.3} ry={s * 0.26} fill="#9a7a64" />
      {/* highlight sheen on the body */}
      <ellipse cx={cx - s * 0.06} cy={bodyY - s * 0.1} rx={s * 0.16} ry={s * 0.08} fill="#fff" opacity="0.16" />
      {/* collar / accent marking */}
      <ellipse cx={cx} cy={bodyY - s * 0.1} rx={s * 0.18} ry={s * 0.07} fill={accent} />

      {/* head */}
      <ellipse cx={cx} cy={s * 0.38} rx={s * 0.23} ry={s * 0.21} fill="#b08f74" />

      {/* eyes */}
      {renderEyes()}

      {/* whiskers */}
      {renderWhiskers()}

      {/* mouth */}
      {renderMouth()}

      {/* curled tail */}
      <path d={`M ${cx + 20} ${bodyY + 10} q 16 -2 14 -14 q -2 -10 -10 -8`}
        stroke={accent} strokeWidth="3.5" fill="none" strokeLinecap="round" />

      {/* effects */}
      {renderEffects()}
    </svg>
  );
};

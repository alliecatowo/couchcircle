/**
 * Pond Frog — round, content, big eyes on top of head, wide smile.
 * Pure inline SVG, no images.
 */

import React from 'react';
import type { AvatarMood } from './index';

interface Props {
  accent: string;
  mood: AvatarMood;
  size: number;
}

export const FrogAvatar: React.FC<Props> = ({ accent, mood, size }) => {
  const s = size;
  const cx = s / 2;

  const renderEyes = () => {
    if (mood === 'sleepy') {
      return (
        <>
          <ellipse cx={cx - 9} cy={s * 0.27} rx="5.5" ry="5" fill="#3a2d27" />
          <line x1={cx - 14.5} y1={s * 0.27} x2={cx - 3.5} y2={s * 0.27} stroke="#1f1815" strokeWidth="2.5" strokeLinecap="round" />
          <ellipse cx={cx + 9} cy={s * 0.27} rx="5.5" ry="5" fill="#3a2d27" />
          <line x1={cx + 3.5} y1={s * 0.27} x2={cx + 14.5} y2={s * 0.27} stroke="#1f1815" strokeWidth="2.5" strokeLinecap="round" />
        </>
      );
    }
    if (mood === 'buffering') {
      return (
        <>
          <ellipse cx={cx - 9} cy={s * 0.27} rx="5.5" ry="5" fill="#3a2d27" />
          <path d={`M ${cx - 11} ${s * 0.25} a 4 4 0 1 1 3 4`} stroke="#f7eee2" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <ellipse cx={cx + 9} cy={s * 0.27} rx="5.5" ry="5" fill="#3a2d27" />
          <path d={`M ${cx + 7} ${s * 0.25} a 4 4 0 1 1 3 4`} stroke="#f7eee2" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </>
      );
    }
    if (mood === 'melted') {
      return (
        <>
          <ellipse cx={cx - 9} cy={s * 0.28} rx="5.5" ry="4" fill="#3a2d27" />
          <line x1={cx - 14.5} y1={s * 0.25} x2={cx - 3.5} y2={s * 0.3} stroke="#1f1815" strokeWidth="2" strokeLinecap="round" />
          <ellipse cx={cx + 9} cy={s * 0.28} rx="5.5" ry="4" fill="#3a2d27" />
          <line x1={cx + 3.5} y1={s * 0.25} x2={cx + 14.5} y2={s * 0.3} stroke="#1f1815" strokeWidth="2" strokeLinecap="round" />
        </>
      );
    }
    if (mood === 'focused') {
      return (
        <>
          <ellipse cx={cx - 9} cy={s * 0.27} rx="5.5" ry="5" fill="#3a2d27" />
          <ellipse cx={cx - 9} cy={s * 0.27} rx="3" ry="1.5" fill="#4a3a32" />
          <ellipse cx={cx + 9} cy={s * 0.27} rx="5.5" ry="5" fill="#3a2d27" />
          <ellipse cx={cx + 9} cy={s * 0.27} rx="3" ry="1.5" fill="#4a3a32" />
        </>
      );
    }
    if (mood === 'hyped') {
      return (
        <>
          <ellipse cx={cx - 9} cy={s * 0.27} rx="5.5" ry="5" fill="#3a2d27" />
          <circle cx={cx - 9} cy={s * 0.27} r="3" fill={accent} />
          <circle cx={cx - 8} cy={s * 0.26} r="1.2" fill="#f7eee2" />
          <ellipse cx={cx + 9} cy={s * 0.27} rx="5.5" ry="5" fill="#3a2d27" />
          <circle cx={cx + 9} cy={s * 0.27} r="3" fill={accent} />
          <circle cx={cx + 10} cy={s * 0.26} r="1.2" fill="#f7eee2" />
        </>
      );
    }
    if (mood === 'happy') {
      return (
        <>
          <ellipse cx={cx - 9} cy={s * 0.27} rx="5.5" ry="5.5" fill="#3a2d27" />
          <circle cx={cx - 8} cy={s * 0.26} r="1.5" fill="#f7eee2" />
          <ellipse cx={cx + 9} cy={s * 0.27} rx="5.5" ry="5.5" fill="#3a2d27" />
          <circle cx={cx + 10} cy={s * 0.26} r="1.5" fill="#f7eee2" />
        </>
      );
    }
    // idle / default — big round periscope eyes with blink
    return (
      <>
        <ellipse cx={cx - 9} cy={s * 0.27} rx="5.5" ry="5" fill="#3a2d27" />
        <ellipse cx={cx - 9} cy={s * 0.27} rx="3" ry="3.5" fill="#100b09"
          className="animate-blink" style={{ transformOrigin: `${cx - 9}px ${s * 0.27}px` }} />
        <circle cx={cx - 8} cy={s * 0.26} r="1" fill="#f7eee2" />
        <ellipse cx={cx + 9} cy={s * 0.27} rx="5.5" ry="5" fill="#3a2d27" />
        <ellipse cx={cx + 9} cy={s * 0.27} rx="3" ry="3.5" fill="#100b09"
          className="animate-blink" style={{ transformOrigin: `${cx + 9}px ${s * 0.27}px` }} />
        <circle cx={cx + 10} cy={s * 0.26} r="1" fill="#f7eee2" />
      </>
    );
  };

  const renderMouth = () => {
    if (mood === 'happy' || mood === 'hyped') {
      // wide frog grin
      return (
        <path d={`M ${cx - 12} ${s * 0.52} q 12 10 24 0`} stroke="#100b09" strokeWidth="2" fill="none" strokeLinecap="round" />
      );
    }
    if (mood === 'melted') {
      return <path d={`M ${cx - 6} ${s * 0.55} q 6 -3 12 0`} stroke="#100b09" strokeWidth="2" fill="none" strokeLinecap="round" />;
    }
    if (mood === 'sleepy') {
      return <line x1={cx - 6} y1={s * 0.54} x2={cx + 6} y2={s * 0.54} stroke="#100b09" strokeWidth="2" strokeLinecap="round" />;
    }
    // default content smile
    return <path d={`M ${cx - 8} ${s * 0.51} q 8 7 16 0`} stroke="#100b09" strokeWidth="1.8" fill="none" strokeLinecap="round" />;
  };

  const renderEffects = () => {
    if (mood === 'sleepy') {
      return <text x={cx + 12} y={s * 0.18} fontSize={s * 0.12} fill="#bfac95" fontFamily="sans-serif" opacity="0.85"
        style={{ animation: 'float-bob 3.5s ease-in-out infinite' }}>zzz</text>;
    }
    if (mood === 'thirsty') {
      return <ellipse cx={cx + 20} cy={s * 0.3} rx={s * 0.055} ry={s * 0.085} fill="#56855f" opacity="0.9" />;
    }
    if (mood === 'away') {
      return (
        <g opacity="0.9">
          <line x1={cx + 16} y1={s * 0.12} x2={cx + 16} y2={s * 0.27} stroke="#9c886f" strokeWidth="1.5" />
          <rect x={cx + 16} y={s * 0.12} width={s * 0.12} height={s * 0.07} rx="1" fill={accent} />
          <text x={cx + 17} y={s * 0.185} fontSize={s * 0.065} fill="#100b09" fontFamily="sans-serif">brb</text>
        </g>
      );
    }
    if (mood === 'lit') {
      return (
        <>
          <circle cx={cx} cy={s * 0.42} r={s * 0.44} fill="none" stroke={accent} strokeWidth="3" opacity="0.22" />
          <circle cx={cx} cy={s * 0.42} r={s * 0.48} fill="none" stroke={accent} strokeWidth="1" opacity="0.12" />
          <circle cx={cx - 5} cy={s * 0.07} r="3" fill="#9c886f" opacity="0" style={{ animation: 'puff 3.6s ease-out infinite', animationDelay: '0s' }} />
          <circle cx={cx + 3} cy={s * 0.05} r="2.5" fill="#9c886f" opacity="0" style={{ animation: 'puff 3.6s ease-out infinite', animationDelay: '1.3s' }} />
          <circle cx={cx + 8} cy={s * 0.09} r="2" fill="#9c886f" opacity="0" style={{ animation: 'puff 3.6s ease-out infinite', animationDelay: '2.6s' }} />
        </>
      );
    }
    return null;
  };

  const bodyY = mood === 'melted' ? s * 0.63 : s * 0.6;

  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* soft contrast backing so the silhouette reads on a dark couch */}
      <ellipse cx={cx} cy={bodyY - s * 0.08} rx={s * 0.46} ry={s * 0.46} fill="#0d0907" opacity="0.24" />

      {/* eye stalks */}
      <ellipse cx={cx - 9} cy={s * 0.28} rx="7" ry="6.5" fill={accent} />
      <ellipse cx={cx + 9} cy={s * 0.28} rx="7" ry="6.5" fill={accent} />

      {/* body — very round */}
      <ellipse cx={cx} cy={bodyY} rx={s * 0.33} ry={s * 0.28} fill={accent} />
      {/* belly lighter patch */}
      <ellipse cx={cx} cy={bodyY + 2} rx={s * 0.2} ry={s * 0.18} fill="#f7eee2" opacity="0.3" />

      {/* head */}
      <ellipse cx={cx} cy={s * 0.42} rx={s * 0.27} ry={s * 0.25} fill={accent} />
      {/* highlight sheen across the top of the head */}
      <ellipse cx={cx - s * 0.06} cy={s * 0.33} rx={s * 0.16} ry={s * 0.07} fill="#fff" opacity="0.2" />

      {/* smile line base */}
      <ellipse cx={cx} cy={s * 0.51} rx={s * 0.2} ry={s * 0.06} fill="#3a2d27" opacity="0.4" />

      {/* eyes */}
      {renderEyes()}

      {/* mouth */}
      {renderMouth()}

      {/* tiny legs */}
      <ellipse cx={cx - 18} cy={bodyY + 10} rx={s * 0.12} ry={s * 0.07} fill={accent} opacity="0.9" transform={`rotate(30 ${cx - 18} ${bodyY + 10})`} />
      <ellipse cx={cx + 18} cy={bodyY + 10} rx={s * 0.12} ry={s * 0.07} fill={accent} opacity="0.9" transform={`rotate(-30 ${cx + 18} ${bodyY + 10})`} />

      {/* effects */}
      {renderEffects()}
    </svg>
  );
};

/**
 * Blanket Person — a cozy ghost-like blob draped in a blanket with tiny feet poking out.
 * Pure inline SVG, no images.
 */

import React from 'react';
import type { AvatarMood } from './index';

interface Props {
  accent: string;
  mood: AvatarMood;
  size: number;
}

export const BlanketAvatar: React.FC<Props> = ({ accent, mood, size }) => {
  const s = size;
  const cx = s / 2;

  const bodyTop = s * 0.18;
  const bodyMid = s * 0.5;

  const renderEyes = () => {
    if (mood === 'sleepy') {
      return (
        <>
          <line x1={cx - 8} y1={s * 0.38} x2={cx - 2} y2={s * 0.38} stroke="#100b09" strokeWidth="2" strokeLinecap="round" />
          <line x1={cx + 2} y1={s * 0.38} x2={cx + 8} y2={s * 0.38} stroke="#100b09" strokeWidth="2" strokeLinecap="round" />
        </>
      );
    }
    if (mood === 'buffering') {
      return (
        <>
          <path d={`M ${cx - 9} ${s * 0.36} a 3.5 3.5 0 1 1 2 4`} stroke="#100b09" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <path d={`M ${cx + 2} ${s * 0.36} a 3.5 3.5 0 1 1 2 4`} stroke="#100b09" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </>
      );
    }
    if (mood === 'melted') {
      return (
        <>
          <ellipse cx={cx - 6} cy={s * 0.39} rx="3" ry="3.5" fill="#100b09" />
          <line x1={cx - 9} y1={s * 0.36} x2={cx - 3} y2={s * 0.42} stroke="#100b09" strokeWidth="2.2" strokeLinecap="round" />
          <ellipse cx={cx + 6} cy={s * 0.39} rx="3" ry="3.5" fill="#100b09" />
          <line x1={cx + 3} y1={s * 0.36} x2={cx + 9} y2={s * 0.42} stroke="#100b09" strokeWidth="2.2" strokeLinecap="round" />
        </>
      );
    }
    if (mood === 'focused') {
      return (
        <>
          <ellipse cx={cx - 6} cy={s * 0.38} rx="3.5" ry="2" fill="#100b09" />
          <ellipse cx={cx + 6} cy={s * 0.38} rx="3.5" ry="2" fill="#100b09" />
        </>
      );
    }
    if (mood === 'hyped') {
      return (
        <>
          <circle cx={cx - 6} cy={s * 0.38} r="3.5" fill="#100b09" />
          <circle cx={cx - 6} cy={s * 0.38} r="2" fill={accent} />
          <circle cx={cx - 5.2} cy={s * 0.37} r="0.9" fill="#f7eee2" />
          <circle cx={cx + 6} cy={s * 0.38} r="3.5" fill="#100b09" />
          <circle cx={cx + 6} cy={s * 0.38} r="2" fill={accent} />
          <circle cx={cx + 6.8} cy={s * 0.37} r="0.9" fill="#f7eee2" />
        </>
      );
    }
    if (mood === 'happy') {
      return (
        <>
          <path d={`M ${cx - 9} ${s * 0.4} q 3 -6 6 0`} stroke="#100b09" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d={`M ${cx + 3} ${s * 0.4} q 3 -6 6 0`} stroke="#100b09" strokeWidth="2" fill="none" strokeLinecap="round" />
        </>
      );
    }
    // idle — simple dot eyes peeking out of blanket
    return (
      <>
        <circle cx={cx - 6} cy={s * 0.38} r="3" fill="#100b09"
          className="animate-blink" style={{ transformOrigin: `${cx - 6}px ${s * 0.38}px` }} />
        <circle cx={cx - 5.3} cy={s * 0.37} r="0.9" fill="#f7eee2" />
        <circle cx={cx + 6} cy={s * 0.38} r="3" fill="#100b09"
          className="animate-blink" style={{ transformOrigin: `${cx + 6}px ${s * 0.38}px` }} />
        <circle cx={cx + 6.7} cy={s * 0.37} r="0.9" fill="#f7eee2" />
      </>
    );
  };

  const renderMouth = () => {
    if (mood === 'happy' || mood === 'hyped') {
      return <path d={`M ${cx - 6} ${s * 0.48} q 6 5 12 0`} stroke="#100b09" strokeWidth="1.8" fill="none" strokeLinecap="round" />;
    }
    if (mood === 'melted') {
      return <path d={`M ${cx - 4} ${s * 0.52} q 4 -3 8 0`} stroke="#100b09" strokeWidth="1.5" fill="none" strokeLinecap="round" />;
    }
    if (mood === 'sleepy') {
      return <line x1={cx - 3} y1={s * 0.49} x2={cx + 3} y2={s * 0.49} stroke="#100b09" strokeWidth="1.5" strokeLinecap="round" />;
    }
    return <path d={`M ${cx - 4} ${s * 0.47} q 4 3 8 0`} stroke="#100b09" strokeWidth="1.4" fill="none" strokeLinecap="round" />;
  };

  const renderEffects = () => {
    if (mood === 'sleepy') {
      return <text x={cx + 14} y={s * 0.22} fontSize={s * 0.12} fill="#bfac95" fontFamily="sans-serif" opacity="0.85"
        style={{ animation: 'float-bob 4s ease-in-out infinite' }}>zzz</text>;
    }
    if (mood === 'thirsty') {
      return <ellipse cx={cx + 21} cy={s * 0.3} rx={s * 0.055} ry={s * 0.085} fill="#56855f" opacity="0.9" />;
    }
    if (mood === 'away') {
      return (
        <g opacity="0.9">
          <line x1={cx + 17} y1={s * 0.13} x2={cx + 17} y2={s * 0.28} stroke="#9c886f" strokeWidth="1.5" />
          <rect x={cx + 17} y={s * 0.13} width={s * 0.12} height={s * 0.07} rx="1" fill={accent} />
          <text x={cx + 18} y={s * 0.195} fontSize={s * 0.065} fill="#100b09" fontFamily="sans-serif">brb</text>
        </g>
      );
    }
    if (mood === 'lit') {
      return (
        <>
          <circle cx={cx} cy={s * 0.42} r={s * 0.44} fill="none" stroke={accent} strokeWidth="3" opacity="0.22" />
          <circle cx={cx} cy={s * 0.42} r={s * 0.48} fill="none" stroke={accent} strokeWidth="1" opacity="0.12" />
          <circle cx={cx - 4} cy={s * 0.06} r="3" fill="#9c886f" opacity="0" style={{ animation: 'puff 3.6s ease-out infinite', animationDelay: '0s' }} />
          <circle cx={cx + 2} cy={s * 0.04} r="2.5" fill="#9c886f" opacity="0" style={{ animation: 'puff 3.6s ease-out infinite', animationDelay: '1.2s' }} />
          <circle cx={cx + 8} cy={s * 0.08} r="2" fill="#9c886f" opacity="0" style={{ animation: 'puff 3.6s ease-out infinite', animationDelay: '2.5s' }} />
        </>
      );
    }
    return null;
  };

  // blanket drape shape varies slightly by mood
  const blanketSag = mood === 'melted' ? s * 0.07 : s * 0.02;

  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* soft contrast backing so the silhouette reads on a dark couch */}
      <ellipse cx={cx} cy={s * 0.5} rx={s * 0.42} ry={s * 0.46} fill="#0d0907" opacity="0.22" />

      {/* blanket blob body — the whole shape is the blanket */}
      <path
        d={`
          M ${cx - s * 0.28} ${bodyMid}
          Q ${cx - s * 0.32} ${bodyTop + s * 0.08}
            ${cx} ${bodyTop}
          Q ${cx + s * 0.32} ${bodyTop + s * 0.08}
            ${cx + s * 0.28} ${bodyMid}
          Q ${cx + s * 0.3} ${s * 0.7 + blanketSag}
            ${cx + s * 0.2} ${s * 0.76 + blanketSag}
          Q ${cx} ${s * 0.8 + blanketSag}
            ${cx - s * 0.2} ${s * 0.76 + blanketSag}
          Q ${cx - s * 0.3} ${s * 0.7 + blanketSag}
            ${cx - s * 0.28} ${bodyMid}
          Z
        `}
        fill={accent}
      />
      {/* highlight sheen across the top of the draped blanket */}
      <ellipse cx={cx - s * 0.05} cy={bodyTop + s * 0.07} rx={s * 0.16} ry={s * 0.06} fill="#fff" opacity="0.2" />

      {/* blanket fold/texture lines */}
      <path d={`M ${cx - s * 0.2} ${bodyTop + s * 0.06} q ${s * 0.2} -4 ${s * 0.4} 0`}
        stroke={accent} strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.5" />
      <path d={`M ${cx - s * 0.14} ${s * 0.6 + blanketSag / 2} q ${s * 0.14} 3 ${s * 0.28} 0`}
        stroke="#3a2d27" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.3" />

      {/* face area — lighter peeking oval so the dark eyes/mouth read against it */}
      <ellipse cx={cx} cy={s * 0.4} rx={s * 0.16} ry={s * 0.15} fill="#cbb39a" opacity="0.85" />

      {/* eyes */}
      {renderEyes()}

      {/* mouth */}
      {renderMouth()}

      {/* tiny feet poking out at the bottom */}
      <ellipse cx={cx - s * 0.1} cy={s * 0.82 + blanketSag} rx={s * 0.07} ry={s * 0.045} fill="#8a6a55" />
      <ellipse cx={cx + s * 0.1} cy={s * 0.82 + blanketSag} rx={s * 0.07} ry={s * 0.045} fill="#8a6a55" />
      {/* toe nubs */}
      <circle cx={cx - s * 0.13} cy={s * 0.826 + blanketSag} r={s * 0.02} fill="#3a2d27" />
      <circle cx={cx - s * 0.085} cy={s * 0.832 + blanketSag} r={s * 0.02} fill="#3a2d27" />
      <circle cx={cx + s * 0.085} cy={s * 0.832 + blanketSag} r={s * 0.02} fill="#3a2d27" />
      <circle cx={cx + s * 0.13} cy={s * 0.826 + blanketSag} r={s * 0.02} fill="#3a2d27" />

      {/* effects */}
      {renderEffects()}
    </svg>
  );
};

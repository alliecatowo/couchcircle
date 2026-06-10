/**
 * Lil Sprout — tiny plant in a little terracotta pot, cheerful leaf-face.
 * Pure inline SVG, no images.
 */

import React from 'react';
import type { AvatarMood } from './index';

interface Props {
  accent: string;
  mood: AvatarMood;
  size: number;
}

export const SproutAvatar: React.FC<Props> = ({ accent, mood, size }) => {
  const s = size;
  const cx = s / 2;

  // pot base position
  const potY = s * 0.72;
  const potH = s * 0.22;
  const potW = s * 0.36;

  // stem and face
  const stemTop = s * 0.42;

  const renderEyes = () => {
    if (mood === 'sleepy') {
      return (
        <>
          <line x1={cx - 7} y1={stemTop + 4} x2={cx - 2} y2={stemTop + 4} stroke="#100b09" strokeWidth="1.8" strokeLinecap="round" />
          <line x1={cx + 2} y1={stemTop + 4} x2={cx + 7} y2={stemTop + 4} stroke="#100b09" strokeWidth="1.8" strokeLinecap="round" />
        </>
      );
    }
    if (mood === 'buffering') {
      return (
        <>
          <path d={`M ${cx - 7} ${stemTop + 3} a 3 3 0 1 1 2 3.5`} stroke="#100b09" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          <path d={`M ${cx + 2} ${stemTop + 3} a 3 3 0 1 1 2 3.5`} stroke="#100b09" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </>
      );
    }
    if (mood === 'melted') {
      return (
        <>
          <ellipse cx={cx - 5} cy={stemTop + 5} rx="2.5" ry="2" fill="#100b09" />
          <line x1={cx - 8} y1={stemTop + 3} x2={cx - 2} y2={stemTop + 7} stroke="#100b09" strokeWidth="1.8" strokeLinecap="round" />
          <ellipse cx={cx + 5} cy={stemTop + 5} rx="2.5" ry="2" fill="#100b09" />
          <line x1={cx + 2} y1={stemTop + 3} x2={cx + 8} y2={stemTop + 7} stroke="#100b09" strokeWidth="1.8" strokeLinecap="round" />
        </>
      );
    }
    if (mood === 'focused') {
      return (
        <>
          <ellipse cx={cx - 5} cy={stemTop + 4} rx="3" ry="1.5" fill="#100b09" />
          <ellipse cx={cx + 5} cy={stemTop + 4} rx="3" ry="1.5" fill="#100b09" />
        </>
      );
    }
    if (mood === 'hyped') {
      return (
        <>
          <circle cx={cx - 5} cy={stemTop + 4} r="3" fill="#100b09" />
          <circle cx={cx - 5} cy={stemTop + 4} r="1.5" fill={accent} />
          <circle cx={cx - 4} cy={stemTop + 3} r="0.8" fill="#f7eee2" />
          <circle cx={cx + 5} cy={stemTop + 4} r="3" fill="#100b09" />
          <circle cx={cx + 5} cy={stemTop + 4} r="1.5" fill={accent} />
          <circle cx={cx + 6} cy={stemTop + 3} r="0.8" fill="#f7eee2" />
        </>
      );
    }
    if (mood === 'happy') {
      return (
        <>
          <path d={`M ${cx - 8} ${stemTop + 5} q 3 -5 6 0`} stroke="#100b09" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <path d={`M ${cx + 2} ${stemTop + 5} q 3 -5 6 0`} stroke="#100b09" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </>
      );
    }
    // idle — cute round dot eyes
    return (
      <>
        <circle cx={cx - 5} cy={stemTop + 4} r="2.5" fill="#100b09"
          className="animate-blink" style={{ transformOrigin: `${cx - 5}px ${stemTop + 4}px` }} />
        <circle cx={cx - 4.3} cy={stemTop + 3.2} r="0.8" fill="#f7eee2" />
        <circle cx={cx + 5} cy={stemTop + 4} r="2.5" fill="#100b09"
          className="animate-blink" style={{ transformOrigin: `${cx + 5}px ${stemTop + 4}px` }} />
        <circle cx={cx + 5.7} cy={stemTop + 3.2} r="0.8" fill="#f7eee2" />
      </>
    );
  };

  const renderMouth = () => {
    if (mood === 'happy' || mood === 'hyped') {
      return <path d={`M ${cx - 5} ${stemTop + 10} q 5 5 10 0`} stroke="#100b09" strokeWidth="1.5" fill="none" strokeLinecap="round" />;
    }
    if (mood === 'melted') {
      return <path d={`M ${cx - 3} ${stemTop + 12} q 3 -2 6 0`} stroke="#100b09" strokeWidth="1.5" fill="none" strokeLinecap="round" />;
    }
    if (mood === 'sleepy') {
      return <line x1={cx - 3} y1={stemTop + 11} x2={cx + 3} y2={stemTop + 11} stroke="#100b09" strokeWidth="1.5" strokeLinecap="round" />;
    }
    return <path d={`M ${cx - 4} ${stemTop + 10} q 4 3 8 0`} stroke="#100b09" strokeWidth="1.4" fill="none" strokeLinecap="round" />;
  };

  const renderLeaves = () => {
    // two side leaves off the main stem
    const moodScale = mood === 'melted' ? 0.8 : mood === 'happy' || mood === 'hyped' ? 1.15 : 1;
    const lx = cx - s * 0.18 * moodScale;
    const rx = cx + s * 0.18 * moodScale;
    const ly = s * 0.35;
    return (
      <>
        {/* left leaf */}
        <ellipse cx={lx} cy={ly} rx={s * 0.1} ry={s * 0.07}
          fill="#6fa874" opacity="0.95"
          transform={`rotate(-30 ${lx} ${ly})`} />
        <line x1={lx + 2} y1={ly + 1} x2={cx - 3} y2={stemTop - 2}
          stroke="#3d6347" strokeWidth="1.2" opacity="0.6" />
        {/* right leaf */}
        <ellipse cx={rx} cy={ly} rx={s * 0.1} ry={s * 0.07}
          fill="#79a97f" opacity="0.9"
          transform={`rotate(30 ${rx} ${ly})`} />
        <line x1={rx - 2} y1={ly + 1} x2={cx + 3} y2={stemTop - 2}
          stroke="#56855f" strokeWidth="1.2" opacity="0.6" />
        {/* top sprout */}
        <ellipse cx={cx} cy={s * 0.28} rx={s * 0.07} ry={s * 0.1}
          fill={accent} opacity="0.85" />
        <line x1={cx} y1={s * 0.38} x2={cx} y2={s * 0.28}
          stroke="#56855f" strokeWidth="1.5" />
      </>
    );
  };

  const renderEffects = () => {
    if (mood === 'sleepy') {
      return <text x={cx + 12} y={s * 0.2} fontSize={s * 0.12} fill="#bfac95" fontFamily="sans-serif" opacity="0.85"
        style={{ animation: 'float-bob 3.8s ease-in-out infinite' }}>zzz</text>;
    }
    if (mood === 'thirsty') {
      // droplet near pot — the plant is thirsty!
      return <ellipse cx={cx + 22} cy={potY - 8} rx={s * 0.055} ry={s * 0.085} fill="#56855f" opacity="0.9" />;
    }
    if (mood === 'away') {
      return (
        <g opacity="0.9">
          <line x1={cx + 14} y1={s * 0.17} x2={cx + 14} y2={s * 0.32} stroke="#9c886f" strokeWidth="1.5" />
          <rect x={cx + 14} y={s * 0.17} width={s * 0.12} height={s * 0.07} rx="1" fill={accent} />
          <text x={cx + 15} y={s * 0.235} fontSize={s * 0.065} fill="#100b09" fontFamily="sans-serif">brb</text>
        </g>
      );
    }
    if (mood === 'lit') {
      return (
        <>
          <circle cx={cx} cy={s * 0.45} r={s * 0.44} fill="none" stroke={accent} strokeWidth="3" opacity="0.22" />
          <circle cx={cx} cy={s * 0.45} r={s * 0.48} fill="none" stroke={accent} strokeWidth="1" opacity="0.12" />
          <circle cx={cx - 3} cy={s * 0.07} r="3" fill="#9c886f" opacity="0" style={{ animation: 'puff 3.6s ease-out infinite', animationDelay: '0s' }} />
          <circle cx={cx + 4} cy={s * 0.05} r="2.5" fill="#9c886f" opacity="0" style={{ animation: 'puff 3.6s ease-out infinite', animationDelay: '1.5s' }} />
          <circle cx={cx + 9} cy={s * 0.09} r="2" fill="#9c886f" opacity="0" style={{ animation: 'puff 3.6s ease-out infinite', animationDelay: '3s' }} />
        </>
      );
    }
    return null;
  };

  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* soft contrast backing so the silhouette reads on a dark couch */}
      <ellipse cx={cx} cy={s * 0.55} rx={s * 0.44} ry={s * 0.48} fill="#0d0907" opacity="0.22" />

      {/* pot */}
      <rect x={cx - potW / 2} y={potY - potH} width={potW} height={potH} rx={s * 0.05} fill={accent} />
      {/* highlight sheen on the pot */}
      <rect x={cx - potW / 2 + 2} y={potY - potH + 2} width={potW * 0.4} height={potH * 0.5} rx={s * 0.03} fill="#fff" opacity="0.15" />
      {/* pot rim */}
      <rect x={cx - potW / 2 - 2} y={potY - potH} width={potW + 4} height={s * 0.05} rx="3" fill={accent} opacity="0.85" />
      {/* soil / dirt line inside pot */}
      <ellipse cx={cx} cy={potY - potH + s * 0.04} rx={potW / 2 - 2} ry={s * 0.025} fill="#3a2d27" opacity="0.6" />

      {/* main stem */}
      <line x1={cx} y1={potY - potH + s * 0.04} x2={cx} y2={stemTop + 15}
        stroke="#6fa874" strokeWidth="2.5" strokeLinecap="round" />

      {/* leaf face */}
      <ellipse cx={cx} cy={stemTop + s * 0.12} rx={s * 0.17} ry={s * 0.15} fill="#6fa874" />
      {/* highlight sheen on the leaf face */}
      <ellipse cx={cx - s * 0.04} cy={stemTop + s * 0.07} rx={s * 0.09} ry={s * 0.05} fill="#fff" opacity="0.18" />

      {/* leaves */}
      {renderLeaves()}

      {/* eyes */}
      {renderEyes()}

      {/* mouth */}
      {renderMouth()}

      {/* effects */}
      {renderEffects()}
    </svg>
  );
};

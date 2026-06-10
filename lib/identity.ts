'use client';

import type { IdentitySnapshot } from '@/shared/protocol';
import { AVATAR_IDS, ACCENT_COLORS } from '@/shared/constants';
import { nanoid } from 'nanoid';

/** Re-export the protocol's identity shape for local persistence. */
export type LocalIdentity = IdentitySnapshot;

/**
 * Two-part cozy name wordlists (stoner-adjacent flavor).
 * Random picks combine adjective/mood with a noun for fun combinations.
 */
const ADJECTIVES = [
  'Blanket',
  'Couch',
  'Haze',
  'Snack',
  'Mellow',
  'Cozy',
  'Drowsy',
  'Sleepy',
  'Crusty',
  'Gooey',
  'Fuzzy',
  'Smoky',
  'Vibe',
  'Chilled',
  'Glowy',
  'Dreamy',
];

const NOUNS = [
  'Wizard',
  'Cryptid',
  'Gremlin',
  'Goblin',
  'Ghost',
  'Spirit',
  'Bandit',
  'Phantom',
  'Sprite',
  'Entity',
  'Creature',
  'Beast',
  'Sage',
  'Phantom',
  'Wisp',
  'Slouch',
];

/**
 * The participant id is TAB-scoped (sessionStorage) rather than browser-scoped:
 * sessionStorage survives reloads within a tab (so reconnects reattach to the
 * same participant) but differs between tabs, so opening the room in two tabs
 * gives two people on the couch instead of one ghost with two connections.
 */
function tabScopedId(): string {
  try {
    const existing = window.sessionStorage?.getItem('couchcircle:tab-id');
    if (existing) return existing;
    const fresh = nanoid();
    window.sessionStorage?.setItem('couchcircle:tab-id', fresh);
    return fresh;
  } catch {
    return nanoid();
  }
}

/**
 * Load identity prefs from localStorage if available (id comes from the
 * per-tab scope — see tabScopedId).
 * Returns null if SSR (server) or if no stored identity exists.
 * Validates minimal shape (has id, name, avatar, accent) before returning.
 */
export function loadIdentity(): LocalIdentity | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = window.localStorage?.getItem('couchcircle:identity');
    if (!stored) return null;

    const parsed = JSON.parse(stored);

    // Minimal validation: must have all required fields
    if (
      typeof parsed.id === 'string' &&
      typeof parsed.name === 'string' &&
      typeof parsed.avatar === 'string' &&
      typeof parsed.accent === 'string'
    ) {
      return { ...(parsed as LocalIdentity), id: tabScopedId() };
    }
  } catch {
    // JSON parse error or validation failed; return null
  }

  return null;
}

/**
 * Save identity prefs to localStorage (and pin the id to this tab's scope).
 * No-op if SSR (server).
 */
export function saveIdentity(identity: LocalIdentity): void {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage?.setItem('couchcircle:tab-id', identity.id);
    window.localStorage?.setItem('couchcircle:identity', JSON.stringify(identity));
  } catch {
    // Storage full or disabled; silently fail
  }
}

/**
 * Generate a random cozy two-part name.
 * Example: "Blanket Wizard", "Couch Cryptid", "Haze Gremlin".
 */
export function randomName(): string {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adjective} ${noun}`;
}

/**
 * Create a new random identity with a unique id, random name, avatar, and accent.
 */
export function randomIdentity(): LocalIdentity {
  return {
    id: typeof window === 'undefined' ? nanoid() : tabScopedId(),
    name: randomName(),
    avatar: AVATAR_IDS[Math.floor(Math.random() * AVATAR_IDS.length)],
    accent: ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)],
  };
}

/**
 * Load an identity from storage, or create and save a new random one.
 * Always returns a valid LocalIdentity.
 */
export function ensureIdentity(): LocalIdentity {
  const loaded = loadIdentity();
  if (loaded) return loaded;

  const fresh = randomIdentity();
  saveIdentity(fresh);
  return fresh;
}

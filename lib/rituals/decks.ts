/**
 * Ritual decks — static prompt/trigger sets for the chat games (SPRINT2 §12).
 *
 * Canon voice: lowercase, sly, warm, cozy-spicy — never mean, never targeting,
 * never a consumption instruction. Sips are always self-serve flavor. These decks
 * feed:
 *   - **most likely to…** 🗳️ — a prompt the crew anonymously votes a creature into.
 *   - **movie bingo** 🍿 — shared on-screen triggers the room calls when they happen.
 *
 * No Node/browser APIs — safe to import anywhere. `sampleTriggers` uses
 * `crypto.getRandomValues` (available in workerd + the browser) with a Math.random
 * fallback so it can also run in a plain Node test.
 */

// ---------------------------------------------------------------------------
// most likely to… — anonymous crew picks, cozy-spicy not mean
// ---------------------------------------------------------------------------

export const MOST_LIKELY_PROMPTS: readonly string[] = [
  'most likely to fall asleep before the credits',
  'most likely to spoil the ending they already saw',
  'most likely to start a side conversation in the group chat',
  'most likely to ask "wait, who is that again?"',
  'most likely to cry at the part nobody else cried at',
  'most likely to quote this movie for the next month',
  'most likely to pause it for a snack run at the worst moment',
  'most likely to defend the villain, unprompted',
  'most likely to fully melt into the couch by act two',
  'most likely to fight you over the remote',
  'most likely to know an obscure fact about the lead actor',
  'most likely to text someone "are you watching this"',
  'most likely to call the twist five minutes in',
  'most likely to rewatch this alone next week',
  'most likely to root for the couple that obviously breaks up',
  'most likely to make everyone watch the credits scene',
] as const;

// ---------------------------------------------------------------------------
// movie bingo — shared triggers; a start deals 5 random ones to the room
// ---------------------------------------------------------------------------

export const MOVIE_BINGO_TRIGGERS: readonly string[] = [
  'someone says the movie title out loud',
  'an unnecessary explosion',
  'they kiss in the rain',
  'painfully obvious product placement',
  'a slow clap',
  'the hero walks away from an explosion without looking',
  'a dramatic phone hang-up, no goodbye',
  'someone runs through an airport',
  'a record-scratch freeze frame',
  'the dog survives (or, tragically, does not)',
  'a "we have to go back" line',
  'an out-of-nowhere needle drop',
  'a villain monologues instead of just winning',
  'someone whispers when there is no reason to whisper',
  'a laptop hacking montage with way too much typing',
  'a fake-out death that does not stick',
] as const;

// ---------------------------------------------------------------------------
// Deal helper — sample N distinct triggers for a fresh bingo card
// ---------------------------------------------------------------------------

/** Cryptographically-seeded shuffle index, with a plain-Math fallback. */
function randomInt(maxExclusive: number): number {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.getRandomValues === 'function'
  ) {
    const buf = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buf);
    return buf[0] % maxExclusive;
  }
  return Math.floor(Math.random() * maxExclusive);
}

/**
 * Pick `n` distinct triggers from {@link MOVIE_BINGO_TRIGGERS} (default 5) via a
 * partial Fisher–Yates. The server deals these at game start and broadcasts them
 * as the shared card (sent as `value` = JSON of the sampled array).
 */
export function sampleTriggers(n = 5): string[] {
  const pool = [...MOVIE_BINGO_TRIGGERS];
  const count = Math.min(n, pool.length);
  for (let i = 0; i < count; i++) {
    const j = i + randomInt(pool.length - i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

/** Pick one random prompt for a fresh "most likely to…" round. */
export function sampleMostLikelyPrompt(): string {
  return MOST_LIKELY_PROMPTS[randomInt(MOST_LIKELY_PROMPTS.length)];
}

/** The card's standing footnote — hydration is always self-serve, never pressured. */
export const RITUAL_WATER_FOOTNOTE = 'sips are self-serve — hydrate, legend 💧';

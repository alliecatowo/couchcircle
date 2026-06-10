/**
 * CouchCircle — human-friendly join codes (§6 of ARCHITECTURE.md).
 *
 * Codes look like `WORD-NNN` (e.g. `MOSS-420`, `COUCH-117`): one cozy /
 * sesh-adjacent word, a dash, and a three-digit number in 100–999.
 *
 * Runs in BOTH workerd (the PartyKit server) and the browser. Uses only
 * `crypto.getRandomValues` for randomness — no Node APIs, no `Math.random`.
 */

/**
 * ~80 cozy / sesh-adjacent ALL-CAPS words used as the leading half of a join
 * code. Kept short and friendly so codes are easy to read aloud.
 */
export const JOIN_CODE_WORDS: readonly string[] = [
  'MOSS', 'COUCH', 'HAZE', 'PUFF', 'FERN', 'DRIP', 'SNACK', 'BLAZE',
  'CLOUD', 'MELLOW', 'NOODLE', 'GOBLIN', 'AMBER', 'EMBER', 'LAMP', 'COZY',
  'DRIFT', 'SMOKE', 'PILLOW', 'BLANKET', 'CUSHION', 'LOUNGE', 'NIGHT', 'GLOW',
  'CANDLE', 'MAPLE', 'HONEY', 'TOAST', 'COCOA', 'CIDER', 'WARM', 'DUSK',
  'MOTH', 'FROG', 'CAT', 'SPROUT', 'CHINCHILLA', 'CRICKET', 'OWL', 'FOX',
  'BEAN', 'GRAVY', 'NACHO', 'PRETZEL', 'POPCORN', 'WAFFLE', 'CRUMB', 'CRISP',
  'VELVET', 'PLUSH', 'FUZZY', 'SLEEPY', 'DROWSY', 'DREAMY', 'HUSH', 'STILL',
  'LANTERN', 'HEARTH', 'FIRE', 'COAL', 'SPARK', 'WICK', 'STOVE', 'KETTLE',
  'BREW', 'STEEP', 'MUG', 'QUILT', 'THROW', 'SOCK', 'SLIPPER', 'LOFT',
  'ATTIC', 'DEN', 'NOOK', 'BURROW', 'NEST', 'MEADOW', 'CLOVER', 'THICKET',
  'WILLOW', 'CEDAR', 'BIRCH', 'PINE',
];

/**
 * Generate a fresh join code of the form `WORD-NNN` (number in 100–999).
 *
 * Note: this is not guaranteed unique on its own — the lobby retries until it
 * finds a code not already in use.
 */
export function generateJoinCode(): string {
  const word = JOIN_CODE_WORDS[randomInt(JOIN_CODE_WORDS.length)];
  const num = 100 + randomInt(900); // 100..999 inclusive
  return `${word}-${num}`;
}

/**
 * Normalize user input toward canonical code form: trim, uppercase, and
 * collapse runs of spaces / underscores / dashes into a single `-`.
 */
export function normalizeJoinCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * True when `s` (after normalization) is a structurally valid join code:
 * an ALL-CAPS A–Z word, a dash, and a three-digit number 100–999.
 */
export function isValidJoinCode(s: string): boolean {
  return /^[A-Z]+-[1-9][0-9]{2}$/.test(normalizeJoinCode(s));
}

/**
 * Cryptographically-strong, uniformly-distributed integer in `[0, max)`.
 * Uses rejection sampling over `crypto.getRandomValues` to avoid modulo bias.
 */
function randomInt(max: number): number {
  if (max <= 0) return 0;
  const limit = Math.floor(0xffffffff / max) * max;
  const buf = new Uint32Array(1);
  let x = 0;
  do {
    crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= limit);
  return x % max;
}

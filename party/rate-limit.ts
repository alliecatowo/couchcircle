/**
 * CouchCircle — sliding-window rate limiter (§7 of ARCHITECTURE.md).
 *
 * Tiny in-memory limiter keyed by `connectionId:category`. Each category has a
 * max number of hits allowed within a rolling window. We keep timestamps of
 * recent hits and prune anything older than the window before deciding.
 *
 * Pure: no PartyKit / Node APIs, so it is trivially testable and safe in
 * workerd. One instance lives on the room server (per-connection categories)
 * and a separate per-IP variant guards the lobby.
 */

/** Category → { limit, windowMs } table used by the room server. */
export interface RateRule {
  /** Max hits permitted within `windowMs`. */
  limit: number;
  /** Sliding window length, in ms. */
  windowMs: number;
}

/**
 * The §7 per-connection categories. The string keys double as the category
 * names callers pass to {@link RateLimiter.check}.
 */
export type RateCategory =
  | 'chat'
  | 'reaction'
  | 'media'
  | 'queue'
  | 'action'
  | 'join';

/** §7 limits. chat 5/5s, reactions 10/5s, media 10/3s, queue 10/10s, actions 4/5s, join 5/10s. */
export const RATE_RULES: Record<RateCategory, RateRule> = {
  chat: { limit: 5, windowMs: 5_000 },
  reaction: { limit: 10, windowMs: 5_000 },
  media: { limit: 10, windowMs: 3_000 },
  queue: { limit: 10, windowMs: 10_000 },
  action: { limit: 4, windowMs: 5_000 },
  join: { limit: 5, windowMs: 10_000 },
};

/**
 * A generic sliding-window limiter. Keys are arbitrary strings; the room server
 * uses `${connectionId}:${category}` and the lobby uses the client IP.
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  /**
   * Record a hit for `key` at time `now` and report whether it is allowed under
   * `rule`. Returns `true` when within budget, `false` when the window is full
   * (in which case the hit is NOT recorded, so a blocked caller keeps its slot
   * free for the next legitimate request once older hits age out).
   */
  check(key: string, rule: RateRule, now: number = Date.now()): boolean {
    const cutoff = now - rule.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (recent.length >= rule.limit) {
      // Keep the pruned list so memory doesn't grow unbounded on abuse.
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  /** Forget all hits for a key (e.g. when a connection closes). */
  forget(key: string): void {
    this.hits.delete(key);
  }

  /** Forget every key that begins with `prefix` (e.g. all categories for a connection). */
  forgetPrefix(prefix: string): void {
    for (const key of this.hits.keys()) {
      if (key.startsWith(prefix)) this.hits.delete(key);
    }
  }

  /** Drop any keys with no live hits left as of `now` (lazy GC for the lobby). */
  prune(now: number = Date.now()): void {
    for (const [key, times] of this.hits) {
      const live = times.filter((t) => t > now - 60_000);
      if (live.length === 0) this.hits.delete(key);
      else this.hits.set(key, live);
    }
  }
}

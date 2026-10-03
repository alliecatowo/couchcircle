import { describe, expect, it } from 'vitest';
import { RATE_RULES, RateLimiter } from '../party/rate-limit';

describe('RateLimiter', () => {
  const rule = { limit: 3, windowMs: 1000 };

  it('allows up to the limit then blocks', () => {
    const l = new RateLimiter();
    expect([0, 10, 20, 30].map((t) => l.check('k', rule, t))).toEqual([true, true, true, false]);
  });
  it('frees slots as hits age out of the window', () => {
    const l = new RateLimiter();
    [0, 10, 20].forEach((t) => l.check('k', rule, t));
    expect(l.check('k', rule, 500)).toBe(false);
    expect(l.check('k', rule, 1001)).toBe(true);
  });
  it('does not record blocked hits', () => {
    const l = new RateLimiter();
    [0, 1, 2].forEach((t) => l.check('k', rule, t));
    for (let t = 3; t < 900; t += 50) l.check('k', rule, t);
    expect(l.check('k', rule, 1003)).toBe(true);
  });
  it('tracks keys independently and can forget them', () => {
    const l = new RateLimiter();
    [0, 1, 2].forEach((t) => l.check('a:chat', rule, t));
    expect(l.check('b:chat', rule, 3)).toBe(true);
    l.forgetPrefix('a:');
    expect(l.check('a:chat', rule, 4)).toBe(true);
  });
  it('prune drops stale keys', () => {
    const l = new RateLimiter();
    l.check('old', rule, 0);
    l.prune(120_000);
    expect(l.check('old', { limit: 1, windowMs: 1_000_000 }, 120_001)).toBe(true);
  });
  it('ships the documented chat limit', () => {
    expect(RATE_RULES.chat).toEqual({ limit: 5, windowMs: 5000 });
  });
});

import { describe, expect, it } from 'vitest';
import { generateJoinCode, isValidJoinCode, normalizeJoinCode } from '../shared/join-codes';

describe('join codes', () => {
  it('generates valid codes', () => {
    for (let i = 0; i < 50; i++) expect(isValidJoinCode(generateJoinCode())).toBe(true);
  });
  it('normalizes separators and case', () => {
    expect(normalizeJoinCode('  cozy_ 123 ')).toBe('COZY-123');
    expect(normalizeJoinCode('-cozy--123-')).toBe('COZY-123');
  });
  it('rejects malformed codes', () => {
    for (const s of ['', 'COZY', 'COZY-12', 'COZY-1234', 'COZY-099', '123-COZY']) {
      expect(isValidJoinCode(s)).toBe(false);
    }
  });
});

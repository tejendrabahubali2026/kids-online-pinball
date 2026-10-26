import { describe, expect, it } from 'vitest';
import {
  parseLeaderboardPayload,
  parseSubmitResponse,
  sanitizeName,
  validateName,
  validateScore,
  validateSubmission,
} from '../src/shared/leaderboard';

describe('name validation', () => {
  it('trims surrounding whitespace', () => {
    const result = validateName('  Nova  ');
    expect(result).toEqual({ ok: true, value: 'Nova' });
  });

  it('rejects empty and whitespace-only names', () => {
    expect(validateName('').ok).toBe(false);
    expect(validateName('   ').ok).toBe(false);
  });

  it('rejects names longer than 12 characters', () => {
    expect(validateName('ABCDEFGHIJKLM').ok).toBe(false);
    expect(validateName('ABCDEFGHIJKL').ok).toBe(true);
  });

  it('rejects control characters', () => {
    expect(validateName('Bad\u0000Name').ok).toBe(false);
    expect(validateName('Bad\u001bName').ok).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(validateName(42).ok).toBe(false);
    expect(validateName(null).ok).toBe(false);
  });

  it('sanitizeName silently cleans stored values', () => {
    expect(sanitizeName('  space  ')).toBe('space');
    expect(sanitizeName('')).toBeNull();
    expect(sanitizeName(123)).toBeNull();
    expect(sanitizeName('abcdefghijklmnop')).toHaveLength(12);
  });
});

describe('score validation', () => {
  it('accepts positive safe integers', () => {
    expect(validateScore(1)).toEqual({ ok: true, value: 1 });
    expect(validateScore(123456)).toEqual({ ok: true, value: 123456 });
  });

  it('rejects zero, negatives, floats and unsafe values', () => {
    expect(validateScore(0).ok).toBe(false);
    expect(validateScore(-5).ok).toBe(false);
    expect(validateScore(1.5).ok).toBe(false);
    expect(validateScore(Number.MAX_SAFE_INTEGER + 2).ok).toBe(false);
    expect(validateScore(Number.POSITIVE_INFINITY).ok).toBe(false);
    expect(validateScore(Number.NaN).ok).toBe(false);
    expect(validateScore('100').ok).toBe(false);
  });
});

describe('submission validation', () => {
  it('accepts a well-formed payload', () => {
    expect(validateSubmission({ name: 'Nova', score: 1000 })).toEqual({
      ok: true,
      value: { name: 'Nova', score: 1000 },
    });
  });

  it('rejects arrays, null and primitives', () => {
    expect(validateSubmission([]).ok).toBe(false);
    expect(validateSubmission(null).ok).toBe(false);
    expect(validateSubmission('nope').ok).toBe(false);
  });

  it('reports a 400 status for invalid input', () => {
    const result = validateSubmission({ name: '', score: 10 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });
});

describe('response parsing', () => {
  it('parses the documented { scores: [...] } payload', () => {
    const parsed = parseLeaderboardPayload({
      scores: [
        { name: 'Nova', score: 5000, createdAt: 1_700_000_000_000 },
        { name: 'Orion', score: 4000, createdAt: 1_700_000_100 },
      ],
    });
    expect(parsed).toHaveLength(2);
    expect(parsed?.[0]).toEqual({ name: 'Nova', score: 5000, createdAt: 1_700_000_000_000 });
    expect(parsed?.[1].createdAt).toBe(1_700_000_100_000);
  });

  it('accepts a bare array and drops malformed rows', () => {
    const parsed = parseLeaderboardPayload([
      { name: 'Nova', score: 10 },
      { name: '', score: 20 },
      { name: 'Zero', score: -1 },
      null,
      'nope',
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed?.[0].name).toBe('Nova');
  });

  it('returns null for unusable payloads', () => {
    expect(parseLeaderboardPayload(null)).toBeNull();
    expect(parseLeaderboardPayload({})).toBeNull();
    expect(parseLeaderboardPayload({ scores: 'nope' })).toBeNull();
    expect(parseLeaderboardPayload('<html>404</html>')).toBeNull();
  });

  it('caps the leaderboard at 10 entries', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ name: `P${i}`, score: 1000 - i }));
    expect(parseLeaderboardPayload({ scores: rows })).toHaveLength(10);
  });

  it('parses submission acknowledgements', () => {
    expect(parseSubmitResponse({ ok: true, rank: 3 })).toEqual({ ok: true, rank: 3 });
    expect(parseSubmitResponse({ ok: false })).toEqual({ ok: false, rank: null });
    expect(parseSubmitResponse('bad')).toEqual({ ok: false, rank: null });
  });
});

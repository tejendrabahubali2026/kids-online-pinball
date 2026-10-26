import { describe, expect, it } from 'vitest';
import { clamp, escapeHtml, formatScore, mulberry32, normAngle } from '../src/game/util';

describe('formatScore', () => {
  it('adds thousands separators', () => {
    expect(formatScore(0)).toBe('0');
    expect(formatScore(999)).toBe('999');
    expect(formatScore(1000)).toBe('1,000');
    expect(formatScore(1234567)).toBe('1,234,567');
  });

  it('handles invalid and unsafe input', () => {
    expect(formatScore(Number.NaN)).toBe('0');
    expect(formatScore(Number.POSITIVE_INFINITY)).toBe('0');
    expect(formatScore(-50)).toBe('0');
    expect(formatScore(10.7)).toBe('10');
    expect(formatScore(Number.MAX_SAFE_INTEGER + 10)).toBe(formatScore(Number.MAX_SAFE_INTEGER));
  });
});

describe('escapeHtml', () => {
  it('escapes markup characters', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'
    );
    expect(escapeHtml("O'Brien & Sons")).toBe('O&#39;Brien &amp; Sons');
  });
});

describe('math helpers', () => {
  it('clamps values including NaN', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(50, 0, 10)).toBe(10);
    expect(clamp(Number.NaN, 2, 10)).toBe(2);
  });

  it('normalises angles into (-π, π]', () => {
    expect(normAngle(0)).toBeCloseTo(0);
    expect(normAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(Math.abs(normAngle(-Math.PI * 3))).toBeCloseTo(Math.PI);
  });

  it('produces deterministic pseudo-random sequences', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 5; i++) expect(a()).toBe(b());
  });
});

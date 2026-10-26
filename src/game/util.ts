/** Small, dependency-free helpers shared by game / UI / tests. */

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Format a score with thousands separators and no unsafe values.
 * Invalid / negative input degrades to "0" instead of "NaN".
 */
export function formatScore(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const safe = Math.min(Math.max(0, Math.floor(value)), Number.MAX_SAFE_INTEGER);
  return safe.toLocaleString('en-US');
}

/** Escape a string for safe interpolation into HTML markup. */
export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c
  );
}

/** Deterministic PRNG (mulberry32) so stage layouts are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded integer in [min, max]. */
export function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/** Wrap an angle to (-π, π]. */
export function normAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Read a value from localStorage without throwing (private mode / disabled storage). */
export function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Write a value to localStorage without throwing. */
export function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — the game stays playable, just without persistence */
  }
}

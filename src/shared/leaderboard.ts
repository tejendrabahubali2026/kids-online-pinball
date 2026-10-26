/**
 * Shared leaderboard validation + response parsing.
 *
 * Imported by BOTH the browser bundle and the Cloudflare Pages Function so the
 * client and server agree on the exact contract. Keep this module free of DOM,
 * Node and Cloudflare APIs so it can run in every runtime.
 */

export const NAME_MAX_LENGTH = 12;
export const SCORE_MIN = 1;
export const SCORE_MAX = Number.MAX_SAFE_INTEGER;
export const LEADERBOARD_SIZE = 10;

export interface LeaderboardEntry {
  name: string;
  score: number;
  /** Milliseconds since epoch (0 when the server did not provide one). */
  createdAt: number;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: string };

/** Control characters are rejected — they can corrupt terminal output / layout. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

/**
 * Validate a player name for submission.
 * Trims surrounding whitespace, rejects empty names, control characters and
 * names longer than NAME_MAX_LENGTH characters (after trimming).
 */
export function validateName(raw: unknown): ValidationResult<string> {
  if (typeof raw !== 'string') {
    return { ok: false, status: 400, error: 'name must be a string' };
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, status: 400, error: 'name must not be empty' };
  }
  if (CONTROL_CHARS.test(trimmed)) {
    return { ok: false, status: 400, error: 'name must not contain control characters' };
  }
  if ([...trimmed].length > NAME_MAX_LENGTH) {
    return { ok: false, status: 400, error: `name must be at most ${NAME_MAX_LENGTH} characters` };
  }
  return { ok: true, value: trimmed };
}

/**
 * Lenient name cleaner used for LOCAL storage and display: returns null when the
 * value cannot be salvaged, otherwise a trimmed, control-character-stripped name
 * capped at NAME_MAX_LENGTH characters.
 */
export function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(CONTROL_CHARS, '').trim();
  if (cleaned.length === 0) return null;
  return [...cleaned].slice(0, NAME_MAX_LENGTH).join('');
}

/** Validate a submitted score: a positive, safe integer. */
export function validateScore(raw: unknown): ValidationResult<number> {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return { ok: false, status: 400, error: 'score must be a number' };
  }
  if (!Number.isInteger(raw)) {
    return { ok: false, status: 400, error: 'score must be an integer' };
  }
  if (raw < SCORE_MIN) {
    return { ok: false, status: 400, error: 'score must be a positive integer' };
  }
  if (!Number.isSafeInteger(raw) || raw > SCORE_MAX) {
    return { ok: false, status: 400, error: 'score is out of range' };
  }
  return { ok: true, value: raw };
}

/** Validate a full POST body: `{ name, score }`. */
export function validateSubmission(payload: unknown): ValidationResult<{ name: string; score: number }> {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return { ok: false, status: 400, error: 'body must be a JSON object' };
  }
  const record = payload as Record<string, unknown>;
  const name = validateName(record.name);
  if (!name.ok) return name;
  const score = validateScore(record.score);
  if (!score.ok) return score;
  return { ok: true, value: { name: name.value, score: score.value } };
}

function parseTimestamp(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    // Accept both seconds and milliseconds since epoch.
    return raw < 1e12 ? Math.round(raw * 1000) : Math.round(raw);
  }
  if (typeof raw === 'string') {
    const asNumber = Number(raw);
    if (Number.isFinite(asNumber) && raw.trim() !== '') {
      return asNumber < 1e12 ? Math.round(asNumber * 1000) : Math.round(asNumber);
    }
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function parseEntry(raw: unknown): LeaderboardEntry | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const name = sanitizeName(record.name);
  const score = typeof record.score === 'number' ? record.score : Number(record.score);
  if (!name) return null;
  if (!Number.isFinite(score) || score < 0) return null;
  return {
    name,
    score: Math.min(Math.floor(score), SCORE_MAX),
    createdAt: parseTimestamp(record.createdAt ?? record.created_at),
  };
}

/**
 * Parse a leaderboard response.
 * Accepts `{ scores: [...] }` (the documented shape) and a bare array, and
 * silently drops malformed rows. Returns null when the payload is unusable so
 * the caller can fall back to the offline/local leaderboard.
 */
export function parseLeaderboardPayload(payload: unknown): LeaderboardEntry[] | null {
  let rows: unknown;
  if (Array.isArray(payload)) rows = payload;
  else if (typeof payload === 'object' && payload !== null && 'scores' in payload) {
    rows = (payload as { scores: unknown }).scores;
  } else return null;

  if (!Array.isArray(rows)) return null;
  const entries: LeaderboardEntry[] = [];
  for (const row of rows) {
    const entry = parseEntry(row);
    if (entry) entries.push(entry);
    if (entries.length >= LEADERBOARD_SIZE) break;
  }
  return entries;
}

/** Parse the POST acknowledgement. Never throws. */
export function parseSubmitResponse(payload: unknown): { ok: boolean; rank: number | null } {
  if (typeof payload !== 'object' || payload === null) return { ok: false, rank: null };
  const record = payload as Record<string, unknown>;
  const rank = typeof record.rank === 'number' && Number.isFinite(record.rank) ? record.rank : null;
  return { ok: record.ok === true, rank };
}

/**
 * Client for the Cloudflare D1 leaderboard (`/api/scores`).
 *
 * Every call is time-boxed and never throws: the caller always gets a result
 * object so the game can fall back to the local leaderboard when the Pages
 * Function is unavailable (plain `vite dev`, offline play, etc.).
 */
import { SCORES_ENDPOINT } from './constants';
import {
  parseLeaderboardPayload,
  parseSubmitResponse,
  validateName,
  validateScore,
  type LeaderboardEntry,
} from '../shared/leaderboard';

export type ApiFailureReason = 'offline' | 'timeout' | 'http' | 'bad-response' | 'rate-limit' | 'invalid';

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: ApiFailureReason; status?: number; message: string };

const DEFAULT_TIMEOUT_MS = 6500;

async function requestJson(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<{ ok: true; status: number; payload: unknown } | { ok: false; reason: ApiFailureReason; status?: number; message: string }> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timedOut = false;
  const timer = controller
    ? setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs)
    : null;

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller ? controller.signal : undefined,
      headers: { Accept: 'application/json', ...(init.headers ?? {}) },
    });

    if (response.status === 429) {
      return { ok: false, reason: 'rate-limit', status: 429, message: 'Too many submissions — try again in a minute.' };
    }

    if (!response.ok) {
      return {
        ok: false,
        reason: 'http',
        status: response.status,
        message: `Leaderboard request failed (HTTP ${response.status}).`,
      };
    }

    const text = await response.text();
    if (!text.trim()) return { ok: false, reason: 'bad-response', message: 'Leaderboard returned an empty response.' };
    let payload: unknown;
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      return { ok: false, reason: 'bad-response', message: 'Leaderboard returned malformed JSON.' };
    }
    return { ok: true, status: response.status, payload };
  } catch (error) {
    if (timedOut) return { ok: false, reason: 'timeout', message: 'Leaderboard request timed out.' };
    const message = error instanceof Error ? error.message : 'Network error';
    return { ok: false, reason: 'offline', message };
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

/** Fetch the global top-10. */
export async function fetchTopScores(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<ApiResult<LeaderboardEntry[]>> {
  const response = await requestJson(SCORES_ENDPOINT, { method: 'GET' }, timeoutMs);
  if (!response.ok) return response;
  const entries = parseLeaderboardPayload(response.payload);
  if (entries === null) {
    return { ok: false, reason: 'bad-response', message: 'Unexpected leaderboard payload.' };
  }
  return { ok: true, data: entries };
}

/** Submit a score. Validates locally first so obviously bad input never round-trips. */
export async function submitScore(
  name: string,
  score: number,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<ApiResult<{ rank: number | null }>> {
  const validName = validateName(name);
  if (!validName.ok) return { ok: false, reason: 'invalid', message: validName.error };
  const validScore = validateScore(score);
  if (!validScore.ok) return { ok: false, reason: 'invalid', message: validScore.error };

  const response = await requestJson(
    SCORES_ENDPOINT,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: validName.value, score: validScore.value }),
    },
    timeoutMs
  );
  if (!response.ok) return response;

  const parsed = parseSubmitResponse(response.payload);
  if (!parsed.ok) {
    return { ok: false, reason: 'bad-response', message: 'Submission was not acknowledged.' };
  }
  return { ok: true, data: { rank: parsed.rank } };
}

/** Human-readable status label for the UI. */
export function describeApiFailure(reason: ApiFailureReason): string {
  switch (reason) {
    case 'timeout':
      return 'Leaderboard timed out — offline mode.';
    case 'offline':
      return 'Offline — showing local scores only.';
    case 'rate-limit':
      return 'Too many submissions — showing local scores.';
    case 'bad-response':
      return 'Leaderboard unavailable — showing local scores.';
    case 'invalid':
      return 'That name or score is not valid.';
    case 'http':
    default:
      return 'Leaderboard unavailable — showing local scores.';
  }
}

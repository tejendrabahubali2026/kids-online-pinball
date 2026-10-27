/**
 * Server-side leaderboard endpoint backed by a SQL table.
 *
 *   GET  /api/scores  → { scores: [{ name, score, createdAt }] } (top 10)
 *   POST /api/scores  → { name: string, score: number } → { ok, rank }
 *
 * Notes
 *  - Scores are user-submitted from the browser and are NOT cheat-proof.
 *  - Rate limiting is a basic abuse control (5 POSTs / minute / IP hash), not an
 *    anti-cheat system. Only a SHA-256 hash of the connecting IP is stored.
 *  - All queries are parameterized and no database details leak to clients.
 */
import { LEADERBOARD_SIZE, validateSubmission } from '../../src/shared/leaderboard';

interface Env {
  DB: D1Database;
}

interface ScoreRow {
  name: string;
  score: number;
  created_at: number;
}

const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_POSTS = 5;
const MAX_BODY_BYTES = 2048;

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

/** SHA-256 hash of the connecting IP so raw addresses are never stored. */
async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(`space-pinball:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

async function handleGet(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT name, score, created_at
       FROM scores
      ORDER BY score DESC, created_at ASC, id ASC
      LIMIT ?`
  )
    .bind(LEADERBOARD_SIZE)
    .all<ScoreRow>();

  const scores = (results ?? []).map((row) => ({
    name: row.name,
    score: row.score,
    // seconds → milliseconds so the client can format it directly
    createdAt: Number(row.created_at) * 1000,
  }));

  return json({ scores });
}

interface RateLimitRow {
  window_start: number;
  count: number;
}

async function handlePost(request: Request, env: Env): Promise<Response> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return json({ error: 'Content-Type must be application/json' }, 415);
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return json({ error: 'Request body is too large' }, 413);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw) as unknown;
  } catch {
    return json({ error: 'Malformed JSON body' }, 400);
  }

  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const ipHash = await hashIp(ip);
  const now = nowSeconds();

  const window = await env.DB.prepare(
    'SELECT window_start, count FROM rate_limits WHERE ip_hash = ?'
  )
    .bind(ipHash)
    .first<RateLimitRow>();

  if (window && now - window.window_start < RATE_LIMIT_WINDOW_SECONDS) {
    if (window.count >= RATE_LIMIT_MAX_POSTS) {
      const retryAfter = Math.max(1, RATE_LIMIT_WINDOW_SECONDS - (now - window.window_start));
      return json(
        { error: 'Too many submissions — please wait a moment.' },
        429,
        { 'retry-after': String(retryAfter) }
      );
    }
  }

  const validated = validateSubmission(payload);
  if (!validated.ok) {
    return json({ error: validated.error }, validated.status);
  }

  const { name, score } = validated.value;

  const inserted = await env.DB.prepare(
    'INSERT INTO scores (name, score) VALUES (?, ?) RETURNING id'
  )
    .bind(name, score)
    .first<{ id: number }>();

  // Rate-limit bookkeeping (fixed window, best effort). Keep it in the same
  // statement batch as the insert so a failed insert does not consume quota.
  await env.DB.prepare(
    `INSERT INTO rate_limits (ip_hash, window_start, count)
          VALUES (?, ?, 1)
     ON CONFLICT(ip_hash) DO UPDATE SET
          count = CASE
                    WHEN excluded.window_start - rate_limits.window_start >= ?
                    THEN 1 ELSE rate_limits.count + 1 END,
          window_start = CASE
                    WHEN excluded.window_start - rate_limits.window_start >= ?
                    THEN excluded.window_start ELSE rate_limits.window_start END`
  )
    .bind(ipHash, now, RATE_LIMIT_WINDOW_SECONDS, RATE_LIMIT_WINDOW_SECONDS)
    .run();

  let rank: number | null = null;
  if (inserted?.id !== undefined) {
    const better = await env.DB.prepare(
      'SELECT COUNT(*) AS better FROM scores WHERE score > ? OR (score = ? AND id < ?)'
    )
      .bind(score, score, inserted.id)
      .first<{ better: number }>();
    rank = (better?.better ?? 0) + 1;
  }

  return json({ ok: true, rank }, 201);
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (!env.DB) {
    // Misconfiguration (binding missing / not named DB). Never expose details.
    return json({ error: 'Leaderboard is not configured.' }, 500);
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { allow: 'GET, POST, OPTIONS', 'cache-control': 'no-store' },
    });
  }

  try {
    if (request.method === 'GET') return await handleGet(env);
    if (request.method === 'POST') return await handlePost(request, env);
    return json({ error: 'Method not allowed' }, 405, { allow: 'GET, POST, OPTIONS' });
  } catch (error) {
    console.error('leaderboard error', error);
    return json({ error: 'Leaderboard is temporarily unavailable.' }, 500);
  }
};

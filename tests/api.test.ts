import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchTopScores, submitScore } from '../src/game/api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchTopScores', () => {
  it('parses a successful leaderboard response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ scores: [{ name: 'Nova', score: 9000, createdAt: 1700000000000 }] }))
    );
    const result = await fetchTopScores();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({ name: 'Nova', score: 9000 });
    }
  });

  it('reports a 404 (Functions missing on static hosting) as an HTTP failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Not found', { status: 404 })));
    const result = await fetchTopScores();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('http');
      expect(result.status).toBe(404);
    }
  });

  it('reports rate limiting distinctly', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 429 })));
    const result = await fetchTopScores();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('rate-limit');
  });

  it('treats malformed JSON as a bad response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 200 })));
    const result = await fetchTopScores();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('bad-response');
  });

  it('treats network errors as offline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      })
    );
    const result = await fetchTopScores();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('offline');
  });

  it('times out instead of waiting forever', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
          })
      )
    );
    const result = await fetchTopScores(20);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('timeout');
  });
});

describe('submitScore', () => {
  it('validates locally before sending', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const badName = await submitScore('', 100);
    expect(badName.ok).toBe(false);
    if (!badName.ok) expect(badName.reason).toBe('invalid');
    const badScore = await submitScore('Nova', -1);
    expect(badScore.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts JSON and parses the acknowledgement', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true, rank: 2 }, 201));
    vi.stubGlobal('fetch', fetchMock);
    const result = await submitScore('  Nova  ', 5000);
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ name: 'Nova', score: 5000 });
  });

  it('handles a rejection response without throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'name must not be empty' }, 400))
    );
    const result = await submitScore('Nova', 10);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('http');
      expect(result.status).toBe(400);
    }
  });
});

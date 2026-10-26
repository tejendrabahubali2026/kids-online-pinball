-- Cloudflare D1 migration: global leaderboard + basic rate limiting.
-- Apply with:
--   npx wrangler d1 migrations apply DB --local     (development)
--   npx wrangler d1 migrations apply DB --remote    (production)

CREATE TABLE IF NOT EXISTS scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 12),
  score      INTEGER NOT NULL CHECK (score > 0),
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Serves the top-10 query (score DESC, earliest first on ties).
CREATE INDEX IF NOT EXISTS idx_scores_ranking
  ON scores (score DESC, created_at ASC, id ASC);

-- Basic IP rate limiting. Only a SHA-256 hash of the connecting IP is stored,
-- and the value is never returned to clients.
CREATE TABLE IF NOT EXISTS rate_limits (
  ip_hash      TEXT    PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL CHECK (count >= 0)
);

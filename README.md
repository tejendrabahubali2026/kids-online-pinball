# 🪐 Space Pinball Blast

A kid-friendly, neon space-themed pinball game for the browser: **50
progression stages**, real Matter.js flippers, a Cloudflare D1 global
leaderboard, and an audio system that is fully playable with zero audio files.

Built with **Vite + TypeScript + HTML Canvas + Matter.js**, deployable to
**Cloudflare Pages** with a Pages Function (`/functions/api/scores.ts`).

---

## Features

- **Real flippers** — left/right controls rotate kinematic flipper blades. The
  blade strikes the ball through the physics solver; no artificial force is ever
  applied to the ball from input.
- **50 data-driven stages** with themes, goals, gravity/timer modifiers, boss
  stages at 10/20/30/40/50, and a final victory screen.
- **Rich scoring**: pop bumpers, slingshots, stand-up targets, drop-target
  banks, rollover lanes, spinner, orbits, ramps, skill shot, jackpots, multiball
  locks, combos, multipliers, extra balls and ball saves.
- **Global top-10 leaderboard** via Cloudflare D1 with server-side validation
  and a basic per-IP rate limit, plus the original local top-10 table that keeps
  working offline.
- **Audio manager** with file-first playback and synthesized fallbacks, separate
  music/SFX mute toggles, and autoplay-safe behaviour.
- **Accessibility & UX**: pause/restart screens, stage select, high-DPI canvas,
  reduced-motion option, keyboard focus outlines, colour+icon distinction for
  locked stages, and large touch controls.
- **Stable physics at any refresh rate**: the simulation runs on a fixed 60 Hz
  step with a speed cap that prevents tunnelling.
- **Developer credits** shown on the start screen, a dedicated **CREDITS**
  screen, a subtle semi-transparent footer while playing, and on the game-over
  and victory screens.

## Credits

The developer credit line is stored once in `src/game/credit.ts` as ordered
segments and rendered in four places:

| Where | Element | Notes |
| --- | --- | --- |
| Start screen | `.credit-block` footer at the bottom of the menu panel | Full-size text, e-mail and website are links |
| **CREDITS** screen | `CREDITS` button on the start menu | Mandated line large and centred, plus game/engine/tooling attribution |
| Gameplay | `.spb-credit-rail` at the bottom of the playfield | Small, 45% opacity, no pointer events, lifted above the touch buttons |
| Game over / victory | `.credit-block-over` footer | Full-size text with links |

The mandated string is:

```
Dev- Tejendra Bahubali | Email - tejendrabahubali@outlook.com | Website - https://tejendrabahubali2026.pagezapp.cc.cd/
```

Because only the e-mail and URL are wrapped in anchors, every credit element's
`textContent` still reads back as that exact string — verified in
`tests/credits.test.ts`.

## Controls

| Action | Keyboard | Touch / pointer |
| --- | --- | --- |
| Left flipper | `←` or `A` | left on-screen button (or tap left half) |
| Right flipper | `→` or `D` | right on-screen button (or tap right half) |
| Launch / plunger | hold `Space` or `↓`, release to fire | hold `LAUNCH`, release |
| Pause | `P` or `Esc` | pause button |
| Restart stage | `R` (pause / game-over screens) | restart button |
| Mute all audio | `M` | music / SFX toggles |
| Menus | `Enter` | buttons |

Hold-and-release charges the plunger (release early for a soft launch). Both
flippers work simultaneously, and keys are released automatically on window
blur or when the tab is hidden.

## Scoring & gameplay systems

| Element | Base points (before multiplier) |
| --- | --- |
| Stand-up target | 150 |
| Drop target | 250 |
| Pop bumper | 300 |
| Slingshot | 120 |
| Spinner hit | 400 |
| Orbit | 2,500 |
| Ramp | 3,000 |
| Lane set | 4,000 |
| Target bank cleared | 8,000 |
| Skill shot | 12,000 |
| Lock | 2,000 |
| Multiball | 5,000 |
| Jackpot | 18,000 + 900 × stage (boss stages ×1.4) |
| Stage clear bonus | 5,000 + 400 × stage (bosses: 50,000) |

- **Combo**: consecutive scoring hits within 3.2 s build a chain (max ×8 in the
  HUD; every 2 combo steps grants +1 multiplier).
- **Multiplier**: stage base multiplier (some stages start at ×2) plus the combo
  bonus, capped per stage (max ×10 globally).
- **Ball save**: 2.6–5.2 s after each launch depending on the stage; a drain in
  that window re-serves the ball without losing a life.
- **Multiball**: lock balls in the lock lane to start a two-ball launch from the
  plunger lane.
- **Extra ball**: clearing two stage goals awards one extra ball.
- All scoring goes through `ScoreManager`, which clamps values to
  `9,999,999,999` (well inside the safe integer range) and refuses invalid
  numbers. Each element has its own collision cooldown so one impact can never
  tick-farm points.

## The 50 stages

Stages live in `src/game/stages/library.ts` and are generated from typed
blueprints + reusable layout archetypes (`classic`, `orbit`, `ramp`, `banks`,
`lanes`, `gauntlet`, `twin`, `movers`, `boss`). Each stage defines:

- id, name, tagline, theme (8 palettes), gravity, balls, optional time limit,
  ball-save duration, flipper power, base/max multiplier, jackpot value,
  locks required, goals, rewards and full layout data.

Difficulty ramps from a gentle stage 1 to a 4-ball, timed final boss:

| Stages | Focus |
| --- | --- |
| 1–5 | flippers, launcher, bumpers, basic targets |
| 6–10 | lanes, target banks, first boss (10) |
| 11–20 | ramps, orbits, combos, multipliers, timed goals, boss (20) |
| 21–30 | locks, multiball, moving obstacles, boss (30) |
| 31–40 | multi-part missions, time pressure, boss (40) |
| 41–49 | advanced combinations and stricter goals |
| 50 | **Supernova Finale** — the victory stage |

**Progression**: stage 1 starts unlocked; clearing a stage unlocks the next one.
Progress, per-stage best scores and the highest unlocked stage are stored in
`localStorage` (`spb_progress_v2`). Stage select shows locked stages with a lock
icon and "Locked" label, allows replaying cleared stages, and offers a
confirm-guarded **Reset Progress** button. Finishing stage 50 shows the victory
screen. Corrupt/legacy storage is discarded safely rather than crashing the game.

### Local vs. global score

- **Per-stage score**: shown on the stage-complete screen, stored as that
  stage's local best.
- **Run total**: the cumulative score of the current run (all stages played
  since you pressed Play). **This run total is what is submitted to the global
  leaderboard**, and it is also what goes into the local top-10 table.
- Restarting a stage discards that stage's points but keeps points banked from
  earlier stages.

## Local development

Requires **Node.js 20.19+ (Node 22 recommended)** and npm.

```bash
npm ci          # or: npm install
npm run dev     # Vite dev server, http://localhost:5173
```

The Vite dev server has no Pages Functions, so `/api/scores` is unavailable and
the UI automatically falls back to the local leaderboard. To develop the
frontend **and** the D1 leaderboard together, see
[Local Pages development](#local-development-with-pages-functions).

## Build, typecheck and test

```bash
npm run build              # production bundle in dist/
npm run preview            # preview the production build
npm run typecheck          # tsc --noEmit (app + tests)
npm run typecheck:functions# tsc -p tsconfig.functions.json (Pages Function)
npm test                   # vitest (87 tests)
npm run check              # typecheck + functions typecheck + tests + build
```

The test suite covers flipper physics (a flipper hit must reach the upper
half), launch behaviour, stage-library completeness (exactly 50 unique,
validated stages), scoring clamps/cooldowns, localStorage parsing and fallbacks,
leaderboard validation/response parsing, score formatting, and a jsdom smoke
test that boots the real game, plays frames, completes a stage and ends a run.

## Project structure

```
functions/api/scores.ts     # Cloudflare Pages Function: GET/POST /api/scores
migrations/0001_init.sql     # D1 schema (scores + rate_limits)
wrangler.toml                # Pages + D1 binding configuration
src/
  main.ts                    # entry point
  audio/sound.ts             # audio manager (files + synth fallback)
  game/
    api.ts                   # leaderboard client (timeouts, offline fallback)
    constants.ts             # tuning, scoring values, storage keys
    game.ts                  # game states, stage lifecycle, collisions, input
    particles.ts             # pooled sparks + floating score text
    renderer.ts              # data-driven canvas renderer
    scoring.ts               # ScoreManager (single source of truth)
    storage.ts               # scores, progress, prefs, player name
    styles.css               # UI theme
    stages/types.ts          # typed stage model + validation
    stages/library.ts        # 50 stage blueprints → configs
    stages/themes.ts         # 8 visual themes
  physics/
    flippers.ts              # kinematic flipper
    stageBuilder.ts          # StageConfig → Matter.js bodies + draw data
    matterExtensions.ts      # typed wrappers for matter-js setAngle/setPosition
  shared/leaderboard.ts      # validation/parsing shared by client + Function
  game/credit.ts             # developer credit text (single source of truth)
  ui/screens.ts              # menus, HUD, touch controls, leaderboard UI
tests/                       # vitest suites
tools/sim.ts                 # optional headless physics report
public/sounds/README.md      # audio drop-in instructions
```

## Audio

The game synthesizes every sound and the background music with the Web Audio
API, so it is fully playable with **no audio files present**. To use real
assets, drop files into `public/sounds/` using these names:

`bgm.mp3`, `flipper.wav`, `bumper.wav`, `launch.wav`, `gameover.wav`
(optional extras in `public/sounds/README.md`).

Missing or undecodable files fall back to synthesis — they can never block
startup. Music starts only after a user gesture, is ducked while paused and is
suspended while the tab is hidden. Music and SFX mute preferences persist in
`localStorage`. No third-party audio is committed; see
[`public/sounds/README.md`](public/sounds/README.md) for licence-safe sourcing
instructions.

## Leaderboard architecture

- Frontend: `src/game/api.ts` → `GET/POST /api/scores` with a 6.5 s abort
  timeout. Failures are classified (offline / timeout / HTTP / rate-limit /
  malformed) and never break the game.
- Backend: `functions/api/scores.ts` (Cloudflare Pages Function).
- Database: Cloudflare D1, table `scores (id, name, score, created_at)` plus a
  `rate_limits` table. The top-10 query is
  `ORDER BY score DESC, created_at ASC, id ASC LIMIT 10` (earliest entry wins
  ties).

### API

`GET /api/scores` → `200`

```json
{ "scores": [ { "name": "Nova", "score": 123456, "createdAt": 1730000000000 } ] }
```

`POST /api/scores` with `{ "name": "string", "score": 123 }` →

- `201 { "ok": true, "rank": 1 }` on success
- `400` invalid JSON / name / score, `413` body too large, `415` wrong content
  type, `405` unsupported method (with `Allow` header), `429` rate limited (with
  `Retry-After`), `500` misconfiguration or database error.

Validation: name must be a string, trimmed, 1–12 characters, without control
characters; score must be a positive safe integer. All SQL is parameterized and
no stack traces or database details are returned. Responses use
`Cache-Control: no-store`.

### Rate limiting (basic abuse control only)

POSTs are limited to **5 per minute per connecting IP** using a fixed window in
D1. Only a SHA-256 hash of `CF-Connecting-IP` is stored, and it is never returned
to clients. This is a basic abuse control, **not an anti-cheat system**: scores
are submitted by the browser and can be manipulated without authoritative
server-side gameplay. The leaderboard is intentionally described as
"not cheat-proof".

### Offline behaviour

If `GET`/`POST` fails (static hosting without Functions, `vite dev`, offline,
timeout, malformed response), the game keeps working and the UI labels the local
board. Every eligible run total is saved locally regardless of API availability.

---

## Deploy to Cloudflare Pages

These steps follow the current Cloudflare docs. Official references:

- Pages Git integration: <https://developers.cloudflare.com/pages/get-started/git-integration/>
- Pages build configuration: <https://developers.cloudflare.com/pages/configuration/build-configuration/>
- Pages Functions (D1 bindings): <https://developers.cloudflare.com/pages/functions/bindings/#d1-databases>
- Pages Wrangler configuration: <https://developers.cloudflare.com/pages/functions/wrangler-configuration/>
- D1 getting started: <https://developers.cloudflare.com/d1/get-started/>
- D1 migrations: <https://developers.cloudflare.com/d1/reference/migrations/>
- D1 local development: <https://developers.cloudflare.com/d1/best-practices/local-development/>
- Wrangler install/auth: <https://developers.cloudflare.com/workers/wrangler/install-and-update/>

### 1. Push the repository to GitHub

Fork this repository (or push your own copy) so Cloudflare can connect to it:

```bash
git push -u origin main
```

### 2. Create the D1 database

Authenticate Wrangler and create the database:

```bash
npx wrangler login
npx wrangler d1 create space-pinball-leaderboard
```

The command prints a `database_id`. Keep it — you need it in step 3 and/or step
5.

### 3. Put the database id in `wrangler.toml`

`wrangler.toml` in this repo contains a clearly-labelled placeholder:

```toml
[[d1_databases]]
binding = "DB"                       # must stay "DB" — the Function reads env.DB
database_name = "space-pinball-leaderboard"
database_id = "REPLACE_WITH_YOUR_D1_DATABASE_ID"
migrations_dir = "migrations"
```

Replace `REPLACE_WITH_YOUR_D1_DATABASE_ID` with the id from step 2. This
repository does **not** ship a real production database id. If you prefer to
configure bindings in the dashboard instead (step 10), remove or comment out the
`[[d1_databases]]` block so it does not override the dashboard configuration.

### 4. Apply the migration

```bash
# local SQLite used by `wrangler pages dev`
npx wrangler d1 migrations apply DB --local

# the real Cloudflare D1 database
npx wrangler d1 migrations apply DB --remote
```

`migrations/0001_init.sql` creates `scores`, the ranking index and
`rate_limits`. Both commands are idempotent (`IF NOT EXISTS`).

### 5. Connect the repository to Cloudflare Pages

Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** →
**Connect to Git**, then pick the repository and branch. Use these build
settings:

| Setting | Value |
| --- | --- |
| Framework preset | None (Vite) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/` (default) |
| Node.js version | `22` (set `NODE_VERSION=22` if the default differs; `package.json` requires ≥ 20.19) |

Deploy. The static game works immediately; the leaderboard needs a D1 binding.

### 6. Bind D1 to the Pages project

If `wrangler.toml` has the `[[d1_databases]]` block with your real id, Pages
applies it on the next deploy. To bind through the dashboard instead:

1. **Workers & Pages** → your Pages project → **Settings** → **Bindings**.
2. **Add** → **D1 database binding**.
3. Variable name: **`DB`** (exactly this — the Function reads `env.DB`).
4. D1 database: select `space-pinball-leaderboard`.
5. Save, then **redeploy** the project for the binding to take effect.

> Pages uses the bindings in `wrangler.toml` when that file is present and the
> project was deployed with it. Do not configure the same binding name in two
> places with different databases.

### 7. Test the API

```bash
# top 10
curl -i https://<your-project>.pages.dev/api/scores

# submit a score
curl -i -X POST https://<your-project>.pages.dev/api/scores \
  -H 'Content-Type: application/json' \
  -d '{"name":"Nova","score":12345}'
```

Expect `200` with `{"scores":[...]}` and `201` with `{"ok":true,"rank":...}`.
Then play a run and submit from the game-over screen.

### Local development with Pages Functions

Run the Vite dev server for UI work (leaderboard falls back to local), or run
the built site with Pages Functions and a local D1 database:

```bash
npm run build
npx wrangler d1 migrations apply DB --local
npx wrangler pages dev          # serves dist/ + /functions on http://localhost:8788
```

`wrangler pages dev` reads `wrangler.toml` (`pages_build_output_dir = "dist"`)
and provides `env.DB` backed by a local SQLite file. For hot-reloading UI work
with the real API, run `npx wrangler pages dev --port 8788` in one terminal and
`npm run dev` in another — `vite.config.ts` proxies `/api` to port 8788.

### Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `500 {"error":"Leaderboard is not configured."}` | No D1 binding named `DB`. Add it (step 6) and redeploy. |
| `500 {"error":"Leaderboard is temporarily unavailable."}` | Migration not applied to the database the binding points at — run `npx wrangler d1 migrations apply DB --remote`. Check `npx wrangler d1 execute DB --remote --command "SELECT name FROM sqlite_master"`. |
| `/api/scores` returns `404` | The `functions/` directory is not at the project root, or the output directory is wrong. Keep `functions/api/scores.ts` in the repo root and build to `dist`. Redeploy after changing Functions. |
| Frontend loads, API calls fail | You are on a static host or `vite dev` without Functions — the game intentionally falls back to the local board. Use `wrangler pages dev` or the deployed Pages URL to test the API. |
| Global board stays empty | Rate limited (`429`, 5 POSTs/min/IP), rejected name (`400`), or you have not applied the migration. Check the browser network tab and `npx wrangler pages deployment tail`. |
| Audio silent | No files in `public/sounds/` is fine (synth fallback). Browsers also require a click/tap before audio starts. See `public/sounds/README.md`. |
| Leaderboard shows "Offline — showing local scores only." | Expected without Functions/network. Local scores are still saved. |
| Stage progress looks wrong after updates | Old/invalid `localStorage` is discarded automatically; use **Reset Progress** in Stage Select. |

## Known limitations

- Scores are client-submitted; there is no authoritative gameplay verification,
  so the global board is **not cheat-proof**. The server rate limit is only
  basic abuse control.
- The D1 rate limiter uses a fixed window; concurrent requests can slightly
  overshoot the limit.
- Leaderboard queries scan the ranking index; fine at hobby scale.
- Audio assets are not bundled — synthesized sounds are used until you add
  licensed files.
- One physics thread on the main thread (Matter.js); extremely old devices may
  drop below 60 fps, but the fixed-step loop keeps behaviour consistent.

## Physics smoke report (optional)

```bash
npx esbuild tools/sim.ts --bundle --platform=node --format=esm --outfile=/tmp/sim.mjs
node /tmp/sim.mjs
```

The same checks run in `npm test`.

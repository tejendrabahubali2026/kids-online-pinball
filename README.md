# 🪐 Space Pinball Blast

A bright, kid-friendly space pinball game you can play right in the browser.
Flip the ball, blast the bumpers and chase a high score across **50 progressive
stages** — on a desktop, a tablet or a phone.

Play with the keyboard or with the big on-screen buttons. Every sound is
generated live, so the game is fully playable even with no audio files at all.

---

## 👤 Developer credit

### Dev- Tejendra Bahubali | Email - [tejendrabahubali@outlook.com](mailto:tejendrabahubali@outlook.com) | Website - [https://tejendrabahubali2026.pagezapp.cc.cd/](https://tejendrabahubali2026.pagezapp.cc.cd/)

```
Dev- Tejendra Bahubali | Email - tejendrabahubali@outlook.com | Website - https://tejendrabahubali2026.pagezapp.cc.cd/
```

The same line appears inside the game: on the start screen, on the **CREDITS**
screen, as a subtle footer while you play, and on the game-over and victory
screens.

---

## What's in the game

### 🕹️ Real flipper physics
The flippers are solid blades that sweep through the playfield — the ball is
struck by the blade itself, never nudged along by the controls. Time your flip
and you can send the ball all the way up to the top lanes.

### 🌌 50 progressive stages
Stage 1 teaches you the flippers and the launcher. From there you unlock ramps,
orbits, target banks, rollover lanes, spinners and moving obstacles, one stage at
a time.

| Stages | What you learn |
| --- | --- |
| 1–5 | flippers, launcher, bumpers, simple targets |
| 6–10 | top lanes, target banks, first boss |
| 11–20 | ramps, orbits, combos and timed goals |
| 21–30 | ball locks, multiball, moving obstacles |
| 31–40 | multi-part missions and tighter time limits |
| 41–49 | everything combined, with stricter goals |
| 50 | **Supernova Finale** — the final stage and the victory screen |

Clearing a stage unlocks the next one, and your progress is remembered on your
own device. Stage Select lets you replay anything you've cleared and shows a
lock icon on stages you haven't reached yet.

### 👾 Boss battles
Stages **10, 20, 30, 40 and 50** are boss stages: faster gravity, bigger goals,
more balls and a much larger jackpot. Beat them to push deeper into the galaxy.

### 🎯 Scoring to chase
Pop bumpers, slingshots, stand-up and drop targets, target banks, rollover lanes,
a spinner, orbits, ramps, a skill shot, locks, multiball, jackpots and stage-clear
bonuses — all multiplied by combos and score multipliers.

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

- **Combos** reward quick consecutive hits; every couple of steps adds a
  multiplier.
- **Ball save** gives you a few forgiving seconds after each launch, so an early
  drain doesn't cost a ball.
- **Extra ball** at two completed goals per stage, and **multiball** once you fill
  the lock lane.
- Scores are capped at `9,999,999,999` so nothing can overflow.

### 🔊 Sound effects and music
Hits, flippers, launches, jackpots and game over each have their own sound, plus a
looping background track. Everything is synthesized on the fly, so no downloads
are needed. Music and effects have separate mute buttons, and the game never
makes noise until you interact with it.

### 🏆 Online global leaderboard
Finish a run and you can send your **run total** to the public top-10 board, where
it sits alongside scores from other players. Your own device keeps a separate
local top-10 table, so the game still rewards you when you're offline. Frames the
board is unreachable, the local table takes over automatically and the UI says so.

> Scores are sent from the browser, so the global board is a friendly
> high-score list rather than a cheat-proof ranking.

### 📱 Desktop, tablet and phone
The playfield scales to any screen, the interface reflows for narrow phones, and
large touch buttons appear on touch devices. Keyboard players use the arrows and
dedicated action keys.

### ♿ Comfort and accessibility
Pause and restart at any time, a **reduced motion** option, keyboard focus
outlines, and locked stages marked with both a colour change and a lock icon.

### 🧑‍🚀 Developer credits in-game
A **CREDITS** button on the start menu opens a dedicated credits screen. The
mandatory developer line also appears on the start screen, on the game-over and
victory screens, and as a small translucent footer while playing, so it never
gets in the way of the ball.

---

## How to play

| Action | Keyboard | Touch / pointer |
| --- | --- | --- |
| Left flipper | `←` or `A` | left on-screen button |
| Right flipper | `→` or `D` | right on-screen button |
| Launch / plunger | hold `Space` or `↓`, release to fire | hold **LAUNCH**, release |
| Pause | `P` or `Esc` | pause button |
| Restart stage | `R` (pause / game-over screens) | restart button |
| Mute all audio | `M` | music / SFX toggles |
| Menus | `Enter` | buttons |

Hold the plunger and release for a charged launch — a short hold gives a gentle
shot, a long hold fires the ball around the lane. Both flippers work at the same
time, and keys release automatically if the window loses focus or the tab is
hidden, so the ball never jumps on its own.

### Which score goes online?

- **Per-stage score** — shown on the stage-complete screen, saved as that stage's
  local best.
- **Run total** — everything you've banked since you pressed Play. **This is the
  number sent to the global leaderboard** and stored in the local top 10.
- Restarting a stage throws away that stage's points but keeps earlier stages.

---

## Developer setup

You need a current long-term-support JavaScript runtime and its package manager
installed on your machine. Then, from the repository folder:

```bash
# Install dependencies
npm install

# Start the development server (then open the printed local address)
npm run dev

# Build the production bundle (output goes to dist/)
npm run build

# Preview the production bundle locally
npm run preview

# Check types, run the tests, and build
npm run check
```

Individual checks:

```bash
npm run typecheck      # type-check the application and tests
npm test               # run the automated test suite
```

The development server serves the game with the **local** leaderboard. The public
leaderboard needs its small server-side endpoint (below) running alongside it.

### Project layout

```
src/
  main.ts                  # entry point
  audio/sound.ts           # sound manager: audio files + live synthesis
  game/
    api.ts                 # leaderboard API client (timeouts, offline fallback)
    constants.ts           # tuning, scoring values, storage keys
    credit.ts              # developer credit text (single source of truth)
    game.ts                # game states, stage lifecycle, collisions, input
    particles.ts           # sparks and floating score text
    renderer.ts            # data-driven canvas renderer
    scoring.ts             # single source of truth for scoring
    storage.ts             # scores, progress, preferences, player name
    styles.css             # UI theme
    stages/types.ts        # typed stage model + runtime validation
    stages/library.ts      # the 50 stage definitions
    stages/themes.ts       # 8 colour themes
  physics/                 # flippers, stage building, physics helpers
  shared/leaderboard.ts    # validation/parsing shared by client and server
  ui/screens.ts            # menus, HUD, touch controls, leaderboard UI
functions/                 # server-side leaderboard endpoint (/api/scores)
migrations/                # database schema for the leaderboard
tests/                     # automated tests
tools/sim.ts               # optional headless physics report
public/sounds/             # optional drop-in audio files
```

### Audio files (optional)

The game synthesizes all of its audio and needs **no sound files at all**. To use
your own, drop them into `public/sounds/` with these names:

`bgm.mp3`, `flipper.wav`, `bumper.wav`, `launch.wav`, `gameover.wav`

Missing or unreadable files quietly fall back to synthesis and can never block
startup. Music only begins after a click or tap, is softened while paused and
stops while the tab is hidden. See
[`public/sounds/README.md`](public/sounds/README.md) for licence-safe sourcing
guidance — no third-party audio is included in this repository.

### Online leaderboard (optional)

The game is completely playable without any server. To enable the public top 10,
a small server-side function in `functions/` answers two requests on `/api/scores`:

- `GET /api/scores` → `200` with
  `{ "scores": [ { "name": "Nova", "score": 123456, "createdAt": 1730000000000 } ] }`
  (top 10, highest score first, earliest entry wins ties)
- `POST /api/scores` with `{ "name": "string", "score": 123 }` →
  `201 { "ok": true, "rank": 1 }`

Responses for invalid input: `400` (bad payload, name or score), `413` (body too
large), `415` (wrong content type), `405` (unsupported method, with an `Allow`
header), `429` (too many submissions, with `Retry-After`) and `500`
(misconfiguration). Names are trimmed to 1–12 characters with control characters
removed; scores must be positive safe integers. All database access is
parameterized and no internal details or stack traces are ever returned.

Submissions are limited to **5 per minute per connecting address**, tracked as a
one-way hash of the address and never shown to players. This is basic abuse
control, not an anti-cheat system.

Any hosting platform that can serve a static site plus one small server-side
function and a SQL table will work; the repository root contains the endpoint, the
schema and the deployment configuration for the hosted setup the game is built
for. If you only want to host the static game, everything works except the public
leaderboard — the local top 10 takes over.

| Symptom | What to check |
| --- | --- |
| Global board says "not configured" | The server-side database binding is missing. |
| Global board is "temporarily unavailable" | The database schema hasn't been applied to the bound database. |
| `/api/scores` returns `404` | The `functions/` folder must sit at the repository root, and the build output must be the served folder. |
| Global board is empty after playing | You may have hit the rate limit (`429`), or the name was rejected (`400`). |
| No sound | Browsers require a click or tap before audio starts; also check the mute toggles. |
| Progress looks odd after an update | Old or invalid saved data is discarded automatically; use **Reset Progress** in Stage Select. |

### Known limitations

- Scores come from the browser, so the public board is **not cheat-proof**; the
  rate limit is only basic abuse control.
- The built-in rate limiter uses a fixed time window, so concurrent requests can
  slightly overshoot it.
- Audio assets are not bundled — synthesized sounds play until you add your own
  licensed files.
- Physics runs on the main thread; very old devices may drop below 60 frames per
  second, but the fixed-step loop keeps gameplay consistent.

### Physics smoke report (optional)

A headless report lives in `tools/sim.ts`. It builds all 50 stages and prints
launch and flipper results, and you can bundle it with whatever tooling you
prefer. The same scenarios also run as part of `npm test`.

---

**Space Pinball Blast** — Dev- Tejendra Bahubali | Email -
tejendrabahubali@outlook.com | Website -
https://tejendrabahubali2026.pagezapp.cc.cd/

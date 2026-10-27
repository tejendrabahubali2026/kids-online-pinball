/**
 * Space Pinball Blast — shared design + tuning constants.
 *
 * All physics / layout coordinates are expressed in VIRTUAL units
 * (VIEW_W × VIEW_H). The renderer scales this virtual space to the screen,
 * so physics never depends on device size or refresh rate.
 */

export const VIEW_W = 540; // virtual playfield width
export const VIEW_H = 960; // virtual playfield height

export const BALL_R = 11;

/** Plunger / spawn point (right launch lane, resting on the plunger plate). */
export const SPAWN = { x: 513, y: 914 };

export const LAUNCH_MIN = 25; // softest launch still clears the lane deflector
export const LAUNCH_MAX = 35; // full power rides the whole top arc
export const CHARGE_TIME_MS = 900; // hold-to-full-power time

/** Fixed simulation step — physics is decoupled from the monitor refresh rate. */
export const STEP_MS = 1000 / 60;

/** Ball speed ceiling (virtual units per 1/60s tick) — also prevents tunnelling. */
export const MAX_BALL_SPEED = 33;

/**
 * Physics tuning. A touch heavier than reality so the game stays lively and
 * child-friendly while still being stable.
 */
export const PHYSICS = {
  gravityY: 0.82,
  positionIterations: 10,
  velocityIterations: 8,
  constraintIterations: 2,
  ballRestitution: 0.42,
  ballFriction: 0.04,
  ballFrictionAir: 0.012,
  ballDensity: 0.0016,
  wallRestitution: 0.2,
  slingRestitution: 0.55,
  bumperRestitution: 0.9,
} as const;

/**
 * Flipper tuning. The blade is a kinematic (static-body) flipper: it is rotated
 * around its pivot each fixed tick through the engine's `setAngle(angle, true)`,
 * which feeds the angular sweep into the collision solver as a real contact
 * velocity. The ball is therefore struck by the blade itself — no artificial
 * impulses.
 */
export const FLIPPER = {
  length: 78,
  height: 26,
  /** Distance from the pivot to the blade's centre of mass. */
  pivotOffset: 34,
  restLeft: 0.56, // pointing down-right (radians)
  activeLeft: -0.52, // flipped up-right
  /** Radians per 1/60s tick while raising — a full stroke in ~3 ticks (50 ms). */
  upStep: 0.42,
  /** Radians per 1/60s tick while falling back to rest. */
  downStep: 0.26,
  restitution: 0.24,
  friction: 0.06,
  leftPivot: { x: 196, y: 856 },
  rightPivot: { x: 344, y: 856 },
} as const;

export const BALL_SAVE_MS = 5200; // kid-friendly ball saver after launch
export const BALL_SAVE_MIN_MS = 2500; // shortened saver in later stages

export const COMBO_WINDOW_MS = 3200;
export const COMBO_MAX = 8;
export const MULTIPLIER_CAP = 10;

/** Score values. Every award runs through ScoreManager (single source of truth). */
export const SCORE = {
  standup: 150,
  drop: 250,
  lane: 200,
  bumper: 300,
  hazard: 0,
  sling: 120,
  spinner: 400,
  orbit: 2500,
  ramp: 3000,
  laneSet: 4000,
  bankClear: 8000,
  skillShot: 12000,
  jackpot: 25000,
  lock: 2000,
  multiball: 5000,
  comboBonus: 500,
  mission: 20000,
  extraBall: 5000,
  stageClear: 10000,
  bossClear: 50000,
} as const;

/** Hard ceiling for all scores (well inside Number.MAX_SAFE_INTEGER). */
export const MAX_SCORE = 9_999_999_999;

/** localStorage keys — versioned so old/invalid data can be discarded safely. */
export const HISCORE_KEY = 'spb_highscores_v1';
export const HISCORE_MAX = 10;
export const PROGRESS_KEY = 'spb_progress_v2';
export const PREFS_KEY = 'spb_prefs_v2';
export const PLAYER_NAME_KEY = 'spb_player_name_v1';
export const PLAYER_NAME_MAX = 12;

/** Leaderboard API route (served by the server-side endpoint). */
export const SCORES_ENDPOINT = '/api/scores';
export const LEADERBOARD_LIMIT = 10;

export const STAGE_COUNT = 50;

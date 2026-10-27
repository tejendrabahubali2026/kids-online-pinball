/**
 * Typed, data-driven stage model.
 *
 * A stage is pure data: layout elements, physics modifiers, goals, theme and
 * rewards. `buildStageBodies()` turns it into physics bodies and the renderer
 * draws the same data — the game loop never hard-codes stage content.
 */

export type ThemeId =
  | 'cosmos'
  | 'nebula'
  | 'ice'
  | 'lava'
  | 'jungle'
  | 'candy'
  | 'gold'
  | 'ocean';

export interface StageTheme {
  id: ThemeId;
  name: string;
  /** Background gradient stops. */
  bgTop: string;
  bgBottom: string;
  /** Outer nebula glow colours. */
  glowA: string;
  glowB: string;
  /** Wall stroke / fill. */
  wall: string;
  wallFill: string;
  /** Bumper palette. */
  bumperA: string;
  bumperB: string;
  bumperDark: string;
  /** Target + lane accent. */
  accent: string;
  accentSoft: string;
  /** Slingshot colour. */
  sling: string;
  /** Text/HUD accent. */
  hud: string;
}

export type BumperKind = 'pop' | 'hazard' | 'jackpot';

export interface BumperSpec {
  x: number;
  y: number;
  r: number;
  kind: BumperKind;
  /** Optional per-bumper point override. */
  points?: number;
}

export type TargetKind = 'standup' | 'drop' | 'skill' | 'jackpot';

export interface TargetSpec {
  x: number;
  y: number;
  /** Collision width / height (before rotation). */
  w: number;
  h: number;
  /** Rotation in radians. */
  angle: number;
  kind: TargetKind;
  /** Targets sharing a bank id form a bank that must be cleared together. */
  bank?: string;
  points?: number;
}

export interface SlingSpec {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kickX: number;
  kickY: number;
}

export interface LaneSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
  label: string;
}

export type ZoneKind = 'orbit' | 'ramp' | 'spinner' | 'lock';

export interface ZoneSpec {
  kind: ZoneKind;
  x: number;
  y: number;
  /** Circle radius for orbit/spinner zones. */
  r?: number;
  /** Half extents for rect zones. */
  w?: number;
  h?: number;
  angle?: number;
  label?: string;
}

export interface PostSpec {
  x: number;
  y: number;
  r: number;
}

/** A bar that oscillates back and forth (kinematic obstacle). */
export interface MoverSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
  /** Travel distance in virtual units. */
  travel: number;
  /** Direction of travel: horizontal or vertical. */
  axis: 'x' | 'y';
  /** Full cycle duration in milliseconds. */
  periodMs: number;
  /** Phase offset 0..1. */
  phase: number;
}

export type GoalKind =
  | 'score'
  | 'bumpers'
  | 'targets'
  | 'banks'
  | 'orbits'
  | 'ramps'
  | 'lanes'
  | 'spinner'
  | 'combos'
  | 'jackpot'
  | 'locks';

export interface Goal {
  kind: GoalKind;
  count: number;
  label: string;
}

export interface StageReward {
  /** Extra ball granted on completion. */
  extraBall?: boolean;
  /** Flat bonus points granted on completion. */
  bonus?: number;
}

export interface StageConfig {
  id: number;
  name: string;
  tagline: string;
  theme: StageTheme;
  archetype: string;
  /** Gravity multiplier (0.55 easy … 1.15 hard). */
  gravity: number;
  /** Balls for this stage. */
  balls: number;
  /** Optional stage timer in seconds. */
  timeLimitSec?: number;
  /** Ball saver duration for this stage in ms. */
  ballSaveMs: number;
  /** Flipper strength multiplier (1 = default). */
  flipperPower: number;
  baseMultiplier: number;
  maxMultiplier: number;
  jackpotValue: number;
  /** Locks required to start multiball. */
  locksRequired: number;
  goals: Goal[];
  reward: StageReward;
  boss: boolean;
  /** Layout */
  bumpers: BumperSpec[];
  targets: TargetSpec[];
  slings: SlingSpec[];
  lanes: LaneSpec[];
  zones: ZoneSpec[];
  posts: PostSpec[];
  movers: MoverSpec[];
  banks: string[];
}

export const GOAL_LABELS: Record<GoalKind, string> = {
  score: 'Score',
  bumpers: 'Bumpers',
  targets: 'Targets',
  banks: 'Target banks',
  orbits: 'Orbits',
  ramps: 'Ramps',
  lanes: 'Lane sets',
  spinner: 'Spinner',
  combos: 'Combo',
  jackpot: 'Jackpot',
  locks: 'Locks',
};

const VALID_THEMES: ThemeId[] = ['cosmos', 'nebula', 'ice', 'lava', 'jungle', 'candy', 'gold', 'ocean'];

/**
 * Runtime validation for stage data. Returns a list of human-readable problems
 * (empty = valid). Used by the stage library at boot (dev warnings) and by tests.
 */
export function validateStage(stage: StageConfig): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(stage.id) || stage.id < 1 || stage.id > 50) {
    errors.push(`stage ${stage.id}: id must be an integer in 1..50`);
  }
  if (!stage.name || stage.name.trim().length === 0) errors.push(`stage ${stage.id}: name is empty`);
  if (!VALID_THEMES.includes(stage.theme.id)) errors.push(`stage ${stage.id}: unknown theme ${stage.theme.id}`);
  if (!(stage.gravity >= 0.3 && stage.gravity <= 1.5)) errors.push(`stage ${stage.id}: gravity out of range`);
  if (!Number.isInteger(stage.balls) || stage.balls < 1 || stage.balls > 5) {
    errors.push(`stage ${stage.id}: balls must be 1..5`);
  }
  if (!(stage.flipperPower >= 0.5 && stage.flipperPower <= 1.6)) {
    errors.push(`stage ${stage.id}: flipperPower out of range`);
  }
  if (!(stage.baseMultiplier >= 1 && stage.baseMultiplier <= stage.maxMultiplier)) {
    errors.push(`stage ${stage.id}: invalid multiplier range`);
  }
  if (stage.maxMultiplier > 10) errors.push(`stage ${stage.id}: maxMultiplier must be <= 10`);
  if (!Number.isFinite(stage.jackpotValue) || stage.jackpotValue < 0) {
    errors.push(`stage ${stage.id}: jackpotValue invalid`);
  }
  if (!Number.isInteger(stage.locksRequired) || stage.locksRequired < 1) {
    errors.push(`stage ${stage.id}: locksRequired invalid`);
  }
  if (!Array.isArray(stage.goals) || stage.goals.length === 0) {
    errors.push(`stage ${stage.id}: needs at least one goal`);
  }
  for (const goal of stage.goals) {
    if (!(goal.kind in GOAL_LABELS)) errors.push(`stage ${stage.id}: unknown goal ${goal.kind}`);
    if (!Number.isFinite(goal.count) || goal.count <= 0) {
      errors.push(`stage ${stage.id}: goal ${goal.kind} needs a positive count`);
    }
    if (goal.kind === 'score' && goal.count < 100) {
      errors.push(`stage ${stage.id}: score goal must be at least 100`);
    }
  }
  if (goalKindCount(stage, 'jackpot') > 0 && !stage.targets.some((t) => t.kind === 'jackpot') && !stage.bumpers.some((b) => b.kind === 'jackpot')) {
    errors.push(`stage ${stage.id}: jackpot goal without a jackpot target/bumper`);
  }
  if (goalKindCount(stage, 'spinner') > 0 && !stage.zones.some((z) => z.kind === 'spinner')) {
    errors.push(`stage ${stage.id}: spinner goal without a spinner zone`);
  }
  if (goalKindCount(stage, 'orbits') > 0 && !stage.zones.some((z) => z.kind === 'orbit')) {
    errors.push(`stage ${stage.id}: orbit goal without an orbit zone`);
  }
  if (goalKindCount(stage, 'ramps') > 0 && !stage.zones.some((z) => z.kind === 'ramp')) {
    errors.push(`stage ${stage.id}: ramp goal without a ramp zone`);
  }
  if (goalKindCount(stage, 'banks') > 0 && stage.banks.length === 0) {
    errors.push(`stage ${stage.id}: bank goal without target banks`);
  }
  if (goalKindCount(stage, 'lanes') > 0 && stage.lanes.length < 2) {
    errors.push(`stage ${stage.id}: lane goal needs at least two rollover lanes`);
  }
  if (goalKindCount(stage, 'locks') > 0 && !stage.zones.some((z) => z.kind === 'lock')) {
    errors.push(`stage ${stage.id}: lock goal without a lock zone`);
  }
  if (goalKindCount(stage, 'bumpers') > 0 && stage.bumpers.length === 0) {
    errors.push(`stage ${stage.id}: bumper goal without bumpers`);
  }
  if (goalKindCount(stage, 'targets') > 0 && stage.targets.length === 0) {
    errors.push(`stage ${stage.id}: target goal without targets`);
  }
  if (stage.timeLimitSec !== undefined && !(stage.timeLimitSec > 10)) {
    errors.push(`stage ${stage.id}: time limit too short`);
  }
  for (const target of stage.targets) {
    if (!isInsidePlayfield(target.x, target.y, 6)) {
      errors.push(`stage ${stage.id}: target at ${target.x},${target.y} is outside the playfield`);
    }
  }
  for (const bumper of stage.bumpers) {
    if (!isInsidePlayfield(bumper.x, bumper.y, bumper.r)) {
      errors.push(`stage ${stage.id}: bumper at ${bumper.x},${bumper.y} is outside the playfield`);
    }
  }
  for (const lane of stage.lanes) {
    if (!isInsidePlayfield(lane.x, lane.y, 4)) {
      errors.push(`stage ${stage.id}: lane at ${lane.x},${lane.y} is outside the playfield`);
    }
  }
  return errors;
}

function goalKindCount(stage: StageConfig, kind: GoalKind): number {
  return stage.goals.filter((g) => g.kind === kind).length;
}

/**
 * Coarse playfield bounds used by validation. The right-hand launch lane
 * (x > 480, y > 240) and the area behind the lower funnel walls are excluded.
 */
export function isInsidePlayfield(x: number, y: number, radius: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (y < 60 || y > 930) return false;
  // right launch lane is reserved for the plunger
  if (x > 470 && y > 230) return false;
  const leftBound = y < 300 ? 0 : 24;
  const rightBound = y < 300 ? 540 : 470;
  if (x - radius < leftBound || x + radius > rightBound) return false;
  // rounded top arc (inner radius ~ 261 around 270,300)
  const dx = x - 270;
  const dy = y - 300;
  if (dy < 0 && Math.hypot(dx, dy) + radius > 264) return false;
  return true;
}

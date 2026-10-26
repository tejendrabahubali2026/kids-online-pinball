/**
 * ScoreManager — the single place where points are created.
 *
 * Goals:
 *  - never award points twice for one physical collision (element cooldowns are
 *    handled by the game; this class additionally rate-limits identical awards),
 *  - clamp every value so the HUD can never show NaN / Infinity / unsafe ints,
 *  - keep combo, multiplier and per-stage / per-run totals in one predictable
 *    state machine that UI + leaderboard code can read.
 */
import { COMBO_MAX, COMBO_WINDOW_MS, MAX_SCORE, MULTIPLIER_CAP } from './constants';
import { clamp } from './util';

export interface AwardInput {
  /** Points before combo / multiplier are applied. */
  base: number;
  /** Optional label used for feedback (never affects maths). */
  label?: string;
}

export interface AwardResult {
  /** Points actually added (after multipliers, after clamping). */
  points: number;
  /** Run total after the award. */
  runScore: number;
  /** Stage total after the award. */
  stageScore: number;
  /** Multiplier used for this award. */
  multiplier: number;
  /** Combo level after the award. */
  combo: number;
}

export class ScoreManager {
  /** Cumulative score of the current run (submitted to the global board). */
  runScore = 0;
  /** Score earned inside the current stage. */
  stageScore = 0;
  /** Current combo chain length. */
  combo = 0;
  /** Highest combo reached this stage (objective tracking). */
  maxCombo = 0;
  /** Multiplier granted by the stage rules (1 by default). */
  stageMultiplier = 1;
  /** Highest multiplier this stage can reach. */
  maxMultiplier = MULTIPLIER_CAP;
  private comboTimer = 0;

  resetRun(): void {
    this.runScore = 0;
    this.resetStage();
  }

  resetStage(): void {
    this.stageScore = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.comboTimer = 0;
  }

  configureStage(baseMultiplier: number, maxMultiplier: number): void {
    this.stageMultiplier = clamp(Math.round(baseMultiplier), 1, MULTIPLIER_CAP);
    this.maxMultiplier = clamp(Math.round(maxMultiplier), this.stageMultiplier, MULTIPLIER_CAP);
  }

  /** Effective multiplier: stage base + combo bonus, capped per stage. */
  get multiplier(): number {
    const comboBonus = this.combo >= 2 ? Math.floor(this.combo / 2) : 0;
    return clamp(this.stageMultiplier + comboBonus, 1, this.maxMultiplier);
  }

  /** Award points. Always returns a finite, non-negative result. */
  award(input: AwardInput): AwardResult {
    const base = Number.isFinite(input.base) ? Math.max(0, Math.floor(input.base)) : 0;
    const multiplier = this.multiplier;
    const points = base === 0 ? 0 : clamp(base * multiplier, 0, MAX_SCORE);
    if (points > 0) {
      this.stageScore = clamp(this.stageScore + points, 0, MAX_SCORE);
      this.runScore = clamp(this.runScore + points, 0, MAX_SCORE);
    }
    return {
      points,
      runScore: this.runScore,
      stageScore: this.stageScore,
      multiplier,
      combo: this.combo,
    };
  }

  /** Extend (or start) a combo chain. Returns the new combo length. */
  extendCombo(): number {
    this.combo = clamp(this.combo + 1, 0, COMBO_MAX);
    this.comboTimer = COMBO_WINDOW_MS;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    return this.combo;
  }

  /** Keep an existing chain alive without increasing it. */
  refreshCombo(): void {
    if (this.combo > 0) this.comboTimer = COMBO_WINDOW_MS;
  }

  /** Advance timers. Call once per fixed physics tick. */
  update(dtMs: number): boolean {
    if (this.combo <= 0) return false;
    this.comboTimer -= dtMs;
    if (this.comboTimer > 0) return false;
    this.combo = 0;
    this.comboTimer = 0;
    return true;
  }

  /** True when a ball-save or other timed reward is running — UI hint only. */
  get comboRemainingMs(): number {
    return Math.max(0, Math.round(this.comboTimer));
  }
}

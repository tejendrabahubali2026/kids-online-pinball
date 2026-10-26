import { describe, expect, it } from 'vitest';
import { ScoreManager } from '../src/game/scoring';
import { COMBO_MAX, COMBO_WINDOW_MS, MAX_SCORE } from '../src/game/constants';

describe('ScoreManager', () => {
  it('awards base points at ×1 by default', () => {
    const score = new ScoreManager();
    const result = score.award({ base: 300 });
    expect(result.points).toBe(300);
    expect(result.runScore).toBe(300);
    expect(result.stageScore).toBe(300);
  });

  it('applies stage and combo multipliers with a cap', () => {
    const score = new ScoreManager();
    score.configureStage(2, 6);
    expect(score.multiplier).toBe(2);
    for (let i = 0; i < 4; i++) score.extendCombo();
    expect(score.multiplier).toBe(4); // 2 + floor(4 / 2)
    expect(score.award({ base: 100 }).points).toBe(400);

    for (let i = 0; i < 10; i++) score.extendCombo();
    expect(score.combo).toBe(COMBO_MAX);
    expect(score.multiplier).toBe(6); // capped by the stage rule
  });

  it('never exceeds the stage multiplier cap', () => {
    const score = new ScoreManager();
    score.configureStage(1, 3);
    for (let i = 0; i < 8; i++) score.extendCombo();
    expect(score.multiplier).toBe(3);
  });

  it('clamps giant awards to the safe score ceiling', () => {
    const score = new ScoreManager();
    score.configureStage(1, 10);
    for (let i = 0; i < 8; i++) score.extendCombo();
    score.award({ base: MAX_SCORE });
    expect(score.runScore).toBe(MAX_SCORE);
    expect(Number.isSafeInteger(score.runScore)).toBe(true);
    score.award({ base: MAX_SCORE });
    expect(score.runScore).toBe(MAX_SCORE);
  });

  it('rejects invalid award values safely', () => {
    const score = new ScoreManager();
    expect(score.award({ base: Number.NaN }).points).toBe(0);
    expect(score.award({ base: -100 }).points).toBe(0);
    expect(score.runScore).toBe(0);
  });

  it('expires combos after the window', () => {
    const score = new ScoreManager();
    score.extendCombo();
    expect(score.combo).toBe(1);
    expect(score.update(COMBO_WINDOW_MS - 10)).toBe(false);
    expect(score.update(20)).toBe(true);
    expect(score.combo).toBe(0);
    expect(score.multiplier).toBe(1);
  });

  it('tracks the highest combo for objectives', () => {
    const score = new ScoreManager();
    score.extendCombo();
    score.extendCombo();
    score.extendCombo();
    score.update(COMBO_WINDOW_MS + 10);
    expect(score.maxCombo).toBe(3);
    expect(score.combo).toBe(0);
  });

  it('resets stage score without touching the run total', () => {
    const score = new ScoreManager();
    score.award({ base: 1000 });
    score.resetStage();
    expect(score.stageScore).toBe(0);
    expect(score.runScore).toBe(1000);
    score.resetRun();
    expect(score.runScore).toBe(0);
  });
});

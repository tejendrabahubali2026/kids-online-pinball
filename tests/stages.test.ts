import { describe, expect, it } from 'vitest';
import { STAGES, getStage, isFinalStage } from '../src/game/stages/library';
import { buildStage } from '../src/physics/stageBuilder';
import { validateStage, isInsidePlayfield } from '../src/game/stages/types';
import { STAGE_COUNT } from '../src/game/constants';

describe('stage library', () => {
  it('contains exactly 50 stages', () => {
    expect(STAGES).toHaveLength(50);
    expect(STAGES).toHaveLength(STAGE_COUNT);
  });

  it('has unique, sequential ids 1..50', () => {
    const ids = STAGES.map((stage) => stage.id);
    expect(new Set(ids).size).toBe(50);
    expect(ids).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });

  it('passes runtime validation for every stage', () => {
    const problems = STAGES.flatMap((stage) => validateStage(stage));
    expect(problems).toEqual([]);
  });

  it('ships boss stages 10, 20, 30, 40 and 50', () => {
    const bosses = STAGES.filter((stage) => stage.boss).map((stage) => stage.id);
    expect(bosses).toEqual(expect.arrayContaining([10, 20, 30, 40, 50]));
  });

  it('has a final victory stage', () => {
    expect(isFinalStage(50)).toBe(true);
    expect(isFinalStage(49)).toBe(false);
    expect(getStage(50).name).toMatch(/Supernova/i);
  });

  it('varies layouts instead of only raising score targets', () => {
    const archetypes = new Set(STAGES.map((stage) => stage.archetype));
    const themes = new Set(STAGES.map((stage) => stage.theme.id));
    const goalKinds = new Set(STAGES.flatMap((stage) => stage.goals.map((goal) => goal.kind)));
    expect(archetypes.size).toBeGreaterThanOrEqual(6);
    expect(themes.size).toBeGreaterThanOrEqual(6);
    expect(goalKinds.size).toBeGreaterThanOrEqual(8);

    // Geometry fingerprints (bumper positions) must differ across stages.
    const fingerprints = new Set(
      STAGES.map((stage) => stage.bumpers.map((bumper) => `${bumper.x},${bumper.y}`).join('|'))
    );
    expect(fingerprints.size).toBeGreaterThanOrEqual(20);
  });

  it('increases difficulty from the early stages to the late game', () => {
    const early = STAGES.slice(0, 5).reduce((sum, stage) => sum + stage.gravity, 0) / 5;
    const late = STAGES.slice(-5).reduce((sum, stage) => sum + stage.gravity, 0) / 5;
    expect(late).toBeGreaterThan(early);
  });

  it('keeps every layout element inside the playfield', () => {
    for (const stage of STAGES) {
      for (const bumper of stage.bumpers) {
        expect(isInsidePlayfield(bumper.x, bumper.y, bumper.r), `stage ${stage.id} bumper`).toBe(true);
      }
      for (const target of stage.targets) {
        expect(isInsidePlayfield(target.x, target.y, 6), `stage ${stage.id} target`).toBe(true);
      }
      for (const lane of stage.lanes) {
        expect(isInsidePlayfield(lane.x, lane.y, 4), `stage ${stage.id} lane`).toBe(true);
      }
    }
  });

  it('gives every goal the element it needs to be achievable', () => {
    for (const stage of STAGES) {
      for (const goal of stage.goals) {
        switch (goal.kind) {
          case 'bumpers':
            expect(stage.bumpers.some((bumper) => bumper.kind === 'pop')).toBe(true);
            break;
          case 'targets':
            expect(stage.targets.length).toBeGreaterThan(0);
            break;
          case 'banks':
            expect(stage.banks.length).toBeGreaterThan(0);
            break;
          case 'orbits':
            expect(stage.zones.some((zone) => zone.kind === 'orbit')).toBe(true);
            break;
          case 'spinner':
            expect(stage.zones.some((zone) => zone.kind === 'spinner')).toBe(true);
            break;
          case 'ramps':
            expect(stage.zones.some((zone) => zone.kind === 'ramp')).toBe(true);
            break;
          case 'lanes':
            expect(stage.lanes.length).toBeGreaterThanOrEqual(2);
            break;
          case 'locks':
            expect(stage.zones.some((zone) => zone.kind === 'lock')).toBe(true);
            break;
          case 'jackpot':
            expect(stage.targets.some((target) => target.kind === 'jackpot')).toBe(true);
            break;
          default:
            break;
        }
      }
    }
  });

  it('builds physics bodies for all 50 stages without NaN geometry', () => {
    for (const stage of STAGES) {
      const built = buildStage(stage);
      expect(built.bodies.length, `stage ${stage.id} bodies`).toBeGreaterThan(10);
      expect(built.flippers.left.body.label).toBe('flipperL');
      expect(built.flippers.right.body.label).toBe('flipperR');
      for (const body of built.bodies) {
        expect(Number.isFinite(body.position.x)).toBe(true);
        expect(Number.isFinite(body.position.y)).toBe(true);
      }
      expect(built.drain.label).toBe('drain');
    }
  });

  it('throws for unknown stage ids', () => {
    expect(() => getStage(0)).toThrow();
    expect(() => getStage(51)).toThrow();
  });
});

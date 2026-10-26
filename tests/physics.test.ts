import { describe, expect, it } from 'vitest';
import Matter from 'matter-js';
import { buildStage, clampBallSpeed, makeBall, type BuiltStage } from '../src/physics/stageBuilder';
import { getStage } from '../src/game/stages/library';
import { LAUNCH_MAX, LAUNCH_MIN, MAX_BALL_SPEED, SPAWN, STEP_MS } from '../src/game/constants';

const { Engine, Composite, Body } = Matter;

interface World {
  engine: Matter.Engine;
  built: BuiltStage;
}

function createWorld(stageId: number): World {
  const stage = getStage(stageId);
  const built = buildStage(stage);
  const engine = Engine.create();
  engine.gravity.y = stage.gravity;
  engine.positionIterations = 10;
  engine.velocityIterations = 8;
  Composite.add(engine.world, built.bodies);
  return { engine, built };
}

function addBall(world: World, x: number, y: number, vx = 0, vy = 0): Matter.Body {
  const ball = makeBall(x, y);
  Body.setVelocity(ball, { x: vx, y: vy });
  Composite.add(world.engine.world, ball);
  return ball;
}

interface Track {
  minY: number;
  maxY: number;
  minX: number;
  maxX: number;
}

function newTrack(): Track {
  return { minY: Infinity, maxY: -Infinity, minX: Infinity, maxX: -Infinity };
}

function step(world: World, ticks: number, ball?: Matter.Body, track?: Track): void {
  for (let i = 0; i < ticks; i++) {
    world.built.flippers.left.update(STEP_MS);
    world.built.flippers.right.update(STEP_MS);
    Engine.update(world.engine, STEP_MS);
    if (ball) {
      clampBallSpeed(ball, MAX_BALL_SPEED);
      if (track) {
        track.minY = Math.min(track.minY, ball.position.y);
        track.maxY = Math.max(track.maxY, ball.position.y);
        track.minX = Math.min(track.minX, ball.position.x);
        track.maxX = Math.max(track.maxX, ball.position.x);
      }
    }
  }
}

describe('launch lane', () => {
  it.each([1, 10, 25, 50])('a full-power launch sends the ball into the upper playfield (stage %i)', (id) => {
    const world = createWorld(id);
    const ball = addBall(world, SPAWN.x, SPAWN.y, 0, -LAUNCH_MAX);
    const track = newTrack();
    step(world, 240, ball, track);
    expect(track.minY).toBeLessThan(200);
    expect(track.minX).toBeLessThan(300); // ball leaves the lane and travels left along the arc
  });

  it('the weakest launch still clears the launch lane', () => {
    const world = createWorld(1);
    const ball = addBall(world, SPAWN.x, SPAWN.y, 0, -LAUNCH_MIN);
    const track = newTrack();
    step(world, 200, ball, track);
    expect(track.minX).toBeLessThan(470);
    expect(track.minY).toBeLessThan(400);
  });
});

describe('flippers', () => {
  it('launches a resting ball into the upper half of the playfield', () => {
    for (const id of [1, 25, 50]) {
      const world = createWorld(id);
      const ball = addBall(world, 238, 838);
      step(world, 24, ball); // settle onto the blade
      world.built.flippers.left.setPressed(true);
      const track = newTrack();
      step(world, 90, ball, track);
      expect(track.minY, `stage ${id} flipper punt`).toBeLessThan(480);
      expect(Number.isFinite(ball.position.x)).toBe(true);
    }
  });

  it('right flipper works independently', () => {
    const world = createWorld(1);
    const ball = addBall(world, 306, 844);
    step(world, 24, ball);
    world.built.flippers.right.setPressed(true);
    const track = newTrack();
    step(world, 90, ball, track);
    expect(track.minY).toBeLessThan(480);
  });

  it('does not move a ball that is not touching the blade', () => {
    const world = createWorld(1);
    const ball = addBall(world, SPAWN.x, SPAWN.y - 30);
    Body.setVelocity(ball, { x: 0, y: 0 });
    world.built.flippers.left.setPressed(true);
    world.built.flippers.right.setPressed(true);
    step(world, 3, ball);
    expect(Math.abs(ball.position.x - SPAWN.x)).toBeLessThan(2);
    // Only gravity acts on it (no artificial input impulse).
    expect(ball.velocity.y).toBeGreaterThan(-1);
  });

  it('returns to its resting angle and respects the raised limit', () => {
    const world = createWorld(1);
    const flipper = world.built.flippers.left;
    flipper.setPressed(true);
    for (let i = 0; i < 10; i++) flipper.update(STEP_MS);
    const raised = flipper.body.angle;
    expect(raised).toBeLessThan(0);
    expect(raised).toBeGreaterThan(-1);
    flipper.setPressed(false);
    for (let i = 0; i < 20; i++) flipper.update(STEP_MS);
    expect(flipper.body.angle).toBeCloseTo(0.56, 1);
  });

  it('is frame-rate independent for rotation speed', () => {
    const a = createWorld(1).built.flippers.left;
    const b = createWorld(1).built.flippers.left;
    a.setPressed(true);
    b.setPressed(true);
    // One 33 ms step should rotate about as far as two 16.67 ms steps.
    a.update(STEP_MS * 2);
    b.update(STEP_MS);
    b.update(STEP_MS);
    expect(Math.abs(a.body.angle - b.body.angle)).toBeLessThan(0.02);
  });
});

describe('stability', () => {
  it('keeps the ball inside sane bounds while it is on the table', () => {
    const world = createWorld(30);
    const ball = addBall(world, SPAWN.x, SPAWN.y, 0, -LAUNCH_MAX);
    const track = newTrack();
    // 200 ticks ≈ 3.3 s: the ball is still above the drain line.
    step(world, 200, ball, track);
    expect(Number.isFinite(ball.position.x)).toBe(true);
    expect(track.minX).toBeGreaterThan(-120);
    expect(track.maxX).toBeLessThan(660);
    expect(track.maxY).toBeLessThan(1100);
  });

  it('never exceeds the ball speed cap', () => {
    const world = createWorld(1);
    const ball = addBall(world, 270, 500, 120, -120);
    for (let i = 0; i < 120; i++) {
      step(world, 1, ball);
      expect(Math.hypot(ball.velocity.x, ball.velocity.y)).toBeLessThanOrEqual(MAX_BALL_SPEED + 0.5);
    }
  });
});

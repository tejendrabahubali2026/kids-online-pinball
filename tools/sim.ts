/**
 * Headless physics + stage verification harness (development only).
 *
 * Run it with:
 *   npx esbuild tools/sim.ts --bundle --platform=node --format=esm --outfile=/tmp/sim.mjs
 *   node /tmp/sim.mjs
 *
 * The same scenarios are covered by `npm test` (tests/physics.test.ts), which is
 * the recommended way to run them.
 */
import Matter from 'matter-js';
import { buildStage, clampBallSpeed, makeBall, type BuiltStage } from '../src/physics/stageBuilder';
import { getStage, STAGES } from '../src/game/stages/library';
import { LAUNCH_MAX, LAUNCH_MIN, MAX_BALL_SPEED, SPAWN, STEP_MS } from '../src/game/constants';
import { validateStage } from '../src/game/stages/types';

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

function step(world: World, ticks: number, ball?: Matter.Body): { minY: number; minX: number } {
  const track = { minY: Infinity, minX: Infinity };
  for (let i = 0; i < ticks; i++) {
    world.built.flippers.left.update(STEP_MS);
    world.built.flippers.right.update(STEP_MS);
    Engine.update(world.engine, STEP_MS);
    if (ball) {
      clampBallSpeed(ball, MAX_BALL_SPEED);
      track.minY = Math.min(track.minY, ball.position.y);
      track.minX = Math.min(track.minX, ball.position.x);
    }
  }
  return track;
}

console.log(`Space Pinball Blast — verifying ${STAGES.length} stages`);

// 1. Stage validation
const problems = STAGES.flatMap((stage) => validateStage(stage));
console.log(`stage validation problems: ${problems.length}`);
for (const problem of problems.slice(0, 10)) console.log('  -', problem);

// 2. Launch test
for (const id of [1, 10, 25, 50]) {
  const world = createWorld(id);
  const ball = addBall(world, SPAWN.x, SPAWN.y, 0, -LAUNCH_MAX);
  const track = step(world, 240, ball);
  console.log(
    `stage ${id}: full launch minY=${track.minY.toFixed(0)} minX=${track.minX.toFixed(0)} → ${
      track.minY < 200 ? 'PASS' : 'FAIL'
    }`
  );
}

{
  const world = createWorld(1);
  const ball = addBall(world, SPAWN.x, SPAWN.y, 0, -LAUNCH_MIN);
  const track = step(world, 200, ball);
  console.log(`weak launch leaves lane: ${track.minX < 470 ? 'PASS' : 'FAIL'} (minX=${track.minX.toFixed(0)})`);
}

// 3. Flipper punt test
for (const id of [1, 25, 50]) {
  const world = createWorld(id);
  const ball = addBall(world, 238, 838);
  step(world, 24, ball);
  world.built.flippers.left.setPressed(true);
  const track = step(world, 90, ball);
  console.log(`stage ${id}: flipper punt minY=${track.minY.toFixed(0)} → ${track.minY < 480 ? 'PASS' : 'FAIL'}`);
}

// 4. Every stage must construct cleanly
let bad = 0;
for (const stage of STAGES) {
  const built = buildStage(stage);
  if (built.bodies.length === 0) bad++;
  for (const body of built.bodies) {
    if (!Number.isFinite(body.position.x) || !Number.isFinite(body.position.y)) bad++;
  }
}
console.log(`stage construction: ${bad === 0 ? 'PASS' : `FAIL (${bad} problems)`}`);

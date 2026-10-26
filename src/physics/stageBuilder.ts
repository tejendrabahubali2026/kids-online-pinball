/**
 * Converts a StageConfig into Matter.js bodies + drawable geometry.
 *
 * The outer table (rounded top arc, side walls, launch lane, funnel walls and
 * slingshot funnels) is shared by every stage; everything else comes from the
 * stage data. Building a stage never mutates the config.
 */
import Matter from 'matter-js';
import {
  BALL_R,
  FLIPPER,
  PHYSICS,
  SPAWN,
  VIEW_H,
} from '../game/constants';
import type {
  BumperSpec,
  LaneSpec,
  MoverSpec,
  StageConfig,
  TargetSpec,
  ZoneSpec,
} from '../game/stages/types';
import { Flipper } from './flippers';
import { setBodyPosition } from './matterExtensions';

const { Bodies, Body } = Matter;

export interface DrawSeg {
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
}

export interface DrawPost {
  x: number;
  y: number;
  r: number;
  accent: boolean;
}

export interface BuiltSling {
  body: Matter.Body;
  seg: DrawSeg;
  kickX: number;
  kickY: number;
}

export interface BuiltBumper {
  spec: BumperSpec;
  body: Matter.Body;
}

export interface BuiltTarget {
  spec: TargetSpec;
  body: Matter.Body;
  index: number;
}

export interface BuiltLane {
  spec: LaneSpec;
  body: Matter.Body;
  index: number;
}

export interface BuiltZone {
  spec: ZoneSpec;
  body: Matter.Body;
  index: number;
}

export interface BuiltMover {
  spec: MoverSpec;
  body: Matter.Body;
  baseX: number;
  baseY: number;
}

export interface BuiltStage {
  stage: StageConfig;
  bodies: Matter.Body[];
  walls: DrawSeg[];
  slings: BuiltSling[];
  bumpers: BuiltBumper[];
  targets: BuiltTarget[];
  lanes: BuiltLane[];
  zones: BuiltZone[];
  posts: DrawPost[];
  movers: BuiltMover[];
  drain: Matter.Body;
  flippers: { left: Flipper; right: Flipper };
  spawn: { x: number; y: number };
}

/** Top arc geometry (renderer + walls). */
export const ARC = { cx: 270, cy: 300, r: 261, segR: 270, segs: 26 };

const BASE_POSTS: DrawPost[] = [
  { x: 180, y: 847, r: 10, accent: false },
  { x: 360, y: 847, r: 10, accent: false },
];

function box(
  x: number,
  y: number,
  w: number,
  h: number,
  angle: number,
  label: string,
  extra: Matter.IChamferableBodyDefinition = {}
): Matter.Body {
  return Bodies.rectangle(x, y, w, h, {
    isStatic: true,
    angle,
    label,
    friction: 0.02,
    restitution: PHYSICS.wallRestitution,
    ...extra,
  });
}

function segment(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  thick: number,
  label: string,
  extra: Matter.IChamferableBodyDefinition = {}
): { body: Matter.Body; draw: DrawSeg } {
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const len = Math.hypot(x2 - x1, y2 - y1);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  return {
    body: box(cx, cy, len + thick, thick, angle, label, extra),
    draw: { x: cx, y: cy, w: len + thick, h: thick, angle },
  };
}

function circle(x: number, y: number, r: number, label: string, extra: Matter.IBodyDefinition = {}): Matter.Body {
  return Bodies.circle(x, y, r, { isStatic: true, label, friction: 0.01, ...extra });
}

/** Create the ball body used for the plunger and multiball. */
export function makeBall(x = SPAWN.x, y = SPAWN.y): Matter.Body {
  return Bodies.circle(x, y, BALL_R, {
    label: 'ball',
    restitution: PHYSICS.ballRestitution,
    friction: PHYSICS.ballFriction,
    frictionAir: PHYSICS.ballFrictionAir,
    density: PHYSICS.ballDensity,
    slop: 0.02,
  });
}

export function buildStage(stage: StageConfig): BuiltStage {
  const bodies: Matter.Body[] = [];
  const walls: DrawSeg[] = [];
  const add = <T extends Matter.Body>(body: T): T => {
    bodies.push(body);
    return body;
  };

  // ---------------------------------------------------------------- top arc
  const step = Math.PI / ARC.segs;
  for (let i = 0; i < ARC.segs; i++) {
    const a1 = Math.PI + i * step;
    const a2 = Math.PI + (i + 1) * step;
    const s = segment(
      ARC.cx + Math.cos(a1) * ARC.segR,
      ARC.cy + Math.sin(a1) * ARC.segR,
      ARC.cx + Math.cos(a2) * ARC.segR,
      ARC.cy + Math.sin(a2) * ARC.segR,
      18,
      'wall'
    );
    add(s.body);
    walls.push(s.draw);
  }

  // ------------------------------------------------------------ outer walls
  add(box(0, 630, 18, 660, 0, 'wall'));
  walls.push({ x: 0, y: 630, w: 18, h: 660, angle: 0 });
  add(box(540, 605, 18, 710, 0, 'wall'));
  walls.push({ x: 540, y: 605, w: 18, h: 710, angle: 0 });

  // ------------------------------------------------ launch lane + deflector
  const deflector = segment(489, 160, 530, 250, 14, 'wall');
  add(deflector.body);
  walls.push(deflector.draw);

  add(box(489, 583.5, 14, 677, 0, 'wall', { chamfer: { radius: 4 } }));
  walls.push({ x: 489, y: 583.5, w: 14, h: 677, angle: 0 });

  add(box(513, 935, 36, 14, 0, 'wall', { restitution: 0.1 }));
  walls.push({ x: 513, y: 935, w: 36, h: 14, angle: 0 });

  // ------------------------------------------------------- left orbit rail
  add(box(66, 470, 10, 190, 0, 'wall'));
  walls.push({ x: 66, y: 470, w: 10, h: 190, angle: 0 });

  // ------------------------------------------------------ funnel walls
  const leftFunnel = segment(74.2, 670.4, 172, 836, 16, 'wall');
  add(leftFunnel.body);
  walls.push(leftFunnel.draw);
  const rightFunnel = segment(436.4, 670.4, 368, 836, 16, 'wall');
  add(rightFunnel.body);
  walls.push(rightFunnel.draw);

  // ------------------------------------------------------------ slingshots
  const slings: BuiltSling[] = stage.slings.map((sling, i) => {
    const built = segment(sling.x1, sling.y1, sling.x2, sling.y2, 16, `sling:${i}`, {
      restitution: PHYSICS.slingRestitution,
    });
    add(built.body);
    return { body: built.body, seg: built.draw, kickX: sling.kickX, kickY: sling.kickY };
  });

  // ---------------------------------------------------------------- posts
  const posts: DrawPost[] = [...BASE_POSTS.map((p) => ({ ...p }))];
  for (const post of BASE_POSTS) {
    add(circle(post.x, post.y, post.r, 'wall', { restitution: 0.3 }));
  }
  for (const post of stage.posts) {
    add(circle(post.x, post.y, post.r, 'wall', { restitution: 0.35 }));
    posts.push({ x: post.x, y: post.y, r: post.r, accent: true });
  }

  // --------------------------------------------------------------- bumpers
  const bumpers: BuiltBumper[] = stage.bumpers.map((spec, i) => {
    const body = add(
      circle(spec.x, spec.y, spec.r, `bumper:${i}`, {
        restitution: spec.kind === 'hazard' ? PHYSICS.wallRestitution : PHYSICS.bumperRestitution,
        friction: 0,
      })
    );
    return { spec, body };
  });

  // --------------------------------------------------------------- targets
  const targets: BuiltTarget[] = stage.targets.map((spec, i) => {
    const body = add(
      Bodies.rectangle(spec.x, spec.y, spec.w, spec.h, {
        isStatic: true,
        angle: spec.angle,
        label: `target:${i}`,
        restitution: spec.kind === 'standup' ? 0.55 : 0.35,
        friction: 0.01,
      })
    );
    return { spec, body, index: i };
  });

  // ------------------------------------------------------- rollover lanes
  const lanes: BuiltLane[] = stage.lanes.map((spec, i) => {
    const body = add(
      Bodies.rectangle(spec.x, spec.y, spec.w, spec.h, {
        isStatic: true,
        isSensor: true,
        angle: spec.angle,
        label: `lane:${i}`,
      })
    );
    return { spec, body, index: i };
  });

  // ----------------------------------------------------------------- zones
  const zones: BuiltZone[] = stage.zones.map((spec, i) => {
    const label = `zone:${spec.kind}:${i}`;
    const body =
      spec.r !== undefined
        ? add(circle(spec.x, spec.y, spec.r, label, { isSensor: true }))
        : add(
            Bodies.rectangle(spec.x, spec.y, spec.w ?? 60, spec.h ?? 20, {
              isStatic: true,
              isSensor: true,
              angle: spec.angle ?? 0,
              label,
            })
          );
    return { spec, body, index: i };
  });

  // ---------------------------------------------------------------- movers
  const movers: BuiltMover[] = stage.movers.map((spec, i) => {
    const body = add(
      Bodies.rectangle(spec.x, spec.y, spec.w, spec.h, {
        isStatic: true,
        angle: spec.angle,
        label: `mover:${i}`,
        chamfer: { radius: 5 },
        restitution: 0.35,
        friction: 0.05,
      })
    );
    return { spec, body, baseX: spec.x, baseY: spec.y };
  });

  // ----------------------------------------------------------------- drain
  const drain = add(box(270, 955, 580, 22, 0, 'drain', { isStatic: true, isSensor: true }));

  // -------------------------------------------------------------- flippers
  const flippers = {
    left: new Flipper('left', FLIPPER.leftPivot.x, FLIPPER.leftPivot.y, stage.flipperPower),
    right: new Flipper('right', FLIPPER.rightPivot.x, FLIPPER.rightPivot.y, stage.flipperPower),
  };
  add(flippers.left.body);
  add(flippers.right.body);

  return {
    stage,
    bodies,
    walls,
    slings,
    bumpers,
    targets,
    lanes,
    zones,
    posts,
    movers,
    drain,
    flippers,
    spawn: { ...SPAWN },
  };
}

/** Drive oscillating obstacles from the stage clock (seconds). */
export function updateMovers(movers: BuiltMover[], timeSec: number): void {
  for (const mover of movers) {
    const { spec } = mover;
    const t = ((timeSec * 1000) / spec.periodMs + spec.phase) % 1;
    const offset = Math.sin(t * Math.PI * 2) * (spec.travel / 2);
    const x = mover.baseX + (spec.axis === 'x' ? offset : 0);
    const y = mover.baseY + (spec.axis === 'y' ? offset : 0);
    if (Math.abs(mover.body.position.x - x) < 1e-6 && Math.abs(mover.body.position.y - y) < 1e-6) {
      continue;
    }
    setBodyPosition(mover.body, { x, y }, true);
  }
}

/** Keep a ball inside the legal speed range so it can never tunnel a wall. */
export function clampBallSpeed(ball: Matter.Body, maxSpeed: number): void {
  const v = ball.velocity;
  const speed = Math.hypot(v.x, v.y);
  if (!Number.isFinite(speed) || speed <= maxSpeed) return;
  Body.setVelocity(ball, { x: (v.x / speed) * maxSpeed, y: (v.y / speed) * maxSpeed });
}

/** Convenience for the renderer background/tint. */
export const PLAYFIELD_BOTTOM = VIEW_H;

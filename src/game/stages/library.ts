/**
 * The stage library: 50 data-driven stages built from a handful of reusable
 * layout templates ("archetypes") plus per-stage rules, goals, themes and
 * physics modifiers.
 *
 * Nothing here touches the physics engine or the DOM — see
 * `physics/stageBuilder.ts`.
 */
import { STAGE_COUNT } from '../constants';
import { mulberry32 } from '../util';
import { THEMES } from './themes';
import {
  GOAL_LABELS,
  validateStage,
  type BumperSpec,
  type Goal,
  type GoalKind,
  type LaneSpec,
  type MoverSpec,
  type PostSpec,
  type SlingSpec,
  type StageConfig,
  type TargetSpec,
  type ThemeId,
  type ZoneSpec,
} from './types';

interface Layout {
  bumpers: BumperSpec[];
  targets: TargetSpec[];
  slings: SlingSpec[];
  lanes: LaneSpec[];
  zones: ZoneSpec[];
  posts: PostSpec[];
  movers: MoverSpec[];
}

type Archetype =
  | 'classic'
  | 'orbit'
  | 'ramp'
  | 'banks'
  | 'lanes'
  | 'gauntlet'
  | 'twin'
  | 'movers'
  | 'boss';

const BUMPER_SLOTS: Record<string, BumperSpec> = {
  A: { x: 270, y: 292, r: 34, kind: 'pop' },
  B: { x: 152, y: 336, r: 29, kind: 'pop' },
  C: { x: 388, y: 336, r: 29, kind: 'pop' },
  D: { x: 270, y: 404, r: 27, kind: 'pop' },
  E: { x: 204, y: 240, r: 24, kind: 'pop' },
  F: { x: 336, y: 240, r: 24, kind: 'pop' },
  G: { x: 112, y: 262, r: 23, kind: 'pop' },
  H: { x: 428, y: 262, r: 23, kind: 'pop' },
  I: { x: 214, y: 520, r: 25, kind: 'pop' },
  J: { x: 326, y: 520, r: 25, kind: 'pop' },
};

const RIGHT_TARGETS: TargetSpec[] = [
  { x: 452, y: 428, w: 26, h: 26, angle: 0, kind: 'standup' },
  { x: 452, y: 500, w: 26, h: 26, angle: 0, kind: 'standup' },
  { x: 452, y: 572, w: 26, h: 26, angle: 0, kind: 'standup' },
];

const LEFT_TARGETS: TargetSpec[] = [
  { x: 92, y: 428, w: 26, h: 26, angle: 0, kind: 'standup' },
  { x: 92, y: 500, w: 26, h: 26, angle: 0, kind: 'standup' },
  { x: 92, y: 572, w: 26, h: 26, angle: 0, kind: 'standup' },
];

const CENTER_DROP_BANK: TargetSpec[] = [
  { x: 200, y: 620, w: 38, h: 13, angle: 0, kind: 'drop', bank: 'center' },
  { x: 270, y: 620, w: 38, h: 13, angle: 0, kind: 'drop', bank: 'center' },
  { x: 340, y: 620, w: 38, h: 13, angle: 0, kind: 'drop', bank: 'center' },
];

const LEFT_DROP_BANK: TargetSpec[] = [
  { x: 108, y: 468, w: 13, h: 36, angle: 0, kind: 'drop', bank: 'left' },
  { x: 108, y: 518, w: 13, h: 36, angle: 0, kind: 'drop', bank: 'left' },
  { x: 108, y: 568, w: 13, h: 36, angle: 0, kind: 'drop', bank: 'left' },
];

const RIGHT_DROP_BANK: TargetSpec[] = [
  { x: 436, y: 468, w: 13, h: 36, angle: 0, kind: 'drop', bank: 'right' },
  { x: 436, y: 518, w: 13, h: 36, angle: 0, kind: 'drop', bank: 'right' },
  { x: 436, y: 568, w: 13, h: 36, angle: 0, kind: 'drop', bank: 'right' },
];

const CENTER_TARGETS: TargetSpec[] = [
  { x: 270, y: 560, w: 28, h: 28, angle: 0, kind: 'standup' },
  { x: 208, y: 596, w: 26, h: 26, angle: 0, kind: 'standup' },
  { x: 332, y: 596, w: 26, h: 26, angle: 0, kind: 'standup' },
];

const BASE_SLINGS: SlingSpec[] = [
  { x1: 9, y1: 560, x2: 74.2, y2: 670.4, kickX: 0.861, kickY: -0.508 },
  { x1: 482, y1: 560, x2: 436.4, y2: 670.4, kickX: -0.924, kickY: -0.381 },
];

const LANE_3: LaneSpec[] = [
  { x: 150, y: 206, w: 62, h: 26, angle: 0, label: 'A' },
  { x: 270, y: 198, w: 62, h: 26, angle: 0, label: 'B' },
  { x: 390, y: 206, w: 62, h: 26, angle: 0, label: 'C' },
];

const LANE_4: LaneSpec[] = [
  { x: 122, y: 216, w: 56, h: 24, angle: 0, label: 'A' },
  { x: 218, y: 196, w: 56, h: 24, angle: 0, label: 'B' },
  { x: 322, y: 196, w: 56, h: 24, angle: 0, label: 'C' },
  { x: 418, y: 216, w: 56, h: 24, angle: 0, label: 'D' },
];

const ZONES = {
  orbit: { kind: 'orbit', x: 35, y: 500, r: 21 } as ZoneSpec,
  spinner: { kind: 'spinner', x: 35, y: 412, r: 16 } as ZoneSpec,
  ramp: { kind: 'ramp', x: 352, y: 96, w: 70, h: 18, angle: 0.42 } as ZoneSpec,
  rampAlt: { kind: 'ramp', x: 188, y: 96, w: 70, h: 18, angle: -0.42 } as ZoneSpec,
  lock: { kind: 'lock', x: 270, y: 662, w: 84, h: 20 } as ZoneSpec,
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function jitter(rng: () => number, amount: number): number {
  return Math.round((rng() * 2 - 1) * amount);
}

/** Build the raw layout for an archetype (deterministic per stage id). */
function layoutFor(archetype: Archetype, id: number): Layout {
  const rng = mulberry32(id * 7919 + 13);
  const pick = <T>(list: T[]): T => list[Math.floor(rng() * list.length) % list.length];

  const bumpers: Record<string, BumperSpec> = {
    A: clone(BUMPER_SLOTS.A),
    B: clone(BUMPER_SLOTS.B),
    C: clone(BUMPER_SLOTS.C),
    D: clone(BUMPER_SLOTS.D),
    E: clone(BUMPER_SLOTS.E),
    F: clone(BUMPER_SLOTS.F),
    G: clone(BUMPER_SLOTS.G),
    H: clone(BUMPER_SLOTS.H),
    I: clone(BUMPER_SLOTS.I),
    J: clone(BUMPER_SLOTS.J),
  };

  const layout: Layout = {
    bumpers: [],
    targets: [],
    slings: clone(BASE_SLINGS),
    lanes: clone(LANE_3),
    zones: [],
    posts: [],
    movers: [],
  };

  switch (archetype) {
    case 'classic':
      layout.bumpers = pick([
        [bumpers.B, bumpers.C, bumpers.A],
        [bumpers.A, bumpers.D],
        [bumpers.B, bumpers.C, bumpers.D],
      ]);
      layout.targets = clone(RIGHT_TARGETS);
      layout.zones = [clone(ZONES.ramp)];
      if (id >= 8) layout.zones.push(clone(ZONES.orbit), clone(ZONES.spinner));
      break;

    case 'orbit':
      layout.bumpers = [bumpers.B, bumpers.C];
      layout.targets = clone(LEFT_TARGETS);
      layout.zones = [clone(ZONES.orbit), clone(ZONES.spinner), clone(ZONES.ramp)];
      break;

    case 'ramp':
      layout.bumpers = [bumpers.E, bumpers.F, bumpers.A];
      layout.targets = clone(RIGHT_TARGETS);
      layout.zones = [clone(ZONES.ramp), clone(ZONES.rampAlt)];
      break;

    case 'banks':
      layout.bumpers = [bumpers.A, bumpers.D];
      layout.targets = [...clone(CENTER_DROP_BANK), clone(RIGHT_TARGETS[0]), clone(RIGHT_TARGETS[1])];
      layout.zones = [clone(ZONES.ramp)];
      break;

    case 'lanes':
      layout.bumpers = [bumpers.B, bumpers.C];
      layout.lanes = clone(LANE_4);
      layout.targets = clone(CENTER_TARGETS).slice(0, 2);
      layout.zones = [clone(ZONES.ramp)];
      break;

    case 'gauntlet':
      bumpers.G.kind = 'hazard';
      layout.bumpers = [bumpers.A, bumpers.B, bumpers.C, bumpers.G];
      layout.targets = clone(CENTER_TARGETS);
      layout.posts = [
        { x: 236, y: 706, r: 9 },
        { x: 304, y: 706, r: 9 },
      ];
      layout.zones = [clone(ZONES.ramp)];
      break;

    case 'twin':
      layout.bumpers = [bumpers.A];
      layout.targets = [...clone(LEFT_DROP_BANK), ...clone(RIGHT_DROP_BANK)];
      layout.zones = [clone(ZONES.ramp), clone(ZONES.orbit)];
      break;

    case 'movers':
      layout.bumpers = [bumpers.B, bumpers.C];
      layout.targets = clone(RIGHT_TARGETS);
      layout.movers = [
        { x: 270, y: 745, w: 96, h: 12, angle: 0, travel: 56, axis: 'x', periodMs: 4200, phase: 0 },
      ];
      layout.zones = [clone(ZONES.ramp)];
      break;

    case 'boss':
      layout.bumpers = [bumpers.A, bumpers.B, bumpers.C];
      layout.targets = [
        ...clone(RIGHT_TARGETS),
        ...clone(CENTER_DROP_BANK),
        { x: 270, y: 168, w: 26, h: 26, angle: 0, kind: 'skill' },
      ];
      layout.lanes = clone(LANE_4);
      layout.zones = [clone(ZONES.orbit), clone(ZONES.ramp), clone(ZONES.lock)];
      if (id >= 30) {
        layout.zones.push(clone(ZONES.spinner));
        layout.movers = [
          { x: 270, y: 745, w: 96, h: 12, angle: 0, travel: 56, axis: 'x', periodMs: 3800, phase: 0.25 },
        ];
      }
      break;
  }

  // Small deterministic variation so repeated archetypes never look identical.
  const spread = 9;
  for (const bumper of layout.bumpers) {
    bumper.x += jitter(rng, spread);
    bumper.y += jitter(rng, spread);
  }
  for (const target of layout.targets) {
    if (target.kind === 'drop') continue;
    target.x += jitter(rng, 5);
    target.y += jitter(rng, 5);
  }
  return layout;
}

function goal(kind: GoalKind, count: number): Goal {
  const short = GOAL_LABELS[kind];
  let label: string;
  switch (kind) {
    case 'score':
      label = `Reach ${count.toLocaleString('en-US')} points`;
      break;
    case 'combos':
      label = `Build a ×${count} combo`;
      break;
    case 'lanes':
      label = `Light ${count} lane set${count === 1 ? '' : 's'}`;
      break;
    case 'jackpot':
      label = count === 1 ? 'Hit the jackpot' : `Hit the jackpot ${count}×`;
      break;
    case 'locks':
      label = `Lock ${count} ball${count === 1 ? '' : 's'}`;
      break;
    default:
      label = `${short} ×${count}`;
      break;
  }
  return { kind, count, label };
}

interface Blueprint {
  id: number;
  name: string;
  tagline: string;
  theme: ThemeId;
  archetype: Archetype;
  goals: Goal[];
  gravity?: number;
  balls?: number;
  timeLimitSec?: number;
  baseMultiplier?: number;
  maxMultiplier?: number;
  boss?: boolean;
}

function g(...items: [GoalKind, number][]): Goal[] {
  return items.map(([kind, count]) => goal(kind, count));
}

const BLUEPRINTS: Blueprint[] = [
  { id: 1, name: 'First Flip', tagline: 'Find the flippers and wake up the bumpers.', theme: 'cosmos', archetype: 'classic', gravity: 0.72, goals: g(['bumpers', 5], ['score', 4000]) },
  { id: 2, name: 'Planet Hop', tagline: 'Bounce between worlds and tap the star targets.', theme: 'cosmos', archetype: 'classic', gravity: 0.74, goals: g(['targets', 6], ['score', 8000]) },
  { id: 3, name: 'Twin Stars', tagline: 'Two planets, one very bouncy orbit.', theme: 'nebula', archetype: 'classic', gravity: 0.76, goals: g(['targets', 9], ['score', 12000]) },
  { id: 4, name: 'Ramp Camp', tagline: 'Learn the cosmic ramp at the top of the table.', theme: 'ice', archetype: 'ramp', gravity: 0.78, goals: g(['ramps', 2], ['score', 15000]) },
  { id: 5, name: 'Slingshot City', tagline: 'Let the pink slingshots fling you around.', theme: 'candy', archetype: 'classic', gravity: 0.78, goals: g(['score', 20000], ['targets', 8]) },

  { id: 6, name: 'Lane Runner', tagline: 'Roll through every lane at the top of the table.', theme: 'ocean', archetype: 'lanes', gravity: 0.8, goals: g(['lanes', 2], ['score', 18000]) },
  { id: 7, name: 'Bank Job', tagline: 'Knock down a whole bank of drop targets.', theme: 'gold', archetype: 'banks', gravity: 0.8, goals: g(['banks', 1], ['targets', 6]) },
  { id: 8, name: 'Orbit Initiate', tagline: 'Ride the left orbit and spin the wheel.', theme: 'nebula', archetype: 'orbit', gravity: 0.8, goals: g(['orbits', 2], ['score', 25000]) },
  { id: 9, name: 'Drop Zone', tagline: 'Two banks, plenty of clatter.', theme: 'lava', archetype: 'banks', gravity: 0.82, goals: g(['banks', 2], ['score', 30000]) },
  { id: 10, name: 'Moon Base', tagline: 'MILESTONE — the first boss guards the Moon Base.', theme: 'ice', archetype: 'boss', gravity: 0.82, balls: 4, boss: true, goals: g(['targets', 12], ['banks', 1], ['score', 60000]) },

  { id: 11, name: 'Combo Comet', tagline: 'Chain hits together to grow the multiplier.', theme: 'cosmos', archetype: 'classic', gravity: 0.84, goals: g(['combos', 4], ['score', 30000]) },
  { id: 12, name: 'Spinner Nebula', tagline: 'Feed the spinner and watch it sing.', theme: 'nebula', archetype: 'orbit', gravity: 0.84, goals: g(['spinner', 8], ['score', 35000]) },
  { id: 13, name: 'Ramp Rally', tagline: 'Both ramps are live — keep climbing.', theme: 'gold', archetype: 'ramp', gravity: 0.84, goals: g(['ramps', 4], ['score', 40000]) },
  { id: 14, name: 'Multiplier Madness', tagline: 'Starts at ×2. Combos push it higher.', theme: 'candy', archetype: 'classic', gravity: 0.84, baseMultiplier: 2, maxMultiplier: 6, goals: g(['score', 60000]) },
  { id: 15, name: 'Timed Orbit', tagline: '75 seconds to ride the orbit three times.', theme: 'ocean', archetype: 'orbit', gravity: 0.85, timeLimitSec: 75, goals: g(['orbits', 3], ['score', 35000]) },
  { id: 16, name: 'Double Drop', tagline: 'Two drop banks must fall.', theme: 'lava', archetype: 'banks', gravity: 0.85, goals: g(['banks', 2], ['score', 50000]) },
  { id: 17, name: 'Bank & Burn', tagline: 'Clear the bank, then smash the jackpot.', theme: 'lava', archetype: 'banks', gravity: 0.85, goals: g(['banks', 1], ['jackpot', 1], ['score', 60000]) },
  { id: 18, name: 'Spin Cycle', tagline: 'The spinner is hungry today.', theme: 'ice', archetype: 'orbit', gravity: 0.86, goals: g(['spinner', 14], ['orbits', 2]) },
  { id: 19, name: 'Combo Cavern', tagline: 'A tight gauntlet of posts and targets.', theme: 'jungle', archetype: 'gauntlet', gravity: 0.86, goals: g(['combos', 5], ['score', 50000]) },
  { id: 20, name: 'Saturn Slam', tagline: 'MILESTONE — ramps and orbits under pressure.', theme: 'gold', archetype: 'boss', gravity: 0.86, balls: 4, boss: true, goals: g(['ramps', 3], ['orbits', 2], ['score', 90000]) },

  { id: 21, name: 'Lock & Load', tagline: 'Lock two balls in the lock lane. Mind the drop!', theme: 'cosmos', archetype: 'classic', gravity: 0.88, goals: g(['locks', 2], ['score', 60000]) },
  { id: 22, name: 'Multiball Mayhem', tagline: 'Twin banks and a multiball finish.', theme: 'nebula', archetype: 'twin', gravity: 0.88, goals: g(['locks', 3], ['score', 70000]) },
  { id: 23, name: 'Asteroid Field', tagline: 'Thread the asteroids — avoid the grey rock.', theme: 'lava', archetype: 'gauntlet', gravity: 0.9, goals: g(['targets', 14], ['score', 60000]) },
  { id: 24, name: 'Moving Target', tagline: 'A sliding bar blocks the way down.', theme: 'ocean', archetype: 'movers', gravity: 0.9, goals: g(['targets', 12], ['score', 65000]) },
  { id: 25, name: 'Gravity Well', tagline: 'Heavier gravity. Stronger flippers required.', theme: 'cosmos', archetype: 'classic', gravity: 1.02, goals: g(['bumpers', 16], ['score', 70000]) },
  { id: 26, name: 'Ice Flow', tagline: 'Four icy lanes, one slippery table.', theme: 'ice', archetype: 'lanes', gravity: 0.9, goals: g(['lanes', 3], ['score', 70000]) },
  { id: 27, name: 'Lava Locks', tagline: 'Lock balls while the drop bank melts.', theme: 'lava', archetype: 'banks', gravity: 0.92, goals: g(['locks', 2], ['banks', 1], ['score', 75000]) },
  { id: 28, name: 'Jackpot Junction', tagline: 'Two jackpots are waiting at the junction.', theme: 'gold', archetype: 'classic', gravity: 0.92, goals: g(['jackpot', 2], ['score', 80000]) },
  { id: 29, name: 'Spin Doctor', tagline: 'Feed the spinner, then orbit for the bonus.', theme: 'candy', archetype: 'orbit', gravity: 0.92, goals: g(['spinner', 20], ['orbits', 2]) },
  { id: 30, name: 'Meteor Storm', tagline: 'MILESTONE — moving meteors over a multiball table.', theme: 'lava', archetype: 'boss', gravity: 0.94, balls: 4, boss: true, goals: g(['targets', 18], ['locks', 2], ['score', 120000]) },

  { id: 31, name: 'Mission Control', tagline: '100 seconds of pure pinball.', theme: 'cosmos', archetype: 'classic', gravity: 0.94, timeLimitSec: 100, goals: g(['bumpers', 20], ['targets', 15], ['score', 90000]) },
  { id: 32, name: 'Deep Space Run', tagline: 'Orbit and ramp your way across the void.', theme: 'ocean', archetype: 'orbit', gravity: 0.95, goals: g(['orbits', 4], ['ramps', 3]) },
  { id: 33, name: 'Gauntlet Gate', tagline: 'Posts, targets and hazards — pick your shots.', theme: 'jungle', archetype: 'gauntlet', gravity: 0.95, goals: g(['targets', 20], ['combos', 6]) },
  { id: 34, name: 'Drop Everything', tagline: 'Three banks to clear. Good luck.', theme: 'gold', archetype: 'twin', gravity: 0.95, goals: g(['banks', 3], ['score', 100000]) },
  { id: 35, name: 'Time Warp', tagline: '×2 start and 80 seconds to score big.', theme: 'nebula', archetype: 'classic', gravity: 0.96, timeLimitSec: 80, baseMultiplier: 2, maxMultiplier: 6, goals: g(['score', 150000]) },
  { id: 36, name: 'Bumper Wall', tagline: 'A wall of bumpers wants your ball.', theme: 'candy', archetype: 'gauntlet', gravity: 0.96, goals: g(['bumpers', 26], ['score', 100000]) },
  { id: 37, name: 'Spin & Win', tagline: 'Spin, orbit, jackpot.', theme: 'ice', archetype: 'orbit', gravity: 0.97, goals: g(['spinner', 26], ['jackpot', 1]) },
  { id: 38, name: 'Lockdown', tagline: 'Three locks and two banks on a fast table.', theme: 'cosmos', archetype: 'banks', gravity: 0.97, goals: g(['locks', 3], ['banks', 2]) },
  { id: 39, name: 'Combo Galaxy', tagline: '×7 combo or bust.', theme: 'nebula', archetype: 'classic', gravity: 0.98, goals: g(['combos', 7], ['score', 120000]) },
  { id: 40, name: 'Black Hole', tagline: 'MILESTONE — locks, jackpots and a hungry black hole.', theme: 'cosmos', archetype: 'boss', gravity: 1.0, balls: 4, boss: true, timeLimitSec: 150, goals: g(['locks', 3], ['jackpot', 2], ['score', 180000]) },

  { id: 41, name: 'Solar Winds', tagline: 'Sliding bars everywhere.', theme: 'gold', archetype: 'movers', gravity: 1.0, goals: g(['targets', 22], ['combos', 7]) },
  { id: 42, name: 'Frozen Orbit', tagline: 'Five orbits and a frozen spinner.', theme: 'ice', archetype: 'orbit', gravity: 1.0, goals: g(['orbits', 5], ['spinner', 20]) },
  { id: 43, name: 'Rampline', tagline: 'Both ramps, six times.', theme: 'jungle', archetype: 'ramp', gravity: 1.02, goals: g(['ramps', 6], ['score', 150000]) },
  { id: 44, name: 'Multiplier Max', tagline: '×2 to start, ×8 ceiling.', theme: 'candy', archetype: 'classic', gravity: 1.02, baseMultiplier: 2, maxMultiplier: 8, goals: g(['score', 220000]) },
  { id: 45, name: 'Precision Drop', tagline: 'Four banks. No rush. No mercy.', theme: 'gold', archetype: 'twin', gravity: 1.03, goals: g(['banks', 4], ['targets', 20]) },
  { id: 46, name: 'Chain Reaction', tagline: 'Every hit matters. Keep the chain alive.', theme: 'lava', archetype: 'gauntlet', gravity: 1.04, goals: g(['combos', 8], ['bumpers', 30]) },
  { id: 47, name: 'Jackpot Hunt', tagline: 'Three jackpots in two minutes.', theme: 'gold', archetype: 'classic', gravity: 1.05, timeLimitSec: 120, goals: g(['jackpot', 3], ['score', 200000]) },
  { id: 48, name: 'Final Approach', tagline: 'Orbits, ramps and locks on a fast table.', theme: 'ocean', archetype: 'orbit', gravity: 1.06, timeLimitSec: 130, goals: g(['orbits', 5], ['ramps', 4], ['locks', 3]) },
  { id: 49, name: 'Event Horizon', tagline: 'The last stop before the finale.', theme: 'cosmos', archetype: 'gauntlet', gravity: 1.08, goals: g(['targets', 24], ['banks', 3], ['jackpot', 2]) },
  { id: 50, name: 'Supernova Finale', tagline: 'FINAL BOSS — everything, all at once.', theme: 'nebula', archetype: 'boss', gravity: 1.05, balls: 4, boss: true, timeLimitSec: 180, goals: g(['locks', 4], ['jackpot', 3], ['banks', 3], ['score', 300000]) },
];

/** Add any element a goal needs but the archetype did not provide. */
function ensureGoalElements(stage: StageConfig): void {
  const kinds = new Set(stage.goals.map((goalItem) => goalItem.kind));
  const hasZone = (kind: ZoneSpec['kind']): boolean => stage.zones.some((zone) => zone.kind === kind);

  if (kinds.has('jackpot') && !stage.targets.some((t) => t.kind === 'jackpot')) {
    stage.targets.push({ x: 270, y: 452, w: 40, h: 40, angle: 0, kind: 'jackpot' });
  }
  if (stage.boss && !stage.targets.some((t) => t.kind === 'jackpot')) {
    stage.targets.push({ x: 270, y: 452, w: 40, h: 40, angle: 0, kind: 'jackpot' });
  }
  if (kinds.has('orbits') && !hasZone('orbit')) stage.zones.push(clone(ZONES.orbit));
  if (kinds.has('spinner') && !hasZone('spinner')) stage.zones.push(clone(ZONES.spinner));
  if ((kinds.has('ramps')) && !hasZone('ramp')) stage.zones.push(clone(ZONES.ramp));
  if (kinds.has('locks') && !hasZone('lock')) stage.zones.push(clone(ZONES.lock));

  if (kinds.has('banks')) {
    const existing = new Set(stage.targets.filter((t) => t.kind === 'drop' && t.bank).map((t) => t.bank));
    if (existing.size === 0) stage.targets.push(...clone(CENTER_DROP_BANK));
  }
  if (kinds.has('lanes') && stage.lanes.length < 2) stage.lanes = clone(LANE_3);
  if (kinds.has('bumpers') && stage.bumpers.length === 0) stage.bumpers.push(clone(BUMPER_SLOTS.A));
  if (kinds.has('targets') && stage.targets.length === 0) stage.targets.push(...clone(RIGHT_TARGETS));
  if ((kinds.has('orbits') || kinds.has('spinner')) && stage.lanes.length === 0) stage.lanes = clone(LANE_3);
}

function buildStage(blueprint: Blueprint): StageConfig {
  const layout = layoutFor(blueprint.archetype, blueprint.id);
  const theme = THEMES[blueprint.theme];
  const boss = blueprint.boss === true;
  const stage: StageConfig = {
    id: blueprint.id,
    name: blueprint.name,
    tagline: blueprint.tagline,
    theme,
    archetype: blueprint.archetype,
    gravity: blueprint.gravity ?? 0.82,
    balls: blueprint.balls ?? (boss ? 4 : 3),
    timeLimitSec: blueprint.timeLimitSec,
    ballSaveMs: Math.max(2600, 5200 - blueprint.id * 45),
    flipperPower: boss ? 1.12 : blueprint.id > 39 ? 1.08 : 1,
    baseMultiplier: blueprint.baseMultiplier ?? 1,
    maxMultiplier: blueprint.maxMultiplier ?? (boss ? 8 : 6),
    jackpotValue: Math.round((18000 + blueprint.id * 900) * (boss ? 1.4 : 1)),
    locksRequired: blueprint.id >= 45 ? 3 : 2,
    goals: blueprint.goals,
    reward: {
      extraBall: boss || blueprint.id % 10 === 0,
      bonus: boss ? 50000 : 5000 + blueprint.id * 400,
    },
    boss,
    bumpers: layout.bumpers,
    targets: layout.targets,
    slings: layout.slings,
    lanes: layout.lanes,
    zones: layout.zones,
    posts: layout.posts,
    movers: layout.movers,
    banks: [],
  };

  ensureGoalElements(stage);

  const bankIds = new Set<string>();
  for (const target of stage.targets) {
    if (target.bank) bankIds.add(target.bank);
  }
  stage.banks = [...bankIds];

  return stage;
}

function buildLibrary(): StageConfig[] {
  const stages = BLUEPRINTS.map(buildStage);
  if (stages.length !== STAGE_COUNT) {
    throw new Error(`Stage library must contain exactly ${STAGE_COUNT} stages (found ${stages.length})`);
  }
  return stages;
}

/** All 50 stages, validated at module load in development. */
export const STAGES: StageConfig[] = buildLibrary();

if (import.meta.env?.DEV) {
  const errors = STAGES.flatMap(validateStage);
  if (errors.length > 0) {
    console.warn('[Space Pinball] stage validation problems:\n' + errors.join('\n'));
  }
}

export function getStage(id: number): StageConfig {
  const stage = STAGES.find((s) => s.id === id);
  if (!stage) throw new Error(`Unknown stage id ${id}`);
  return stage;
}

/** True when the stage id is the final stage. */
export function isFinalStage(id: number): boolean {
  return id >= STAGE_COUNT;
}

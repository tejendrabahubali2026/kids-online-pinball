import Matter from 'matter-js';
import { FLIPPER, STEP_MS } from '../game/constants';
import { clamp, normAngle } from '../game/util';
import { setBodyAngle, setBodyPosition } from './matterExtensions';

const { Bodies } = Matter;

export type FlipperSide = 'left' | 'right';

/**
 * A kinematic pinball flipper.
 *
 * The blade is a *static* physics body that is rotated around its pivot once per
 * fixed tick. Because `Body.setAngle(angle, true)` and `Body.setPosition(…, true)`
 * update the body's previous transform, the collision solver sees genuine
 * contact velocities (blade angular sweep) and kicks the ball with real
 * momentum. Nothing ever pushes the ball directly, the blade cannot be shoved
 * through walls, and the motion is frame-rate independent (radians per tick).
 */
export class Flipper {
  readonly body: Matter.Body;
  readonly side: FlipperSide;
  readonly pivot: { x: number; y: number };
  pressed = false;
  /** 0 = resting, 1 = fully raised (render juice). */
  flipAnim = 0;

  private readonly restAngle: number;
  private readonly activeAngle: number;
  private readonly power: number;
  private angle: number;

  constructor(side: FlipperSide, pivotX: number, pivotY: number, power = 1) {
    this.side = side;
    this.pivot = { x: pivotX, y: pivotY };
    this.restAngle = side === 'left' ? FLIPPER.restLeft : Math.PI - FLIPPER.restLeft;
    this.activeAngle = side === 'left' ? FLIPPER.activeLeft : Math.PI - FLIPPER.activeLeft;
    this.power = clamp(power, 0.4, 1.8);
    this.angle = this.restAngle;

    const centre = this.centreFor(this.restAngle);
    this.body = Bodies.trapezoid(centre.x, centre.y, FLIPPER.length, FLIPPER.height, 0.42, {
      isStatic: true,
      label: side === 'left' ? 'flipperL' : 'flipperR',
      restitution: FLIPPER.restitution,
      friction: FLIPPER.friction,
      chamfer: { radius: 6 },
    });
    setBodyAngle(this.body, this.restAngle);
    setBodyPosition(this.body, centre);
  }

  private centreFor(angle: number): { x: number; y: number } {
    return {
      x: this.pivot.x + Math.cos(angle) * FLIPPER.pivotOffset,
      y: this.pivot.y + Math.sin(angle) * FLIPPER.pivotOffset,
    };
  }

  setPressed(pressed: boolean): void {
    this.pressed = pressed;
  }

  /**
   * Advance the flipper by one physics tick.
   * @param dtMs fixed timestep in milliseconds.
   */
  update(dtMs = STEP_MS): void {
    const ticks = dtMs / STEP_MS;
    const target = this.pressed ? this.activeAngle : this.restAngle;
    const error = normAngle(target - this.angle);
    if (Math.abs(error) < 1e-4) {
      this.flipAnim = this.pressed ? 1 : 0;
      return;
    }

    const speed = (this.pressed ? FLIPPER.upStep : FLIPPER.downStep) * this.power * ticks;
    const step = Math.sign(error) * Math.min(Math.abs(error), speed);
    this.angle = normAngle(this.angle + step);

    // Update transform AND inferred velocities so the blade strikes the ball.
    setBodyAngle(this.body, this.angle, true);
    setBodyPosition(this.body, this.centreFor(this.angle), true);

    const travel = Math.abs(normAngle(this.activeAngle - this.restAngle));
    const progress = travel > 0 ? Math.abs(normAngle(this.angle - this.restAngle)) / travel : 0;
    this.flipAnim = clamp(progress, 0, 1);
  }

  /** World-space tip position (used for effects). */
  tip(): { x: number; y: number } {
    return {
      x: this.body.position.x + Math.cos(this.angle) * (FLIPPER.length / 2),
      y: this.body.position.y + Math.sin(this.angle) * (FLIPPER.length / 2),
    };
  }
}

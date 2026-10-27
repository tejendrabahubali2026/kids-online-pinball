import Matter from 'matter-js';

/**
 * The physics engine accepts an optional `updateVelocity` flag on
 * `Body.setAngle` and `Body.setPosition`, but its published type declarations
 * still describe the older two-argument signatures. These thin wrappers expose
 * the runtime behaviour with correct types instead of sprinkling `as any` or
 * `@ts-ignore` around the physics code.
 */
type SetAngleFn = (body: Matter.Body, angle: number, updateVelocity?: boolean) => void;
type SetPositionFn = (body: Matter.Body, position: Matter.Vector, updateVelocity?: boolean) => void;

const setAngleImpl = Matter.Body.setAngle as unknown as SetAngleFn;
const setPositionImpl = Matter.Body.setPosition as unknown as SetPositionFn;

/** Set the body angle, optionally inferring angular velocity from the delta. */
export function setBodyAngle(body: Matter.Body, angle: number, updateVelocity = false): void {
  setAngleImpl(body, angle, updateVelocity);
}

/** Set the body position, optionally inferring linear velocity from the delta. */
export function setBodyPosition(
  body: Matter.Body,
  position: Matter.Vector,
  updateVelocity = false
): void {
  setPositionImpl(body, position, updateVelocity);
}

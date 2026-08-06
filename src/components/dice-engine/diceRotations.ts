/**
 * Pure math helpers for deterministic dice orientation.
 *
 * Face layout used by `Dice3D` (opposite faces always sum to 7):
 *   +Y = 1   -Y = 6
 *   +X = 3   -X = 4
 *   +Z = 2   -Z = 5
 *
 * The engine never simulates physics: the parent supplies the value and we
 * simply compute the quaternion that puts that face upwards, then tumble
 * *into* it so the motion looks believable.
 */
import { Euler, MathUtils, Quaternion, Vector3 } from "three";
import type { DiceValue } from "./types";

const HALF_PI = Math.PI / 2;

/** Euler angles that bring the requested face to +Y. */
const FACE_EULER: Record<DiceValue, [number, number, number]> = {
  1: [0, 0, 0], // +Y already up
  2: [-HALF_PI, 0, 0], // +Z -> +Y
  3: [0, 0, HALF_PI], // +X -> +Y
  4: [0, 0, -HALF_PI], // -X -> +Y
  5: [HALF_PI, 0, 0], // -Z -> +Y
  6: [Math.PI, 0, 0], // -Y -> +Y
};

const scratchEuler = new Euler();
const scratchYaw = new Quaternion();
const UP = new Vector3(0, 1, 0);

/**
 * Quaternion that lands `value` face-up.
 * `spin` adds a random-but-quantised yaw so dice don't all face the camera
 * identically while still keeping the correct face upwards.
 */
export function getFaceQuaternion(value: DiceValue, spin = 0, target = new Quaternion()): Quaternion {
  const [x, y, z] = FACE_EULER[value];
  scratchEuler.set(x, y, z);
  target.setFromEuler(scratchEuler);
  // The yaw must be applied in WORLD space (pre-multiplied), otherwise it
  // rotates around a local axis and can tip the wrong face upwards.
  scratchYaw.setFromAxisAngle(UP, spin * HALF_PI);
  return target.premultiply(scratchYaw);
}

/** Random unit axis, biased away from degenerate near-zero vectors. */
export function randomAxis(target = new Vector3()): Vector3 {
  return target
    .set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
    .normalize();
}

/** Random integer in `[min, max]`. */
export function randomInt(min: number, max: number): number {
  return Math.floor(MathUtils.lerp(min, max + 1, Math.random()));
}

/** Cubic ease-out — fast start, gentle settle. */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Quartic ease-out, used for the secondary tumble axis (different feel). */
export function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

/**
 * Vertical offset of the landing bounce: the die is tossed up, drops, then
 * bounces once with damped amplitude. Returns 0 at t = 0 and t = 1.
 */
export function bounceHeight(t: number, amplitude: number): number {
  if (t >= 1) return 0;
  // Toss arc for the first 70% of the animation, damped bounce after.
  if (t < 0.7) {
    const p = t / 0.7;
    return Math.sin(p * Math.PI) * amplitude;
  }
  const p = (t - 0.7) / 0.3;
  return Math.abs(Math.sin(p * Math.PI)) * amplitude * 0.22 * (1 - p);
}

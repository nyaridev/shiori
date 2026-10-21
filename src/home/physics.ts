// Deck motion, in slot units (1 = one card). Pure, so it's easy to tune and test.

/** Exponential slowdown of a fling, per second. Lower spins longer. */
export const FRICTION = 1.5;
/** Below this speed (slots/s) a fling hands over to the snap spring. */
export const SETTLE_SPEED = 2.2;
/** Snap spring: stiffness and damping. Slightly under-damped, for a small, soft overshoot. */
export const STIFFNESS = 140;
export const DAMPING = 19;
export const MAX_SPEED = 70;
/** Wheel glide: a critically damped spring toward the wheel's target, so it eases in and out without a bounce. */
export const GLIDE_STIFFNESS = 120;
export const GLIDE_DAMPING = 2 * Math.sqrt(GLIDE_STIFFNESS);

export type Mode = "idle" | "drag" | "coast" | "settle" | "glide";

/** Modes that move on their own, frame after frame. */
export const moving = (mode: Mode) => mode === "coast" || mode === "settle" || mode === "glide";

export interface MotionState {
  x: number;
  v: number;
  mode: Mode;
  target: number;
}

/** Advance the motion by dt seconds. */
export function step(s: MotionState, dt: number): MotionState {
  let { x, v, mode, target } = s;
  if (mode === "coast") {
    x += v * dt;
    v *= Math.exp(-FRICTION * dt);
    if (Math.abs(v) < SETTLE_SPEED) {
      mode = "settle";
      // Lean into the direction of travel so the last card doesn't snap back.
      target = Math.round(x + v * 0.12);
    }
  } else if (mode === "settle" || mode === "glide") {
    const [k, c] = mode === "settle" ? [STIFFNESS, DAMPING] : [GLIDE_STIFFNESS, GLIDE_DAMPING];
    const a = k * (target - x) - c * v;
    v += a * dt;
    x += v * dt;
    // A glide only comes to rest once its target is a card (the wheel has stopped).
    if (Number.isInteger(target) && Math.abs(target - x) < 0.0008 && Math.abs(v) < 0.02) {
      x = target;
      v = 0;
      mode = "idle";
    }
  }
  return { x, v, mode, target };
}

/** Signed distance of slot i from position x on a loop of `count` slots, in [-count/2, count/2). */
export function offset(i: number, x: number, count: number): number {
  return mod(i - x + count / 2, count) - count / 2;
}

export const mod = (a: number, n: number) => ((a % n) + n) % n;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

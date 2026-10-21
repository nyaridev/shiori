import { describe, expect, it } from "vitest";
import { type MotionState, offset, step } from "./physics.ts";

function run(s: MotionState, seconds: number) {
  let state = s;
  for (let t = 0; t < seconds; t += 1 / 120) state = step(state, 1 / 120);
  return state;
}

describe("deck physics", () => {
  it("a fling coasts, then snaps exactly onto a card", () => {
    const end = run({ x: 3, v: 30, mode: "coast", target: 3 }, 6);
    expect(end.mode).toBe("idle");
    expect(Number.isInteger(end.x)).toBe(true);
    expect(end.x).toBeGreaterThan(15);
  });

  it("a slow release settles in the direction of travel", () => {
    const end = run({ x: 3.4, v: 2, mode: "coast", target: 3 }, 3);
    expect(end.x).toBe(4);
  });

  it("a wheel glide follows its target without overshooting, and rests once the target is a card", () => {
    let s: MotionState = { x: 3, v: 0, mode: "glide", target: 4.6 };
    let furthest = 0;
    for (let t = 0; t < 1; t += 1 / 120) {
      s = step(s, 1 / 120);
      furthest = Math.max(furthest, s.x);
    }
    expect(s.mode).toBe("glide");
    expect(furthest).toBeLessThanOrEqual(4.6 + 1e-6);
    const end = run({ ...s, target: 5 }, 2);
    expect(end.mode).toBe("idle");
    expect(end.x).toBe(5);
  });

  it("measures distance around the loop", () => {
    expect(offset(0, 9, 10)).toBe(1);
    expect(offset(9, 0, 10)).toBe(-1);
    expect(offset(5, 5.25, 10)).toBeCloseTo(-0.25);
  });
});

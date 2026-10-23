import { describe, expect, it } from "vitest";
import { Path, type Point, Stabilizer } from "./stroke.ts";

const pt = (x: number, y: number, p = 0.5): Point => ({ x, y, p });

describe("a stroke's path", () => {
  it("dabs at even spacing however the points come", () => {
    const dabs: Point[] = [];
    const path = new Path(
      () => 10,
      (at) => dabs.push(at),
    );
    // A straight line from 0 to 100, in uneven steps.
    for (const x of [0, 3, 4, 40, 41, 77, 100]) path.add(pt(x, 0));
    path.end();
    const xs = dabs.map((d) => Math.round(d.x));
    expect(xs[0]).toBe(0);
    expect(xs.at(-1)).toBeGreaterThanOrEqual(90);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeCloseTo(10, 0);
    expect(dabs.every((d) => Math.abs(d.y) < 1e-9)).toBe(true);
  });

  it("rounds corners into curves", () => {
    const dabs: Point[] = [];
    const path = new Path(
      () => 2,
      (at) => dabs.push(at),
    );
    for (const p of [pt(0, 0), pt(50, 0), pt(50, 50)]) path.add(p);
    path.end();
    // No dab at the corner itself: the curve cuts inside it.
    expect(dabs.some((d) => d.x > 49 && d.y < 1)).toBe(false);
    expect(dabs.at(-1)?.y).toBeGreaterThan(45);
  });

  it("dabs once for a tap, and ignores points on top of each other", () => {
    const dabs: Point[] = [];
    const path = new Path(
      () => 5,
      (at) => dabs.push(at),
    );
    path.add(pt(10, 10));
    path.add(pt(10, 10, 0.9));
    path.end();
    expect(dabs).toEqual([pt(10, 10)]);
  });

  it("draws a straight line to a point", () => {
    const dabs: Point[] = [];
    const path = new Path(
      () => 25,
      (at) => dabs.push(at),
    );
    path.add(pt(0, 0));
    path.lineTo(pt(100, 0));
    expect(dabs.map((d) => Math.round(d.x))).toEqual([0, 25, 50, 75, 100]);
  });
});

describe("the stabilizer", () => {
  it("follows the pen exactly at 0", () => {
    const s = new Stabilizer(0);
    expect(s.push(pt(0, 0))).toEqual(pt(0, 0));
    expect(s.push(pt(10, 5))).toEqual(pt(10, 5));
    expect(s.finish(pt(10, 5))).toEqual([]);
  });

  it("evens out a wobble, and still ends where the pen lifted", () => {
    const s = new Stabilizer(0.8);
    s.push(pt(0, 0));
    // A shaky line along y = 0.
    const ys = [6, -6, 6, -6, 6, -6].map((y, i) => s.push(pt((i + 1) * 10, y)).y);
    expect(Math.max(...ys.map(Math.abs))).toBeLessThan(3);
    const tail = s.finish(pt(60, 0));
    expect(tail.at(-1)).toEqual(pt(60, 0));
    expect(tail.length).toBeGreaterThan(1);
  });
});

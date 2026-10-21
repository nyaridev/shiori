import { describe, expect, it } from "vitest";
import { Buckets, createLinkLimits, LIMITS, Windows } from "./limits.ts";

describe("Buckets", () => {
  it("allow a burst, then refill over time", () => {
    const b = new Buckets({ capacity: 3, per: 60_000, refill: 6 });
    expect([b.take("a", 0), b.take("a", 0), b.take("a", 0)]).toEqual([0, 0, 0]);
    expect(b.take("a", 0)).toBe(10_000);
    expect(b.take("b", 0)).toBe(0);
    expect(b.take("a", 10_000)).toBe(0);
  });
});

describe("Windows", () => {
  it("count events in a sliding window", () => {
    const w = new Windows(2, 1000);
    w.count("a", 0);
    w.count("a", 500);
    expect(w.wait("a", 600)).toBe(400);
    expect(w.wait("a", 1000)).toBe(0);
  });
});

describe("link limits", () => {
  it("don't spend a guest's daily writes on refused ones", () => {
    const l = createLinkLimits();
    let ok = 0;
    for (let i = 0; i < 100; i++) if (l.write("g", 0) === 0) ok++;
    expect(ok).toBe(LIMITS.writes.capacity);
    for (let t = 10_000; t < 86_400_000; t += 10_000) if (l.write("g", t) === 0) ok++;
    expect(ok).toBe(LIMITS.writesPerGuestPerDay);
  });
});

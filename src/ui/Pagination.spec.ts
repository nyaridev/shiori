import { describe, expect, it } from "vitest";
import { pageWindow } from "./Pagination.tsx";

describe("pageWindow", () => {
  it("shows the first and last page, the pages around this one, and gaps between", () => {
    expect(pageWindow(6, 40)).toEqual([1, null, 4, 5, 6, 7, 8, null, 40]);
    expect(pageWindow(1, 40)).toEqual([1, 2, 3, null, 40]);
    expect(pageWindow(40, 40)).toEqual([1, null, 38, 39, 40]);
  });

  it("shows a page instead of a gap of one", () => {
    expect(pageWindow(5, 9)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(pageWindow(5, 12)).toEqual([1, 2, 3, 4, 5, 6, 7, null, 12]);
  });

  it("has nothing to skip on a short list", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(2, 3)).toEqual([1, 2, 3]);
  });
});

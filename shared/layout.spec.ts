import { describe, expect, it } from "vitest";
import { closeUp, frontLayoutSchema, gridOf, INFOBOX_WIDTH, layoutSchema } from "./layout.ts";

const layout = (areas: string[][], blocks: Record<string, unknown>) =>
  layoutSchema.parse({ title: "T", areas, blocks });

describe("a layout's grid", () => {
  it("keeps a column of fact boxes as wide as the infobox beside a plain article", () => {
    const concept = layout(
      [
        ["design", "facts"],
        ["body", "facts"],
        ["questions", "questions"],
      ],
      {
        design: { type: "design" },
        facts: { type: "infobox" },
        body: { type: "body" },
        questions: { type: "questions" },
      },
    );
    expect(gridOf(concept)).toEqual({
      areas: '"design facts" "body facts" "questions questions"',
      columns: `minmax(0, 1fr) ${INFOBOX_WIDTH}`,
    });
  });

  it("shares the width when no column holds only fact boxes", () => {
    const two = layout([["body", "gallery"]], { body: { type: "body" }, gallery: { type: "gallery" } });
    expect(gridOf(two).columns).toBe("minmax(0, 1fr) minmax(0, 1fr)");
  });
});

describe("layouts on the public wiki (ADR-0012)", () => {
  it("lets a page layout opt in, and keeps the front page's blocks to its own", () => {
    expect(
      layoutSchema.safeParse({ public: true, areas: [["body"]], blocks: { body: { type: "body" } } }).success,
    ).toBe(true);
    expect(layoutSchema.safeParse({ areas: [["t"]], blocks: { t: { type: "title" } } }).success).toBe(false);
    const front = (blocks: Record<string, unknown>) =>
      frontLayoutSchema.safeParse({ areas: [Object.keys(blocks)], blocks }).success;
    expect(front({ t: { type: "title" }, s: { type: "start", columns: 4 } })).toBe(true);
    expect(front({ p: { type: "pages", pages: ["mobs/rat"] } })).toBe(true);
    // Nothing that reads beyond the public pages: questions, designs and the home blocks stay in the app.
    expect(front({ q: { type: "questions" } })).toBe(false);
    expect(front({ r: { type: "recent-changes" } })).toBe(false);
    expect(front({ s: { type: "start", columns: 9 } })).toBe(false);
  });

  it("closes up around the areas it leaves out, keeping each a rectangle", () => {
    const concept = [
      ["design", "facts"],
      ["body", "facts"],
      ["questions", "questions"],
    ];
    expect(closeUp(concept, (a) => a !== "design" && a !== "questions")).toEqual([["body", "facts"]]);
    expect(closeUp(concept, (a) => a === "body")).toEqual([["body"]]);
    expect(closeUp(concept, () => false)).toBeNull();
    // The areas above grow down over the gap, and the row that repeats goes.
    expect(
      closeUp(
        [
          ["a", "b"],
          ["c", "c"],
          ["d", "e"],
        ],
        (x) => x !== "c",
      ),
    ).toEqual([
      ["a", "b"],
      ["d", "e"],
    ]);
  });
});

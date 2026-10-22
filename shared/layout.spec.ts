import { describe, expect, it } from "vitest";
import { gridOf, INFOBOX_WIDTH, layoutSchema } from "./layout.ts";

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

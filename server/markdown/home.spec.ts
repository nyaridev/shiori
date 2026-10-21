// The home page's elements (ADR-0002): boxes, and the blocks that show the whole wiki live.
import type { Element, Root, RootContent } from "hast";
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./render.ts";

function render(md: string, fileExists = (_rel: string) => true) {
  return renderMarkdown(md, { wikiId: "demo", pageDir: "", pageExists: () => true, fileExists });
}

function find(node: Root | RootContent, tag: string): Element[] {
  const out: Element[] = [];
  if (node.type === "element" && node.tagName === tag) out.push(node);
  if ("children" in node) for (const c of node.children) out.push(...find(c, tag));
  return out;
}

describe("home elements", () => {
  it("make a grid of titled boxes, with an icon as an emoji or a picture of the wiki", () => {
    const { hast, problems } = render(
      [
        '::::boxes{columns="4"}',
        ':::box[Start here]{icon="🧭" span="2"}',
        "Hello",
        ":::",
        ':::box[Map]{icon="/assets/icons/map.svg"}',
        "::directory",
        ":::",
        "::::",
      ].join("\n"),
    );
    expect(problems).toEqual([]);
    expect(find(hast, "sh-boxes")[0].properties).toEqual({ columns: "4" });
    const boxes = find(hast, "sh-box");
    expect(boxes.map((b) => b.properties)).toEqual([
      { title: "Start here", icon: "🧭", span: "2" },
      { title: "Map", icon: "/api/wikis/demo/files/assets/icons/map.svg" },
    ]);
    expect(find(hast, "sh-directory")).toHaveLength(1);
  });

  it("report content outside a box, bad columns and spans, and a missing icon picture", () => {
    const { problems } = render(
      '::::boxes{columns="5"}\nStray text\n:::box[A]{span="4" icon="/assets/nope.svg"}\nx\n:::\n::::',
      (rel) => rel !== "assets/nope.svg",
    );
    expect(problems.join("\n")).toMatch(/columns="5" isn't one of 2, 3, 4/);
    expect(problems.join("\n")).toMatch(/span="4" isn't one of 2, 3/);
    expect(problems.join("\n")).toMatch(/put all content inside ":::box\[Title\]"/);
    expect(problems.join("\n")).toMatch(/missing file "\/assets\/nope.svg"/);
  });

  it("place the live blocks, with a count from 1 to 50", () => {
    const { hast, problems } = render(
      '::recent-changes{count="6"}\n\n::open-questions\n\n::open-tasks{count="50"}\n\n::discussions{count="3"}',
    );
    expect(problems).toEqual([]);
    expect(find(hast, "sh-recent-changes")[0].properties).toEqual({ count: "6" });
    expect(find(hast, "sh-open-questions")).toHaveLength(1);
    expect(find(hast, "sh-open-tasks")[0].properties).toEqual({ count: "50" });
    expect(find(hast, "sh-discussions")[0].properties).toEqual({ count: "3" });
    for (const bad of ["0", "51", "many", "-2"]) {
      expect(render(`::recent-changes{count="${bad}"}`).problems, bad).toEqual([
        "line 1: recent-changes: count is a number from 1 to 50",
      ]);
    }
  });
});

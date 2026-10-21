import type { Element, Root, RootContent } from "hast";
import { describe, expect, it } from "vitest";
import { resolveFile, resolvePageLink } from "./links.ts";
import { renderMarkdown } from "./render.ts";

const ctx = {
  wikiId: "demo",
  pageDir: "systems",
  pageExists: (p: string) => ["", "systems", "systems/combat", "enemies/rat"].includes(p),
  fileExists: (rel: string) => rel === "assets/rat.png",
};

function find(node: Root | RootContent, tag: string): Element[] {
  const out: Element[] = [];
  if (node.type === "element" && node.tagName === tag) out.push(node);
  if ("children" in node) for (const c of node.children) out.push(...find(c, tag));
  return out;
}

describe("renderMarkdown", () => {
  it("turns directives into ld elements with their label", () => {
    const { hast, problems } = renderMarkdown(':::callout[Heads up]{tone="warning"}\nText\n:::', ctx);
    const [callout] = find(hast, "sh-callout");
    expect(callout.properties).toMatchObject({ tone: "warning", title: "Heads up" });
    expect(problems).toEqual([]);
  });

  it("splits infobox list items into rows", () => {
    const { hast } = renderMarkdown(":::infobox[Rat]\n- Health: 20\n- Speed: **Fast**\n:::", ctx);
    const keys = find(hast, "sh-key").map((k) => (k.children[0] as { value: string }).value);
    expect(keys).toEqual(["Health", "Speed"]);
    expect(find(hast, "sh-value")[1].children.some((c) => c.type === "element" && c.tagName === "strong")).toBe(true);
  });

  it("splits columns on ---", () => {
    const { hast } = renderMarkdown(":::columns\nLeft\n\n---\n\nRight\n:::", ctx);
    expect(find(hast, "sh-column")).toHaveLength(2);
  });

  it("reports unknown elements and bad attribute values", () => {
    const { problems } = renderMarkdown(':::banner\nx\n:::\n\n:::callout{tone="loud"}\ny\n:::', ctx, 4);
    expect(problems).toEqual([
      'line 5: unknown element ":::banner"',
      'line 9: callout: tone="loud" isn\'t one of note, tip, warning, danger',
    ]);
  });

  it("leaves colons in prose alone", () => {
    const { hast, problems } = renderMarkdown("Meet at 10:30, time:now.", ctx);
    expect(problems).toEqual([]);
    expect(JSON.stringify(hast)).toContain("time");
    expect(JSON.stringify(hast)).toContain(":now");
  });

  it("rewrites and checks links and images", () => {
    const { hast, problems } = renderMarkdown(
      "[a](combat) [b](/enemies/rat#drops) [c](missing) [d](https://example.com) ![r](/assets/rat.png)",
      ctx,
    );
    const hrefs = find(hast, "a").map((a) => a.properties.href);
    expect(hrefs).toEqual([
      "/w/demo/systems/combat",
      "/w/demo/enemies/rat#drops",
      "/w/demo/systems/missing",
      "https://example.com",
    ]);
    expect(find(hast, "img")[0].properties.src).toBe("/api/wikis/demo/files/assets/rat.png");
    expect(problems).toEqual(['line 1: broken link "missing"']);
  });

  it("turns stats items into tiles with a label, value, change and trend", () => {
    const { hast, problems } = renderMarkdown(
      ":::stats\n- Subscribers: 12.4k | +8% this month\n- Churn: 3% | -1%\n- Videos: 42\n:::",
      ctx,
    );
    expect(find(hast, "sh-stat").map((t) => t.properties)).toEqual([
      { label: "Subscribers", value: "12.4k", change: "+8% this month", trend: "up" },
      { label: "Churn", value: "3%", change: "-1%", trend: "down" },
      { label: "Videos", value: "42", change: "", trend: "flat" },
    ]);
    expect(problems).toEqual([]);
  });

  it("marks timeline milestones done, now and next from their task boxes", () => {
    const { hast } = renderMarkdown(
      ":::timeline\n- [x] March: Prototype\n- [ ] April: Demo\n- [ ] May: **Launch**\n:::",
      ctx,
    );
    const steps = find(hast, "sh-milestone");
    expect(steps.map((m) => m.properties)).toEqual([
      { when: "March", state: "done" },
      { when: "April", state: "now" },
      { when: "May", state: "next" },
    ]);
    expect(find(steps[2], "strong")).toHaveLength(1);
  });

  it("makes link cards with an icon, a resolved title link and a description", () => {
    const { hast, problems } = renderMarkdown(
      ":::cards\n- ⚔️ [Combat](combat) — how fights work\n- No link here\n:::",
      ctx,
    );
    const [card] = find(hast, "sh-card");
    expect(card.properties).toEqual({ icon: "⚔️" });
    expect(find(card, "a")[0].properties.href).toBe("/w/demo/systems/combat");
    expect(JSON.stringify(card)).toContain("how fights work");
    expect(JSON.stringify(card)).not.toContain("—");
    expect(problems).toEqual(['line 1: cards: "No link here" needs a link, as "- [Title](page) — description"']);
  });

  it("collects gallery images into captioned tiles", () => {
    const { hast } = renderMarkdown(
      ':::gallery\n![Rat](/assets/rat.png "A thief")\n![Rat again](/assets/rat.png)\n:::',
      ctx,
    );
    expect(find(hast, "sh-shot").map((s) => s.properties.caption)).toEqual(["A thief", "Rat again"]);
    expect(find(hast, "img")[0].properties.src).toBe("/api/wikis/demo/files/assets/rat.png");
  });

  it("checks progress values", () => {
    const { problems } = renderMarkdown(
      ':progress[Launch]{value="60"} :progress{value="3" max="10"} :progress[Bad]',
      ctx,
    );
    expect(problems).toEqual([
      'line 1: progress: give it a number, as :progress[Label]{value="60"} (out of max="100")',
    ]);
  });

  it("builds the table of contents from h2 and h3", () => {
    const { toc } = renderMarkdown("## Attacks\n\n### Swing\n\n#### Deep\n\n## Damage", ctx);
    expect(toc).toEqual([
      { id: "attacks", text: "Attacks", depth: 2 },
      { id: "swing", text: "Swing", depth: 3 },
      { id: "damage", text: "Damage", depth: 2 },
    ]);
  });
});

describe("paths", () => {
  it("resolves page links relative to the page folder", () => {
    expect(resolvePageLink("systems", "combat.md")).toBe("systems/combat");
    expect(resolvePageLink("systems", "../enemies/rat")).toBe("enemies/rat");
    expect(resolvePageLink("systems", "/")).toBe("");
    expect(resolvePageLink("systems", "index")).toBe("systems");
    expect(resolvePageLink("", "../../outside")).toBeNull();
  });

  it("keeps files inside the wiki", () => {
    expect(resolveFile("systems", "/assets/a.png")).toBe("assets/a.png");
    expect(resolveFile("systems", "../../assets/a.png")).toBe("assets/a.png");
    expect(resolveFile("", "../../secret.txt")).toBeNull();
  });
});

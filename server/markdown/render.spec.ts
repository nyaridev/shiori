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
  it("colors code blocks in known languages with the theme's variables, and leaves others plain", () => {
    const { hast, problems } = renderMarkdown("```luau\nlocal hp = 20 -- full\n```\n\n```ini\n[game]\n```", ctx);
    const [luau, other] = find(hast, "pre");
    expect(luau.properties).toMatchObject({ className: ["sh-code"], dataLang: "luau" });
    const styles = find(luau, "span").map((s) => String(s.properties.style ?? ""));
    expect(styles).toContain("color:var(--code-token-keyword)");
    expect(styles.some((s) => s.includes("--code-token-comment"))).toBe(true);
    expect(other.properties).toMatchObject({ className: ["sh-code"], dataLang: "ini" });
    expect(find(other, "span")).toEqual([]);
    expect(problems).toEqual([]);
  });

  it("hands a mermaid fence to the app as a diagram, with its source", () => {
    const { hast, problems } = renderMarkdown("```mermaid\nflowchart LR\n  a --> b\n```\n\n```mermaid\n```", ctx);
    const diagrams = find(hast, "sh-diagram");
    expect(diagrams).toHaveLength(2);
    expect(diagrams[0].children).toEqual([{ type: "text", value: "flowchart LR\n  a --> b" }]);
    expect(find(hast, "pre")).toEqual([]);
    expect(problems).toEqual(["line 6: diagram: the block is empty"]);
  });

  it("typesets $$math$$ in a sentence and in a block, but leaves a lone $ alone", () => {
    const md = "Costs $5 and $10, and $$E = mc^2$$.\n\n$$\n\\frac{a}{b}\n$$\n\n```math\nx^2\n```";
    const { hast, problems } = renderMarkdown(md, ctx);
    const classes = (el: Element) => (el.properties.className as string[] | undefined) ?? [];
    const inline = find(hast, "span").filter((s) => classes(s).includes("sh-math"));
    expect(inline.map((s) => s.properties.dataTex)).toEqual(["E = mc^2"]);
    const blocks = find(hast, "div").filter((d) => classes(d).includes("sh-math-block"));
    expect(blocks.map((d) => d.properties.dataTex)).toEqual(["\\frac{a}{b}", "x^2"]);
    expect(JSON.stringify(hast)).toContain("Costs $5 and $10, and ");
    expect(find(hast, "math")).toHaveLength(3);
    expect(problems).toEqual([]);
  });

  it("reports a formula KaTeX can't read, and still shows it", () => {
    const { hast, problems } = renderMarkdown("Broken: $$\\frac{a$$", ctx);
    expect(problems[0]).toMatch(/^line 1: math: /);
    expect(JSON.stringify(hast)).toContain("katex-error");
  });

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

  it("gives a tab its label and an optional tone", () => {
    const md = ["::::tabs", ":::tab[Ideas]", "A", ":::", ':::tab[Suggestions]{tone="good"}', "B", ":::", "::::"];
    const { hast, problems } = renderMarkdown(md.join("\n"), ctx);
    expect(find(hast, "sh-tab").map((t) => [t.properties.label, t.properties.tone])).toEqual([
      ["Ideas", undefined],
      ["Suggestions", "good"],
    ]);
    expect(problems).toEqual([]);
    const pink = ["::::tabs", ':::tab[X]{tone="pink"}', "A", ":::", "::::"].join("\n");
    expect(renderMarkdown(pink, ctx).problems[0]).toContain("tone");
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

  it("gives roadmap milestones a status from their tasks, unless they say one, and counts the tasks", () => {
    const md = [
      "::::roadmap",
      ':::milestone[Research]{version="0.1"}',
      "- [x] Read\n- [x] Ask",
      ":::",
      ':::milestone[Prototype]{when="May" goal="five people tried it"}',
      "What it is.\n\n- [x] Build\n- [ ] Test",
      ":::",
      ":::milestone[Launch]",
      "- [ ] Post",
      ":::",
      ':::milestone[Sequel]{status="later"}',
      ":::",
      "::::",
    ].join("\n");
    const { hast, problems } = renderMarkdown(md, ctx);
    expect(problems).toEqual([]);
    expect(find(hast, "sh-roadmap-milestone").map((m) => m.properties)).toEqual([
      { title: "Research", version: "0.1", status: "done", done: "2", total: "2" },
      { title: "Prototype", when: "May", goal: "five people tried it", status: "now", done: "1", total: "2" },
      { title: "Launch", status: "next", done: "0", total: "1" },
      { title: "Sequel", status: "later", done: "0", total: "0" },
    ]);
  });

  it("reports a roadmap with stray content, two nows, or a milestone outside one", () => {
    const md = [
      "::::roadmap",
      "Loose text",
      ':::milestone[A]{status="now"}',
      ":::",
      ':::milestone[B]{status="now"}',
      ":::",
      "::::",
      "",
      ":::milestone[Alone]",
      ":::",
    ].join("\n");
    const { problems } = renderMarkdown(md, ctx);
    expect(problems).toEqual([
      'line 1: roadmap: put all content inside ":::milestone[Name]" blocks (and use "::::roadmap" outside)',
      "line 1: roadmap: only one milestone can be now",
      'line 9: milestone: put it inside a "::::roadmap" block',
    ]);
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

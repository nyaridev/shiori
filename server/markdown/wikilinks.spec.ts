import type { Element, Root, RootContent } from "hast";
import { describe, expect, it } from "vitest";
import { type PageFile, pageFinder } from "../pages.ts";
import { renderMarkdown } from "./render.ts";

const file = (path: string, title: string): PageFile => ({
  path,
  title,
  file: `pages/${path || "index"}.md`,
  order: 0,
  hidden: false,
});
const pages = [
  file("", "Home"),
  file("plan", "Plan"),
  file("plan/goals", "Goals"),
  file("plan/roadmap", "Roadmap"),
  file("research/audience", "Audience & market"),
  file("notes/goals", "Old goals"),
  file("notes/café", "Café notes"),
];

function render(md: string, pageDir = "plan") {
  const known = new Set(pages.map((p) => p.path));
  return renderMarkdown(md, {
    wikiId: "demo",
    pageDir,
    pageExists: (p) => known.has(p),
    fileExists: () => true,
    findPage: pageFinder(pages, pageDir),
  });
}

function links(node: Root | RootContent): Element[] {
  const out: Element[] = [];
  if (node.type === "element" && node.tagName === "a") out.push(node);
  if ("children" in node) for (const c of node.children) out.push(...links(c));
  return out;
}

const summary = (a: Element) => [
  a.properties.href,
  (a.children[0] as { value: string }).value,
  a.properties.dataMissing === undefined ? "ok" : "missing",
];

describe("wikilinks", () => {
  it("find pages by path, folder, file name and title, and label them with the title", () => {
    const { hast, problems } = render(
      "[[/plan/roadmap]] [[roadmap|the roadmap]] [[audience]] [[Audience & Market]] [[cafe]] [[Home]]",
    );
    expect(links(hast).map(summary)).toEqual([
      ["/w/demo/plan/roadmap", "Roadmap", "ok"],
      ["/w/demo/plan/roadmap", "the roadmap", "ok"],
      ["/w/demo/research/audience", "Audience & market", "ok"],
      ["/w/demo/research/audience", "Audience & market", "ok"],
      ["/w/demo/notes/café", "Café notes", "ok"],
      ["/w/demo", "Home", "ok"],
    ]);
    expect(problems).toEqual([]);
  });

  it("prefers the page's own folder, and reports names that match several pages", () => {
    expect(links(render("[[goals]]", "plan").hast).map(summary)).toEqual([["/w/demo/plan/goals", "Goals", "ok"]]);
    const { problems } = render("Text\n\n[[goals]]", "research");
    expect(problems).toEqual(["line 3: [[goals]] matches several pages (plan/goals, notes/goals); write its path"]);
  });

  it("link to sections, and survive escaped bars in tables", () => {
    const { hast } = render("[[Roadmap#Key Milestones!|dates]]\n\n| a | b |\n|---|---|\n| [[goals\\|our goals]] | 2 |");
    expect(links(hast).map(summary)).toEqual([
      ["/w/demo/plan/roadmap#key-milestones", "dates", "ok"],
      ["/w/demo/plan/goals", "our goals", "ok"],
    ]);
  });

  it("make red links for pages not written yet, without reporting them; broken Markdown links still are", () => {
    const { hast, problems } = render("[[Character Creation]] and [a typo](roadmapp)");
    expect(links(hast).map(summary)).toEqual([
      ["/w/demo/character-creation", "Character Creation", "missing"],
      ["/w/demo/plan/roadmapp", "a typo", "missing"],
    ]);
    expect(problems).toEqual(['line 1: broken link "roadmapp"']);
  });

  it("leave code alone", () => {
    const { hast } = render("`[[goals]]`\n\n```\n[[goals]]\n```");
    expect(links(hast)).toEqual([]);
  });
});

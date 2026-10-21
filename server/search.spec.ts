import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown/render.ts";
import { fold, indexPage, marksIn, type SearchDoc, search, snippet, terms } from "./search.ts";

const ctx = { wikiId: "demo", pageDir: "", pageExists: () => true, fileExists: () => true };

function doc(path: string, title: string, body: string, extra: Partial<SearchDoc> = {}): SearchDoc {
  const { hast } = renderMarkdown(body, ctx);
  return { ...indexPage({ path, title, summary: "", tags: [], hast }), ...extra };
}

const docs = [
  doc(
    "plan/roadmap",
    "Roadmap",
    "Intro text.\n\n## Milestones\n\nShip the prototype in March.\n\n## Risks\n\nScope creep.",
  ),
  doc("research", "Research", "## Sources\n\nForum threads about the roadmap.", { summary: "What we learned" }),
  doc("notes/ideas", "Ideas", ":::stats\n- Café visits: 120 | +5%\n:::\n\n## Backlog\n\nA prototype of the café."),
];

describe("search", () => {
  it("folds case and accents, and keeps track of where each character came from", () => {
    const { folded, from } = fold("Café Œ");
    expect(folded).toBe("cafe œ");
    expect(from[3]).toBe(3);
    expect(terms("  Décision, roadmap  roadmap")).toEqual(["decision", "roadmap"]);
  });

  it("cuts pages into sections at their headings", () => {
    expect(docs[0].sections.map((s) => [s.id, s.heading, s.text])).toEqual([
      [null, "", "Intro text."],
      ["milestones", "Milestones", "Ship the prototype in March."],
      ["risks", "Risks", "Scope creep."],
    ]);
    expect(docs[2].sections[0].text).toContain("Café visits 120 +5%");
  });

  it("ranks title matches first and points to the best section", () => {
    const hits = search(docs, "roadmap");
    expect(hits.map((h) => h.path)).toEqual(["plan/roadmap", "research"]);
    expect(hits[0].titleMarks).toEqual([[0, 7]]);
    expect(hits[1].section).toEqual({ id: "sources", heading: "Sources", marks: [] });
  });

  it("needs every word somewhere in the page, and prefers them in one section", () => {
    expect(search(docs, "prototype march").map((h) => [h.path, h.section?.id])).toEqual([
      ["plan/roadmap", "milestones"],
    ]);
    expect(search(docs, "prototype cafe").map((h) => h.path)).toEqual(["notes/ideas"]);
    expect(search(docs, "prototype zebra")).toEqual([]);
    expect(search(docs, "  ")).toEqual([]);
  });

  it("cuts snippets around the match and marks it in the original text", () => {
    const text = `${"word ".repeat(40)}the Café opens ${"more ".repeat(40)}`;
    const { snippet: s, marks } = snippet(text, ["cafe"]);
    expect(s.startsWith("…")).toBe(true);
    expect(s.endsWith("…")).toBe(true);
    expect(marks.map(([a, b]) => s.slice(a, b))).toEqual(["Café"]);
    expect(marksIn("Roadmap and roadmaps", ["roadmap"])).toEqual([
      [0, 7],
      [12, 19],
    ]);
  });
});

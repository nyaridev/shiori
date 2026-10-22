import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addAnswer, answerCounts, listAnswers } from "./answers.ts";
import { buildCorpus } from "./corpus.ts";
import { listPages } from "./pages.ts";
import { loadWiki, type Wiki } from "./registry.ts";
import { closeAll } from "./threads.ts";

let root: string;
let wiki: Wiki;

const PLAN = [
  "---",
  "title: Plan",
  "questions:",
  "  - id: q1",
  "    text: Which platform first?",
  "    options: [Steam, itch.io, 2]",
  "    due: 2026-11-15",
  "  - id: q2",
  "    text: Who designs the logo?",
  "    status: resolved",
  "    answer: Nari",
  "    decided: 2026-10-20",
  "  - id: q2",
  "    text: A copy",
  "---",
  "::question{id=q1}",
  "",
  "::question{id=q9}",
].join("\n");

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "shiori-q-"));
  mkdirSync(join(root, "pages"));
  writeFileSync(join(root, "wiki.json"), JSON.stringify({ schema: 1, id: "demo", title: "Demo" }));
  writeFileSync(join(root, "cover.svg"), "<svg/>");
  writeFileSync(join(root, "pages", "index.md"), "Home");
  writeFileSync(join(root, "pages", "plan.md"), PLAN);
  const w = loadWiki(root, "local");
  if (!("id" in w)) throw new Error(w.problems.join("; "));
  wiki = w;
});
afterEach(() => {
  closeAll();
  rmSync(root, { recursive: true, force: true });
});

describe("questions", () => {
  it("come from the frontmatter, with placement and id problems reported", () => {
    const plan = buildCorpus(wiki, listPages(wiki)).pages.get("plan");
    expect(plan?.questions.map((q) => [q.id, q.status, q.options, q.answer])).toEqual([
      ["q1", "open", ["Steam", "itch.io", "2"], undefined],
      ["q2", "resolved", [], "Nari"],
      ["q2", "open", [], undefined],
    ]);
    expect(plan?.questions.map((q) => [q.due, q.decided])).toEqual([
      ["2026-11-15", undefined],
      [undefined, "2026-10-20"],
      [undefined, undefined],
    ]);
    expect(plan?.placed.questions).toEqual(["q1", "q9"]);
    expect(plan?.problems).toEqual([
      'frontmatter: questions and suggestions: "q2" is used twice',
      '::question{id=q9}: there\'s no question or suggestion "q9" in the frontmatter',
    ]);
  });

  it("take suggestions too, after the questions, placed with ::suggestion and counted against settings.json", () => {
    const lines = ["---", "title: Ideas", "questions:", "  - id: q1", "    text: Which first?", "suggestions:"];
    for (const n of [1, 2, 3]) lines.push(`  - id: s${n}`, `    text: Add thing ${n}?`, "    options: [Yes, No]");
    lines.push("---", "::suggestion{id=s2}");
    writeFileSync(join(root, "pages", "ideas.md"), lines.join("\n"));
    writeFileSync(join(root, "settings.json"), JSON.stringify({ maxQuestions: 6, maxSuggestions: 2 }));
    const w = loadWiki(root, "local");
    if (!("id" in w)) throw new Error(w.problems.join("; "));
    expect(w.settings).toEqual({ maxQuestions: 6, maxSuggestions: 2 });
    const ideas = buildCorpus(w, listPages(w)).pages.get("ideas");
    expect(ideas?.questions.map((q) => [q.kind, q.id])).toEqual([
      ["question", "q1"],
      ["suggestion", "s1"],
      ["suggestion", "s2"],
      ["suggestion", "s3"],
    ]);
    expect(ideas?.placed.questions).toEqual(["s2"]);
    expect(ideas?.problems).toEqual([
      "frontmatter: 3 open suggestions, more than the 2 settings.json allows; decide or drop some",
    ]);
  });

  it("read settings.json, report one that isn't right, and allow 6 and 6 without one", () => {
    expect(wiki.settings).toEqual({ maxQuestions: 6, maxSuggestions: 6 });
    writeFileSync(join(root, "settings.json"), JSON.stringify({ maxQuestions: -1, extra: true }));
    const w = loadWiki(root, "local");
    expect(w.problems.some((p) => p.startsWith("settings.json:"))).toBe(true);
  });

  it("store answers in the wiki's database, and count them per question", () => {
    addAnswer(root, "plan", "q1", "Steam", "Most of our players are there");
    addAnswer(root, "plan", "q1", null, "Both, a week apart?", { guest: "g1", name: "Ana" });
    addAnswer(root, "", "q5", "x", "");
    expect(listAnswers(root, { page: "plan" }).map((a) => [a.question, a.choice, a.body])).toEqual([
      ["q1", "Steam", "Most of our players are there"],
      ["q1", null, "Both, a week apart?"],
    ]);
    expect(listAnswers(root)).toHaveLength(3);
    expect(answerCounts(root).get("plan#q1")).toBe(2);
  });

  it("change a person's answer when they answer again, and keep everyone else's", () => {
    const first = addAnswer(root, "plan", "q1", "Steam", "");
    addAnswer(root, "plan", "q1", "itch.io", "", { guest: "g1", name: "Ana" });
    const changed = addAnswer(root, "plan", "q1", "itch.io", "Changed my mind");
    expect(changed.id).toBe(first.id);
    expect(changed.updatedAt && changed.updatedAt >= (first.updatedAt ?? "")).toBe(true);
    expect(listAnswers(root, { page: "plan" }).map((a) => [a.author, a.choice, a.body])).toEqual([
      ["user", "itch.io", "Changed my mind"],
      ["guest", "itch.io", ""],
    ]);
  });
});

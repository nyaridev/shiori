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
  "  - id: q2",
  "    text: Who designs the logo?",
  "    status: resolved",
  "    answer: Nari",
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
    expect(plan?.placed.questions).toEqual(["q1", "q9"]);
    expect(plan?.problems).toEqual([
      'frontmatter: questions: "q2" is used twice',
      '::question{id=q9}: there\'s no question "q9" in the frontmatter',
    ]);
  });

  it("store answers in the wiki's database, and count them per question", () => {
    addAnswer(root, "plan", "q1", "Steam", "Most of our players are there");
    addAnswer(root, "plan", "q1", null, "Both, a week apart?");
    addAnswer(root, "", "q5", "x", "");
    expect(listAnswers(root, { page: "plan" }).map((a) => [a.question, a.choice, a.body])).toEqual([
      ["q1", "Steam", "Most of our players are there"],
      ["q1", null, "Both, a week apart?"],
    ]);
    expect(listAnswers(root)).toHaveLength(3);
    expect(answerCounts(root).get("plan#q1")).toBe(2);
  });
});

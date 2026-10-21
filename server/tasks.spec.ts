import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildCorpus } from "./corpus.ts";
import { listPages } from "./pages.ts";
import { loadWiki } from "./registry.ts";

let root: string;
afterEach(() => rmSync(root, { recursive: true, force: true }));

const PLAN = [
  "---",
  "title: Plan",
  "---",
  "- [x] Before any heading",
  "",
  "## This week",
  "",
  "- [x] Set up the wiki",
  "- [ ] Write the **pitch**",
  "  - [ ] Nested step",
  "- Not a task",
  "",
  "### Later",
  "",
  "- [ ] A loose task",
  "",
  "- [ ] Another loose one",
  "",
  "::::tabs",
  ":::tab[Launch]",
  "- [ ] Inside a tab",
  ":::",
  "::::",
].join("\n");

describe("tasks", () => {
  it("collect every checkbox with its page and heading", () => {
    root = mkdtempSync(join(tmpdir(), "shiori-tasks-"));
    mkdirSync(join(root, "pages"));
    writeFileSync(join(root, "wiki.json"), JSON.stringify({ schema: 1, id: "demo", title: "Demo" }));
    writeFileSync(join(root, "cover.svg"), "<svg/>");
    writeFileSync(join(root, "pages", "index.md"), "Home, no tasks.");
    writeFileSync(join(root, "pages", "plan.md"), PLAN);
    const w = loadWiki(root, "local");
    if (!("id" in w)) throw new Error(w.problems.join("; "));

    const { tasks } = buildCorpus(w, listPages(w));
    expect(tasks.map((t) => [t.page.path, t.section?.heading ?? null, t.text, t.done])).toEqual([
      ["plan", null, "Before any heading", true],
      ["plan", "This week", "Set up the wiki", true],
      ["plan", "This week", "Write the pitch", false],
      ["plan", "This week", "Nested step", false],
      ["plan", "Later", "A loose task", false],
      ["plan", "Later", "Another loose one", false],
      ["plan", "Later", "Inside a tab", false],
    ]);
    expect(tasks[1].section?.id).toBe("this-week");
  });
});

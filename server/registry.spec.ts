import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildNav, listPages } from "./pages.ts";
import { discover, writeLinks } from "./registry.ts";
import { closeAll, createThread, listThreads, waitingForAgent } from "./threads.ts";

let app: string;

function wiki(root: string, id: string, extra: Record<string, unknown> = {}) {
  mkdirSync(join(root, "pages", "systems"), { recursive: true });
  writeFileSync(join(root, "wiki.json"), JSON.stringify({ schema: 1, id, title: id.toUpperCase(), ...extra }));
  writeFileSync(join(root, "cover.svg"), "<svg/>");
  writeFileSync(join(root, "pages", "index.md"), "Home");
  writeFileSync(join(root, "pages", "systems", "index.md"), "---\ntitle: Systems\n---\n");
  writeFileSync(join(root, "pages", "systems", "combat.md"), "---\ntitle: Combat\norder: 2\n---\n");
  writeFileSync(join(root, "pages", "systems", "lanterns.md"), "---\ntitle: Lanterns\norder: 1\n---\n");
}

beforeEach(() => {
  app = mkdtempSync(join(tmpdir(), "loredeck-"));
  mkdirSync(join(app, "wikis", "_template"), { recursive: true });
});
afterEach(() => {
  closeAll();
  rmSync(app, { recursive: true, force: true });
});

describe("discover", () => {
  it("finds local and linked wikis, skips _template, reports broken ones", () => {
    wiki(join(app, "wikis", "alpha"), "alpha");
    wiki(join(app, "elsewhere"), "beta", { order: -1 });
    mkdirSync(join(app, "wikis", "broken"));
    writeLinks(app, [join(app, "elsewhere"), join(app, "gone")]);

    const { wikis, broken } = discover(app);
    expect(wikis.map((w) => [w.id, w.source])).toEqual([
      ["beta", "linked"],
      ["alpha", "local"],
    ]);
    expect(broken.map((b) => b.problems[0])).toEqual(["wiki.json: missing", "folder not found"]);
  });

  it("rejects duplicate ids and bad themes", () => {
    wiki(join(app, "wikis", "a"), "same");
    wiki(join(app, "wikis", "b"), "same");
    writeFileSync(join(app, "wikis", "a", "theme.json"), JSON.stringify({ radius: "huge" }));
    const { wikis, broken } = discover(app);
    expect(wikis).toHaveLength(1);
    expect(wikis[0].problems[0]).toMatch(/^theme.json: radius/);
    expect(broken[0].problems).toEqual(['duplicate id "same"']);
  });
});

describe("pages and threads", () => {
  it("builds the sidebar in order and keeps comments in the wiki's data folder", () => {
    wiki(join(app, "wikis", "alpha"), "alpha");
    const [w] = discover(app).wikis;
    const nav = buildNav(listPages(w));
    expect(nav.map((n) => n.title)).toEqual(["Systems"]);
    expect(nav[0].children.map((n) => n.title)).toEqual(["Lanterns", "Combat"]);

    createThread(w.root, "systems/combat", { exact: "x", prefix: "", suffix: "" }, "Why?");
    const threads = listThreads(w.root, { page: "systems/combat" });
    expect(threads).toHaveLength(1);
    expect(waitingForAgent(threads)).toHaveLength(1);
    expect(listThreads(w.root, { page: "" })).toHaveLength(0);
  });
});

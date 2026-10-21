import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fillKit, listKits, newPage } from "./kits.ts";
import { listPages, renderPage } from "./pages.ts";
import { loadWiki, type Wiki } from "./registry.ts";
import { closeAll } from "./threads.ts";

/** The real app folder, for the template's kits. */
const APP = resolve(import.meta.dirname, "..");
let root: string;
let wiki: Wiki;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "shiori-kits-"));
  mkdirSync(join(root, "pages", "weapons"), { recursive: true });
  writeFileSync(join(root, "wiki.json"), JSON.stringify({ schema: 1, id: "demo", title: "Demo" }));
  writeFileSync(join(root, "cover.svg"), "<svg/>");
  writeFileSync(join(root, "pages", "index.md"), "Home");
  writeFileSync(join(root, "pages", "decision-log.md"), "---\ntitle: Decision log\n---\n");
  wiki = loadWiki(root, "local") as Wiki;
});
afterEach(() => {
  closeAll();
  rmSync(root, { recursive: true, force: true });
});

const problemsOf = (path: string) => renderPage(wiki, listPages(wiki), path)?.problems;

describe("kits", () => {
  it("come from the wiki first, then the template", () => {
    mkdirSync(join(root, "kits"));
    writeFileSync(join(root, "kits", "item.md"), '---\nkit: "Our own item"\ntitle: "{{page.title}}"\n---\n');
    writeFileSync(join(root, "kits", "boss.md"), '---\nkit: "A boss fight"\n---\n');
    const kits = listKits(wiki, APP);
    expect(kits.find((k) => k.name === "item")).toMatchObject({ source: "wiki", description: "Our own item" });
    expect(kits.find((k) => k.name === "boss")?.source).toBe("wiki");
    expect(kits.filter((k) => k.source === "template").map((k) => k.name)).toEqual(
      expect.arrayContaining(["character", "decision", "feature", "place", "research"]),
    );
  });

  it("fill in the title and date, and drop the kit's description", () => {
    const text = fillKit(
      '---\nkit: "x"\ntitle: "{{page.title}}"\n---\nAbout {{page.title}} on {{page.date}}.\n',
      'The "Big" one',
      "2026-10-21",
    );
    expect(text).toBe('---\ntitle: "The \\"Big\\" one"\n---\nAbout The "Big" one on 2026-10-21.\n');
  });

  it("make pages every built-in kit renders without problems", () => {
    for (const kit of listKits(wiki, APP)) {
      const file = newPage(wiki, APP, `kits-test/${kit.name}`, { kit: kit.name });
      expect(readFileSync(join(root, file), "utf8")).not.toMatch(/\{\{|^kit:/m);
      expect(problemsOf(`kits-test/${kit.name}`), kit.name).toEqual([]);
    }
  });

  it("make a bare page, a section page, and refuse what exists or isn't a kit", () => {
    expect(newPage(wiki, APP, "weapons/iron-sword")).toBe("pages/weapons/iron-sword.md");
    expect(readFileSync(join(root, "pages/weapons/iron-sword.md"), "utf8")).toBe(
      '---\ntitle: "Iron sword"\nsummary: ""\n---\n\n',
    );
    expect(newPage(wiki, APP, "weapons", { title: "Weapons" })).toBe("pages/weapons/index.md");
    expect(newPage(wiki, APP, "armor", { section: true })).toBe("pages/armor/index.md");
    expect(() => newPage(wiki, APP, "weapons/iron-sword")).toThrow(/already exists/);
    expect(() => newPage(wiki, APP, "x", { kit: "nope" })).toThrow(/No kit "nope". Kits: character/);
    expect(() => newPage(wiki, APP, "")).toThrow(/home page/);
  });
});

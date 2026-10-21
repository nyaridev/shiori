import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addAnswer, listAnswers } from "./answers.ts";
import { listPages, renderPage } from "./pages.ts";
import { loadWiki, type Wiki } from "./registry.ts";
import { applyRename, pagePathOf, planRename } from "./rename.ts";
import { closeAll, createThread, listThreads } from "./threads.ts";

let root: string;
let wiki: Wiki;

function write(rel: string, body: string) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), body);
}
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "shiori-rename-"));
  write("wiki.json", JSON.stringify({ schema: 1, id: "demo", title: "Demo" }));
  write("cover.svg", "<svg/>");
  write("assets/sword.png", "png");
  write("pages/index.md", "See [the sword](weapons/iron), [[weapons/iron]], [[Iron sword]] and :page[iron].\n");
  write("pages/weapons/index.md", "---\ntitle: Weapons\n---\nOur [iron](iron) and [steel](./steel.md#forging).\n");
  write(
    "pages/weapons/iron.md",
    [
      "---",
      "title: Iron sword",
      'image: "sword-sketch.png"',
      "related:",
      "  - to: weapons/steel",
      "infobox:",
      '  Upgrade: "[[weapons/steel|Steel]]"',
      "---",
      "Better: [steel](steel). Art: ![sketch](sword-sketch.png) and ![main](/assets/sword.png).",
      "",
      "```md",
      "[[weapons/iron]] and [x](iron) stay as code",
      "```",
      "",
      "| Link |",
      "|---|",
      "| [[weapons/steel\\|Steel]] |",
    ].join("\n"),
  );
  write("pages/weapons/sword-sketch.png", "png");
  write("pages/weapons/steel.md", "---\ntitle: Steel sword\n---\nWorse: [[iron]]. Up: [weapons](/weapons).\n");
  write("pages/armor/index.md", "---\ntitle: Armor\n---\nNot [[weapons/iron]] but [[Weapons]].\n");
  wiki = loadWiki(root, "local") as Wiki;
});
afterEach(() => {
  closeAll();
  rmSync(root, { recursive: true, force: true });
});

const problems = () => listPages(wiki).flatMap((p) => renderPage(wiki, listPages(wiki), p.path)?.problems ?? []);

describe("pagePathOf", () => {
  it("reads a page however it's typed", () => {
    expect(["weapons/iron", "/weapons/iron/", "pages/weapons/iron.md", "weapons\\iron"].map(pagePathOf)).toEqual(
      Array(4).fill("weapons/iron"),
    );
    expect(pagePathOf("weapons/index.md")).toBe("weapons");
  });
});

describe("renaming a page", () => {
  it("moves it, fixes every link to and from it, and moves its comments", () => {
    createThread(root, "weapons/iron", { exact: "Better", prefix: "", suffix: "" }, "Why better?");
    addAnswer(root, "weapons/iron", "q1", null, "Yes");
    createThread(root, "weapons/steel", { exact: "", prefix: "", suffix: "" }, "Stays");
    expect(problems()).toEqual([]);

    const plan = planRename(wiki, "weapons/iron", "armory/iron-sword");
    expect(plan.moves).toEqual([{ from: "pages/weapons/iron.md", to: "pages/armory/iron-sword.md" }]);
    expect(applyRename(wiki, plan)).toEqual({ threads: 1, answers: 1 });

    expect(existsSync(join(root, "pages/weapons/iron.md"))).toBe(false);
    expect(read("pages/index.md")).toBe(
      "See [the sword](/armory/iron-sword), [[armory/iron-sword]], [[Iron sword]] and :page[armory/iron-sword].\n",
    );
    // `[[Iron sword]]` finds the page by title and stays; `:page[iron]` found it by file name, which changed.
    expect(read("pages/weapons/index.md")).toBe(
      "---\ntitle: Weapons\n---\nOur [iron](/armory/iron-sword) and [steel](./steel.md#forging).\n",
    );
    const moved = read("pages/armory/iron-sword.md");
    expect(moved).toContain('image: "/pages/weapons/sword-sketch.png"');
    expect(moved).toContain("  - to: weapons/steel");
    expect(moved).toContain("Better: [steel](/weapons/steel). Art: ![sketch](/pages/weapons/sword-sketch.png)");
    expect(moved).toContain("![main](/assets/sword.png)");
    expect(moved).toContain("[[weapons/iron]] and [x](iron) stay as code");
    expect(moved).toContain("| [[weapons/steel\\|Steel]] |");
    expect(read("pages/weapons/steel.md")).toBe(
      "---\ntitle: Steel sword\n---\nWorse: [[armory/iron-sword]]. Up: [weapons](/weapons).\n",
    );
    expect(read("pages/armor/index.md")).toBe("---\ntitle: Armor\n---\nNot [[armory/iron-sword]] but [[Weapons]].\n");

    wiki = loadWiki(root, "local") as Wiki;
    expect(problems()).toEqual([]);
    expect(listThreads(root).map((t) => t.page)).toEqual(["armory/iron-sword", "weapons/steel"]);
    expect(listAnswers(root)[0].page).toBe("armory/iron-sword");
  });

  it("moves a section with everything under it, keeping links inside it as they are", () => {
    createThread(root, "weapons/steel", { exact: "", prefix: "", suffix: "" }, "Hm");
    const plan = planRename(wiki, "weapons", "gear/blades");
    expect(plan.moves).toEqual([{ from: "pages/weapons", to: "pages/gear/blades" }]);
    expect([...plan.paths]).toEqual([
      ["weapons", "gear/blades"],
      ["weapons/iron", "gear/blades/iron"],
      ["weapons/steel", "gear/blades/steel"],
    ]);
    applyRename(wiki, plan);
    expect(read("pages/gear/blades/index.md")).toContain("Our [iron](iron) and [steel](./steel.md#forging).");
    expect(read("pages/gear/blades/iron.md")).toContain('image: "sword-sketch.png"');
    expect(read("pages/gear/blades/steel.md")).toContain("Up: [weapons](/gear/blades).");
    expect(read("pages/armor/index.md")).toBe("---\ntitle: Armor\n---\nNot [[gear/blades/iron]] but [[Weapons]].\n");
    wiki = loadWiki(root, "local") as Wiki;
    expect(problems()).toEqual([]);
    expect(listThreads(root)[0].page).toBe("gear/blades/steel");
  });

  it("refuses what it can't do", () => {
    expect(() => planRename(wiki, "nope", "x")).toThrow(/No page "nope"/);
    expect(() => planRename(wiki, "weapons/iron", "weapons/steel")).toThrow(/already exists/);
    expect(() => planRename(wiki, "weapons/iron", "armor")).toThrow(/already exists/);
    expect(() => planRename(wiki, "", "x")).toThrow(/home page/);
    expect(() => planRename(wiki, "weapons", "weapons/old")).toThrow(/into itself/);
  });
});

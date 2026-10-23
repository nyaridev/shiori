// The public wiki (ADR-0011): only public pages go in, and nothing private reaches any of its files.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildCorpus } from "../corpus.ts";
import { listPages } from "../pages.ts";
import { loadWiki, type Wiki } from "../registry.ts";
import { closeAll } from "../threads.ts";
import { buildEdition, type Edition, readEditionFile } from "./edition.ts";
import { zipEdition } from "./output.ts";
import { globMatch, isPrivateFile } from "./rules.ts";

let root: string;

function write(rel: string, text: string) {
  const full = join(root, rel);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, text);
}

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><rect width="4" height="4"/></svg>';

function sampleWiki(publicSettings: object = {}): Wiki {
  write(
    "wiki.json",
    JSON.stringify({
      schema: 1,
      id: "game",
      title: "Game",
      tagline: "the game's wiki",
      public: {
        pages: ["mobs/**", "items"],
        front: "about",
        privateFields: ["Script"],
        privateFiles: ["assets/concepts/**"],
        ...publicSettings,
      },
    }),
  );
  write("cover.svg", SVG);
  write("assets/rat.svg", SVG);
  write("assets/concepts/boss.svg", SVG);
  write("assets/private/next.svg", SVG);
  write("pages/index.md", "Home with ::recent-changes and plans.");
  write("pages/roadmap.md", "---\npanel: true\n---\nThe roadmap.");
  write("pages/about.md", "The game, in short. The end :spoiler[was a dream].\n\n:::private\nTeam note.\n:::\n");
  write("pages/notes.md", "---\ntitle: Notes\n---\nSecret notes.");
  write("pages/items.md", "---\ntitle: Items\n---\nAll items. [[Cheese]] heals.");
  write("pages/cheese.md", "---\ntitle: Cheese\npublic: true\nimage: /assets/private/next.svg\n---\nCheese.");
  write("pages/mobs/index.md", "---\ntitle: Mobs\n---\n::children");
  write(
    "pages/mobs/rat.md",
    [
      "---",
      "title: Rat",
      "summary: A small rat.",
      "image: /assets/rat.svg",
      "infobox:",
      "  Health: 20",
      "  Script: RatAI.lua",
      "  Speed: Fast",
      "private: [Speed]",
      "questions:",
      "  - id: q1",
      "    text: Bigger?",
      "---",
      "Rats live in [[Notes]] and near [[Cheese]]. Spawns :private[every 90 seconds] often.",
      "",
      "## Looks",
      "",
      "![Rat](/assets/rat.svg) ![Boss](/assets/concepts/boss.svg)",
      "",
      "## Code",
      "",
      "```lua",
      "RatAI.start()",
      "```",
      "",
      "## Drops",
      "",
      "| Item | Chance | Script |",
      "|---|---|---|",
      "| Cheese | 40% | DropCheese |",
      "",
      "::question{id=q1}",
      "",
      "## Story",
      "",
      ":::spoiler[The ending]",
      "The rat was the king.",
      ":::",
    ].join("\n"),
  );
  write("pages/mobs/boss.md", "---\ntitle: Boss\npublic: false\n---\nThe secret boss.");
  const w = loadWiki(root, "local");
  if (!("id" in w)) throw new Error(w.problems.join("; "));
  return w;
}

const build = (w: Wiki) => {
  const pages = listPages(w);
  return buildEdition(w, pages, buildCorpus(w, pages));
};

/** Every text file of the edition, joined: what a reader could ever see. */
const allText = (e: Edition) =>
  [...e.files.values()].map((f) => ("body" in f && typeof f.body === "string" ? f.body : "")).join("\n");

const page = (e: Edition, name: string) => {
  const f = e.files.get(name);
  return f && "body" in f ? String(f.body) : "";
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "shiori-public-"));
});
afterEach(() => {
  closeAll();
  rmSync(root, { recursive: true, force: true });
});

describe("what goes public", () => {
  it("matches page paths with * and **", () => {
    expect(globMatch("mobs/**", "mobs")).toBe(true);
    expect(globMatch("mobs/**", "mobs/forest/rat")).toBe(true);
    expect(globMatch("mobs/*", "mobs/forest/rat")).toBe(false);
    expect(globMatch("items", "items/sword")).toBe(false);
    expect(globMatch("**/rat", "mobs/forest/rat")).toBe(true);
  });

  it("keeps private folders, names and listed pictures home", () => {
    const s = { privateFiles: ["assets/wip/**"] } as never;
    expect(isPrivateFile(s, "assets/private/a.png")).toBe(true);
    expect(isPrivateFile(s, "assets/_private/a.png")).toBe(true);
    expect(isPrivateFile(s, "assets/boss.private.png")).toBe(true);
    expect(isPrivateFile(s, "assets/wip/x/a.png")).toBe(true);
    expect(isPrivateFile(s, "assets/rat.png")).toBe(false);
  });

  it("lists the public pages, never the home page, panels or pages that opt out", () => {
    const e = build(sampleWiki());
    expect(e.report.pages.map((p) => p.path)).toEqual(["cheese", "items", "mobs", "mobs/rat"]);
    expect(e.report.front?.path).toBe("about");
    expect([...e.files.keys()]).toEqual(
      expect.arrayContaining(["index.html", "items.html", "mobs.html", "mobs/rat.html", "cheese.html", "404.html"]),
    );
    for (const name of ["notes.html", "roadmap.html", "mobs/boss.html", "about.html"])
      expect(e.files.has(name)).toBe(false);
  });

  it("makes nothing public without wiki.json's public or a page's public: true", () => {
    sampleWiki();
    write("wiki.json", JSON.stringify({ schema: 1, id: "game", title: "Game" }));
    const bare = loadWiki(root, "local") as Wiki;
    expect(build(bare).report.pages.map((p) => p.path)).toEqual(["cheese"]);
  });
});

describe("nothing private in any file", () => {
  it("leaves out private blocks, words, code, questions, fields and pictures", () => {
    const e = build(sampleWiki());
    const text = allText(e);
    for (const secret of [
      "Team note",
      "every 90 seconds",
      "RatAI",
      "Bigger?",
      "DropCheese",
      "boss.svg",
      "next.svg",
      "Secret notes",
      "The secret boss",
      "recent-changes",
    ])
      expect(text).not.toContain(secret);
    const rat = page(e, "mobs/rat.html");
    expect(rat).toContain("<dt>Health</dt>");
    expect(rat).not.toContain("<dt>Script</dt>");
    expect(rat).not.toContain("<dt>Speed</dt>");
    // The Code section had only code in it, so its heading goes too.
    expect(rat).not.toContain(">Code<");
    expect(e.report.removed).toMatchObject({ private: 2, code: 1, questions: 1 });
    expect(e.report.removed.fields).toBeGreaterThanOrEqual(3);
    expect(e.report.removed.pictures).toBeGreaterThanOrEqual(2);
  });

  it("keeps links to public pages and turns the rest into text", () => {
    const rat = page(build(sampleWiki()), "mobs/rat.html");
    expect(rat).toMatch(/<a href="\.\.\/cheese\.html"[^>]*>Cheese<\/a>/);
    expect(rat).toMatch(/Rats live in Notes and near/);
    expect(rat).not.toContain("notes.html");
  });

  it("brings only public pictures along, as their own files", () => {
    const e = build(sampleWiki());
    const media = [...e.files.keys()].filter((k) => k.startsWith("_media/"));
    expect(media).toEqual(["_media/assets/rat.svg"]);
    expect(page(e, "mobs/rat.html")).toContain('src="../_media/assets/rat.svg"');
  });

  it("indexes only public text for search", () => {
    const search = page(build(sampleWiki()), "_site/search.js");
    expect(search).toContain("Rat");
    expect(search).not.toContain("Secret notes");
    expect(search).not.toContain("every 90 seconds");
  });

  it("keeps code when the wiki says so", () => {
    const rat = page(build(sampleWiki({ code: true })), "mobs/rat.html");
    expect(rat).toContain('class="sh-code"');
    expect(rat).toContain("RatAI.");
  });
});

describe("the site", () => {
  it("has a front page with the chosen text, spoilers and a card for each section", () => {
    const e = build(sampleWiki());
    const front = page(e, "index.html");
    expect(front).toContain("The game, in short.");
    expect(front).toContain('class="sh-spoiler-inline"');
    expect(front).toContain('id="pw-spoilers"');
    expect(front).toContain('href="mobs.html"');
    expect(front).toContain("Where to start");
  });

  it("links every page relative to itself, so it works from a folder", () => {
    const rat = page(build(sampleWiki()), "mobs/rat.html");
    expect(rat).toMatch(/href="\.\.\/_site\/style\.css\?v=[0-9a-f]{10}"/);
    expect(rat).toContain('href="../index.html"');
    expect(rat).not.toMatch(/(href|src)="\/(?!\/)/);
  });

  it("names its own files with a hash of what's in them, so browsers never keep old ones", () => {
    const a = page(build(sampleWiki()), "index.html");
    const b = page(build(sampleWiki({ title: "Another game" })), "index.html");
    const version = (s: string) => /style\.css\?v=(\w+)/.exec(s)?.[1];
    expect(version(a)).toBeTruthy();
    expect(a).toContain(`site.js?v=${version(a)}`);
    expect(version(a)).not.toBe(version(b));
  });

  it("speaks the wiki's language when it gives its words", () => {
    const e = build(sampleWiki({ lang: "pl", words: { start: "Od czego zacząć", search: "Szukaj w wiki…" } }));
    const front = page(e, "index.html");
    expect(front).toContain('lang="pl"');
    expect(front).toContain("Od czego zacząć");
    expect(front).toContain('placeholder="Szukaj w wiki…"');
  });

  it("reports what names nothing", () => {
    const e = build(sampleWiki({ pages: ["mobs/**", "quests/**"], front: "Nowhere" }));
    expect(e.report.problems).toEqual(
      expect.arrayContaining(['public.front: there\'s no page "Nowhere"', 'public.pages: "quests/**" names no page']),
    );
  });

  it("zips into a folder named for the wiki", async () => {
    const w = sampleWiki();
    const e = build(w);
    const zip = await zipEdition(w, e);
    expect(zip.subarray(0, 4).toString("hex")).toBe("504b0304");
    // The first entry is a real file whose content comes back out.
    const nameLength = zip.readUInt16LE(26);
    const name = zip.subarray(30, 30 + nameLength).toString("utf8");
    expect(name.startsWith("game/")).toBe(true);
    const size = zip.readUInt32LE(18);
    const method = zip.readUInt16LE(8);
    const data = zip.subarray(30 + nameLength, 30 + nameLength + size);
    const body = method === 8 ? inflateRawSync(data) : data;
    const expected = await readEditionFile(w, e.files.get(name.slice("game/".length)) as never);
    expect(Buffer.from(body).equals(Buffer.from(expected as string | Uint8Array))).toBe(true);
  });
});

describe("the wiki's own layout (ADR-0012)", () => {
  const frontLayout = (blocks: Record<string, unknown>) =>
    write("layouts/front.json", JSON.stringify({ areas: Object.keys(blocks).map((a) => [a]), blocks }));

  it("puts the frame's presets on the body, and the footer's text as text", () => {
    const e = build(
      sampleWiki({ frame: { width: "wide", sidebar: "none", cards: { picture: "cover" }, footer: "Fan <b>made</b>" } }),
    );
    const rat = page(e, "mobs/rat.html");
    expect(rat).toContain(
      '<body class="pw" data-width="wide" data-sidebar="none" data-backdrop="slate" data-cards="cover">',
    );
    expect(rat).toContain("Fan &#x3C;b>made&#x3C;/b>");
    expect(e.report.layout.frame).toEqual(["width: wide", "sidebar: none", "cards: cover", "footer text"]);
  });

  it("takes a public picture as the backdrop, and never a private one", () => {
    const style = (e: Edition) => page(e, "_site/style.css");
    const ok = build(sampleWiki({ frame: { backdrop: "/assets/rat.svg" } }));
    expect(style(ok)).toContain('--pw-backdrop-image:url("../_media/assets/rat.svg")');
    expect(page(ok, "index.html")).toContain('data-backdrop="picture"');

    const hidden = build(sampleWiki({ frame: { backdrop: "/assets/private/next.svg" } }));
    expect(style(hidden)).not.toContain("--pw-backdrop-image:url(");
    expect(page(hidden, "index.html")).toContain('data-backdrop="slate"');
    expect([...hidden.files.keys()].some((f) => f.includes("private"))).toBe(false);
    expect(hidden.report.problems).toContain('public.frame.backdrop: "/assets/private/next.svg" is missing or private');
  });

  it("draws its own front page, and never features, lists or counts a private page", () => {
    write("pages/about.md", "The game, in short.\n\n## Team\n\n:::private\nTeam plans for the sequel.\n:::\n");
    frontLayout({
      title: { type: "title" },
      team: { type: "section", heading: "Team" },
      featured: { type: "pages", title: "Featured", pages: ["mobs/rat", "notes", "mobs/boss"] },
      recent: { type: "recent" },
      stats: { type: "stats" },
      search: { type: "search" },
    });
    const e = build(sampleWiki());
    const front = page(e, "index.html");
    expect(front).toContain("Featured");
    expect(front).toContain('href="mobs/rat.html"');
    expect(front).toContain("data-pw-search");
    // The private section, page and boss stay out, and the section's area closes up.
    for (const secret of ["Team plans", "notes.html", "boss.html", "Secret notes", 'data-block="section"'])
      expect(front).not.toContain(secret);
    expect(e.report.problems).toEqual(
      expect.arrayContaining([
        'layouts/front.json: "notes" isn\'t a public page',
        'layouts/front.json: "mobs/boss" isn\'t a public page',
      ]),
    );
    expect(e.report.layout.front).toBe(true);
  });

  it("arranges a page by a layout made for the public wiki, without its app-only blocks", () => {
    write(
      "layouts/mob.json",
      JSON.stringify({
        public: true,
        areas: [
          ["design", "facts"],
          ["body", "facts"],
          ["questions", "questions"],
        ],
        blocks: {
          design: { type: "design" },
          facts: { type: "infobox" },
          body: { type: "body" },
          questions: { type: "questions", title: "Open questions" },
        },
      }),
    );
    const rat = (text: string) => write("pages/mobs/rat.md", text);
    const w = sampleWiki();
    rat(readFileSync(join(root, "pages/mobs/rat.md"), "utf8").replace("title: Rat\n", "title: Rat\nlayout: mob\n"));
    const e = build(w);
    const html = page(e, "mobs/rat.html");
    expect(html).toContain('class="sh-layout" data-layout="mob"');
    expect(html).toContain('data-block="infobox"');
    expect(html).toContain("Health");
    for (const secret of ["Bigger?", "Open questions", 'data-block="design"', "RatAI.lua", "every 90 seconds"])
      expect(html).not.toContain(secret);
    expect(e.report.layout.pages).toEqual(["mob"]);
  });

  it("leaves a page plain when its layout isn't made for the public wiki", () => {
    write("layouts/mob.json", JSON.stringify({ areas: [["body"]], blocks: { body: { type: "body" } } }));
    const w = sampleWiki();
    write(
      "pages/mobs/rat.md",
      readFileSync(join(root, "pages/mobs/rat.md"), "utf8").replace("title: Rat\n", "title: Rat\nlayout: mob\n"),
    );
    const html = page(build(w), "mobs/rat.html");
    expect(html).not.toContain("sh-layout");
    expect(html).toContain("Rats live in");
  });
});

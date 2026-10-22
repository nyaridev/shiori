import type { Element, Root, RootContent } from "hast";
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./render.ts";
import { type PageRow, pagesMatching, parseDelimited } from "./tables.ts";

const FILES: Record<string, string> = {
  "tables/mobs.csv": 'Name,HP,Damage,Biome\nRat,20,2,Sewer\n"Slime, big",45,5,"Forest"\nWolf,30,8,Forest\n',
  "tables/items.tsv": "Item\tPrice\nSword\t$10\nShield\t$8\n",
  "tables/loot.json": JSON.stringify([
    { name: "Coin", value: 1 },
    { name: "Gem", value: 50, tags: ["rare", "shiny"] },
  ]),
  "data/wiki.db": "not a table",
};

const PAGES: PageRow[] = [
  {
    path: "mobs/rat",
    title: "Rat",
    type: "Mob",
    status: "done",
    tags: ["sewer"],
    fields: { HP: "20", biome: "Sewer" },
  },
  { path: "mobs/wolf", title: "Wolf", type: "Mob", status: "active", fields: { HP: "30", biome: "Forest" } },
  { path: "mobs/boss/king", title: "Rat King", type: "Mob", tags: ["boss"], fields: { HP: "300", Phase: "2" } },
  { path: "items/sword", title: "Sword", type: "Item", fields: { Price: "10" } },
];

const ctx = {
  wikiId: "demo",
  pageDir: "mobs",
  pageExists: (p: string) => PAGES.some((x) => x.path === p),
  fileExists: () => true,
  tables: { readData: (rel: string) => FILES[rel] ?? null, pages: () => PAGES },
};

function find(node: Root | RootContent, tag: string): Element[] {
  const out: Element[] = [];
  if (node.type === "element" && node.tagName === tag) out.push(node);
  if ("children" in node) for (const c of node.children) out.push(...find(c, tag));
  return out;
}
const text = (node: RootContent): string =>
  node.type === "text" ? node.value : "children" in node ? node.children.map(text).join("") : "";
/** The table under the first `sh-table`: its header and rows as text. */
function grid(md: string) {
  const { hast, problems } = renderMarkdown(md, ctx);
  const table = find(hast, "sh-table")[0];
  const rows = table ? find(table, "tr").map((tr) => find(tr, "th").concat(find(tr, "td")).map(text)) : [];
  return { table, rows, problems };
}

describe("parseDelimited", () => {
  it("reads quotes, doubled quotes, line breaks in cells and CRLF", () => {
    expect(parseDelimited('a,b\r\n"x, y","say ""hi"""\n"two\nlines",z', ",")).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
      ["two\nlines", "z"],
    ]);
    expect(parseDelimited("﻿a\tb\n1\t2\n\n", "\t")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("::table from a file", () => {
  it("reads CSV from the page's folder or the wiki root, with its sort and caption", () => {
    const { table, rows, problems } = grid('::table[Mobs]{src="/tables/mobs.csv" sort="-HP" stats}');
    expect(problems).toEqual([]);
    expect(table.properties).toMatchObject({ src: "/tables/mobs.csv", sort: "-HP", stats: "", caption: "Mobs" });
    expect(rows).toEqual([
      ["Name", "HP", "Damage", "Biome"],
      ["Rat", "20", "2", "Sewer"],
      ["Slime, big", "45", "5", "Forest"],
      ["Wolf", "30", "8", "Forest"],
    ]);
    expect(grid('::table{src="../../tables/mobs.csv"}').problems).toEqual([]);
  });

  it("reads TSV and JSON, and keeps the columns asked for", () => {
    expect(grid('::table{src="/tables/items.tsv"}').rows[1]).toEqual(["Sword", "$10"]);
    const json = grid('::table{src="/tables/loot.json" columns="value, name"}');
    expect(json.rows).toEqual([
      ["value", "name"],
      ["1", "Coin"],
      ["50", "Gem"],
    ]);
    expect(grid('::table{src="/tables/loot.json"}').rows[2]).toEqual(["Gem", "50", "rare, shiny"]);
  });

  it("reports a missing or wrong file, a bad column, sort or stat", () => {
    expect(grid('::table{src="/tables/nope.csv"}').problems).toEqual([
      'line 1: table: missing file "/tables/nope.csv"',
    ]);
    expect(grid('::table{src="/data/wiki.db"}').problems[0]).toContain("should be a .csv, .tsv or .json file");
    expect(grid('::table{src="/tables/../data/x.csv"}').problems[0]).toContain("not in data/");
    expect(grid('::table{src="/tables/mobs.csv" columns="HP, Mana"}').problems[0]).toContain('no column "Mana"');
    expect(grid('::table{src="/tables/mobs.csv" sort="Speed"}').problems[0]).toContain('sort="Speed"');
    expect(grid('::table{src="/tables/mobs.csv" stats="median"}').problems[0]).toContain('stats "median"');
    expect(grid("::table").problems[0]).toContain("give it a file");
    expect(grid('::table{src="/tables/mobs.csv" pages="type:Mob"}').problems[0]).toContain("give it a file");
  });
});

describe("::table from pages", () => {
  it("finds pages by type, tag, status, folder and their own fields", () => {
    const titles = (filter: string) => pagesMatching(PAGES, filter, () => {}).map((p) => p.title);
    expect(titles("type:mob")).toEqual(["Rat", "Wolf", "Rat King"]);
    expect(titles("type:Mob, tag:boss")).toEqual(["Rat King"]);
    expect(titles("status:active")).toEqual(["Wolf"]);
    expect(titles("in:mobs/boss")).toEqual(["Rat King"]);
    expect(titles("biome:forest")).toEqual(["Wolf"]);
    expect(titles("hp:20")).toEqual(["Rat"]);
  });

  it("makes a row per page: the page linked, then its own fields", () => {
    const { table, rows, problems } = grid('::table{pages="type:Mob"}');
    expect(problems).toEqual([]);
    expect(rows).toEqual([
      ["Page", "HP", "biome", "Phase"],
      ["Rat", "20", "Sewer", ""],
      ["Rat King", "300", "", "2"],
      ["Wolf", "30", "Forest", ""],
    ]);
    const links = find(table, "a").map((a) => a.properties.href);
    expect(links).toEqual(["/w/demo/mobs/rat", "/w/demo/mobs/boss/king", "/w/demo/mobs/wolf"]);
  });

  it("shows the page's type, status, tags and summary when asked", () => {
    const { rows } = grid('::table{pages="in:mobs" columns="Name, Status, Tags, HP"}');
    expect(rows[0]).toEqual(["Page", "Status", "Tags", "HP"]);
    expect(rows[1]).toEqual(["Rat", "done", "sewer", "20"]);
  });

  it("reports a filter that matches nothing or isn't key:value", () => {
    expect(grid('::table{pages="type:Dragon"}').problems).toEqual([
      'line 1: table: no page matches pages="type:Dragon"',
    ]);
    expect(grid('::table{pages="Mob"}').problems[0]).toContain("key:value");
  });
});

describe(":::table around a Markdown table", () => {
  it("keeps the table, with its links and elements", () => {
    const md = ':::table{sort="HP"}\n| Name | HP |\n|---|---|\n| [[Rat]] | :badge[20]{tone="good"} |\n:::';
    const { table, rows, problems } = grid(md);
    expect(problems).toEqual([]);
    expect(rows).toEqual([
      ["Name", "HP"],
      ["Rat", "20"],
    ]);
    expect(find(table, "sh-badge")).toHaveLength(1);
  });

  it("needs exactly one table inside, and no source", () => {
    expect(grid(":::table\nJust text.\n:::").problems[0]).toContain("one Markdown table");
    expect(grid(':::table{src="/tables/mobs.csv"}\n| A |\n|---|\n| 1 |\n:::').problems[0]).toContain("nothing inside");
    expect(grid(':::table{sort="Speed"}\n| A |\n|---|\n| 1 |\n:::').problems[0]).toContain('sort="Speed"');
  });
});

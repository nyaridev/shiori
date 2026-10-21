// The universal elements (ADR-0002): related, children, toc, status, page, steps, compare, quote, embed.
import type { Element, Root, RootContent } from "hast";
import { describe, expect, it } from "vitest";
import { type PageFile, pageFinder } from "../pages.ts";
import { renderMarkdown } from "./render.ts";

const pages: PageFile[] = [
  { path: "", title: "Home", file: "pages/index.md", order: 0, hidden: false },
  { path: "plan/goals", title: "Goals", file: "pages/plan/goals.md", order: 0, hidden: false },
];

function render(md: string) {
  const known = new Set(pages.map((p) => p.path));
  return renderMarkdown(md, {
    wikiId: "demo",
    pageDir: "",
    pageExists: (p) => known.has(p),
    fileExists: () => true,
    findPage: pageFinder(pages, ""),
  });
}

function find(node: Root | RootContent, tag: string): Element[] {
  const out: Element[] = [];
  if (node.type === "element" && node.tagName === tag) out.push(node);
  if ("children" in node) for (const c of node.children) out.push(...find(c, tag));
  return out;
}

const text = (node: Root | RootContent): string =>
  node.type === "text" ? node.value : "children" in node ? node.children.map(text).join("") : "";

describe("universal elements", () => {
  it("place related pages, children and contents, and check the children style", () => {
    const { hast, problems } = render(
      '::related{kind="depends on"}\n\n::children{layout=list}\n\n::toc\n\n::children{layout=grid}',
    );
    expect(find(hast, "sh-related")[0].properties).toEqual({ kind: "depends on" });
    expect(find(hast, "sh-children")[0].properties).toEqual({ layout: "list" });
    expect(find(hast, "sh-toc")).toHaveLength(1);
    expect(problems).toEqual(['line 7: children: layout="grid" isn\'t one of cards, list']);
  });

  it("check statuses", () => {
    const { hast, problems } = render(":status[Active] and :status[shipping]");
    expect(find(hast, "sh-status").map((s) => s.properties.value)).toEqual(["active", "shipping"]);
    expect(problems).toEqual([
      'line 1: status: "shipping" isn\'t one of idea, planned, active, paused, done, archived',
    ]);
  });

  it("turn :page[] into page chips, red when the page isn't written", () => {
    const { hast, problems } = render(":page[Goals] and :page[Shop#Prices]");
    const [goals, shop] = find(hast, "a");
    expect(goals.properties).toMatchObject({ href: "/w/demo/plan/goals", dataChip: "" });
    expect(text(goals)).toBe("Goals");
    expect(shop.properties).toMatchObject({ href: "/w/demo/shop#prices", dataChip: "", dataMissing: "" });
    expect(problems).toEqual([]);
  });

  it("number steps, with optional titles", () => {
    const { hast } = render(":::steps[Upload a video]\n1. Export: 1080p, H.264\n2. Write the description\n:::");
    expect(find(hast, "sh-steps")[0].properties).toEqual({ title: "Upload a video" });
    expect(find(hast, "sh-step").map((s) => [s.properties.title, text(s).trim()])).toEqual([
      ["Export", "1080p, H.264"],
      [undefined, "Write the description"],
    ]);
  });

  it("compare options with pros, cons and facts, and mark the pick", () => {
    const { hast, problems } = render(
      ':::compare{pick="Shopify"}\n### Shopify\n- Pro: Fast to start\n- Con: Monthly fee\n- Cost: $39/month\n\n### Own site\n- Pro: Full control\n:::',
    );
    const options = find(hast, "sh-option");
    expect(options.map((o) => o.properties)).toEqual([{ name: "Shopify", picked: "" }, { name: "Own site" }]);
    expect(find(options[0], "sh-point").map((p) => [p.properties.kind, p.properties.label, text(p).trim()])).toEqual([
      ["pro", undefined, "Fast to start"],
      ["con", undefined, "Monthly fee"],
      ["note", "Cost", "$39/month"],
    ]);
    expect(problems).toEqual([]);
    expect(render(':::compare{pick="Etsy"}\n### A\nx\n:::').problems).toEqual([
      "line 1: compare: give at least two options, each under its own heading",
      'line 1: compare: pick="Etsy" isn\'t one of the options (A)',
    ]);
  });

  it("attribute quotes", () => {
    const { hast } = render(':::quote{by="Sam" role="Streamer" source="Interview, May"}\nSetup takes too long.\n:::');
    expect(find(hast, "sh-quote")[0].properties).toEqual({ by: "Sam", role: "Streamer", source: "Interview, May" });
  });

  it("embed YouTube, Vimeo and Figma, and nothing else", () => {
    const { hast, problems } = render(
      [
        '::embed[Trailer]{url="https://www.youtube.com/watch?v=dQw4w9WgXcQ"}',
        '::embed{url="https://youtu.be/dQw4w9WgXcQ"}',
        '::embed{url="https://vimeo.com/76979871"}',
        '::embed{url="https://www.figma.com/design/abc123/Shop"}',
        '::embed{url="https://evil.example.com/x"}',
      ].join("\n\n"),
    );
    expect(find(hast, "sh-embed").map((e) => [e.properties.provider, e.properties.src, e.properties.caption])).toEqual([
      ["YouTube", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", "Trailer"],
      ["YouTube", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", undefined],
      ["Vimeo", "https://player.vimeo.com/video/76979871", undefined],
      [
        "Figma",
        `https://www.figma.com/embed?embed_host=shiori&url=${encodeURIComponent("https://www.figma.com/design/abc123/Shop")}`,
        undefined,
      ],
      [undefined, undefined, undefined],
    ]);
    expect(problems).toEqual(['line 9: embed: "https://evil.example.com/x" isn\'t a YouTube, Vimeo or Figma link']);
  });
});

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildCorpus } from "./corpus.ts";
import { buildNav, listPages, renderPage } from "./pages.ts";
import { createRegistry, discover, writeLinks } from "./registry.ts";
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
  app = mkdtempSync(join(tmpdir(), "shiori-"));
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

  it("checks the header icon against Shiori's icon set", () => {
    wiki(join(app, "wikis", "a"), "a", { icon: "sparkles" });
    wiki(join(app, "wikis", "b"), "b", { icon: "dragon" });
    wiki(join(app, "wikis", "c"), "c", { icon: "✨" });
    const { wikis, broken } = discover(app);
    expect(wikis.map((w) => [w.id, w.problems])).toEqual([
      ["a", []],
      ["b", [`wiki.json: icon "dragon" isn't in Shiori's icon set (Toolbox → Icons lists them)`]],
    ]);
    expect(broken[0].problems[0]).toMatch(/^wiki.json: icon: name an icon/);
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

describe("dev mode", () => {
  it("shows only the template, filled in, and ignores everything else", () => {
    const template = join(app, "wikis", "_template");
    mkdirSync(join(template, "pages"), { recursive: true });
    writeFileSync(join(template, "wiki.json"), JSON.stringify({ schema: 1, id: "{{id}}", title: "{{title}}" }));
    writeFileSync(join(template, "theme.json"), JSON.stringify({ colors: { accent: "{{accent}}" } }));
    writeFileSync(join(template, "cover.svg"), '<svg fill="{{accent}}"/>');
    writeFileSync(join(template, "pages", "index.md"), "# {{title}}");
    wiki(join(app, "wikis", "alpha"), "alpha");

    const preview = join(app, "preview");
    const registry = createRegistry(app, { dev: true, preview });
    expect(registry.all().map((w) => [w.id, w.manifest.title, w.problems])).toEqual([["template", "Template", []]]);
    expect(registry.classify(join(template, "pages", "index.md"))).toEqual({ wiki: "template", area: "pages" });
    expect(registry.classify(join(preview, "data", "wiki.db"))).toEqual({ wiki: "template", area: "data" });
    expect(registry.classify(join(app, "wikis", "alpha", "pages", "index.md")).area).toBe("ignore");
  });

  it("keeps a page added to the preview until the template changes", () => {
    const template = join(app, "wikis", "_template");
    mkdirSync(join(template, "pages"), { recursive: true });
    writeFileSync(join(template, "wiki.json"), JSON.stringify({ schema: 1, id: "{{id}}", title: "{{title}}" }));
    writeFileSync(join(template, "pages", "index.md"), "# {{title}}");
    const preview = join(app, "preview");
    const registry = createRegistry(app, { dev: true, preview });
    const tried = join(preview, "pages", "tried.md");
    writeFileSync(tried, "# Tried");

    expect(registry.classify(tried)).toEqual({ wiki: "template", area: "pages" });
    registry.invalidate();
    expect(existsSync(tried)).toBe(true);

    registry.classify(join(template, "pages", "index.md"));
    registry.invalidate();
    expect(existsSync(tried)).toBe(false);
  });
});

describe("page relations", () => {
  it("gives a page its trail, children, neighbours and reading time", () => {
    const root = join(app, "wikis", "alpha");
    wiki(root, "alpha");
    writeFileSync(
      join(root, "pages", "systems", "index.md"),
      `---\ntitle: Systems\nicon: "⚙️"\nstatus: active\ntags: [core, combat]\n---\n${"word ".repeat(500)}`,
    );
    const { wikis } = discover(app);
    const w = wikis[0];
    const pages = listPages(w);

    const systems = renderPage(w, pages, "systems");
    expect(systems).toMatchObject({ icon: "⚙️", status: "active", tags: ["core", "combat"], minutes: 2 });
    expect(systems?.trail.map((t) => t.path)).toEqual([""]);
    expect(systems?.children.map((c) => c.title)).toEqual(["Lanterns", "Combat"]);
    expect(systems?.prev?.path).toBe("");
    expect(systems?.next?.path).toBe("systems/lanterns");

    const combat = renderPage(w, pages, "systems/combat");
    expect(combat?.trail.map((t) => t.title)).toEqual(["Home", "Systems"]);
    expect(combat?.next).toBeNull();
    expect(renderPage(w, pages, "")?.children.map((c) => c.path)).toEqual(["systems"]);
  });
});

describe("corpus", () => {
  it("renders every page once with backlinks, the frontmatter infobox and the page index", () => {
    const root = join(app, "wikis", "alpha");
    wiki(root, "alpha");
    mkdirSync(join(root, "assets"));
    writeFileSync(join(root, "assets", "lantern.png"), "png");
    writeFileSync(
      join(root, "pages", "systems", "lanterns.md"),
      [
        "---",
        "title: Lanterns",
        "type: System",
        "image: /assets/lantern.png",
        "caption: The first lantern",
        "toc: false",
        "infobox:",
        "  Owner: Nari",
        "  Uses: [Light, Heat]",
        "  Shipped: true",
        "  Links to: '[Combat](combat)'",
        "---",
        "## One\n\nText.\n\n## Two\n\nMore text.",
      ].join("\n"),
    );
    writeFileSync(join(root, "pages", "index.md"), "See [lanterns](/systems/lanterns) and [combat](/systems/combat).");
    const { wikis } = discover(app);
    const corpus = buildCorpus(wikis[0], listPages(wikis[0]));

    const lanterns = corpus.pages.get("systems/lanterns");
    expect(lanterns?.type).toBe("System");
    expect(lanterns?.toc).toEqual([]);
    expect(lanterns?.infobox?.image).toBe("/api/wikis/alpha/files/assets/lantern.png");
    expect(lanterns?.infobox?.caption).toBe("The first lantern");
    expect(lanterns?.infobox?.rows.map((r) => r.label)).toEqual(["Owner", "Uses", "Shipped", "Links to"]);
    expect(JSON.stringify(lanterns?.infobox?.rows[1].value)).toContain("Light, Heat");
    expect(JSON.stringify(lanterns?.infobox?.rows[2].value)).toContain("Yes");
    expect(lanterns?.problems).toEqual([]);

    expect(corpus.pages.get("systems/combat")?.backlinks.map((b) => b.path)).toEqual(["", "systems/lanterns"]);
    expect(corpus.pages.get("systems/lanterns")?.backlinks.map((b) => b.title)).toEqual(["Home"]);
    expect(corpus.pages.get("")?.backlinks).toEqual([]);

    const entry = corpus.index.find((e) => e.path === "systems/lanterns");
    expect(entry).toMatchObject({ type: "System", hidden: false, image: "/api/wikis/alpha/files/assets/lantern.png" });
    expect(entry?.excerpt).toBe("Text.");
    expect(corpus.search).toHaveLength(corpus.index.length);
  });

  it("resolves related pages by kind, counts them as links, and wants the missing ones", () => {
    const root = join(app, "wikis", "alpha");
    wiki(root, "alpha");
    writeFileSync(
      join(root, "pages", "systems", "combat.md"),
      [
        "---",
        "title: Combat",
        "related:",
        "  - Lanterns",
        "  - to: Boss Fight",
        "    kind: Leads to",
        "---",
        "::related",
      ].join("\n"),
    );
    const { wikis } = discover(app);
    const corpus = buildCorpus(wikis[0], listPages(wikis[0]));
    const combat = corpus.pages.get("systems/combat");
    expect(combat?.related.map((g) => [g.kind, g.pages.map((p) => [p.path, p.isPage])])).toEqual([
      ["Related", [["systems/lanterns", true]]],
      ["Leads to", [["boss-fight", false]]],
    ]);
    expect(combat?.placed.related).toBe(true);
    expect(corpus.pages.get("systems/lanterns")?.backlinks.map((b) => b.title)).toEqual(["Combat"]);
    expect(corpus.wanted.map((w) => w.path)).toEqual(["boss-fight"]);
  });

  it("lists pages that red links want, most wanted first", () => {
    const root = join(app, "wikis", "alpha");
    wiki(root, "alpha");
    writeFileSync(join(root, "pages", "index.md"), "[[Lanterns]] [[Boss Fight]] [[Shop]]");
    writeFileSync(join(root, "pages", "systems", "combat.md"), "---\ntitle: Combat\n---\n[[Boss Fight|the boss]]");
    const { wikis } = discover(app);
    const corpus = buildCorpus(wikis[0], listPages(wikis[0]));
    expect(corpus.wanted.map((w) => [w.path, w.title, w.from.map((f) => f.title)])).toEqual([
      ["boss-fight", "Boss Fight", ["Home", "Combat"]],
      ["shop", "Shop", ["Home"]],
    ]);
    expect(corpus.pages.get("systems/lanterns")?.backlinks.map((b) => b.title)).toEqual(["Home"]);
  });
});

// What the sidebar and the header get from the server: pinned pages, and pages' icons drawn as pictures.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { NavNode, PageData, WikiDetail } from "../shared/api.ts";
import { sharingFixture } from "./sharing/fixture.ts";

const s = sharingFixture();
const alpha = () => join(s.app, "wikis", "alpha");
const detail = async (wiki = "alpha") => (await (await s.owner(`/api/wikis/${wiki}`)).json()) as WikiDetail;
const page = async (path: string) =>
  (await (await s.owner(`/api/wikis/alpha/page?path=${encodeURIComponent(path)}`)).json()) as PageData;

describe("pinned pages", () => {
  it("pin Roadmap by default, when the wiki has one", async () => {
    expect((await detail()).pinned).toEqual([]);
    writeFileSync(join(alpha(), "pages", "roadmap.md"), "---\ntitle: Roadmap\nicon: 🗺️\n---\nSoon.");
    s.emit({ type: "pages", wiki: "alpha" });
    await new Promise((done) => setTimeout(done, 10));
    expect((await detail()).pinned).toEqual([{ path: "roadmap", title: "Roadmap", icon: "🗺️", isPage: true }]);
  });

  it("follow wiki.json's pinned list, by wikilink name, skipping pages that don't exist", async () => {
    writeFileSync(
      join(alpha(), "wiki.json"),
      JSON.stringify({ schema: 1, id: "alpha", title: "ALPHA", pinned: ["Plan", "Nowhere"] }),
    );
    s.emit({ type: "wikis" });
    await new Promise((done) => setTimeout(done, 10));
    expect((await detail()).pinned.map((p) => p.path)).toEqual(["plan"]);
  });
});

describe("picture icons", () => {
  it("resolve a page's icon file to its URL everywhere the page shows", async () => {
    mkdirSync(join(alpha(), "assets", "icons"), { recursive: true });
    writeFileSync(join(alpha(), "assets", "icons", "plan.svg"), "<svg/>");
    writeFileSync(
      join(alpha(), "pages", "plan.md"),
      '---\ntitle: Plan\nicon: "/assets/icons/plan.svg"\n---\nThe plan.',
    );
    s.emit({ type: "pages", wiki: "alpha" });
    await new Promise((done) => setTimeout(done, 10));
    const url = "/api/wikis/alpha/files/assets/icons/plan.svg";
    expect((await page("plan")).icon).toBe(url);
    expect((await page("plan")).problems).toEqual([]);
    const nav = (await detail()).nav.find((n: NavNode) => n.path === "plan");
    expect(nav?.icon).toBe(url);
    expect((await s.owner(url)).headers.get("content-type")).toBe("image/svg+xml");
  });

  it("report a missing picture or a link, and keep emoji as they are", async () => {
    writeFileSync(join(alpha(), "pages", "plan.md"), '---\ntitle: Plan\nicon: "/assets/icons/none.svg"\n---\nx');
    writeFileSync(join(alpha(), "pages", "far.md"), '---\ntitle: Far\nicon: "https://evil.example/x.svg"\n---\nx');
    writeFileSync(join(alpha(), "pages", "emoji.md"), '---\ntitle: Emoji\nicon: "🎯"\n---\nx');
    s.emit({ type: "pages", wiki: "alpha" });
    await new Promise((done) => setTimeout(done, 10));
    const plan = await page("plan");
    expect(plan.icon).toBeUndefined();
    expect(plan.problems).toContain('frontmatter: icon: missing file "/assets/icons/none.svg"');
    const far = await page("far");
    expect(far.icon).toBeUndefined();
    expect(far.problems.join("\n")).toMatch(/must be a picture in the wiki/);
    expect((await page("emoji")).icon).toBe("🎯");
  });

  it("refuse an icon that's neither one emoji nor a picture", async () => {
    writeFileSync(
      join(alpha(), "pages", "plan.md"),
      '---\ntitle: Plan\nicon: "a very long label, not an icon"\n---\nx',
    );
    s.emit({ type: "pages", wiki: "alpha" });
    await new Promise((done) => setTimeout(done, 10));
    expect((await page("plan")).problems.join("\n")).toMatch(/icon: one emoji, or a picture file/);
  });
});

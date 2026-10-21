// Designs (ADR-0006) on the owner's server, and page layouts.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { DesignInfo, PageData } from "../shared/api.ts";
import { layoutSchema } from "../shared/layout.ts";
import { png, sharingFixture, withMobs } from "./sharing/fixture.ts";

const s = sharingFixture();
const alpha = () => join(s.app, "wikis", "alpha");
const json = async <T>(res: Response) => (await res.json()) as T;
const create = async (name = "Carrot") =>
  json<DesignInfo>(await s.owner("/api/wikis/alpha/designs/mobs", { method: "POST", body: { name } }));

describe("designs on the owner's server", () => {
  it("need a collection from wiki.json", async () => {
    expect((await s.owner("/api/wikis/alpha/designs/mobs")).status).toBe(404);
    withMobs(s.app);
    s.emit({ type: "wikis" });
    expect((await s.owner("/api/wikis/alpha/designs/mobs")).status).toBe(200);
    expect((await s.owner("/api/wikis/alpha/designs/items")).status).toBe(404);
    expect((await s.owner("/api/wikis/nope/designs/mobs")).status).toBe(404);
  });

  it("make a design as plain files, change it, and never set it done", async () => {
    withMobs(s.app);
    s.emit({ type: "wikis" });
    const d = await create("Melting Carrot");
    expect(d).toMatchObject({ name: "Melting Carrot", status: "draft", editable: true, mine: true, board: null });
    expect(d.id).toMatch(/^melting-carrot-[0-9a-f]{4}$/);
    const folder = join(alpha(), "designs", "mobs", d.id);
    expect(JSON.parse(readFileSync(join(folder, "design.json"), "utf8")).name).toBe("Melting Carrot");

    const path = `/api/wikis/alpha/designs/mobs/${d.id}`;
    const ready = await s.owner(path, { method: "PATCH", body: { description: "Orange, sad", status: "ready" } });
    expect(await json<DesignInfo>(ready)).toMatchObject({ description: "Orange, sad", status: "ready" });
    expect((await s.owner(path, { method: "PATCH", body: { status: "done" } })).status).toBe(400);
    expect((await s.owner(path, { method: "PATCH", body: { name: "" } })).status).toBe(400);

    const list = await json<{ designs: DesignInfo[] }>(await s.owner("/api/wikis/alpha/designs/mobs"));
    expect(list.designs.map((x) => x.id)).toEqual([d.id]);
  });

  it("save the drawing as a PNG, and serve it", async () => {
    withMobs(s.app);
    s.emit({ type: "wikis" });
    const d = await create();
    const path = `/api/wikis/alpha/designs/mobs/${d.id}`;
    const saved = await s.owner(`${path}/board`, { method: "PUT", raw: await png(), type: "image/png" });
    expect(saved.status).toBe(200);
    const board = (await json<DesignInfo>(saved)).board as string;
    expect(board).toMatch(new RegExp(`^${path}/files/board.png\\?v=`));
    const file = await s.owner(board);
    expect(file.headers.get("content-type")).toBe("image/png");
    expect(existsSync(join(alpha(), "designs", "mobs", d.id, "board.png"))).toBe(true);
    // Not a PNG, a JPEG sent as one, or too wide.
    expect((await s.owner(`${path}/board`, { method: "PUT", raw: Buffer.from("hi"), type: "image/png" })).status).toBe(
      400,
    );
    expect((await s.owner(`${path}/board`, { method: "PUT", raw: await png(), type: "image/jpeg" })).status).toBe(415);
    expect((await s.owner(`${path}/board`, { method: "PUT", raw: await png(4001, 2), type: "image/png" })).status).toBe(
      400,
    );
  });

  it("add and remove pictures, never SVG, and remove a design by moving it aside", async () => {
    withMobs(s.app);
    s.emit({ type: "wikis" });
    const d = await create();
    const path = `/api/wikis/alpha/designs/mobs/${d.id}`;
    const added = await s.owner(`${path}/pictures?caption=${encodeURIComponent("Side view")}`, {
      method: "POST",
      raw: await png(),
      type: "image/png",
    });
    expect(added.status).toBe(201);
    const withPicture = await json<DesignInfo>(added);
    expect(withPicture.images).toEqual([{ file: "ref-1.png", caption: "Side view", url: `${path}/files/ref-1.png` }]);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect((await s.owner(`${path}/pictures`, { method: "POST", raw: svg, type: "image/svg+xml" })).status).toBe(415);
    expect((await s.owner(`${path}/pictures`, { method: "POST", raw: svg, type: "image/png" })).status).toBe(400);

    expect((await s.owner(`${path}/pictures/ref-1.png`, { method: "DELETE" })).status).toBe(200);
    expect((await s.owner(`${path}/files/ref-1.png`)).status).toBe(404);
    expect((await s.owner(path, { method: "DELETE" })).status).toBe(204);
    expect((await s.owner(path)).status).toBe(404);
    const removed = readdirSync(join(alpha(), "designs", "_removed"));
    expect(removed.some((f) => f.endsWith(`-mobs-${d.id}-ref-1.png`))).toBe(true);
    expect(removed.some((f) => f.endsWith(`-mobs-${d.id}`))).toBe(true);
  });

  it("hide only guests' designs", async () => {
    withMobs(s.app);
    s.emit({ type: "wikis" });
    const d = await create();
    const res = await s.owner(`/api/wikis/alpha/designs/mobs/${d.id}/hidden`, {
      method: "PATCH",
      body: { hidden: true },
    });
    expect(res.status).toBe(400);
  });

  it("refuse other sites", async () => {
    withMobs(s.app);
    s.emit({ type: "wikis" });
    const res = await s.ownerApp.request("http://localhost:4400/api/wikis/alpha/designs/mobs", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: JSON.stringify({ name: "x" }),
    });
    expect(res.status).toBe(403);
  });
});

describe("layouts", () => {
  const mob = {
    title: "Mob",
    areas: [
      ["design", "facts"],
      ["body", "facts"],
    ],
    blocks: {
      design: { type: "design" },
      facts: { type: "infobox", title: "Facts" },
      body: { type: "body" },
    },
  };

  it("accept a grid of named areas, each a rectangle with a block", () => {
    expect(layoutSchema.safeParse(mob).success).toBe(true);
    const bad = (layout: unknown) =>
      layoutSchema
        .safeParse(layout)
        .error?.issues.map((i) => i.message)
        .join("; ");
    expect(bad({ ...mob, areas: [["design", "facts"], ["body"]] })).toMatch(/every row needs 2 areas/);
    expect(
      bad({
        ...mob,
        areas: [
          ["design", "facts"],
          ["facts", "design"],
        ],
      }),
    ).toMatch(/isn't a rectangle/);
    expect(bad({ ...mob, blocks: { ...mob.blocks, extra: { type: "toc" } } })).toMatch(/"extra" isn't in any row/);
    expect(bad({ ...mob, blocks: { design: { type: "design" }, body: { type: "body" } } })).toMatch(
      /"facts" has no block/,
    );
    expect(bad({ ...mob, blocks: { ...mob.blocks, body: { type: "script", src: "x.js" } } })).toBeTruthy();
    expect(bad({ ...mob, blocks: { ...mob.blocks, body: { type: "body", css: "color:red" } } })).toBeTruthy();
    expect(bad({ ...mob, areas: [["Design", "facts"]] })).toBeTruthy();
  });

  it("arrange a page that names one, and report a missing or broken layout", async () => {
    withMobs(s.app);
    mkdirSync(join(alpha(), "layouts"));
    writeFileSync(join(alpha(), "layouts", "mob.json"), JSON.stringify(mob));
    writeFileSync(join(alpha(), "layouts", "broken.json"), "{ nope");
    writeFileSync(
      join(alpha(), "pages", "carrot.md"),
      "---\ntitle: Carrot\nlayout: mob\ndesign: mobs/carrot-1a2b\n---\nx",
    );
    writeFileSync(join(alpha(), "pages", "odd.md"), "---\ntitle: Odd\nlayout: nope\n---\nx");
    writeFileSync(join(alpha(), "pages", "worse.md"), "---\ntitle: Worse\nlayout: broken\ndesign: items/x\n---\nx");
    s.emit({ type: "wikis" });
    s.emit({ type: "pages", wiki: "alpha" });
    const page = async (path: string) => json<PageData>(await s.owner(`/api/wikis/alpha/page?path=${path}`));
    const carrot = await page("carrot");
    expect(carrot.layout).toMatchObject({ name: "mob", title: "Mob", areas: mob.areas });
    expect(carrot.design).toEqual({ collection: "mobs", id: "carrot-1a2b" });
    expect(carrot.problems).toEqual([]);
    expect((await page("odd")).problems).toContain("frontmatter: layout: there's no layouts/nope.json");
    const worse = await page("worse");
    expect(worse.layout).toBeUndefined();
    expect(worse.problems.join("\n")).toMatch(/layouts\/broken.json has problems/);
    expect(worse.problems.join("\n")).toMatch(/there's no collection "items"/);
  });
});

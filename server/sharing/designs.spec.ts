// Designs for guests (ADR-0006, AGENTS.md rule 2): everyone on a link sees them; on a comment link a guest makes their
// own and changes only those; the owner changes all and can hide a guest's. Each route is checked for the link,
// other wikis, expiry, view links, ownership, limits, sizes and Origin.
import { describe, expect, it } from "vitest";
import type { DesignCollection, DesignGroupInfo, DesignInfo } from "../../shared/api.ts";
import { type Browser, HOST, png, sharingFixture, withMobs } from "./fixture.ts";
import { LIMITS } from "./limits.ts";
import type { Share } from "./shares.ts";

const s = sharingFixture();
const json = async <T>(res: Response) => (await res.json()) as T;
const MOBS = "/api/wikis/alpha/designs/mobs";

async function setup(kind: "view" | "comment" = "comment", duration?: "1h") {
  withMobs(s.app);
  s.emit({ type: "wikis" });
  return s.shares.create({ wiki: "alpha", kind, ...(duration ? { duration } : {}) });
}
async function joined(share: Share, name: string, ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`) {
  const b = s.browser(share, ip);
  expect((await b.join(name)).status).toBe(201);
  return b;
}
const make = async (b: Browser, name = "Carrot") => json<DesignInfo>(await b.send("POST", MOBS, { name }));
const ownerMakes = async (name = "Owner's") =>
  json<DesignInfo>(await s.owner(MOBS, { method: "POST", body: { name } }));

describe("guests and designs: the link", () => {
  it("answers only for the link's own wiki, after a name, while the link lasts", async () => {
    const share = await setup("comment", "1h");
    const anon = s.browser(share);
    expect((await anon.get(MOBS)).status).toBe(401);
    const b = await joined(share, "Mika");
    expect((await b.get(MOBS)).status).toBe(200);
    expect((await b.get("/api/wikis/beta/designs/mobs")).status).toBe(404);
    expect((await b.send("POST", "/api/wikis/beta/designs/mobs", { name: "x" })).status).toBe(404);
    expect((await b.get("/api/wikis/alpha/designs/items")).status).toBe(404);
    const bogus = await s.guestApp.request(`${HOST}/s/${"x".repeat(43)}${MOBS}`);
    expect(bogus.status).toBe(404);
    s.clock += 2 * 3_600_000;
    expect((await b.get(MOBS)).status).toBe(410);
    expect((await b.send("POST", MOBS, { name: "Late" })).status).toBe(410);
  });

  it("lets view links look but not make or change", async () => {
    const share = await setup("view");
    const d = await ownerMakes();
    const b = await joined(share, "Mika");
    const list = await json<{ designs: DesignInfo[] }>(await b.get(MOBS));
    expect(list.designs.map((x) => [x.id, x.editable, x.author])).toEqual([
      [d.id, false, { kind: "owner", name: "Host" }],
    ]);
    expect((await b.send("POST", MOBS, { name: "Mine" })).status).toBe(403);
    expect((await b.send("PATCH", `${MOBS}/${d.id}`, { description: "x" })).status).toBe(403);
    expect((await b.raw("PUT", `${MOBS}/${d.id}/board`, await png(), "image/png")).status).toBe(403);
  });
});

describe("guests and designs: whose they are", () => {
  it("let a guest make and change their own, and only look at others'", async () => {
    const share = await setup();
    const mika = await joined(share, "Mika", "203.0.113.1");
    const ren = await joined(share, "Ren", "203.0.113.2");
    const mine = await make(mika, "Carrot");
    expect(mine).toMatchObject({ editable: true, mine: true, author: { kind: "guest", name: "Mika" } });
    const path = `${MOBS}/${mine.id}`;
    expect((await mika.send("PATCH", path, { description: "Melting", status: "ready" })).status).toBe(200);
    expect((await mika.raw("PUT", `${path}/board`, await png(), "image/png")).status).toBe(200);
    expect((await mika.raw("POST", `${path}/pictures?caption=ref`, await png(), "image/png")).status).toBe(201);

    // Ren sees it, can't change it.
    const seen = await json<DesignInfo>(await ren.get(path));
    expect(seen).toMatchObject({ editable: false, mine: false, description: "Melting" });
    expect((await ren.get(seen.board as string)).status).toBe(200);
    expect((await ren.send("PATCH", path, { name: "Ren's now" })).status).toBe(403);
    expect((await ren.raw("PUT", `${path}/board`, await png(), "image/png")).status).toBe(403);
    expect((await ren.raw("POST", `${path}/pictures`, await png(), "image/png")).status).toBe(403);
    expect((await ren.send("DELETE", `${path}/pictures/ref-1.png`)).status).toBe(403);
    expect((await ren.send("DELETE", path)).status).toBe(403);

    // Nor the owner's.
    const owners = await ownerMakes();
    expect((await mika.send("PATCH", `${MOBS}/${owners.id}`, { name: "x" })).status).toBe(403);

    // The owner changes anyone's.
    expect((await s.owner(path, { method: "PATCH", body: { name: "Carrot, by the owner" } })).status).toBe(200);
    expect(await json<DesignInfo>(await s.owner(path))).toMatchObject({ editable: true, mine: false });
  });

  it("never send a guest's id, and never let anyone mark a design done", async () => {
    const share = await setup();
    const mika = await joined(share, "Mika");
    const d = await make(mika);
    const ids = [...share.guests.keys()];
    const body = JSON.stringify(await json(await mika.get(MOBS))) + JSON.stringify(await json(await s.owner(MOBS)));
    for (const id of ids) expect(body).not.toContain(id);
    expect((await mika.send("PATCH", `${MOBS}/${d.id}`, { status: "done" })).status).toBe(400);
    expect((await mika.send("PATCH", `${MOBS}/${d.id}`, { hidden: true })).status).toBe(400);
    expect((await mika.send("PATCH", `${MOBS}/${d.id}/hidden`, { hidden: true })).status).toBe(404);
  });

  it("keep what the owner hid from guests, files included, and let the owner block the guest", async () => {
    const share = await setup();
    const mika = await joined(share, "Mika", "203.0.113.1");
    const ren = await joined(share, "Ren", "203.0.113.2");
    const d = await make(mika);
    await mika.raw("PUT", `${MOBS}/${d.id}/board`, await png(), "image/png");
    const hid = await s.owner(`${MOBS}/${d.id}/hidden`, { method: "PATCH", body: { hidden: true } });
    expect(await json<DesignInfo>(hid)).toMatchObject({ hidden: true });
    expect((await json<{ designs: DesignInfo[] }>(await ren.get(MOBS))).designs).toEqual([]);
    expect((await ren.get(`${MOBS}/${d.id}`)).status).toBe(404);
    expect((await ren.get(`${MOBS}/${d.id}/files/board.png`)).status).toBe(404);
    // The wiki's own files route never serves designs to guests.
    for (const path of [`designs/mobs/${d.id}/board.png`, `designs%2Fmobs%2F${d.id}%2Fboard.png`])
      expect((await ren.get(`/api/wikis/alpha/files/${path}`)).status, path).toBe(404);
    expect((await mika.send("PATCH", `${MOBS}/${d.id}`, { name: "x" })).status).toBe(404);
    // The owner still sees it.
    expect((await s.owner(`${MOBS}/${d.id}/files/board.png`)).status).toBe(200);

    const guest = [...share.guests.values()].find((g) => g.name === "Mika");
    s.shares.block(share.id, guest?.id as string, true);
    expect((await mika.send("POST", MOBS, { name: "Again" })).status).toBe(403);
  });
});

describe("guests and groups of designs", () => {
  const GROUPS = `${MOBS}/_groups`;
  const group = async (b: Browser, name: string, parent: string | null = null) => {
    const res = await b.send("POST", GROUPS, { name, parent });
    expect(res.status, name).toBe(201);
    return json<DesignGroupInfo>(res);
  };
  const ownerGroup = async (name: string, parent: string | null = null) =>
    json<DesignGroupInfo>(await s.owner(GROUPS, { method: "POST", body: { name, parent } }));

  it("answer only for the link's wiki while it lasts, and only look on a view link", async () => {
    const share = await setup("comment", "1h");
    const anon = s.browser(share);
    expect((await anon.send("POST", GROUPS, { name: "x" })).status).toBe(401);
    const mika = await joined(share, "Mika");
    expect((await mika.send("POST", "/api/wikis/beta/designs/mobs/_groups", { name: "x" })).status).toBe(404);
    expect((await mika.send("POST", "/api/wikis/alpha/designs/items/_groups", { name: "x" })).status).toBe(404);
    const g = await group(mika, "Monsters");
    s.clock += 2 * 3_600_000;
    expect((await mika.send("POST", GROUPS, { name: "Late" })).status).toBe(410);
    expect((await mika.send("PATCH", `${GROUPS}/${g.id}`, { name: "Late" })).status).toBe(410);

    const view = await setup("view");
    const ren = await joined(view, "Ren");
    const owners = await ownerGroup("Owner's");
    const seen = await json<DesignCollection>(await ren.get(MOBS));
    expect(seen.groups.map((x) => [x.name, x.editable])).toEqual([
      ["Monsters", false],
      ["Owner's", false],
    ]);
    expect((await ren.send("POST", GROUPS, { name: "Mine" })).status).toBe(403);
    expect((await ren.send("PATCH", `${GROUPS}/${owners.id}`, { name: "x" })).status).toBe(403);
    expect((await ren.send("DELETE", `${GROUPS}/${owners.id}`)).status).toBe(403);
  });

  it("let a guest sort their own designs into any group, and change only their own groups", async () => {
    const share = await setup();
    const mika = await joined(share, "Mika", "203.0.113.1");
    const ren = await joined(share, "Ren", "203.0.113.2");
    const owners = await ownerGroup("Monsters");
    const mine = await group(mika, "World 1", owners.id);
    expect(mine).toMatchObject({ editable: true, mine: true, author: { kind: "guest", name: "Mika" } });
    const d = await make(mika, "Fox");
    expect((await mika.send("PATCH", `${MOBS}/${d.id}`, { group: owners.id })).status).toBe(200);
    expect((await mika.send("POST", MOBS, { name: "Moth", group: mine.id })).status).toBe(201);

    // Ren can't rename, move or remove Mika's group, nor the owner's, nor move Mika's design.
    expect((await ren.send("PATCH", `${GROUPS}/${mine.id}`, { name: "Ren's" })).status).toBe(403);
    expect((await ren.send("PATCH", `${GROUPS}/${mine.id}`, { parent: null })).status).toBe(403);
    expect((await ren.send("DELETE", `${GROUPS}/${mine.id}`)).status).toBe(403);
    expect((await ren.send("PATCH", `${GROUPS}/${owners.id}`, { name: "x" })).status).toBe(403);
    expect((await ren.send("PATCH", `${MOBS}/${d.id}`, { group: null })).status).toBe(403);

    // Mika renames her group; she can't move or remove it once someone else's design is in it.
    expect((await mika.send("PATCH", `${GROUPS}/${mine.id}`, { name: "World One" })).status).toBe(200);
    const rens = await make(ren, "Bat");
    expect((await ren.send("PATCH", `${MOBS}/${rens.id}`, { group: mine.id })).status).toBe(200);
    expect((await mika.send("PATCH", `${GROUPS}/${mine.id}`, { parent: null })).status).toBe(403);
    expect((await mika.send("DELETE", `${GROUPS}/${mine.id}`)).status).toBe(403);
    // The owner can.
    expect((await s.owner(`${GROUPS}/${mine.id}`, { method: "DELETE" })).status).toBe(200);
    const after = await json<DesignCollection>(await s.owner(MOBS));
    expect(after.designs.find((x) => x.id === rens.id)?.group).toBe(owners.id);
  });

  it("never send a guest's id, refuse other sites, and count groups against making things", async () => {
    const share = await setup();
    const mika = await joined(share, "Mika");
    const g = await group(mika, "Mine");
    const ids = [...share.guests.keys()];
    const body = JSON.stringify(await json(await mika.get(MOBS))) + JSON.stringify(await json(await s.owner(MOBS)));
    for (const id of ids) expect(body).not.toContain(id);

    const evil = { origin: "https://evil.example" };
    expect((await mika.send("POST", GROUPS, { name: "x" }, evil)).status).toBe(403);
    expect((await mika.send("PATCH", `${GROUPS}/${g.id}`, { name: "x" }, evil)).status).toBe(403);
    expect((await mika.send("DELETE", `${GROUPS}/${g.id}`, undefined, evil)).status).toBe(403);
    expect((await mika.send("POST", GROUPS, { name: "x".repeat(61) })).status).toBe(400);
    expect((await mika.send("POST", GROUPS, { name: "x", parent: "../../etc" })).status).toBe(400);

    let made = 1;
    for (; made < LIMITS.designsPerGuestPerDay; made++) {
      s.clock += 11_000;
      expect((await mika.send("POST", GROUPS, { name: `G${made}` })).status, `group ${made}`).toBe(201);
    }
    s.clock += 11_000;
    expect((await mika.send("POST", GROUPS, { name: "One more" })).status).toBe(429);
  });
});

describe("guests and designs: safety", () => {
  it("can't be written from another site", async () => {
    const share = await setup();
    const mika = await joined(share, "Mika");
    const d = await make(mika);
    const evil = { origin: "https://evil.example" };
    expect((await mika.send("POST", MOBS, { name: "x" }, evil)).status).toBe(403);
    expect((await mika.send("PATCH", `${MOBS}/${d.id}`, { name: "x" }, evil)).status).toBe(403);
    expect((await mika.raw("PUT", `${MOBS}/${d.id}/board`, await png(), "image/png", evil)).status).toBe(403);
    expect((await mika.raw("POST", `${MOBS}/${d.id}/pictures`, await png(), "image/png", evil)).status).toBe(403);
    expect((await mika.send("DELETE", `${MOBS}/${d.id}`, undefined, evil)).status).toBe(403);
  });

  it("cap sizes and kinds of drawings and pictures", async () => {
    const share = await setup();
    const mika = await joined(share, "Mika");
    const d = await make(mika);
    const path = `${MOBS}/${d.id}`;
    const huge = new Uint8Array(9 * 1024 * 1024);
    expect((await mika.raw("PUT", `${path}/board`, huge, "image/png")).status).toBe(413);
    expect((await mika.raw("PUT", `${path}/board`, Buffer.from("not a png"), "image/png")).status).toBe(400);
    const svg = Buffer.from("<svg onload='alert(1)'/>");
    expect((await mika.raw("POST", `${path}/pictures`, svg, "image/svg+xml")).status).toBe(415);
    expect((await mika.raw("POST", `${path}/pictures`, svg, "image/png")).status).toBe(400);
    expect((await mika.send("PATCH", path, { description: "x".repeat(9000) })).status).toBe(400);
    expect((await mika.send("POST", MOBS, { name: "x".repeat(81) })).status).toBe(400);
  });

  it("limit how many designs a guest makes a day, and slow fast saves without blocking", async () => {
    const share = await setup();
    const mika = await joined(share, "Mika");
    let made = 0;
    for (let i = 0; i < LIMITS.designsPerGuestPerDay; i++) {
      // Spread out, so only the day's cap is in play.
      s.clock += 11_000;
      expect((await mika.send("POST", MOBS, { name: `D${i}` })).status, `design ${i}`).toBe(201);
      made++;
    }
    const over = await mika.send("POST", MOBS, { name: "One more" });
    expect(over.status).toBe(429);
    expect(Number(over.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(made).toBe(LIMITS.designsPerGuestPerDay);

    const d = (await json<{ designs: DesignInfo[] }>(await mika.get(MOBS))).designs[0];
    let slowed = 0;
    for (let i = 0; i < LIMITS.designSaves.capacity + 5; i++) {
      const res = await mika.send("PATCH", `${MOBS}/${d.id}`, { description: `v${i}` });
      if (res.status === 429) slowed++;
    }
    expect(slowed).toBeGreaterThan(0);
    // Saves going over their rate don't strike: the guest can still read and, later, save.
    expect((await mika.get(MOBS)).status).toBe(200);
    s.clock += 60_000;
    expect((await mika.send("PATCH", `${MOBS}/${d.id}`, { description: "later" })).status).toBe(200);
  });

  it("wakes a guest's long poll when a design changes", async () => {
    const share = await setup();
    const mika = await joined(share, "Mika");
    const first = await mika.get("/api/wikis/alpha/changes");
    const etag = first.headers.get("etag") as string;
    const waiting = mika.get("/api/wikis/alpha/changes?wait=25", { "if-none-match": etag });
    s.emit({ type: "designs", wiki: "alpha" });
    const woke = await waiting;
    expect(woke.status).toBe(200);
    expect(((await woke.json()) as { designs: number }).designs).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import type { Person } from "../../shared/api.ts";
import { type Browser, HOST, sharingFixture } from "./fixture.ts";
import { LIMITS } from "./limits.ts";
import { createPresence, PRESENCE_TTL, placeOf } from "./presence.ts";
import type { Share } from "./shares.ts";

const s = sharingFixture();
const TAB = "tab-aaaaaaaa";

const people = async (res: Response) => ((await res.json()) as { people: Person[] }).people;
const ownerHere = (page: string | null, tab = TAB) =>
  s.owner("/api/wikis/alpha/presence", { method: "PUT", body: { tab, page } });
const guestHere = (b: Browser, page: string | null, wiki = "alpha") =>
  b.send("PUT", `/api/wikis/${wiki}/presence`, { page });

async function joined(share: Share, name: string, ip?: string) {
  const b = s.browser(share, ip);
  expect((await b.join(name)).status).toBe(201);
  return b;
}

describe("the owner's presence", () => {
  it("reports the page each tab is on and lists the host once, as you", async () => {
    expect((await ownerHere("plan")).status).toBe(200);
    s.clock += 1000;
    await ownerHere("", "tab-bbbbbbbb");
    const list = await people(await s.owner("/api/wikis/alpha/presence"));
    expect(list).toEqual([
      { id: "host", name: "Host", role: "host", page: "", title: "Home", lastSeen: expect.any(String), me: true },
    ]);
    expect(await people(await s.owner("/api/wikis/beta/presence"))).toEqual([]);
  });

  it("keeps only pages that exist and special pages", async () => {
    await ownerHere("_/categories/lore");
    expect((await people(await s.owner("/api/wikis/alpha/presence")))[0].page).toBe("_/categories/lore");
    await ownerHere("no/such/page");
    expect((await people(await s.owner("/api/wikis/alpha/presence")))[0].page).toBeNull();
  });

  it("refuses bad reports, other sites and other host names", async () => {
    expect((await s.owner("/api/wikis/alpha/presence", { method: "PUT", body: { tab: "x", page: "" } })).status).toBe(
      400,
    );
    expect((await s.owner("/api/wikis/nope/presence", { method: "PUT", body: { tab: TAB, page: "" } })).status).toBe(
      404,
    );
    const evil = await s.ownerApp.request("http://localhost:4400/api/wikis/alpha/presence", {
      method: "PUT",
      headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: JSON.stringify({ tab: TAB, page: "" }),
    });
    expect(evil.status).toBe(403);
    expect((await s.ownerApp.request("http://rebound.example/api/wikis/alpha/presence")).status).toBe(404);
  });

  it("leaves when the tab closes or stops reporting", async () => {
    await ownerHere("plan");
    expect((await s.owner(`/api/wikis/alpha/presence/${TAB}`, { method: "DELETE" })).status).toBe(204);
    expect(await people(await s.owner("/api/wikis/alpha/presence"))).toEqual([]);
    await ownerHere("plan");
    s.clock += PRESENCE_TTL + 1;
    s.presence.prune();
    expect(await people(await s.owner("/api/wikis/alpha/presence"))).toEqual([]);
  });

  it("sees every guest on the wiki and gets a presence event when someone moves", async () => {
    const one = await joined(s.shares.create({ wiki: "alpha", kind: "view" }), "Mika", "203.0.113.1");
    const two = await joined(s.shares.create({ wiki: "alpha", kind: "comment" }), "Ren", "203.0.113.2");
    const events = await s.owner("/api/events");
    const reader = (events.body as ReadableStream<Uint8Array>).getReader();
    await guestHere(one, "plan");
    await guestHere(two, "");
    let text = "";
    while (!text.includes('"presence"')) text += new TextDecoder().decode((await reader.read()).value);
    expect(text).toContain('{"type":"presence","wiki":"alpha"}');
    await reader.cancel();
    const list = await people(await s.owner("/api/wikis/alpha/presence"));
    expect(list.map((p) => [p.name, p.role, p.page, p.title])).toEqual([
      ["Mika", "guest", "plan", "Plan"],
      ["Ren", "guest", "", "Home"],
    ]);
  });
});

describe("guests' presence", () => {
  it("checks the link first: unknown, other wiki, ended", async () => {
    const share = s.shares.create({ wiki: "alpha", kind: "view", duration: "1h" });
    const b = await joined(share, "Mika");
    expect((await guestHere(b, "", "beta")).status).toBe(404);
    expect((await b.get("/api/wikis/beta/presence")).status).toBe(404);
    const bogus = await s.guestApp.request(`${HOST}/s/${"x".repeat(43)}/api/wikis/alpha/presence`);
    expect(bogus.status).toBe(404);
    s.clock += 2 * 3_600_000;
    expect((await guestHere(b, "")).status).toBe(410);
    expect((await b.get("/api/wikis/alpha/presence")).status).toBe(410);
  });

  it("need a name, and report on view links too", async () => {
    const share = s.shares.create({ wiki: "alpha", kind: "view" });
    const anon = s.browser(share);
    expect((await guestHere(anon, "")).status).toBe(401);
    expect((await anon.get("/api/wikis/alpha/presence")).status).toBe(401);
    const b = await joined(share, "Mika");
    const res = await guestHere(b, "plan");
    expect(res.status).toBe(200);
    expect((await people(res)).map((p) => [p.name, p.page, p.me])).toEqual([["Mika", "plan", true]]);
  });

  it("can't be reported from another site, or with a big or odd body", async () => {
    const b = await joined(s.shares.create({ wiki: "alpha", kind: "comment" }), "Mika");
    expect(
      (await b.send("PUT", "/api/wikis/alpha/presence", { page: "" }, { origin: "https://evil.example" })).status,
    ).toBe(403);
    expect(
      (await b.send("DELETE", "/api/wikis/alpha/presence", undefined, { origin: "https://evil.example" })).status,
    ).toBe(403);
    expect((await guestHere(b, "x".repeat(LIMITS.request))).status).toBe(413);
    expect((await guestHere(b, "x".repeat(301))).status).toBe(400);
    expect((await b.send("PUT", "/api/wikis/alpha/presence", { page: "", name: "Host" })).status).toBe(400);
  });

  it("see the host and their own link's guests, never other links or anyone's guest id", async () => {
    const mine = s.shares.create({ wiki: "alpha", kind: "view" });
    const other = s.shares.create({ wiki: "alpha", kind: "view" });
    const me = await joined(mine, "Mika", "203.0.113.1");
    const friend = await joined(mine, "Ren", "203.0.113.2");
    const stranger = await joined(other, "Sol", "203.0.113.3");
    await ownerHere("plan");
    await guestHere(me, "");
    await guestHere(friend, "plan");
    await guestHere(stranger, "plan");
    const list = await people(await me.get("/api/wikis/alpha/presence"));
    expect(list.map((p) => [p.name, p.role, p.page, !!p.me])).toEqual([
      ["Host", "host", "plan", false],
      ["Mika", "guest", "", true],
      ["Ren", "guest", "plan", false],
    ]);
    const ids = [...mine.guests.keys(), ...other.guests.keys()];
    for (const p of list) expect(ids).not.toContain(p.id);
  });

  it("go when they leave, are blocked, or their link is revoked", async () => {
    const share = s.shares.create({ wiki: "alpha", kind: "view" });
    const a = await joined(share, "Mika", "203.0.113.1");
    const b = await joined(share, "Ren", "203.0.113.2");
    await guestHere(a, "");
    await guestHere(b, "");
    expect((await a.send("DELETE", "/api/wikis/alpha/presence")).status).toBe(204);
    expect((await people(await s.owner("/api/wikis/alpha/presence"))).map((p) => p.name)).toEqual(["Ren"]);
    const ren = [...share.guests.values()].find((g) => g.name === "Ren");
    s.shares.block(share.id, ren?.id as string, true);
    expect(await people(await s.owner("/api/wikis/alpha/presence"))).toEqual([]);
    expect((await guestHere(b, "")).status).toBe(403);
    await guestHere(a, "plan");
    s.shares.revoke(share.id);
    expect(await people(await s.owner("/api/wikis/alpha/presence"))).toEqual([]);
  });

  it("are rate limited without being blocked for it", async () => {
    const b = await joined(s.shares.create({ wiki: "alpha", kind: "view" }), "Mika");
    for (let i = 0; i < LIMITS.presence.capacity; i++)
      expect((await guestHere(b, i % 2 ? "" : "plan")).status).toBe(200);
    for (let i = 0; i < LIMITS.strikes + 2; i++) {
      const res = await guestHere(b, "");
      expect(res.status).toBe(429);
      expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    }
    expect((await b.get("/api/wikis/alpha/presence")).status).toBe(200);
    s.clock += 60_000;
    expect((await guestHere(b, "")).status).toBe(200);
  });

  it("wake a waiting poll when someone they can see moves, and only then", async () => {
    const mine = s.shares.create({ wiki: "alpha", kind: "view" });
    const other = s.shares.create({ wiki: "alpha", kind: "view" });
    const me = await joined(mine, "Mika", "203.0.113.1");
    const friend = await joined(mine, "Ren", "203.0.113.2");
    const stranger = await joined(other, "Sol", "203.0.113.3");
    const first = await me.get("/api/wikis/alpha/changes");
    const etag = first.headers.get("etag") as string;
    expect(((await first.json()) as { presence: string }).presence).toBe("0-0");

    // Someone on another link moving doesn't wake it.
    const quiet = me.get("/api/wikis/alpha/changes?wait=1", { "if-none-match": etag });
    await guestHere(stranger, "plan");
    expect((await quiet).status).toBe(304);

    const waiting = me.get("/api/wikis/alpha/changes?wait=25", { "if-none-match": etag });
    await guestHere(friend, "plan");
    const woke = await waiting;
    expect(woke.status).toBe(200);
    const tag = woke.headers.get("etag") as string;
    expect(tag).not.toBe(etag);

    const host = me.get("/api/wikis/alpha/changes?wait=25", { "if-none-match": tag });
    await ownerHere("");
    expect((await host).status).toBe(200);

    // A heartbeat on the same page changes nothing.
    const now = (await me.get("/api/wikis/alpha/changes")).headers.get("etag") as string;
    await guestHere(friend, "plan");
    expect((await me.get("/api/wikis/alpha/changes", { "if-none-match": now })).status).toBe(304);
  });
});

describe("placeOf", () => {
  it("keeps pages and special pages, and nothing else", () => {
    const exists = (p: string) => p === "" || p === "plan";
    expect(placeOf("plan", exists)).toBe("plan");
    expect(placeOf("", exists)).toBe("");
    expect(placeOf("_/recent", exists)).toBe("_/recent");
    expect(placeOf("_/categories/Lore & maps", exists)).toBe("_/categories/Lore & maps");
    for (const bad of ["nope", "_/Recent", "_/x/\u0000", "javascript:alert(1)", 3, null, "x".repeat(301)])
      expect(placeOf(bad, exists)).toBeNull();
  });
});

describe("createPresence", () => {
  it("lists the host's latest page across tabs and drops the oldest tabs past fifty", () => {
    let t = 0;
    const p = createPresence({ now: () => t, hostName: () => "Nari", guestName: () => null, newId: () => "id" });
    for (let i = 0; i < 60; i++) {
      t++;
      p.report({ key: `host:${i}`, wiki: "w", role: "host", page: `p${i}` });
    }
    expect(p.list("w", { role: "host" })).toMatchObject([{ name: "Nari", page: "p59", me: true }]);
    t += PRESENCE_TTL - 30;
    p.prune();
    expect(p.list("w", { role: "host" })).toHaveLength(1);
  });
});

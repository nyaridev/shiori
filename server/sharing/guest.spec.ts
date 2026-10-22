import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Answer, GuestSession, LiveEvent, SharesState, Thread, TunnelStatus } from "../../shared/api.ts";
import { buildApp } from "../app.ts";
import { createLive } from "../live.ts";
import { createRegistry } from "../registry.ts";
import { addMessage, closeAll, listThreads, waitingForAgent } from "../threads.ts";
import { createWikiData } from "../wikiData.ts";
import { buildGuestApp, cleanName } from "./guest.ts";
import { LIMITS } from "./limits.ts";
import { createShares, type Share, type Shares } from "./shares.ts";

const HOST = "http://share.test";
/** The built app's page, as the guest server serves it. */
const SHELL = '<!doctype html><div id="root"></div><script type="module" src="/assets/index.js"></script>';
let app: string;
let clock: number;
let shares: Shares;
let guestApp: ReturnType<typeof buildGuestApp>;
let ownerApp: ReturnType<typeof buildApp>;
/** The tunnel the owner's app reports; tests set its status. */
let tunnel: {
  now: TunnelStatus;
  starts: number;
  status: () => TunnelStatus;
  start: () => void;
  onChange: () => () => boolean;
};
/** Tells the servers a file changed, as the file watcher would. */
let emit: (e: LiveEvent) => void;

function wiki(id: string) {
  const root = join(app, "wikis", id);
  mkdirSync(join(root, "pages"), { recursive: true });
  mkdirSync(join(root, "assets"));
  writeFileSync(join(root, "wiki.json"), JSON.stringify({ schema: 1, id, title: id.toUpperCase() }));
  writeFileSync(join(root, "cover.svg"), "<svg/>");
  writeFileSync(join(root, "assets", "map.png"), "png");
  writeFileSync(join(root, "pages", "index.md"), "Home of the wiki.");
  writeFileSync(
    join(root, "pages", "plan.md"),
    "---\ntitle: Plan\nquestions:\n  - id: q1\n    text: Which first?\n    options: [Steam, itch.io]\n---\nThe plan.",
  );
  return root;
}

beforeEach(() => {
  app = mkdtempSync(join(tmpdir(), "shiori-share-"));
  mkdirSync(join(app, "wikis", "_template"), { recursive: true });
  wiki("alpha");
  wiki("beta");
  clock = Date.parse("2026-10-21T12:00:00Z");
  const registry = createRegistry(app);
  const listeners = new Set<(e: LiveEvent) => void>();
  emit = (e) => {
    for (const l of listeners) l(e);
  };
  const live = {
    ...createLive(registry),
    subscribe: (l: (e: LiveEvent) => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
  const data = createWikiData(live);
  shares = createShares({ now: () => clock, origin: () => HOST });
  const dist = join(app, "dist");
  mkdirSync(dist);
  writeFileSync(join(dist, "index.html"), SHELL);
  guestApp = buildGuestApp({ registry, data, shares, staticDir: dist, secret: "test-secret" });
  tunnel = {
    now: { state: "off", url: null },
    starts: 0,
    status: () => tunnel.now,
    start: () => {
      tunnel.starts++;
    },
    onChange: () => () => true,
  };
  ownerApp = buildApp({ registry, live, data, shares, tunnel });
});
afterEach(() => {
  closeAll();
  rmSync(app, { recursive: true, force: true });
});

/** A guest's browser: keeps the cookie, sends this site's Origin on writes, comes from one address. */
function browser(share: Share, ip = "203.0.113.7") {
  let cookie = "";
  const base = `/s/${share.token}`;
  const send = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await guestApp.request(`${HOST}${base}${path}`, {
      method,
      headers: {
        "cf-connecting-ip": ip,
        ...(cookie ? { cookie } : {}),
        ...(body === undefined ? {} : { "content-type": "application/json", origin: HOST }),
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return res;
  };
  return {
    get: (path: string, headers?: Record<string, string>) => send("GET", path, undefined, headers),
    post: (path: string, body: unknown, headers?: Record<string, string>) => send("POST", path, body, headers),
    patch: (path: string, body: unknown) => send("PATCH", path, body),
    join: (name: string) => send("POST", "/api/session", { name }),
    setCookie: (c: string) => {
      cookie = c;
    },
    get cookie() {
      return cookie;
    },
  };
}

/** A page the link can't open: the bare app with the refusal's status, and nothing from the wiki. */
async function refusedPage(res: Response, status: number) {
  expect(res.status).toBe(status);
  expect(res.headers.get("content-type")).toContain("text/html");
  expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  expect(await res.text()).toBe(SHELL);
}

const quote = { exact: "The plan", prefix: "", suffix: "." };
const alpha = () => join(app, "wikis", "alpha");

describe("the link", () => {
  it("answers 404 to unknown tokens and anything outside a link", async () => {
    const share = shares.create({ wiki: "alpha", kind: "view" });
    const bogus = `/s/${"x".repeat(43)}/api/session`;
    for (const path of [bogus, "/s/short/api/session", "/", "/api/wikis", "/api/wikis/alpha", "/api/events"]) {
      expect((await guestApp.request(`${HOST}${path}`)).status, path).toBe(404);
    }
    const b = browser(share);
    await b.join("Ana");
    for (const path of ["/api/wikis", "/api/events", "/api/dev/elements", "/api/shares", "/api/wikis/beta"]) {
      expect((await b.get(path)).status, path).toBe(404);
    }
  });

  it("answers 410 once a link expires or is revoked", async () => {
    const day = shares.create({ wiki: "alpha", kind: "view" });
    const hour = shares.create({ wiki: "alpha", kind: "view", duration: "1h" });
    const forever = shares.create({ wiki: "alpha", kind: "view", duration: "session" });
    expect((await browser(hour).get("/api/session")).status).toBe(200);
    clock += 3_600_000;
    expect((await browser(hour).get("/api/session")).status).toBe(410);
    expect((await browser(day).get("/api/session")).status).toBe(200);
    shares.revoke(day.id);
    expect((await browser(day).get("/api/session")).status).toBe(410);
    clock += 30 * 86_400_000;
    expect((await browser(forever).get("/api/session")).status).toBe(200);
    shares.stopAll();
    expect((await browser(forever).get("/api/session")).status).toBe(410);
  });

  it("serves pages of a link that ended or never existed the bare app, and the API JSON", async () => {
    const share = shares.create({ wiki: "alpha", kind: "view" });
    shares.revoke(share.id);
    const b = browser(share);
    for (const path of ["", "/", "/w/alpha/plan"]) await refusedPage(await b.get(path), 410);
    const api = await b.get("/api/session");
    expect(api.status).toBe(410);
    expect(api.headers.get("content-type")).toContain("application/json");
    const unknown = `${HOST}/s/${"x".repeat(43)}`;
    await refusedPage(await guestApp.request(`${unknown}/w/alpha`), 404);
    expect((await guestApp.request(`${unknown}/api/session`)).headers.get("content-type")).toContain("json");
    // Not a token the app would recognize: no page.
    expect((await guestApp.request(`${HOST}/s/short/`)).headers.get("content-type")).toContain("json");
  });

  it("sends the security headers on everything", async () => {
    const share = shares.create({ wiki: "alpha", kind: "view" });
    for (const res of [await browser(share).get("/api/session"), await guestApp.request(`${HOST}/nope`)]) {
      expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
      expect(res.headers.get("content-security-policy")).toContain("script-src 'self';");
      // Vite inlines small fonts.
      expect(res.headers.get("content-security-policy")).toContain("font-src 'self' data:");
      expect(res.headers.get("referrer-policy")).toBe("no-referrer");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect(res.headers.get("access-control-allow-origin")).toBeNull();
    }
  });
});

describe("guests", () => {
  it("pick a name before reading, and get a cookie scoped to the link", async () => {
    const share = shares.create({ wiki: "alpha", kind: "view" });
    const b = browser(share);
    const before = (await (await b.get("/api/session")).json()) as GuestSession;
    expect(before).toMatchObject({ wiki: { id: "alpha", title: "ALPHA" }, kind: "view", guest: null });
    expect((await b.get("/api/wikis/alpha")).status).toBe(401);

    for (const bad of ["A", "x".repeat(33), "bad\u0000name", "zero​width", "  "]) {
      expect((await b.join(bad)).status, bad).toBe(400);
    }
    expect((await b.join("Agent")).status).toBe(409);
    const res = await b.join("  Ana   Lee ");
    expect(res.status).toBe(201);
    const set = res.headers.get("set-cookie") ?? "";
    expect(set).toMatch(/HttpOnly/);
    expect(set).toMatch(/Secure/);
    expect(set).toMatch(/SameSite=Strict/);
    expect(set).toContain(`Path=/s/${share.token}/`);
    expect(((await res.json()) as GuestSession).guest).toEqual({ name: "Ana Lee" });

    expect((await browser(share, "198.51.100.1").join("ana lee")).status).toBe(409);
  });

  it("can't use a forged cookie or one from another link", async () => {
    const a = shares.create({ wiki: "alpha", kind: "comment" });
    const other = shares.create({ wiki: "alpha", kind: "comment" });
    const b = browser(a);
    await b.join("Ana");
    const forged = browser(a);
    forged.setCookie(`${b.cookie.slice(0, -3)}abc`);
    expect((await forged.get("/api/wikis/alpha")).status).toBe(401);
    const elsewhere = browser(other);
    elsewhere.setCookie(b.cookie);
    expect((await elsewhere.get("/api/wikis/alpha")).status).toBe(401);
  });

  it("read only the link's wiki, its media and nothing owner-only", async () => {
    const share = shares.create({ wiki: "alpha", kind: "view" });
    const b = browser(share);
    await b.join("Ana");
    const detail = await (await b.get("/api/wikis/alpha")).json();
    expect(detail).toMatchObject({ id: "alpha", problems: [] });
    expect((await b.get("/api/wikis/alpha/page?path=plan")).status).toBe(200);
    expect((await b.get("/api/wikis/alpha/pages")).status).toBe(200);
    expect((await b.get("/api/wikis/alpha/search?q=plan")).status).toBe(200);
    expect((await b.get("/api/wikis/alpha/images")).status).toBe(200);
    expect((await b.get("/api/wikis/beta/images")).status).toBe(404);
    const file = await b.get("/api/wikis/alpha/files/assets/map.png");
    expect(file.status).toBe(200);
    expect(file.headers.get("cache-control")).toBe("private, no-cache");
    for (const path of [
      "/api/wikis/beta/page?path=",
      "/api/wikis/beta/files/assets/map.png",
      "/api/wikis/alpha/files/data/wiki.db",
      "/api/wikis/alpha/files/wiki.json",
      "/api/wikis/alpha/files/pages/plan.md",
      "/api/wikis/alpha/files/..%2F..%2Fbeta%2Fassets%2Fmap.png",
      "/api/wikis/alpha/files/%E0%A4%A",
    ]) {
      expect((await b.get(path)).status, path).toBe(404);
    }
  });

  it("can't write through a view link", async () => {
    const share = shares.create({ wiki: "alpha", kind: "view" });
    const b = browser(share);
    await b.join("Ana");
    expect((await b.post("/api/wikis/alpha/threads", { page: "plan", quote, body: "Hi" })).status).toBe(403);
    expect((await b.post("/api/wikis/alpha/answers", { page: "plan", question: "q1", choice: "Steam" })).status).toBe(
      403,
    );
    expect(listThreads(alpha())).toEqual([]);
  });

  it("comment, reply and answer with their name; the owner sees who, guests never see ids", async () => {
    const share = shares.create({ wiki: "alpha", kind: "comment" });
    const ana = browser(share);
    await ana.join("Ana");
    const res = await ana.post("/api/wikis/alpha/threads", { page: "plan", quote, body: "Too vague" });
    expect(res.status).toBe(201);
    const thread = (await res.json()) as Thread;
    expect(thread.messages[0]).toMatchObject({ author: "guest", name: "Ana", mine: true });
    expect(thread.messages[0].guestId).toBeUndefined();
    addMessage(alpha(), thread.id, "user", "Which part?");

    const bo = browser(share, "198.51.100.2");
    await bo.join("Bo");
    expect((await bo.post(`/api/wikis/alpha/threads/${thread.id}/messages`, { body: "Agreed" })).status).toBe(200);
    const seen = ((await (await bo.get("/api/wikis/alpha/threads?page=plan")).json()) as { threads: Thread[] })
      .threads[0];
    expect(seen.messages.map((m) => [m.author, m.name, m.mine])).toEqual([
      ["guest", "Ana", false],
      ["user", "Host", false],
      ["guest", "Bo", true],
    ]);
    expect(JSON.stringify(seen)).not.toContain("guestId");

    const owner = listThreads(alpha())[0];
    expect(owner.messages.map((m) => [m.author, m.name])).toEqual([
      ["guest", "Ana"],
      ["user", undefined],
      ["guest", "Bo"],
    ]);
    expect(owner.messages[0].guestId).toBeTruthy();

    const answer = await bo.post("/api/wikis/alpha/answers", { page: "plan", question: "q1", choice: "Steam" });
    expect(answer.status).toBe(201);
    expect(await answer.json()).toMatchObject({ author: "guest", name: "Bo", mine: true });
    expect((await bo.post("/api/wikis/alpha/answers", { page: "plan", question: "q1", choice: "Epic" })).status).toBe(
      400,
    );
    expect((await bo.post("/api/wikis/alpha/threads", { page: "nowhere", quote, body: "Hi" })).status).toBe(404);
  });

  it("resolve or reopen only threads they started, and never as won't fix", async () => {
    const share = shares.create({ wiki: "alpha", kind: "comment" });
    const ana = browser(share);
    await ana.join("Ana");
    const bo = browser(share, "198.51.100.2");
    await bo.join("Bo");
    const { id } = (await (
      await ana.post("/api/wikis/alpha/threads", { page: "plan", quote, body: "Hm" })
    ).json()) as Thread;
    expect((await bo.patch(`/api/wikis/alpha/threads/${id}`, { status: "resolved" })).status).toBe(403);
    expect((await ana.patch(`/api/wikis/alpha/threads/${id}`, { status: "wontfix" })).status).toBe(400);
    expect((await ana.patch(`/api/wikis/alpha/threads/${id}`, { status: "resolved" })).status).toBe(200);
    expect((await bo.post(`/api/wikis/alpha/threads/${id}/messages`, { body: "Late" })).status).toBe(409);
    expect((await ana.patch(`/api/wikis/alpha/threads/${id}`, { status: "open" })).status).toBe(200);
  });

  it("can't be made to write from another site", async () => {
    const share = shares.create({ wiki: "alpha", kind: "comment" });
    const b = browser(share);
    await b.join("Ana");
    const body = { page: "plan", quote, body: "Hi" };
    expect((await b.post("/api/wikis/alpha/threads", body, { origin: "https://evil.example" })).status).toBe(403);
    expect((await b.post("/api/wikis/alpha/threads", body, { origin: "" })).status).toBe(403);
    expect(
      (await browser(share).post("/api/session", { name: "Eve" }, { origin: "https://evil.example" })).status,
    ).toBe(403);
    expect(listThreads(alpha())).toEqual([]);
  });
});

describe("limits", () => {
  it("cap sizes", async () => {
    const share = shares.create({ wiki: "alpha", kind: "comment" });
    const b = browser(share);
    await b.join("Ana");
    const long = "é".repeat(LIMITS.comment / 2 + 1);
    expect((await b.post("/api/wikis/alpha/threads", { page: "plan", quote, body: long })).status).toBe(400);
    const huge = JSON.stringify({ page: "plan", quote, body: "x".repeat(LIMITS.request) });
    expect((await b.post("/api/wikis/alpha/threads", huge)).status).toBe(413);
    const wide = { ...quote, prefix: "x".repeat(LIMITS.context + 1) };
    expect((await b.post("/api/wikis/alpha/threads", { page: "plan", quote: wide, body: "Hi" })).status).toBe(400);
  });

  it("slow writers down with 429 and block them after five", async () => {
    const share = shares.create({ wiki: "alpha", kind: "comment" });
    const b = browser(share);
    await b.join("Ana");
    const post = () => b.post("/api/wikis/alpha/threads", { page: "plan", quote, body: "Spam" });
    for (let i = 0; i < LIMITS.writes.capacity; i++) expect((await post()).status).toBe(201);
    const limited = await post();
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    clock += 10_000;
    expect((await post()).status).toBe(201);
    for (let i = 0; i < LIMITS.strikes - 1; i++) expect((await post()).status).toBe(429);
    expect((await b.get("/api/session")).status).toBe(403);
    // Their address is blocked too, even with a fresh name.
    expect((await browser(share).get("/api/session")).status).toBe(403);
    expect(shares.info(share).guests[0]).toMatchObject({ name: "Ana", blocked: true });
    expect(shares.info(share).blockedIps).toBe(1);
    expect(shares.info(share).activity.at(-1)?.what).toBe("blocked for going over the limits");
  });

  it("cap writes per guest per day and reads per address", async () => {
    const share = shares.create({ wiki: "alpha", kind: "comment" });
    const b = browser(share);
    await b.join("Ana");
    for (let i = 0; i < LIMITS.writesPerGuestPerDay; i++) {
      clock += 10_000;
      expect((await b.post("/api/wikis/alpha/threads", { page: "plan", quote, body: `#${i}` })).status).toBe(201);
    }
    clock += 60_000;
    expect((await b.post("/api/wikis/alpha/threads", { page: "plan", quote, body: "one more" })).status).toBe(429);

    const reader = browser(share, "192.0.2.50");
    let status = 200;
    for (let i = 0; i <= LIMITS.reads.capacity && status === 200; i++)
      status = (await reader.get("/api/session")).status;
    expect(status).toBe(429);
  });
});

describe("polling", () => {
  it("answers 304 while nothing changed", async () => {
    const share = shares.create({ wiki: "alpha", kind: "view" });
    const b = browser(share);
    await b.join("Ana");
    const first = await b.get("/api/wikis/alpha/changes");
    const etag = first.headers.get("etag") ?? "";
    expect(etag).toMatch(/^"\d+\.\d+\.\d+\.\d+-\d+"$/);
    expect((await b.get("/api/wikis/alpha/changes", { "if-none-match": etag })).status).toBe(304);
    expect((await b.get("/api/wikis/alpha/changes", { "if-none-match": `W/${etag}` })).status).toBe(304);
  });

  it("hold the request until the wiki changes (long polling)", async () => {
    const share = shares.create({ wiki: "alpha", kind: "view" });
    const b = browser(share);
    await b.join("Ana");
    const etag = (await b.get("/api/wikis/alpha/changes")).headers.get("etag") ?? "";
    // Nothing changes: an empty 304 once the wait is up.
    const started = Date.now();
    expect((await b.get("/api/wikis/alpha/changes?wait=0.2", { "if-none-match": etag })).status).toBe(304);
    expect(Date.now() - started).toBeGreaterThanOrEqual(150);
    // Another wiki's comments don't wake it; this wiki's do, with the new versions.
    const waiting = b.get("/api/wikis/alpha/changes?wait=5", { "if-none-match": etag });
    await new Promise((r) => setTimeout(r, 50));
    emit({ type: "threads", wiki: "beta" });
    emit({ type: "threads", wiki: "alpha" });
    const res = await waiting;
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ threads: 1 });
    expect(res.headers.get("etag")).not.toBe(etag);
  });
});

describe("cleanName", () => {
  it("trims, collapses spaces and refuses invisible characters", () => {
    expect(cleanName(" Ana \t Lee ")).toBe("Ana Lee");
    expect(cleanName("Zoë 🌸")).toBe("Zoë 🌸");
    expect(cleanName("a‮b")).toBeNull();
  });
});

describe("the owner's share routes", () => {
  const owner = (path: string, init?: RequestInit) => ownerApp.request(`http://127.0.0.1:4400${path}`, init);
  const json = (body: unknown) => ({
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:4400" },
    body: JSON.stringify(body),
  });

  it("make, list and revoke links", async () => {
    const res = await owner("/api/shares", json({ wiki: "alpha", kind: "comment", duration: "1h" }));
    expect(res.status).toBe(201);
    const info = await res.json();
    expect(info).toMatchObject({ wiki: "alpha", kind: "comment", expiresAt: "2026-10-21T13:00:00.000Z" });
    expect(info.url).toBe(`${HOST}${info.path}`);
    expect(info.path).toMatch(/^\/s\/[A-Za-z0-9_-]{43}\/$/);
    expect((await (await owner("/api/shares")).json()).shares).toHaveLength(1);
    expect((await owner(`/api/shares/${info.id}`, { method: "DELETE" })).status).toBe(204);
    expect((await (await owner("/api/shares")).json()).shares).toHaveLength(0);
    expect((await owner("/api/shares", json({ wiki: "nope", kind: "view" }))).status).toBe(404);
  });

  it("allow ten links at a time and stop them all at once", async () => {
    for (let i = 0; i < LIMITS.links; i++)
      expect((await owner("/api/shares", json({ wiki: "alpha", kind: "view" }))).status).toBe(201);
    expect((await owner("/api/shares", json({ wiki: "alpha", kind: "view" }))).status).toBe(409);
    expect((await owner("/api/shares", { method: "DELETE" })).status).toBe(204);
    expect(shares.list()).toHaveLength(0);
  });

  it("refuse other sites and other host names", async () => {
    const evil = { ...json({ wiki: "alpha", kind: "comment" }), headers: { origin: "https://evil.example" } };
    expect((await owner("/api/shares", evil)).status).toBe(403);
    expect((await ownerApp.request("http://rebind.evil.example:4400/api/wikis")).status).toBe(404);
    expect(shares.list()).toHaveLength(0);
  });

  it("say so in dev, where sharing is off", async () => {
    const registry = createRegistry(app);
    const devApp = buildApp({ registry, live: createLive(registry) });
    const res = await devApp.request("http://localhost:4411/api/shares");
    expect(res.status).toBe(409);
  });
});

describe("the owner's share state", () => {
  const owner = (path: string, init?: RequestInit) => ownerApp.request(`http://127.0.0.1:4400${path}`, init);
  const send = (method: string, body: unknown) => ({
    method,
    headers: { "content-type": "application/json", origin: "http://localhost:4400" },
    body: JSON.stringify(body),
  });
  const state = async () => (await (await owner("/api/shares")).json()) as SharesState;

  it("lists the tunnel and how the owner signs, and tries the tunnel again", async () => {
    tunnel.now = { state: "missing", url: null, install: "winget install Cloudflare.cloudflared" };
    expect(await state()).toMatchObject({ shares: [], tunnel: tunnel.now, host: "Host" });
    expect((await owner("/api/shares/tunnel", send("POST", {}))).status).toBe(409);
    shares.create({ wiki: "alpha", kind: "view" });
    expect((await owner("/api/shares/tunnel", send("POST", {}))).status).toBe(200);
    expect(tunnel.starts).toBe(1);
  });

  it("let the owner pick their name for guests", async () => {
    const share = shares.create({ wiki: "alpha", kind: "comment" });
    expect((await owner("/api/shares/host", send("PUT", { name: "  Nari " }))).status).toBe(200);
    expect((await state()).host).toBe("Nari");
    const ana = browser(share);
    expect(((await (await ana.get("/api/session")).json()) as GuestSession).host).toBe("Nari");
    expect((await ana.join("nari")).status).toBe(409);
    await ana.join("Ana");
    const t = (await (
      await ana.post("/api/wikis/alpha/threads", { page: "plan", quote, body: "Hi" })
    ).json()) as Thread;
    addMessage(alpha(), t.id, "user", "Hello");
    const seen = ((await (await ana.get("/api/wikis/alpha/threads")).json()) as { threads: Thread[] }).threads[0];
    expect(seen.messages[1].name).toBe("Nari");

    expect((await owner("/api/shares/host", send("PUT", { name: "ana" }))).status).toBe(409);
    expect((await owner("/api/shares/host", send("PUT", { name: "x" }))).status).toBe(400);
    // A new link carries the name the dialog remembers.
    await owner("/api/shares", send("POST", { wiki: "beta", kind: "view", host: "Nari N." }));
    expect(shares.host()).toBe("Nari N.");
  });

  it("block a guest and their address, and let them back in", async () => {
    const share = shares.create({ wiki: "alpha", kind: "comment" });
    const ana = browser(share);
    await ana.join("Ana");
    const { id } = (await state()).shares[0].guests[0];
    const block = (blocked: boolean, sid = share.id, gid = id) =>
      owner(`/api/shares/${sid}/guests/${gid}`, send("PATCH", { blocked }));
    expect((await block(true)).status).toBe(200);
    expect((await ana.get("/api/wikis/alpha")).status).toBe(403);
    // Opening or reloading the link shows the app, which explains; the API tells it why and nothing more.
    for (const path of ["", "/", "/w/alpha/plan"]) await refusedPage(await ana.get(path), 403);
    for (const path of ["/api/session", "/api/wikis/alpha/page?path=plan", "/api/wikis/alpha/threads"]) {
      const res = await ana.get(path);
      expect(res.status, path).toBe(403);
      expect(await res.json(), path).toEqual({ error: "blocked" });
    }
    expect((await ana.post("/w/alpha/plan", {})).status).toBe(403);
    expect((await ana.post("/w/alpha/plan", {})).headers.get("content-type")).toContain("json");
    // A fresh cookie from the same address is blocked too.
    expect((await browser(share).get("/api/session")).status).toBe(403);
    await refusedPage(await browser(share).get("/"), 403);
    const listed = (await state()).shares[0];
    expect(listed.guests[0]).toMatchObject({ name: "Ana", blocked: true });
    expect(listed.activity.at(-1)).toMatchObject({ who: "Ana", what: "was blocked by the host" });
    expect((await block(false)).status).toBe(200);
    expect((await ana.get("/api/wikis/alpha")).status).toBe(200);
    expect((await block(true, share.id, "nobody")).status).toBe(404);
    expect((await block(true, "nolink")).status).toBe(404);
  });

  it("refuse other sites", async () => {
    const share = shares.create({ wiki: "alpha", kind: "comment" });
    const evil = (method: string, path: string, body: unknown) =>
      owner(path, { ...send(method, body), headers: { origin: "https://evil.example" } });
    expect((await evil("PUT", "/api/shares/host", { name: "Mallory" })).status).toBe(403);
    expect((await evil("POST", "/api/shares/tunnel", {})).status).toBe(403);
    expect((await evil("PATCH", `/api/shares/${share.id}/guests/x`, { blocked: false })).status).toBe(403);
    expect((await evil("PATCH", "/api/wikis/alpha/messages/1", { hidden: true })).status).toBe(403);
    expect((await evil("PATCH", "/api/wikis/alpha/answers/1", { hidden: true })).status).toBe(403);
    expect(shares.host()).toBe("Host");
  });

  it("say so in dev", async () => {
    const registry = createRegistry(app);
    const devApp = buildApp({ registry, live: createLive(registry) });
    for (const [method, path] of [
      ["PUT", "/api/shares/host"],
      ["POST", "/api/shares/tunnel"],
      ["PATCH", "/api/shares/a/guests/b"],
    ]) {
      const res = await devApp.request(`http://localhost:4411${path}`, send(method, {}));
      expect(res.status, path).toBe(409);
    }
  });
});

describe("hiding a guest's comment", () => {
  const owner = (path: string, init?: RequestInit) => ownerApp.request(`http://127.0.0.1:4400${path}`, init);
  const hide = (what: "messages" | "answers", id: number, hidden = true) =>
    owner(`/api/wikis/alpha/${what}/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", origin: "http://localhost:4400" },
      body: JSON.stringify({ hidden }),
    });
  const threadsOf = async (b: ReturnType<typeof browser>) =>
    ((await (await b.get("/api/wikis/alpha/threads")).json()) as { threads: Thread[] }).threads;
  const posted = async (res: Promise<Response>) => (await (await res).json()) as Thread;

  it("keeps it from guests and the inbox; the owner still sees it, marked", async () => {
    const share = shares.create({ wiki: "alpha", kind: "comment" });
    const ana = browser(share);
    await ana.join("Ana");
    const bo = browser(share, "198.51.100.2");
    await bo.join("Bo");
    const t = await posted(ana.post("/api/wikis/alpha/threads", { page: "plan", quote, body: "Fine" }));
    const spam = await posted(bo.post(`/api/wikis/alpha/threads/${t.id}/messages`, { body: "BUY NOW" }));
    const spamId = spam.messages[1].id;

    expect((await hide("messages", spamId)).status).toBe(200);
    for (const b of [ana, bo]) {
      const seen = await threadsOf(b);
      expect(seen[0].messages.map((m) => m.body)).toEqual(["Fine"]);
      expect(JSON.stringify(seen)).not.toContain("BUY NOW");
      expect(JSON.stringify(seen)).not.toContain("hidden");
    }
    // Replying hands back the thread as guests see it.
    const after = await posted(ana.post(`/api/wikis/alpha/threads/${t.id}/messages`, { body: "Thanks" }));
    expect(after.messages.map((m) => m.body)).toEqual(["Fine", "Thanks"]);
    const mine = listThreads(alpha())[0];
    expect(mine.messages[1]).toMatchObject({ body: "BUY NOW", hidden: true });
    // The inbox sees what guests see.
    expect(waitingForAgent(listThreads(alpha()))[0].messages.map((m) => m.body)).toEqual(["Fine", "Thanks"]);

    expect((await hide("messages", spamId, false)).status).toBe(200);
    expect((await threadsOf(ana))[0].messages).toHaveLength(3);
  });

  it("keeps hidden text out of guests' search too", async () => {
    const share = shares.create({ wiki: "alpha", kind: "comment" });
    const bo = browser(share);
    await bo.join("Bo");
    const t = await posted(bo.post("/api/wikis/alpha/threads", { page: "plan", quote, body: "Fine" }));
    const spam = await posted(bo.post(`/api/wikis/alpha/threads/${t.id}/messages`, { body: "zebracoin offer" }));
    const find = async (q: string) =>
      ((await (await bo.get(`/api/wikis/alpha/search?q=${q}`)).json()) as { notes: { ref: string }[] }).notes;
    expect(await find("zebracoin")).toHaveLength(1);
    await hide("messages", spam.messages[1].id);
    expect(await find("zebracoin")).toEqual([]);
    expect((await find("fine")).map((n) => n.ref)).toEqual([String(t.id)]);
  });

  it("hides the whole thread when its first message is hidden", async () => {
    const share = shares.create({ wiki: "alpha", kind: "comment" });
    const bo = browser(share);
    await bo.join("Bo");
    const t = await posted(bo.post("/api/wikis/alpha/threads", { page: "plan", quote, body: "spam" }));
    await hide("messages", t.messages[0].id);
    expect(await threadsOf(bo)).toEqual([]);
    expect((await bo.post(`/api/wikis/alpha/threads/${t.id}/messages`, { body: "more" })).status).toBe(404);
    expect((await bo.patch(`/api/wikis/alpha/threads/${t.id}`, { status: "resolved" })).status).toBe(404);
    expect(waitingForAgent(listThreads(alpha()))).toEqual([]);
    expect(listThreads(alpha())[0].messages).toHaveLength(1);
  });

  it("hides answers too, and only guests' text", async () => {
    const share = shares.create({ wiki: "alpha", kind: "comment" });
    const bo = browser(share);
    await bo.join("Bo");
    const res = await bo.post("/api/wikis/alpha/answers", { page: "plan", question: "q1", choice: "Steam", body: "x" });
    const a = (await res.json()) as Answer;
    expect((await hide("answers", a.id)).status).toBe(200);
    const seen = (await (await bo.get("/api/wikis/alpha/answers?page=plan")).json()) as { answers: Answer[] };
    expect(seen.answers).toEqual([]);
    const index = await (await bo.get("/api/wikis/alpha/pages")).json();
    expect(index.questions[0].answers).toBe(0);

    const t = await posted(bo.post("/api/wikis/alpha/threads", { page: "plan", quote, body: "Hi" }));
    const reply = addMessage(alpha(), t.id, "agent", "Hello") as Thread;
    expect((await hide("messages", reply.messages[1].id)).status).toBe(400);
    expect((await hide("messages", 999)).status).toBe(404);
    expect((await hide("answers", 999)).status).toBe(404);
  });
});

describe("reactions", () => {
  const owner = (path: string, init?: RequestInit) => ownerApp.request(`http://127.0.0.1:4400${path}`, init);
  const ownerReact = (mid: number, emoji: string, on = true) =>
    owner(`/api/wikis/alpha/messages/${mid}/reactions`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:4400" },
      body: JSON.stringify({ emoji, on }),
    });
  const posted = async (res: Promise<Response>) => (await (await res).json()) as Thread;

  it("show who reacted: names and whose are yours for guests, never guest ids", async () => {
    const share = shares.create({ wiki: "alpha", kind: "comment" });
    const ana = browser(share);
    await ana.join("Ana");
    const bo = browser(share, "198.51.100.2");
    await bo.join("Bo");
    const t = await posted(ana.post("/api/wikis/alpha/threads", { page: "plan", quote, body: "Too vague" }));
    const mid = t.messages[0].id;

    const res = await bo.post(`/api/wikis/alpha/messages/${mid}/reactions`, { emoji: "👍", on: true });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Thread).messages[0].reactions).toEqual([
      { emoji: "👍", by: [{ author: "guest", name: "Bo", mine: true }] },
    ]);
    expect((await ownerReact(mid, "👍")).status).toBe(200);
    const seen = ((await (await ana.get("/api/wikis/alpha/threads?page=plan")).json()) as { threads: Thread[] })
      .threads[0];
    expect(seen.messages[0].reactions?.[0].by).toEqual([
      { author: "guest", name: "Bo", mine: false },
      { author: "user", name: "Host", mine: false },
    ]);
    expect(JSON.stringify(seen)).not.toContain("guestId");
    // The owner sees which guest it was.
    expect(listThreads(alpha())[0].messages[0].reactions?.[0].by[0].guestId).toBeTruthy();

    // Taking it back; a reaction nobody holds any more is gone.
    await bo.post(`/api/wikis/alpha/messages/${mid}/reactions`, { emoji: "👍", on: false });
    await ownerReact(mid, "👍", false);
    expect(listThreads(alpha())[0].messages[0].reactions).toBeUndefined();
  });

  it("need a comment link, the link's own wiki, a visible message, a known emoji and this site's Origin", async () => {
    const t = await posted(
      (async () => {
        const share = shares.create({ wiki: "alpha", kind: "comment" });
        const ana = browser(share);
        await ana.join("Ana");
        return ana.post("/api/wikis/alpha/threads", { page: "plan", quote, body: "Hi" });
      })(),
    );
    const mid = t.messages[0].id;
    const react = { emoji: "✅", on: true };

    const view = browser(shares.create({ wiki: "alpha", kind: "view" }));
    await view.join("Vi");
    expect((await view.post(`/api/wikis/alpha/messages/${mid}/reactions`, react)).status).toBe(403);

    const share = shares.create({ wiki: "alpha", kind: "comment", duration: "1h" });
    const bo = browser(share, "198.51.100.2");
    await bo.join("Bo");
    expect((await bo.post(`/api/wikis/beta/messages/${mid}/reactions`, react)).status).toBe(404);
    expect((await bo.post("/api/wikis/alpha/messages/999/reactions", react)).status).toBe(404);
    expect((await bo.post(`/api/wikis/alpha/messages/${mid}/reactions`, { emoji: "💩", on: true })).status).toBe(400);
    expect(
      (await bo.post(`/api/wikis/alpha/messages/${mid}/reactions`, react, { origin: "https://evil.example" })).status,
    ).toBe(403);

    // A message the owner hid doesn't exist for guests.
    await owner(`/api/wikis/alpha/messages/${mid}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", origin: "http://localhost:4400" },
      body: JSON.stringify({ hidden: true }),
    });
    expect((await bo.post(`/api/wikis/alpha/messages/${mid}/reactions`, react)).status).toBe(404);
    expect(listThreads(alpha())[0].messages[0].reactions).toBeUndefined();

    clock += 3_600_000;
    expect((await bo.post(`/api/wikis/alpha/messages/${mid}/reactions`, react)).status).toBe(410);
  });

  it("count against the guest's write limits", async () => {
    const share = shares.create({ wiki: "alpha", kind: "comment" });
    const b = browser(share);
    await b.join("Ana");
    const t = await posted(b.post("/api/wikis/alpha/threads", { page: "plan", quote, body: "Hi" }));
    const flip = (on: boolean) =>
      b.post(`/api/wikis/alpha/messages/${t.messages[0].id}/reactions`, { emoji: "👀", on });
    for (let i = 1; i < LIMITS.writes.capacity; i++) expect((await flip(i % 2 === 1)).status).toBe(200);
    expect((await flip(true)).status).toBe(429);
  });
});

describe("pictures on comments", () => {
  const PNG = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(64, 1)]);
  /** A guest's upload: their cookie, this site's Origin unless told otherwise. */
  const upload = (share: Share, b: ReturnType<typeof browser>, data: Buffer, type = "image/png", origin = HOST) =>
    guestApp.request(`${HOST}/s/${share.token}/api/wikis/alpha/attachments`, {
      method: "POST",
      headers: { "cf-connecting-ip": "203.0.113.7", cookie: b.cookie, "content-type": type, origin },
      body: new Uint8Array(data),
    });
  const owner = (path: string, init?: RequestInit) => ownerApp.request(`http://127.0.0.1:4400${path}`, init);

  it("upload, go on a change, and show only to those who can see it", async () => {
    const share = shares.create({ wiki: "alpha", kind: "comment" });
    const ana = browser(share);
    await ana.join("Ana");
    const res = await upload(share, ana, PNG);
    expect(res.status).toBe(201);
    const { file } = (await res.json()) as { file: string };
    expect(file).toMatch(/^[0-9A-Z]{26}\.png$/);
    // Not attached yet: nobody can fetch it through the link.
    expect((await ana.get(`/api/wikis/alpha/attachments/${file}`)).status).toBe(404);

    const t = await ana.post("/api/wikis/alpha/threads", {
      page: "plan",
      quote: { exact: "", prefix: "", suffix: "" },
      body: "Make it like this",
      images: [file],
    });
    expect(t.status).toBe(201);
    expect(((await t.json()) as Thread).messages[0].images).toEqual([file]);
    const got = await ana.get(`/api/wikis/alpha/attachments/${file}`);
    expect(got.status).toBe(200);
    expect(got.headers.get("content-type")).toBe("image/png");
    expect((await owner(`/api/wikis/alpha/attachments/${file}`)).status).toBe(200);

    // A name that isn't one, or a picture that was never uploaded.
    expect((await ana.get("/api/wikis/alpha/attachments/..%2Fwiki.db")).status).toBe(404);
    const fake = { page: "plan", quote, body: "x", images: ["0123456789ABCDEFGHJKMNPQRS.png"] };
    expect((await ana.post("/api/wikis/alpha/threads", fake)).status).toBe(400);
  });

  it("need a comment link, the link's own wiki, a real picture and this site's Origin", async () => {
    const view = shares.create({ wiki: "alpha", kind: "view" });
    const vi = browser(view);
    await vi.join("Vi");
    expect((await upload(view, vi, PNG)).status).toBe(403);

    const share = shares.create({ wiki: "alpha", kind: "comment", duration: "1h" });
    const bo = browser(share);
    await bo.join("Bo");
    const other = await guestApp.request(`${HOST}/s/${share.token}/api/wikis/beta/attachments`, {
      method: "POST",
      headers: { "cf-connecting-ip": "203.0.113.7", cookie: bo.cookie, "content-type": "image/png", origin: HOST },
      body: new Uint8Array(PNG),
    });
    expect(other.status).toBe(404);
    expect((await upload(share, bo, Buffer.from("<svg onload=alert(1)>"), "image/svg+xml")).status).toBe(415);
    expect((await upload(share, bo, Buffer.from("not a png at all"), "image/png")).status).toBe(400);
    expect((await upload(share, bo, PNG, "image/png", "https://evil.example")).status).toBe(403);
    expect((await upload(share, bo, Buffer.alloc(7 * 1024 * 1024))).status).toBe(413);
    clock += 3_600_000;
    expect((await upload(share, bo, PNG)).status).toBe(410);
  });

  it("stop at the guest's daily budget for pictures", async () => {
    const share = shares.create({ wiki: "alpha", kind: "comment" });
    const b = browser(share);
    await b.join("Ana");
    const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
    let status = 201;
    for (let i = 0; i < 60 && status === 201; i++) status = (await upload(share, b, big)).status;
    expect(status).toBe(429);
  });
});

describe("removing a change", () => {
  const del = (share: Share, b: ReturnType<typeof browser>, path: string, origin = HOST) =>
    guestApp.request(`${HOST}/s/${share.token}/api${path}`, {
      method: "DELETE",
      headers: { "cf-connecting-ip": "203.0.113.7", cookie: b.cookie, origin },
    });
  const ownerDelete = (id: number) =>
    ownerApp.request(`http://127.0.0.1:4400/api/wikis/alpha/threads/${id}`, {
      method: "DELETE",
      headers: { origin: "http://localhost:4400" },
    });
  const change = { page: "plan", quote: { exact: "", prefix: "", suffix: "" }, body: "Add a map" };

  it("is for whoever started it, and the host; then it's gone for everyone but kept", async () => {
    const share = shares.create({ wiki: "alpha", kind: "comment" });
    const ana = browser(share);
    await ana.join("Ana");
    const bo = browser(share, "198.51.100.2");
    await bo.join("Bo");
    const mine = (await (await ana.post("/api/wikis/alpha/threads", change)).json()) as Thread;
    const theirs = (await (await bo.post("/api/wikis/alpha/threads", change)).json()) as Thread;

    expect((await del(share, ana, `/wikis/alpha/threads/${theirs.id}`)).status).toBe(403);
    expect((await del(share, ana, `/wikis/alpha/threads/${mine.id}`, "https://evil.example")).status).toBe(403);
    expect((await del(share, ana, `/wikis/beta/threads/${mine.id}`)).status).toBe(404);
    expect((await del(share, ana, `/wikis/alpha/threads/${mine.id}`)).status).toBe(204);
    expect((await del(share, ana, `/wikis/alpha/threads/${mine.id}`)).status).toBe(404);

    const seen = ((await (await bo.get("/api/wikis/alpha/threads")).json()) as { threads: Thread[] }).threads;
    expect(seen.map((t) => t.id)).toEqual([theirs.id]);
    expect(listThreads(alpha()).map((t) => t.id)).toEqual([theirs.id]);
    expect(waitingForAgent(listThreads(alpha())).map((t) => t.id)).toEqual([theirs.id]);
    // Kept in the database, marked, for backups and sync.
    expect(listThreads(alpha(), { removed: true }).find((t) => t.id === mine.id)?.removedAt).toBeTruthy();

    // The host removes anyone's.
    expect((await ownerDelete(theirs.id)).status).toBe(204);
    expect(listThreads(alpha())).toEqual([]);
    expect((await ownerDelete(999)).status).toBe(404);
  });

  it("can't happen through a view link", async () => {
    const t = await createThreadAs("Ana");
    const view = shares.create({ wiki: "alpha", kind: "view" });
    const vi = browser(view);
    await vi.join("Vi");
    expect((await del(view, vi, `/wikis/alpha/threads/${t}`)).status).toBe(403);
  });

  async function createThreadAs(name: string) {
    const share = shares.create({ wiki: "alpha", kind: "comment" });
    const b = browser(share);
    await b.join(name);
    return ((await (await b.post("/api/wikis/alpha/threads", change)).json()) as Thread).id;
  }
});

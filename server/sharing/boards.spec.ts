// Test boards for testers (ADR-0010, AGENTS.md rule 2): a board link shows one board and nothing of the wiki; testers
// write, change and remove only their own reports, see everyone's on a global board and only theirs on a private one.
// Each route is checked for the link kind, expiry, ownership, limits, sizes, pictures and Origin.
import { describe, expect, it } from "vitest";
import type { Board, BoardView, Report, ShareInfo } from "../../shared/api.ts";
import { type Browser, HOST, png, sharingFixture } from "./fixture.ts";
import { LIMITS } from "./limits.ts";
import type { Share } from "./shares.ts";

const s = sharingFixture();
const json = async <T>(res: Response) => (await res.json()) as T;
const BOARDS = "/api/wikis/alpha/boards";

async function board(name = "Alpha playtest", visibility: "global" | "private" = "global") {
  const res = await s.owner(BOARDS, { method: "POST", body: { name, visibility } });
  expect(res.status).toBe(201);
  return json<Board>(res);
}
/** A board link, made as the owner's Share dialog makes it. */
async function link(b: Board, duration?: "1h") {
  const res = await s.owner("/api/shares", {
    method: "POST",
    body: { wiki: "alpha", kind: "board", target: b.uid, ...(duration ? { duration } : {}) },
  });
  expect(res.status).toBe(201);
  const info = await json<ShareInfo>(res);
  return s.shares.list().find((x) => x.id === info.id) as Share;
}
let ip = 10;
async function tester(share: Share, name: string) {
  const b = s.browser(share, `203.0.113.${ip++}`);
  expect((await b.join(name)).status).toBe(201);
  return b;
}
const report = (b: Browser, title = "Tree won't grow", extra: Record<string, unknown> = {}) =>
  b.send("POST", "/api/board/reports", { kind: "bug", title, body: "Planted it, waited a day.", ...extra });
const view = async (b: Browser) => json<BoardView>(await b.get("/api/board"));

describe("the owner's boards", () => {
  it("make, list, rename, close and share them; a closed board can't be shared", async () => {
    const b = await board();
    expect((await s.owner(BOARDS, { method: "POST", body: { name: "" } })).status).toBe(400);
    expect((await json<{ boards: Board[] }>(await s.owner(BOARDS))).boards.map((x) => x.name)).toEqual([
      "Alpha playtest",
    ]);
    const closed = await s.owner(`${BOARDS}/${b.uid}`, { method: "PATCH", body: { closed: true } });
    expect((await json<Board>(closed)).closedAt).toBeTruthy();
    const refused = await s.owner("/api/shares", {
      method: "POST",
      body: { wiki: "alpha", kind: "board", target: b.uid },
    });
    expect(refused.status).toBe(409);
    const missing = await s.owner("/api/shares", {
      method: "POST",
      body: { wiki: "alpha", kind: "board", target: "X" },
    });
    expect(missing.status).toBe(404);
    // A wiki link names no board, a board link names one.
    const odd = await s.owner("/api/shares", { method: "POST", body: { wiki: "alpha", kind: "view", target: b.uid } });
    expect(odd.status).toBe(400);
    expect((await s.owner("/api/shares", { method: "POST", body: { wiki: "alpha", kind: "board" } })).status).toBe(404);
  });

  it("refuse other sites", async () => {
    const res = await s.ownerApp.request(`http://127.0.0.1:4400${BOARDS}`, {
      method: "POST",
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      body: JSON.stringify({ name: "Evil" }),
    });
    expect(res.status).toBe(403);
  });
});

describe("a board link", () => {
  it("shows only its board: every wiki route is 404, and wiki links can't reach the board", async () => {
    const share = await link(await board());
    const t = await tester(share, "Ana");
    const session = await json<{ kind: string; target: { title: string } }>(await t.get("/api/session"));
    expect(session).toMatchObject({ kind: "board", target: { title: "Alpha playtest" } });
    for (const path of [
      "/api/wikis/alpha",
      "/api/wikis/alpha/page?path=plan",
      "/api/wikis/alpha/pages",
      "/api/wikis/alpha/threads",
      "/api/wikis/alpha/search?q=plan",
      "/api/wikis/alpha/changes",
      "/api/wikis/alpha/presence",
      "/api/wikis/alpha/designs/mobs",
      "/api/sheet",
    ])
      expect((await t.get(path)).status, path).toBe(404);
    expect((await t.send("POST", "/api/wikis/alpha/threads", { page: "plan", quote: {}, body: "x" })).status).toBe(404);

    const wikiLink = s.shares.create({ wiki: "alpha", kind: "comment" });
    const reader = await tester(wikiLink, "Bo");
    expect((await reader.get("/api/board")).status).toBe(404);
    expect((await report(reader)).status).toBe(404);
  });

  it("needs a name first, and ends with the link", async () => {
    const share = await link(await board(), "1h");
    const anon = s.browser(share);
    expect((await anon.get("/api/board")).status).toBe(401);
    const t = await tester(share, "Ana");
    expect((await t.get("/api/board")).status).toBe(200);
    s.clock += 2 * 3_600_000;
    expect((await t.get("/api/board")).status).toBe(410);
    expect((await report(t)).status).toBe(410);
  });

  it("gives the board, the wiki's name and theme, and nothing else of the wiki", async () => {
    const share = await link(await board());
    const v = await view(await tester(share, "Ana"));
    expect(v.board).toEqual({ name: "Alpha playtest", visibility: "global", closedAt: null });
    expect(v.wiki.title).toBe("ALPHA");
    expect(Object.keys(v).sort()).toEqual(["board", "reports", "wiki"]);
  });
});

describe("reports", () => {
  it("on a global board: everyone sees all, read-only; each changes and removes only their own", async () => {
    const share = await link(await board());
    const ana = await tester(share, "Ana");
    const bo = await tester(share, "Bo");
    const mine = await json<Report>(await report(ana));
    expect(mine).toMatchObject({ kind: "bug", status: "new", name: "Ana", mine: true });
    expect(mine.guestId).toBeUndefined();
    await report(bo, "Axe is too slow", { kind: "change" });

    const seenByBo = (await view(bo)).reports;
    expect(seenByBo.map((r) => [r.title, r.mine])).toEqual([
      ["Axe is too slow", true],
      ["Tree won't grow", false],
    ]);
    expect(seenByBo.every((r) => r.guestId === undefined)).toBe(true);

    expect((await bo.send("PATCH", `/api/board/reports/${mine.id}`, { title: "Mine now" })).status).toBe(403);
    expect((await bo.send("DELETE", `/api/board/reports/${mine.id}`)).status).toBe(403);
    const edited = await json<Report>(
      await ana.send("PATCH", `/api/board/reports/${mine.id}`, { title: "Oak won't grow" }),
    );
    expect(edited.title).toBe("Oak won't grow");
    expect(edited.editedAt).toBeTruthy();
    expect((await ana.send("PATCH", `/api/board/reports/${mine.id}`, {})).status).toBe(400);
    expect((await ana.send("PATCH", `/api/board/reports/${mine.id}`, { status: "fixed" })).status).toBe(400);
    expect((await ana.send("DELETE", `/api/board/reports/${mine.id}`)).status).toBe(204);
    expect((await view(bo)).reports.map((r) => r.title)).toEqual(["Axe is too slow"]);
    expect((await ana.send("PATCH", `/api/board/reports/${mine.id}`, { title: "Back" })).status).toBe(404);
  });

  it("on a private board: each tester sees only their own, and can't reach anyone else's", async () => {
    const share = await link(await board("Closed beta", "private"));
    const ana = await tester(share, "Ana");
    const bo = await tester(share, "Bo");
    const hers = await json<Report>(await report(ana, "Hers"));
    await report(bo, "His");
    expect((await view(ana)).reports.map((r) => r.title)).toEqual(["Hers"]);
    expect((await view(bo)).reports.map((r) => r.title)).toEqual(["His"]);
    expect((await bo.send("PATCH", `/api/board/reports/${hers.id}`, { title: "x" })).status).toBe(404);
    expect((await bo.send("DELETE", `/api/board/reports/${hers.id}`)).status).toBe(404);
    // The owner sees both.
    const all = await json<{ reports: Report[] }>(await s.owner(`${BOARDS}/${hers.board}/reports`));
    expect(all.reports.map((r) => r.title).sort()).toEqual(["Hers", "His"]);
  });

  it("keep the owner's status and note for testers; hidden ones disappear for them", async () => {
    const b = await board();
    const share = await link(b);
    const ana = await tester(share, "Ana");
    const r = await json<Report>(await report(ana));
    const path = `${BOARDS}/${b.uid}/reports/${r.id}`;
    expect((await s.owner(path, { method: "PATCH", body: { status: "nonsense" } })).status).toBe(400);
    await s.owner(path, { method: "PATCH", body: { status: "fixed", note: "Fixed in 0.4" } });
    expect((await view(ana)).reports[0]).toMatchObject({ status: "fixed", note: "Fixed in 0.4" });
    await s.owner(path, { method: "PATCH", body: { hidden: true } });
    expect((await view(ana)).reports).toEqual([]);
    expect((await ana.send("DELETE", `/api/board/reports/${r.id}`)).status).toBe(404);
    expect((await s.owner(`${BOARDS}/OTHER/reports/${r.id}`, { method: "PATCH", body: { note: "x" } })).status).toBe(
      404,
    );
  });

  it("check what's sent: kinds, sizes, and only this site's Origin", async () => {
    const share = await link(await board());
    const t = await tester(share, "Ana");
    expect((await report(t, "")).status).toBe(400);
    expect((await report(t, "x".repeat(121))).status).toBe(400);
    expect((await report(t, "ok", { kind: "virus" })).status).toBe(400);
    expect((await report(t, "ok", { body: "x".repeat(LIMITS.comment + 1) })).status).toBe(400);
    // Refused tries count as writes too: let the limit refill.
    s.clock += 60_000;
    expect((await report(t, "ok", { status: "fixed" })).status).toBe(400);
    expect((await report(t, "ok", { images: ["../../wiki.json"] })).status).toBe(400);
    expect((await report(t, "ok", { images: ["01ARZ3NDEKTSV4RRFFQ69G5FAV.png"] })).status).toBe(400);
    const evil = await t.send(
      "POST",
      "/api/board/reports",
      { kind: "bug", title: "x" },
      { origin: "https://evil.example" },
    );
    expect(evil.status).toBe(403);
  });

  it("stop at the write limits, and a closed board takes none", async () => {
    const b = await board();
    const share = await link(b);
    const t = await tester(share, "Ana");
    for (let i = 0; i < LIMITS.writes.capacity; i++) expect((await report(t, `r${i}`)).status).toBe(201);
    expect((await report(t, "one too many")).status).toBe(429);
    s.clock += 60_000;
    await s.owner(`${BOARDS}/${b.uid}`, { method: "PATCH", body: { closed: true } });
    expect((await report(t, "late")).status).toBe(409);
    // Their reports stay readable.
    expect((await view(t)).reports).toHaveLength(LIMITS.writes.capacity);
  });
});

describe("pictures on reports", () => {
  it("upload, go on a report, and show only to testers who can see that report", async () => {
    const share = await link(await board("Private", "private"));
    const ana = await tester(share, "Ana");
    const bo = await tester(share, "Bo");
    const up = await ana.raw("POST", "/api/board/attachments", await png(), "image/png");
    expect(up.status).toBe(201);
    const { file } = await json<{ file: string }>(up);
    // Not on a report yet: nobody gets it.
    expect((await ana.get(`/api/board/attachments/${file}`)).status).toBe(404);
    await report(ana, "With a picture", { images: [file] });
    expect((await ana.get(`/api/board/attachments/${file}`)).status).toBe(200);
    // Bo can't see Ana's report on a private board, so not its picture either.
    expect((await bo.get(`/api/board/attachments/${file}`)).status).toBe(404);
    expect((await ana.get("/api/board/attachments/..%2F..%2Fwiki.json")).status).toBe(404);
    // Wrong bytes, SVG, and other sites are refused.
    expect((await ana.raw("POST", "/api/board/attachments", new TextEncoder().encode("hi"), "image/png")).status).toBe(
      400,
    );
    expect(
      (await ana.raw("POST", "/api/board/attachments", new TextEncoder().encode("<svg/>"), "image/svg+xml")).status,
    ).toBe(415);
    const evil = await ana.raw("POST", "/api/board/attachments", await png(), "image/png", {
      origin: "https://evil.example",
    });
    expect(evil.status).toBe(403);
  });

  it("can't be uploaded through a wiki link's board route, nor a board link's wiki route", async () => {
    const share = await link(await board());
    const t = await tester(share, "Ana");
    expect((await t.raw("POST", "/api/wikis/alpha/attachments", await png(), "image/png")).status).toBe(404);
    const wikiLink = s.shares.create({ wiki: "alpha", kind: "comment" });
    const reader = await tester(wikiLink, "Bo");
    expect((await reader.raw("POST", "/api/board/attachments", await png(), "image/png")).status).toBe(404);
    expect(HOST).toBeTruthy();
  });
});

describe("the boards' trash (ADR-0014)", () => {
  it("a trashed board's link stops working, it can't be shared, and coming back restores the link", async () => {
    const b = await board();
    const share = await link(b);
    const t = await tester(share, "Ana");
    expect((await report(t)).status).toBe(201);
    const trashed = await s.owner(`${BOARDS}/${b.uid}`, { method: "PATCH", body: { trashed: true } });
    expect((await json<Board>(trashed)).trashedAt).toBeTruthy();
    expect((await t.get("/api/board")).status).toBe(404);
    expect((await report(t, "Still here?")).status).toBe(404);
    const refused = await s.owner("/api/shares", {
      method: "POST",
      body: { wiki: "alpha", kind: "board", target: b.uid },
    });
    expect(refused.status).toBe(409);

    await s.owner(`${BOARDS}/${b.uid}`, { method: "PATCH", body: { trashed: false } });
    expect((await view(t)).reports.map((r) => r.title)).toEqual(["Tree won't grow"]);
  });

  it("deletes a board for good only from the trash, with its reports", async () => {
    const b = await board();
    const t = await tester(await link(b), "Ana");
    await report(t);
    expect((await s.owner(`${BOARDS}/${b.uid}`, { method: "DELETE" })).status).toBe(409);
    await s.owner(`${BOARDS}/${b.uid}`, { method: "PATCH", body: { trashed: true } });
    const gone = await s.owner(`${BOARDS}/${b.uid}`, { method: "DELETE" });
    expect(gone.status).toBe(200);
    expect(await json<{ reports: number }>(gone)).toEqual({ reports: 1 });
    expect((await s.owner(`${BOARDS}/${b.uid}/reports`)).status).toBe(404);
    expect((await s.owner(`${BOARDS}/${b.uid}`, { method: "DELETE" })).status).toBe(404);
    expect((await json<{ boards: Board[] }>(await s.owner(BOARDS))).boards).toEqual([]);
  });
});

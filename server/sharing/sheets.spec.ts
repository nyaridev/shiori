// Data sheets for guests (ADR-0010, AGENTS.md rule 2): a sheet link shows one sheet and nothing of the wiki; on an
// edit link guests change editable cells, and the server checks every value against the sheet's file. Each route
// is checked for the link kind, expiry, view links, values, conflicts, limits and Origin.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ShareInfo } from "../../shared/api.ts";
import type { SheetCell, SheetEdit, SheetView } from "../../shared/sheet.ts";
import { type Browser, sharingFixture } from "./fixture.ts";
import { LIMITS } from "./limits.ts";
import type { Share } from "./shares.ts";

const s = sharingFixture();
const json = async <T>(res: Response) => (await res.json()) as T;

const MOBS = {
  title: "Mobs",
  key: "id",
  groupBy: "biome",
  columns: [
    { id: "id", type: "text" },
    { id: "name", type: "text", editable: true, maxLength: 20 },
    { id: "biome", type: "choice", options: ["forest", "cave"], editable: true },
    { id: "health", type: "number", min: 1, max: 1000, editable: true },
    { id: "speed", type: "number", min: 0, max: 10, step: 0.5, editable: true },
    { id: "boss", type: "bool", editable: true },
    { id: "secret", type: "number" },
  ],
  rows: [
    { id: "slime", name: "Slime", biome: "forest", health: 20, speed: 1.5, boss: false, secret: 7 },
    { id: "bat", name: "Bat", biome: "cave", health: 8, speed: 4, boss: false, secret: 3 },
  ],
};

function writeSheet(name = "mobs", sheet: unknown = MOBS) {
  const dir = join(s.app, "wikis", "alpha", "sheets");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.json`), JSON.stringify(sheet));
}
async function link(edit: boolean, duration?: "1h") {
  const res = await s.owner("/api/shares", {
    method: "POST",
    body: { wiki: "alpha", kind: "sheet", target: "mobs", edit, ...(duration ? { duration } : {}) },
  });
  expect(res.status).toBe(201);
  const info = await json<ShareInfo>(res);
  return s.shares.list().find((x) => x.id === info.id) as Share;
}
let ip = 10;
async function guest(share: Share, name: string) {
  const b = s.browser(share, `198.51.100.${ip++}`);
  expect((await b.join(name)).status).toBe(201);
  return b;
}
const sheetOf = async (b: Browser) => (await json<{ sheet: SheetView }>(await b.get("/api/sheet"))).sheet;
const cell = (v: SheetView, row: string, col: string) => v.rows.find((r) => r.key === row)?.cells[col] as SheetCell;
const set = (b: Browser, row: string, column: string, value: unknown, base = 0) =>
  b.send("PUT", "/api/sheet/cells", { row, column, value, base });

describe("a sheet link", () => {
  it("names a sheet that exists and reads; the file's own problems keep it from being shared", async () => {
    writeSheet();
    const missing = await s.owner("/api/shares", {
      method: "POST",
      body: { wiki: "alpha", kind: "sheet", target: "nope" },
    });
    expect(missing.status).toBe(404);
    const sneaky = await s.owner("/api/shares", {
      method: "POST",
      body: { wiki: "alpha", kind: "sheet", target: "../wiki" },
    });
    expect(sneaky.status).toBe(404);
    writeSheet("broken", { ...MOBS, rows: [{ id: "slime", health: "lots" }] });
    const broken = await s.owner("/api/shares", {
      method: "POST",
      body: { wiki: "alpha", kind: "sheet", target: "broken" },
    });
    expect(broken.status).toBe(404);
    const problems = await json<{ problems: string[] }>(await s.owner("/api/wikis/alpha/sheets/broken"));
    expect(problems.problems).toEqual(["row 1, health: should be a number"]);
  });

  it("shows only its sheet: every wiki and board route is 404, and wiki links can't reach it", async () => {
    writeSheet();
    const share = await link(false);
    const g = await guest(share, "Ana");
    expect(await json<{ kind: string; edit: boolean }>(await g.get("/api/session"))).toMatchObject({
      kind: "sheet",
      edit: false,
      target: { id: "mobs", title: "Mobs" },
    });
    for (const path of ["/api/wikis/alpha", "/api/wikis/alpha/pages", "/api/wikis/alpha/threads", "/api/board"])
      expect((await g.get(path)).status, path).toBe(404);
    const reader = await guest(s.shares.create({ wiki: "alpha", kind: "comment" }), "Bo");
    expect((await reader.get("/api/sheet")).status).toBe(404);
    expect((await set(reader, "slime", "health", 30)).status).toBe(404);
  });

  it("gives values, defaults and the wiki's name, and lets a view link change nothing", async () => {
    writeSheet();
    const g = await guest(await link(false), "Ana");
    const v = await sheetOf(g);
    expect(v.canEdit).toBe(false);
    expect(cell(v, "slime", "health")).toEqual({ value: 20, default: 20, version: 0 });
    expect((await set(g, "slime", "health", 30)).status).toBe(403);
    expect(cell(await sheetOf(g), "slime", "health").value).toBe(20);
  });

  it("needs a name first, and ends with the link", async () => {
    writeSheet();
    const share = await link(true, "1h");
    expect((await s.browser(share).get("/api/sheet")).status).toBe(401);
    const g = await guest(share, "Ana");
    s.clock += 2 * 3_600_000;
    expect((await g.get("/api/sheet")).status).toBe(410);
    expect((await set(g, "slime", "health", 30)).status).toBe(410);
  });
});

describe("changing values", () => {
  it("checks every value against its column, and refuses read-only columns and unknown cells", async () => {
    writeSheet();
    const g = await guest(await link(true), "Ana");
    const refused: [string, string, unknown, number][] = [
      ["slime", "health", 0, 400],
      ["slime", "health", 1001, 400],
      ["slime", "health", 20.5, 400],
      ["slime", "health", "30", 400],
      ["slime", "health", 1e300, 400],
      ["slime", "speed", 1.25, 400],
      ["slime", "biome", "lava", 400],
      ["slime", "boss", "yes", 400],
      ["slime", "name", "x".repeat(21), 400],
      ["slime", "name", "two\nlines", 400],
      ["slime", "id", "blob", 403],
      ["slime", "secret", 1, 403],
      ["dragon", "health", 5, 404],
      ["slime", "mana", 5, 404],
      ["__proto__", "health", 5, 404],
      ["constructor", "health", 5, 404],
    ];
    for (const [row, col, value, status] of refused) {
      expect((await set(g, row, col, value)).status, `${row}.${col} = ${JSON.stringify(value)}`).toBe(status);
      s.clock += 2_000;
    }
    expect(
      (await g.send("PUT", "/api/sheet/cells", { row: "slime", column: "health", value: { $gt: 1 }, base: 0 })).status,
    ).toBe(400);
    expect(
      (await g.send("PUT", "/api/sheet/cells", { row: "slime", column: "health", value: 5, base: 0, x: 1 })).status,
    ).toBe(400);
    // Nothing above was stored.
    expect((await json<{ edits: SheetEdit[] }>(await g.get("/api/sheet/history"))).edits).toEqual([]);
  });

  it("saves good values with who and when, keeps the default, and resets to it", async () => {
    writeSheet();
    const g = await guest(await link(true), "Ana");
    const res = await set(g, "slime", "speed", 2.5);
    expect(res.status).toBe(200);
    const after = (await json<{ cell: SheetCell }>(res)).cell;
    expect(after).toMatchObject({ value: 2.5, default: 1.5, by: { name: "Ana", mine: true } });
    const reset = await json<{ cell: SheetCell }>(await set(g, "slime", "speed", null, after.version));
    expect(reset.cell).toMatchObject({ value: 1.5, default: 1.5 });
    expect(reset.cell.by).toBeUndefined();
    const history = (await json<{ edits: SheetEdit[] }>(await g.get("/api/sheet/history"))).edits;
    expect(history.map((e) => [e.value, e.prev, e.name])).toEqual([
      [null, 2.5, "Ana"],
      [2.5, 1.5, "Ana"],
    ]);
    expect(history.every((e) => e.guestId === undefined)).toBe(true);
  });

  it("refuses a change made on top of a value someone else changed meanwhile", async () => {
    writeSheet();
    const share = await link(true);
    const ana = await guest(share, "Ana");
    const bo = await guest(share, "Bo");
    expect((await set(ana, "bat", "health", 12, 0)).status).toBe(200);
    const late = await set(bo, "bat", "health", 9, 0);
    expect(late.status).toBe(409);
    expect((await json<{ cell: SheetCell }>(late)).cell).toMatchObject({ value: 12, by: { name: "Ana" } });
    expect(cell(await sheetOf(bo), "bat", "health").value).toBe(12);
  });

  it("needs this site's Origin, and stops at the limits, counting refused tries", async () => {
    writeSheet();
    const g = await guest(await link(true), "Ana");
    const evil = await g.send(
      "PUT",
      "/api/sheet/cells",
      { row: "slime", column: "health", value: 30, base: 0 },
      {
        origin: "https://evil.example",
      },
    );
    expect(evil.status).toBe(403);
    let version = 0;
    for (let i = 0; i < LIMITS.sheetEdits.capacity; i++) {
      const res = await set(g, "slime", "health", i % 2 ? 0 : 30 + i, version);
      if (res.status === 200) version = (await json<{ cell: SheetCell }>(res)).cell.version;
    }
    expect((await set(g, "slime", "health", 99, version)).status).toBe(429);
  });
});

describe("the owner", () => {
  it("edits, undoes one change, and takes back everything one guest did", async () => {
    writeSheet();
    const share = await link(true);
    const ana = await guest(share, "Ana");
    const bo = await guest(share, "Bo");
    await set(ana, "slime", "health", 50);
    await set(ana, "bat", "health", 60);
    await set(bo, "bat", "boss", true);
    const own = await s.owner("/api/wikis/alpha/sheets/mobs/cells", {
      method: "PUT",
      body: { row: "slime", column: "name", value: "Green slime", base: 0 },
    });
    expect((await json<{ cell: SheetCell }>(own)).cell.by).toMatchObject({ name: "You", mine: true });

    const history = (await json<{ edits: SheetEdit[] }>(await s.owner("/api/wikis/alpha/sheets/mobs/history"))).edits;
    const anaId = history.find((e) => e.name === "Ana")?.guestId as string;
    expect(anaId).toBeTruthy();
    const reverted = await s.owner("/api/wikis/alpha/sheets/mobs/revert", { method: "POST", body: { guest: anaId } });
    expect(await json(reverted)).toEqual({ reverted: 2 });
    const v = (await json<{ sheet: SheetView }>(await s.owner("/api/wikis/alpha/sheets/mobs"))).sheet;
    expect([cell(v, "slime", "health").value, cell(v, "bat", "health").value, cell(v, "bat", "boss").value]).toEqual([
      20,
      8,
      true,
    ]);

    const boEdit = history.find((e) => e.name === "Bo") as SheetEdit;
    expect((await s.owner(`/api/wikis/alpha/sheets/mobs/history/${boEdit.id}/undo`, { method: "POST" })).status).toBe(
      200,
    );
    const after = (await json<{ sheet: SheetView }>(await s.owner("/api/wikis/alpha/sheets/mobs"))).sheet;
    expect(cell(after, "bat", "boss").value).toBe(false);
    // Undoing it again: the cell changed since, so it's a conflict, and nothing happens.
    expect((await s.owner(`/api/wikis/alpha/sheets/mobs/history/${boEdit.id}/undo`, { method: "POST" })).status).toBe(
      409,
    );
  });
});

// The boards' trash and the committed data/ folder (ADR-0014): trashing and restoring, deleting for good after 30
// days or at once, with reports and pictures; what backups and sync carry so a deleted board stays deleted; and the
// data/.gitignore that keeps only this PC's files out of git.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exportData, importData } from "./backup.ts";
import {
  createBoard,
  createReport,
  getBoard,
  listBoards,
  listPurged,
  listReports,
  purgeBoard,
  purgeExpired,
  removeReport,
  updateBoard,
} from "./boards.ts";
import { DATA_GITIGNORE, dataDir } from "./paths.ts";
import { mergeData } from "./sync.ts";
import { addMessage, closeAll, createThread, dbFor } from "./threads.ts";

let a: string;
let b: string;
const DAY = 24 * 60 * 60 * 1000;
const tester = { guest: "g1", name: "Ana" };

beforeEach(() => {
  a = mkdtempSync(join(tmpdir(), "shiori-trash-a-"));
  b = mkdtempSync(join(tmpdir(), "shiori-trash-b-"));
});
afterEach(() => {
  closeAll();
  rmSync(a, { recursive: true, force: true });
  rmSync(b, { recursive: true, force: true });
});

/** A picture in the wiki's attachments, as a tester's upload leaves it. */
function picture(root: string, name: string) {
  const dir = dataDir(root, "attachments");
  writeFileSync(join(dir, name), "png");
  return join(dir, name);
}
const PIC = "01M5KSHYYCWGSMS00WJNV6VG70.png";
const KEPT = "01M5KSHYYCWGSMS00WJNV6VG71.png";

/** Moves a board's trashed date back, as if it was trashed `days` ago. */
const trashedAgo = (root: string, uid: string, days: number) =>
  dbFor(root)
    .prepare("update boards set trashed_at = ? where uid = ?")
    .run(new Date(Date.now() - days * DAY).toISOString(), uid);

describe("the boards' trash", () => {
  it("moves a board to the trash and back, keeping it closed or open as it was", () => {
    const board = createBoard(a, "Alpha", "global");
    updateBoard(a, board.uid, { closed: true });
    const trashed = updateBoard(a, board.uid, { trashed: true });
    expect(trashed?.trashedAt).toBeTruthy();
    // Trashing twice keeps the first date, so the 30 days don't start again.
    expect(updateBoard(a, board.uid, { trashed: true })?.trashedAt).toBe(trashed?.trashedAt);
    const back = updateBoard(a, board.uid, { trashed: false });
    expect(back?.trashedAt).toBeNull();
    expect(back?.closedAt).toBeTruthy();
  });

  it("deletes boards 30 days after they were trashed, with their reports and pictures", () => {
    const old = createBoard(a, "Old", "global");
    const recent = createBoard(a, "Recent", "global");
    const kept = createBoard(a, "Kept", "global");
    const r = createReport(a, old.uid, { kind: "bug", title: "Gone", body: "", images: [PIC] }, tester);
    const removed = createReport(a, old.uid, { kind: "idea", title: "Removed", body: "", images: [] }, tester);
    removeReport(a, removed.id);
    createReport(a, recent.uid, { kind: "bug", title: "Stays", body: "", images: [] }, tester);
    const file = picture(a, PIC);
    updateBoard(a, old.uid, { trashed: true });
    updateBoard(a, recent.uid, { trashed: true });
    trashedAgo(a, old.uid, 31);
    trashedAgo(a, recent.uid, 5);

    expect(purgeExpired(a)).toEqual(["Old"]);
    expect(getBoard(a, old.uid)).toBeNull();
    expect(listReports(a, old.uid, { removed: true })).toEqual([]);
    expect(existsSync(file)).toBe(false);
    expect(listPurged(a).map((p) => p.uid)).toEqual(expect.arrayContaining([old.uid, r.uid, removed.uid]));
    expect(listBoards(a).map((x) => x.name)).toEqual(["Kept", "Recent"]);
    expect(getBoard(a, kept.uid)?.trashedAt).toBeNull();
  });

  it("keeps a picture a comment still uses when its board is deleted", () => {
    const board = createBoard(a, "Alpha", "global");
    createReport(a, board.uid, { kind: "bug", title: "Twice", body: "", images: [KEPT] }, tester);
    const thread = createThread(a, "plan", { exact: "x", prefix: "", suffix: "" }, "See this");
    addMessage(a, thread.id, "user", "Same picture");
    dbFor(a)
      .prepare("update messages set images = ?")
      .run(JSON.stringify([KEPT]));
    const file = picture(a, KEPT);
    updateBoard(a, board.uid, { trashed: true });
    expect(purgeBoard(a, board.uid)).toEqual({ reports: 1 });
    expect(existsSync(file)).toBe(true);
  });

  it("backups carry the trash and what was deleted, which a restore doesn't bring back", () => {
    const gone = createBoard(a, "Gone", "global");
    const trashed = createBoard(a, "Trashed", "private");
    updateBoard(a, trashed.uid, { trashed: true });
    const data = exportData(a);
    updateBoard(a, gone.uid, { trashed: true });
    purgeBoard(a, gone.uid);
    const later = exportData(a);
    expect(later.purged.map((p) => p.uid)).toContain(gone.uid);

    // An older backup still holds the board; with what was deleted since, it stays deleted.
    importData(b, { ...data, purged: later.purged });
    expect(listBoards(b).map((x) => [x.name, !!x.trashedAt])).toEqual([["Trashed", true]]);
  });

  it("sync deletes a board another PC deleted for good, and never adds it back", () => {
    const board = createBoard(a, "Alpha", "global");
    createReport(a, board.uid, { kind: "bug", title: "One", body: "", images: [] }, tester);
    mergeData(b, exportData(a));
    expect(listBoards(b).map((x) => x.name)).toEqual(["Alpha"]);

    const before = exportData(a);
    updateBoard(a, board.uid, { trashed: true });
    purgeBoard(a, board.uid);
    mergeData(b, exportData(a));
    expect(listBoards(b)).toEqual([]);
    // A third PC's file from before the delete doesn't bring it back.
    mergeData(b, before);
    expect(listBoards(b)).toEqual([]);
    expect(listPurged(b).map((p) => p.uid)).toContain(board.uid);
  });

  it("sync carries a board moved to the trash, newer change winning", () => {
    const board = createBoard(a, "Alpha", "global");
    mergeData(b, exportData(a));
    updateBoard(a, board.uid, { trashed: true });
    mergeData(b, exportData(a));
    expect(getBoard(b, board.uid)?.trashedAt).toBe(getBoard(a, board.uid)?.trashedAt);
  });
});

describe("data/.gitignore", () => {
  const ignore = (root: string) => readFileSync(join(root, "data", ".gitignore"), "utf8");

  it("is written with only this PC's files, so the rest of data/ is committed", () => {
    dataDir(a);
    expect(ignore(a)).toBe(DATA_GITIGNORE);
    for (const own of ["machine.json", "wiki.db-wal", "wiki.db-shm", "cache/", "export/"])
      expect(ignore(a)).toContain(own);
    expect(ignore(a)).not.toMatch(/^\*$/m);
  });

  it("replaces the old ignore-everything, and leaves a hand-made one alone", () => {
    mkdirSync(join(a, "data"));
    writeFileSync(join(a, "data", ".gitignore"), "*\r\n");
    dataDir(a);
    expect(ignore(a)).toBe(DATA_GITIGNORE);

    mkdirSync(join(b, "data"));
    writeFileSync(join(b, "data", ".gitignore"), "*\nwiki.db\n");
    dataDir(b);
    expect(ignore(b)).toBe("*\nwiki.db\n");
  });
});

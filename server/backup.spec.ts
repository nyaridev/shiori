import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addAnswer, listAnswers, setAnswerHidden } from "./answers.ts";
import { BACKUP_FILE, importData, readBackup, writeBackup } from "./backup.ts";
import { createBoard, createReport, listBoards, listReports, removeReport, triageReport } from "./boards.ts";
import { allEdits, readSheet, type Sheet, setCell } from "./sheets.ts";
import { addMessage, closeAll, createThread, listThreads, setHidden, setStatus } from "./threads.ts";

let a: string;
let b: string;

beforeEach(() => {
  a = mkdtempSync(join(tmpdir(), "shiori-backup-a-"));
  b = mkdtempSync(join(tmpdir(), "shiori-backup-b-"));
});
afterEach(() => {
  closeAll();
  rmSync(a, { recursive: true, force: true });
  rmSync(b, { recursive: true, force: true });
});

describe("backups", () => {
  it("round-trip comments and answers, keeping their ids", () => {
    createThread(a, "plan", { exact: "first", prefix: "", suffix: "" }, "Too vague");
    const second = createThread(a, "", { exact: "second", prefix: "a ", suffix: " b" }, "Why?");
    addMessage(a, second.id, "agent", "Because.");
    addMessage(a, second.id, { guest: "g1", name: "Ana" }, "Agreed");
    setStatus(a, second.id, "resolved");
    addAnswer(a, "plan", "q1", "Steam", "Most players are there");
    const hidden = addAnswer(a, "plan", "q1", "itch.io", "", { guest: "g1", name: "Ana" });
    // What the owner hid stays hidden.
    setHidden(a, (listThreads(a)[1].messages.at(-1) as { id: number }).id, true);
    setAnswerHidden(a, hidden.id, true);

    const written = writeBackup(a);
    expect(written).toMatchObject({ file: join(a, BACKUP_FILE), threads: 2, answers: 2 });
    expect(existsSync(written.file)).toBe(true);

    importData(b, readBackup(a));
    expect(listThreads(b)).toEqual(listThreads(a));
    expect(listAnswers(b)).toEqual(listAnswers(a));
    expect(listAnswers(b)[1].hidden).toBe(true);
    expect(listThreads(b)[1].messages[2].hidden).toBe(true);
    // New comments continue after the restored ids.
    expect(createThread(b, "", { exact: "x", prefix: "", suffix: "" }, "New").id).toBe(3);
  });

  it("round-trip boards, reports (removed ones too) and sheet edits (ADR-0010)", () => {
    const board = createBoard(a, "Alpha", "global");
    const kept = createReport(
      a,
      board.uid,
      { kind: "idea", title: "Rain", body: "", images: [] },
      { guest: "g", name: "Bo" },
    );
    triageReport(a, kept.id, { status: "planned", note: "Next" });
    const gone = createReport(
      a,
      board.uid,
      { kind: "bug", title: "Spam", body: "", images: [] },
      { guest: "g", name: "Bo" },
    );
    removeReport(a, gone.id);
    mkdirSync(join(a, "sheets"));
    writeFileSync(
      join(a, "sheets", "mobs.json"),
      JSON.stringify({
        title: "M",
        key: "id",
        columns: [
          { id: "id", type: "text" },
          { id: "hp", type: "number", editable: true },
        ],
        rows: [{ id: "x", hp: 1 }],
      }),
    );
    setCell(a, readSheet(a, "mobs") as Sheet, { row: "x", column: "hp", value: 5, base: 0 }, "user", { kind: "owner" });
    writeBackup(a);
    importData(b, readBackup(a));
    expect(listBoards(b)).toEqual(listBoards(a));
    expect(listReports(b, board.uid, { removed: true })).toEqual(listReports(a, board.uid, { removed: true }));
    expect(allEdits(b)).toEqual(allEdits(a));
  });

  it("only overwrite a database that has data when asked to", () => {
    createThread(a, "plan", { exact: "kept", prefix: "", suffix: "" }, "Mine");
    writeBackup(a);
    createThread(b, "", { exact: "other", prefix: "", suffix: "" }, "Theirs");
    expect(() => importData(b, readBackup(a))).toThrow(/--replace/);
    expect(listThreads(b).map((t) => t.quote.exact)).toEqual(["other"]);
    importData(b, readBackup(a), { replace: true });
    expect(listThreads(b).map((t) => t.quote.exact)).toEqual(["kept"]);
  });

  it("reject files that aren't backups", () => {
    expect(() => readBackup(b)).toThrow(/No backup.json/);
  });
});

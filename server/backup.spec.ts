import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addAnswer, listAnswers } from "./answers.ts";
import { BACKUP_FILE, importData, readBackup, writeBackup } from "./backup.ts";
import { addMessage, closeAll, createThread, listThreads, setStatus } from "./threads.ts";

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
    addAnswer(a, "plan", "q1", "itch.io", "", { guest: "g1", name: "Ana" });

    const written = writeBackup(a);
    expect(written).toMatchObject({ file: join(a, BACKUP_FILE), threads: 2, answers: 2 });
    expect(existsSync(written.file)).toBe(true);

    importData(b, readBackup(a));
    expect(listThreads(b)).toEqual(listThreads(a));
    expect(listAnswers(b)).toEqual(listAnswers(a));
    // New comments continue after the restored ids.
    expect(createThread(b, "", { exact: "x", prefix: "", suffix: "" }, "New").id).toBe(3);
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

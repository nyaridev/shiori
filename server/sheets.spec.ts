import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkValue } from "../shared/sheet.ts";
import {
  applyToFile,
  currentValues,
  loadSheet,
  luauString,
  pendingEdits,
  readSheet,
  type Sheet,
  setCell,
  toJson,
  toLuau,
} from "./sheets.ts";
import { closeAll } from "./threads.ts";

let root: string;
const OWNER = { kind: "owner" } as const;
const SHEET = {
  title: "Mobs",
  key: "id",
  columns: [
    { id: "id", type: "text" },
    { id: "name", type: "text", editable: true },
    { id: "health", type: "number", min: 1, editable: true },
  ],
  rows: [
    { id: "slime", name: "Slime", health: 20 },
    { id: "bat", name: "Bat", health: 8 },
  ],
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "shiori-sheets-"));
  mkdirSync(join(root, "sheets"));
  writeFileSync(join(root, "sheets", "mobs.json"), JSON.stringify(SHEET));
});
afterEach(() => {
  closeAll();
  rmSync(root, { recursive: true, force: true });
});

describe("values", () => {
  it("are checked by type, range and step", () => {
    const n = { id: "x", type: "number", min: 0, max: 10, step: 0.1 } as const;
    expect(checkValue(n, 0.3)).toEqual({ value: 0.3 });
    expect(checkValue(n, 0.1 + 0.2)).toEqual({ value: 0.3 });
    expect(checkValue(n, 0.35)).toEqual({ error: "in steps of 0.1" });
    expect(checkValue(n, Number.NaN)).toEqual({ error: "a number" });
    expect(checkValue(n, Number.POSITIVE_INFINITY)).toEqual({ error: "a number" });
    expect(checkValue({ id: "t", type: "text" }, "  trimmed ")).toEqual({ value: "trimmed" });
    expect(checkValue({ id: "t", type: "text" }, "a b")).toEqual({ error: "one line of plain text" });
  });
});

describe("loading a sheet", () => {
  it("refuses names that could leave the folder, and files with problems", () => {
    expect(loadSheet(root, "../mobs")).toBeNull();
    expect(loadSheet(root, "Mobs")).toBeNull();
    writeFileSync(
      join(root, "sheets", "dupes.json"),
      JSON.stringify({ ...SHEET, rows: [SHEET.rows[0], SHEET.rows[0]] }),
    );
    expect(loadSheet(root, "dupes")).toEqual({ problems: ['two rows are "slime"'] });
    writeFileSync(join(root, "sheets", "bad.json"), "{ not json");
    expect((loadSheet(root, "bad") as { problems: string[] }).problems[0]).toMatch(/^not JSON/);
    const editableKey = { ...SHEET, columns: [{ id: "id", type: "text", editable: true }, ...SHEET.columns.slice(1)] };
    writeFileSync(join(root, "sheets", "key.json"), JSON.stringify(editableKey));
    expect(loadSheet(root, "key")).toEqual({ problems: ['the key "id" can\'t be editable'] });
  });
});

describe("export", () => {
  it("writes Luau whose strings and keys can't become code", () => {
    expect(luauString('a"b\\c\nd]]--')).toBe('"a\\"b\\\\c\\nd]]--"');
    expect(luauString("\u0000\u001b")).toBe('"\\000\\027"');
    const sheet = readSheet(root, "mobs") as Sheet;
    setCell(root, sheet, { row: "slime", column: "name", value: 'Evil" } os.exit() --', base: 0 }, "user", OWNER);
    const lua = toLuau(sheet, currentValues(root, sheet));
    expect(lua).toContain('["slime"] = { ["id"] = "slime", ["name"] = "Evil\\" } os.exit() --", ["health"] = 20 },');
    expect(lua.split("\n").filter((l) => l.startsWith("\t["))).toHaveLength(2);
    expect(JSON.parse(toJson(currentValues(root, sheet))).slime.name).toBe('Evil" } os.exit() --');
  });

  it("--apply makes current values the file's defaults and marks the changes exported", () => {
    const sheet = readSheet(root, "mobs") as Sheet;
    setCell(root, sheet, { row: "bat", column: "health", value: 12, base: 0 }, { guest: "g1", name: "Ana" }, OWNER);
    expect(pendingEdits(root, "mobs")).toHaveLength(1);
    expect(applyToFile(root, sheet)).toBe(1);
    expect(pendingEdits(root, "mobs")).toEqual([]);
    const file = JSON.parse(readFileSync(join(root, "sheets", "mobs.json"), "utf8"));
    expect(file.rows[1]).toEqual({ id: "bat", name: "Bat", health: 12 });
    // The value is the default now, so nobody's change shows on it.
    const again = readSheet(root, "mobs") as Sheet;
    const values = new Map(currentValues(root, again));
    expect(values.get("bat")?.health).toBe(12);
  });
});

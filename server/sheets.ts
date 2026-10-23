// Data sheets (ADR-0010): `sheets/<name>.json`, written by agents, is read here and never written by the app. What
// people change is kept in `data/wiki.db` (`sheet_edits`), one row per change, so every value has a history and a
// default to go back to. The CLI exports the current values (and may make them the file's new defaults).
import { existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Cell,
  checkValue,
  SHEET_LIMITS,
  SHEET_NAME,
  type SheetCell,
  type SheetColumn,
  type SheetEdit,
  type SheetFile,
  type SheetView,
  sheetFileSchema,
  sheetProblems,
} from "../shared/sheet.ts";
import { newUid } from "./ids.ts";
import { authorColumns, dbFor, type Writer } from "./threads.ts";

export const sheetsDir = (root: string) => join(root, "sheets");

/** A sheet file, read and checked, with its rows and editable columns found by name, never as object keys. */
export interface Sheet {
  name: string;
  file: SheetFile;
  rows: Map<string, Record<string, Cell>>;
  columns: Map<string, SheetColumn>;
}

/** A sheet by name, or why it can't be read. */
export function loadSheet(root: string, name: string): Sheet | { problems: string[] } | null {
  if (!SHEET_NAME.test(name)) return null;
  const path = join(sheetsDir(root), `${name}.json`);
  if (!existsSync(path)) return null;
  if (statSync(path).size > SHEET_LIMITS.bytes) return { problems: ["the file is over 1 MB"] };
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    return { problems: [`not JSON: ${(e as Error).message}`] };
  }
  const parsed = sheetFileSchema.safeParse(raw);
  if (!parsed.success)
    return { problems: parsed.error.issues.map((i) => `${i.path.join(".") || "the file"}: ${i.message}`) };
  const problems = sheetProblems(parsed.data);
  if (problems.length) return { problems };
  const file = parsed.data;
  return {
    name,
    file,
    rows: new Map(file.rows.map((r) => [r[file.key] as string, r])),
    columns: new Map(file.columns.map((c) => [c.id, c])),
  };
}

/** A sheet that can be read, or null. */
export const readSheet = (root: string, name: string): Sheet | null => {
  const s = loadSheet(root, name);
  return s && "file" in s ? s : null;
};

/** The names of a wiki's sheets. */
export function sheetNames(root: string): string[] {
  const dir = sheetsDir(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5))
    .filter((n) => SHEET_NAME.test(n))
    .sort();
}

/** What `wiki check` says about a wiki's sheets. */
export function allSheetProblems(root: string): string[] {
  const out: string[] = [];
  const dir = sheetsDir(root);
  if (existsSync(dir))
    for (const f of readdirSync(dir))
      if (f.endsWith(".json") && !SHEET_NAME.test(f.slice(0, -5)))
        out.push(`sheets/${f}: a sheet's name is lowercase letters, digits and -`);
  for (const name of sheetNames(root)) {
    const s = loadSheet(root, name);
    if (s && "problems" in s) for (const p of s.problems) out.push(`sheets/${name}.json: ${p}`);
  }
  return out;
}

// ── Edits ─────────────────────────────────────────────────────────────────────────────────────────────────────────

interface EditRow {
  id: number;
  sheet: string;
  row_key: string;
  column_id: string;
  value: string;
  prev: string;
  author: "user" | "agent" | "guest";
  guest_id: string | null;
  guest_name: string | null;
  created_at: string;
  exported_at: string | null;
}

const cellOf = (json: string): Cell => {
  try {
    const v = JSON.parse(json) as unknown;
    return typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? v : null;
  } catch {
    return null;
  }
};

/**
 * The latest edit of each cell of a sheet, by `row\ncolumn`. By time, then id: an edit merged from another PC
 * (`pnpm shiori sync`) gets a new id here but keeps when it was made.
 */
function latest(root: string, sheet: string): Map<string, EditRow> {
  const rows = dbFor(root)
    .prepare("select * from sheet_edits where sheet = ? order by created_at, id")
    .all(sheet) as unknown as EditRow[];
  return new Map(rows.map((r) => [`${r.row_key}\n${r.column_id}`, r]));
}

/** Every change to every sheet, oldest first, as backups and sync files carry them. */
export function allEdits(root: string): SheetEditRecord[] {
  const rows = dbFor(root).prepare("select * from sheet_edits order by id").all() as unknown as (EditRow & {
    uid: string;
    updated_at: string;
  })[];
  return rows.map((r) => ({
    uid: r.uid,
    sheet: r.sheet,
    row: r.row_key,
    column: r.column_id,
    value: r.value,
    prev: r.prev,
    author: r.author,
    ...(r.guest_name ? { name: r.guest_name } : {}),
    ...(r.guest_id ? { guestId: r.guest_id } : {}),
    createdAt: r.created_at,
    exportedAt: r.exported_at,
    updatedAt: r.updated_at,
  }));
}

/** A change to a cell in a backup or sync file: `value` and `prev` stay JSON text, as stored. */
export interface SheetEditRecord {
  uid: string;
  sheet: string;
  row: string;
  column: string;
  value: string;
  prev: string;
  author: "user" | "agent" | "guest";
  name?: string;
  guestId?: string;
  createdAt: string;
  exportedAt: string | null;
  updatedAt: string;
}

/** Who sees which name and "mine" on a sheet. */
export type SheetViewer = { kind: "owner" } | { kind: "guest"; id: string; canEdit: boolean; host: string };

const nameOf = (e: Pick<EditRow, "author" | "guest_name">, viewer: SheetViewer) =>
  e.author === "guest"
    ? (e.guest_name ?? "Guest")
    : e.author === "agent"
      ? "Agent"
      : viewer.kind === "owner"
        ? "You"
        : viewer.host;
const isMine = (e: Pick<EditRow, "author" | "guest_id">, viewer: SheetViewer) =>
  viewer.kind === "owner" ? e.author === "user" : e.author === "guest" && e.guest_id === viewer.id;

function cellFrom(sheet: Sheet, key: string, col: SheetColumn, edit: EditRow | undefined, viewer: SheetViewer) {
  const fallback = sheet.rows.get(key)?.[col.id] ?? null;
  if (!edit) return { value: fallback, default: fallback, version: 0 } satisfies SheetCell;
  const v = cellOf(edit.value);
  return {
    value: v === null ? fallback : v,
    default: fallback,
    version: edit.id,
    // Back at the default (a reset, or a value exported as the new default): nobody's change shows.
    ...(v === null || v === fallback
      ? {}
      : { by: { name: nameOf(edit, viewer), at: edit.created_at, ...(isMine(edit, viewer) ? { mine: true } : {}) } }),
  } satisfies SheetCell;
}

/** A sheet with every cell's value, default and last change, as `viewer` sees it. */
export function sheetView(root: string, sheet: Sheet, viewer: SheetViewer): SheetView {
  const edits = latest(root, sheet.name);
  const f = sheet.file;
  return {
    name: sheet.name,
    title: f.title,
    ...(f.description ? { description: f.description } : {}),
    key: f.key,
    ...(f.groupBy ? { groupBy: f.groupBy } : {}),
    columns: f.columns,
    rows: [...sheet.rows.keys()].map((key) => ({
      key,
      cells: Object.fromEntries(
        f.columns.map((c) => [c.id, cellFrom(sheet, key, c, edits.get(`${key}\n${c.id}`), viewer)]),
      ),
    })),
    canEdit: viewer.kind === "owner" || viewer.canEdit,
  };
}

export type SetResult = { cell: SheetCell } | { conflict: SheetCell } | { error: string; status: 400 | 403 | 404 };

/**
 * Sets one cell: `value` null puts it back to its default. `base` is the cell's version the change started from; if
 * someone changed it since, nothing is stored and the current cell comes back as a conflict.
 */
export function setCell(
  root: string,
  sheet: Sheet,
  change: { row: string; column: string; value: unknown; base: number },
  by: Writer,
  viewer: SheetViewer,
): SetResult {
  const row = sheet.rows.get(change.row);
  const col = sheet.columns.get(change.column);
  if (!row || !col) return { error: "no such cell", status: 404 };
  if (!col.editable) return { error: "this column can't be changed", status: 403 };
  let next: Cell = null;
  if (change.value !== null) {
    const checked = checkValue(col, change.value);
    if ("error" in checked) return { error: `should be ${checked.error}`, status: 400 };
    next = checked.value;
  }
  const db = dbFor(root);
  db.exec("begin immediate");
  try {
    const now = latest(root, sheet.name).get(`${change.row}\n${col.id}`);
    const current = cellFrom(sheet, change.row, col, now, viewer);
    if (change.base !== current.version) {
      db.exec("commit");
      return { conflict: current };
    }
    const target = next === null ? current.default : next;
    // Nothing would change: a reset of a default, or the value it already has.
    if (target === current.value) {
      db.exec("commit");
      return { cell: current };
    }
    const at = new Date().toISOString();
    db.prepare(
      "insert into sheet_edits (uid, sheet, row_key, column_id, value, prev, author, guest_id, guest_name, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      newUid(),
      sheet.name,
      change.row,
      col.id,
      JSON.stringify(next),
      JSON.stringify(current.value),
      ...authorColumns(by),
      at,
      at,
    );
    db.exec("commit");
  } catch (e) {
    db.exec("rollback");
    throw e;
  }
  const after = latest(root, sheet.name).get(`${change.row}\n${col.id}`);
  return { cell: cellFrom(sheet, change.row, col, after, viewer) };
}

/** A sheet's changes, newest first. Guests get names, never guest ids. */
export function sheetHistory(root: string, sheet: string, viewer: SheetViewer, limit = 200): SheetEdit[] {
  const rows = dbFor(root)
    .prepare("select * from sheet_edits where sheet = ? order by id desc limit ?")
    .all(sheet, limit) as unknown as EditRow[];
  return rows.map((r) => ({
    id: r.id,
    row: r.row_key,
    column: r.column_id,
    value: cellOf(r.value),
    prev: cellOf(r.prev),
    name: nameOf(r, viewer),
    at: r.created_at,
    author: r.author,
    ...(viewer.kind === "owner" && r.guest_id ? { guestId: r.guest_id } : {}),
    ...(isMine(r, viewer) ? { mine: true } : {}),
    ...(r.exported_at ? { exported: true } : {}),
  }));
}

/** Undoes one change: the cell goes back to what it was before it, if nobody changed it since. */
export function undoEdit(root: string, sheet: Sheet, id: number, by: Writer): SetResult {
  const e = dbFor(root).prepare("select * from sheet_edits where id = ? and sheet = ?").get(id, sheet.name) as
    | EditRow
    | undefined;
  if (!e) return { error: "no such change", status: 404 };
  const prev = cellOf(e.prev);
  const def = sheet.rows.get(e.row_key)?.[e.column_id] ?? null;
  return setCell(
    root,
    sheet,
    { row: e.row_key, column: e.column_id, value: prev === def ? null : prev, base: e.id },
    by,
    { kind: "owner" },
  );
}

/**
 * Takes back everything one guest changed on a sheet: each cell whose latest changes are theirs goes back to what it
 * was before them. Cells someone else changed after them stay. Answers how many cells changed.
 */
export function revertGuest(root: string, sheet: Sheet, guest: string, by: Writer): number {
  const rows = dbFor(root)
    .prepare("select * from sheet_edits where sheet = ? order by created_at, id")
    .all(sheet.name) as unknown as EditRow[];
  const byCell = new Map<string, EditRow[]>();
  for (const r of rows) {
    const k = `${r.row_key}\n${r.column_id}`;
    byCell.set(k, [...(byCell.get(k) ?? []), r]);
  }
  let n = 0;
  for (const list of byCell.values()) {
    let i = list.length;
    while (i > 0 && list[i - 1].author === "guest" && list[i - 1].guest_id === guest) i--;
    if (i === list.length) continue;
    const first = list[i];
    const prev = cellOf(first.prev);
    const def = sheet.rows.get(first.row_key)?.[first.column_id] ?? null;
    const done = setCell(
      root,
      sheet,
      { row: first.row_key, column: first.column_id, value: prev === def ? null : prev, base: list.at(-1)?.id ?? 0 },
      by,
      { kind: "owner" },
    );
    if ("cell" in done) n++;
  }
  return n;
}

// ── Export (the CLI's) ────────────────────────────────────────────────────────────────────────────────────────────

/** Every row's current values, by key, in the file's order. Null cells are left out. */
export function currentValues(root: string, sheet: Sheet): [string, Record<string, Cell>][] {
  const view = sheetView(root, sheet, { kind: "owner" });
  return view.rows.map((r) => [
    r.key,
    Object.fromEntries(
      Object.entries(r.cells)
        .filter(([, c]) => c.value !== null)
        .map(([k, c]) => [k, c.value]),
    ),
  ]);
}

/** Changes not exported yet, oldest first. */
export function pendingEdits(root: string, sheet: string): SheetEdit[] {
  return sheetHistory(root, sheet, { kind: "owner" }, 100_000)
    .filter((e) => !e.exported)
    .reverse();
}

/** A Luau string literal: every quote, backslash and control character escaped, so a value can't become code. */
export function luauString(s: string): string {
  let out = '"';
  for (const ch of s) {
    const code = ch.codePointAt(0) as number;
    if (ch === '"' || ch === "\\") out += `\\${ch}`;
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (code < 0x20 || code === 0x7f) out += `\\${String(code).padStart(3, "0")}`;
    else out += ch;
  }
  return `${out}"`;
}

function luauValue(v: Cell): string {
  if (typeof v === "string") return luauString(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  throw new Error(`can't write ${String(v)} to Luau`);
}

/** A Luau module returning the sheet's values: `return { ["slime"] = { ["health"] = 20 } }`. */
export function toLuau(sheet: Sheet, values: [string, Record<string, Cell>][]): string {
  const lines = [
    `-- ${sheet.file.title}: made by Shiori from sheets/${sheet.name}.json. Change the sheet, not this file.`,
    "return {",
  ];
  for (const [key, cells] of values) {
    const fields = Object.entries(cells).map(([k, v]) => `[${luauString(k)}] = ${luauValue(v)}`);
    lines.push(`\t[${luauString(key)}] = { ${fields.join(", ")} },`);
  }
  lines.push("}", "");
  return lines.join("\n");
}

export const toJson = (values: [string, Record<string, Cell>][]) =>
  `${JSON.stringify(Object.fromEntries(values), null, 2)}\n`;

/** Makes the current values the file's defaults and marks every change exported. The CLI's, never the app's. */
export function applyToFile(root: string, sheet: Sheet): number {
  const values = new Map(currentValues(root, sheet));
  const file = {
    ...sheet.file,
    rows: sheet.file.rows.map((r) => ({ ...r, ...values.get(r[sheet.file.key] as string) })),
  };
  const path = join(sheetsDir(root), `${sheet.name}.json`);
  writeFileSync(`${path}.tmp`, `${JSON.stringify(file, null, 2)}\n`);
  renameSync(`${path}.tmp`, path);
  const at = new Date().toISOString();
  const { changes } = dbFor(root)
    .prepare("update sheet_edits set exported_at = ?, updated_at = ? where sheet = ? and exported_at is null")
    .run(at, at, sheet.name);
  return Number(changes);
}

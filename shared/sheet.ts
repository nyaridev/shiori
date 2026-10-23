// Data sheets (ADR-0010): a table an agent writes as `sheets/<name>.json` in a wiki, whose values people may tune
// through the app or a sheet link. The file's values are the defaults; people's edits live in `data/wiki.db`. The
// server, the CLI and the app all check values with `checkValue`, and the server's answer is the one that counts.
import { z } from "zod";

/** A sheet's name: its file name without `.json`. */
export const SHEET_NAME = /^[a-z0-9][a-z0-9-]{0,47}$/;
/** A column's id and a row's key. */
const ID = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/;
export const SHEET_LIMITS = { rows: 2000, columns: 40, text: 200, bytes: 1024 * 1024 } as const;
/** No number in a sheet is larger than this, either way. */
export const MAX_NUMBER = 1e12;

const base = {
  id: z.string().regex(ID, "a column id is letters, digits, _ . -"),
  label: z.string().max(60).optional(),
  /** People may change it. Columns are read-only unless they say so. */
  editable: z.boolean().optional(),
  /** A short hint under the column's name. */
  hint: z.string().max(200).optional(),
};

const numberColumn = z.strictObject({
  ...base,
  type: z.literal("number"),
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
  /** Values are multiples of it, counted from `min` (or 0). 1 (whole numbers) unless it says otherwise. */
  step: z.number().finite().positive().optional(),
  unit: z.string().max(12).optional(),
});
const textColumn = z.strictObject({
  ...base,
  type: z.literal("text"),
  maxLength: z.number().int().min(1).max(2000).optional(),
});
const choiceColumn = z.strictObject({
  ...base,
  type: z.literal("choice"),
  options: z.array(z.string().min(1).max(60)).min(1).max(50),
});
const boolColumn = z.strictObject({ ...base, type: z.literal("bool") });

export const sheetColumnSchema = z.discriminatedUnion("type", [numberColumn, textColumn, choiceColumn, boolColumn]);
export type SheetColumn = z.infer<typeof sheetColumnSchema>;
export type Cell = string | number | boolean | null;

export const sheetFileSchema = z.strictObject({
  title: z.string().min(1).max(80),
  description: z.string().max(1000).optional(),
  /** The column whose values name the rows. Its values are unique and never change. */
  key: z.string().regex(ID),
  /** Rows are shown in groups by this column's value. */
  groupBy: z.string().regex(ID).optional(),
  columns: z.array(sheetColumnSchema).min(1).max(SHEET_LIMITS.columns),
  rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))).max(SHEET_LIMITS.rows),
});
export type SheetFile = z.infer<typeof sheetFileSchema>;

/** A value someone wants a cell to have, checked against its column: the value to store, or why not. */
export function checkValue(col: SheetColumn, value: unknown): { value: Cell } | { error: string } {
  switch (col.type) {
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) return { error: "a number" };
      if (Math.abs(value) > MAX_NUMBER) return { error: "a smaller number" };
      if (col.min !== undefined && value < col.min) return { error: `at least ${col.min}` };
      if (col.max !== undefined && value > col.max) return { error: `at most ${col.max}` };
      const step = col.step ?? 1;
      const from = col.min ?? 0;
      const steps = (value - from) / step;
      // Within a millionth of a step, so 0.1 + 0.2 still counts as a step of 0.1.
      if (Math.abs(steps - Math.round(steps)) > 1e-6) return { error: `in steps of ${step}` };
      return { value: Number((from + Math.round(steps) * step).toPrecision(12)) };
    }
    case "text": {
      if (typeof value !== "string") return { error: "text" };
      const max = col.maxLength ?? SHEET_LIMITS.text;
      if (value.length > max) return { error: `at most ${max} characters` };
      for (const ch of value) {
        const code = ch.codePointAt(0) as number;
        if (code < 0x20 || code === 0x7f || code === 0x2028 || code === 0x2029)
          return { error: "one line of plain text" };
      }
      return { value: value.trim() };
    }
    case "choice":
      return typeof value === "string" && col.options.includes(value)
        ? { value }
        : { error: `one of ${col.options.join(", ")}` };
    case "bool":
      return typeof value === "boolean" ? { value } : { error: "yes or no" };
  }
}

/** What's wrong with a sheet file beyond its shape: the key, groups and each default against its column. */
export function sheetProblems(sheet: SheetFile): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const c of sheet.columns) {
    if (ids.has(c.id)) problems.push(`two columns are "${c.id}"`);
    ids.add(c.id);
    if (c.type === "number" && c.min !== undefined && c.max !== undefined && c.min > c.max)
      problems.push(`column "${c.id}": min is above max`);
  }
  const key = sheet.columns.find((c) => c.id === sheet.key);
  if (!key) problems.push(`the key "${sheet.key}" isn't a column`);
  else if (key.editable) problems.push(`the key "${sheet.key}" can't be editable`);
  if (sheet.groupBy && !ids.has(sheet.groupBy)) problems.push(`groupBy "${sheet.groupBy}" isn't a column`);
  const keys = new Set<string>();
  sheet.rows.forEach((row, i) => {
    const k = row[sheet.key];
    if (typeof k !== "string" || !ID.test(k)) problems.push(`row ${i + 1}: its key is letters, digits, _ . -`);
    else if (keys.has(k)) problems.push(`two rows are "${k}"`);
    else keys.add(k);
    for (const name of Object.keys(row)) if (!ids.has(name)) problems.push(`row ${i + 1}: "${name}" isn't a column`);
    for (const c of sheet.columns) {
      const v = row[c.id];
      if (v === undefined || v === null) continue;
      const checked = checkValue(c, v);
      if ("error" in checked) problems.push(`row ${i + 1}, ${c.id}: should be ${checked.error}`);
    }
  });
  return problems;
}

/** A sheet as people see it: each cell's value, its default from the file, and who changed it last. */
export interface SheetCell {
  value: Cell;
  /** The file's value. */
  default: Cell;
  /** The id of the edit that set it, 0 while it's the default: what a change starts from. */
  version: number;
  /** Who set it, when it isn't the default. */
  by?: { name: string; at: string; mine?: boolean };
}

export interface SheetView {
  name: string;
  title: string;
  description?: string;
  key: string;
  groupBy?: string;
  columns: SheetColumn[];
  /** Rows by key, in the file's order. */
  rows: { key: string; cells: Record<string, SheetCell> }[];
  /** This viewer may change editable cells. */
  canEdit: boolean;
}

/** One change to one cell, for the sheet's history. */
export interface SheetEdit {
  id: number;
  row: string;
  column: string;
  /** Null: back to the default. */
  value: Cell;
  prev: Cell;
  name: string;
  at: string;
  /** Owner and CLI only: the guest who made it, for undoing everything they did. */
  guestId?: string;
  author: "user" | "agent" | "guest";
  mine?: boolean;
  exported?: boolean;
}

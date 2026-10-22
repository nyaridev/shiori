// Data tables (ADR-0008): `::table` fills itself from a data file in the wiki or from the wiki's pages, and `:::table`
// wraps a Markdown table. Either way the page gets an ordinary table (so search, comments and `wiki check` see it), and
// the app makes it sortable and filterable. The rows are read when the page renders, so they follow the files.
import type { Link, PhrasingContent, Root, RootContent, Table, TableCell, TableRow } from "mdast";
import type { ContainerDirective, LeafDirective } from "mdast-util-directive";
import { visit } from "unist-util-visit";
import { resolveFile } from "./links.ts";

/** A page as a table of pages sees it. */
export interface PageRow {
  path: string;
  title: string;
  type?: string;
  status?: string;
  tags?: string[];
  summary?: string;
  fields?: Record<string, string>;
}

export interface TableSource {
  /** A data file's text (`rel` from the wiki root), or null when there's none. */
  readData: (rel: string) => string | null;
  /** Every page of the wiki. */
  pages: () => PageRow[];
}

export const TABLE_LIMITS = { rows: 2000, bytes: 2 * 1024 * 1024 };
/** Data files a table reads. `data/` is Shiori's own (comments), never a table's. */
const DATA_FILE = /\.(csv|tsv|json)$/i;

interface Grid {
  columns: string[];
  rows: (string | { page: string; title: string })[][];
}

/** CSV or TSV (RFC 4180: quotes around a cell keep its commas, line breaks and doubled quotes). */
export function parseDelimited(text: string, separator: "," | "\t"): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === separator) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const cellText = (v: unknown): string =>
  v === null || v === undefined
    ? ""
    : typeof v === "object"
      ? Array.isArray(v) && v.every((x) => typeof x !== "object")
        ? v.join(", ")
        : JSON.stringify(v)
      : String(v);

/** A data file → its columns and rows. JSON is a list of objects, one per row. */
function gridOfFile(name: string, text: string, problem: (m: string) => void): Grid | null {
  if (/\.json$/i.test(name)) {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch (e) {
      problem(`table: ${name} isn't valid JSON (${(e as Error).message})`);
      return null;
    }
    if (!Array.isArray(data) || !data.every((r) => r && typeof r === "object" && !Array.isArray(r))) {
      problem(`table: ${name} should be a list of objects, one per row`);
      return null;
    }
    const columns = [...new Set(data.flatMap((r) => Object.keys(r as object)))];
    return { columns, rows: data.map((r) => columns.map((c) => cellText((r as Record<string, unknown>)[c]))) };
  }
  const [head, ...rows] = parseDelimited(text, /\.tsv$/i.test(name) ? "\t" : ",");
  if (!head) {
    problem(`table: ${name} is empty`);
    return null;
  }
  const columns = head.map((c) => c.trim());
  return { columns, rows: rows.map((r) => columns.map((_, i) => (r[i] ?? "").trim())) };
}

/** Names compare without case, spaces, dashes or underscores: `HP`, `hp`, `Max HP` vs `max_hp`. */
const loose = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "");

/** The columns a page always has, before its own fields. */
const PAGE_COLUMNS: Record<string, (p: PageRow) => string> = {
  Type: (p) => p.type ?? "",
  Status: (p) => p.status ?? "",
  Tags: (p) => (p.tags ?? []).join(", "),
  Summary: (p) => p.summary ?? "",
};

/**
 * Which pages a `pages` filter takes: terms joined by commas, all of which must match. `type:Mob`, `tag:boss`,
 * `status:active`, `in:mobs` (the folder and below), or any of the pages' own fields, `biome:forest`.
 */
export function pagesMatching(pages: PageRow[], filter: string, problem: (m: string) => void): PageRow[] {
  const terms = filter
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const colon = t.indexOf(":");
      if (colon <= 0) problem(`table: pages="${filter}": write each term as key:value, as type:Mob`);
      return {
        key: loose(t.slice(0, colon)),
        value: t
          .slice(colon + 1)
          .trim()
          .toLowerCase(),
      };
    })
    .filter((t) => t.key);
  const same = (a: string | undefined, b: string) => (a ?? "").trim().toLowerCase() === b;
  return pages.filter((p) =>
    terms.every(({ key, value }) => {
      if (key === "type") return same(p.type, value);
      if (key === "status") return same(p.status, value);
      if (key === "tag" || key === "tags") return (p.tags ?? []).some((t) => same(t, value));
      if (key === "in") return value === "" || p.path === value || p.path.startsWith(`${value.replace(/\/$/, "")}/`);
      const field = Object.entries(p.fields ?? {}).find(([k]) => loose(k) === key);
      return field ? same(field[1], value) : false;
    }),
  );
}

/** Pages → a grid: the page (a link) first, then its own fields as they first appear, or the columns asked for. */
function gridOfPages(pages: PageRow[]): Grid {
  const columns = ["Page"];
  for (const p of pages)
    for (const k of Object.keys(p.fields ?? {})) if (!columns.some((c) => loose(c) === loose(k))) columns.push(k);
  for (const k of Object.keys(PAGE_COLUMNS)) columns.push(k);
  const value = (p: PageRow, column: string) => {
    if (column === "Page") return { page: p.path, title: p.title };
    if (PAGE_COLUMNS[column]) return PAGE_COLUMNS[column](p);
    return Object.entries(p.fields ?? {}).find(([k]) => loose(k) === loose(column))?.[1] ?? "";
  };
  return { columns, rows: pages.map((p) => columns.map((c) => value(p, c))) };
}

/** Keeps the columns asked for, in that order; for pages without `columns`, the page and its own fields only. */
function pick(grid: Grid, asked: string | null | undefined, fromPages: boolean, problem: (m: string) => void): Grid {
  let wanted: number[];
  if (asked) {
    wanted = [];
    for (const name of asked
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)) {
      const at = grid.columns.findIndex(
        (c) => loose(c) === loose(name) || (fromPages && c === "Page" && ["name", "title"].includes(loose(name))),
      );
      if (at < 0) problem(`table: there's no column "${name}" (there are ${grid.columns.join(", ")})`);
      else wanted.push(at);
    }
  } else {
    wanted = grid.columns.map((_, i) => i);
    // Type, status, tags and summary only when asked for: most tables of pages are about the pages' own facts.
    if (fromPages) {
      const own = wanted.filter((i) => !PAGE_COLUMNS[grid.columns[i]]);
      wanted = own.length > 1 ? own : wanted;
    }
  }
  return { columns: wanted.map((i) => grid.columns[i]), rows: grid.rows.map((r) => wanted.map((i) => r[i])) };
}

const text = (value: string): PhrasingContent => ({ type: "text", value });
const cell = (children: PhrasingContent[]): TableCell => ({ type: "tableCell", children });
const row = (cells: TableCell[]): TableRow => ({ type: "tableRow", children: cells });

/** A grid as the Markdown table it would be written as. Page cells link to their page; text keeps its [[links]]. */
function tableOf(grid: Grid): Table {
  const link = (v: { page: string; title: string }): Link => ({
    type: "link",
    url: `/${v.page.split("/").map(encodeURIComponent).join("/")}`,
    children: [text(v.title)],
  });
  return {
    type: "table",
    align: grid.columns.map(() => null),
    children: [
      row(grid.columns.map((c) => cell([text(c)]))),
      ...grid.rows.map((r) => row(r.map((v) => cell([typeof v === "string" ? text(v) : link(v)])))),
    ],
  };
}

type TableDirective = LeafDirective | ContainerDirective;

/**
 * remark plugin, after the elements: fills each `::table` with its rows, checks each `:::table` holds a table, and
 * reports what's wrong as page problems.
 */
export function remarkTables(ctx: { pageDir: string } & Partial<TableSource>, problems: string[], lineOffset = 0) {
  return (tree: Root) => {
    visit(tree, (node) => {
      if (node.type !== "leafDirective" && node.type !== "containerDirective") return;
      const d = node as TableDirective;
      if (d.name !== "table" || d.data?.hName !== "sh-table") return;
      const line = (d.position?.start.line ?? 0) + lineOffset;
      const problem = (message: string) => problems.push(`line ${line}: ${message}`);
      const { src, pages, columns, sort, stats } = d.attributes ?? {};
      checkStats(stats, problem);

      if (d.type === "containerDirective") {
        if (src || pages) problem("table: a table from src or pages is written ::table{…}, with nothing inside");
        const tables = (d.children as RootContent[]).filter((c) => c.type === "table");
        if (tables.length !== 1) problem("table: put one Markdown table inside :::table");
        const head = (tables[0] as Table | undefined)?.children[0];
        checkSort(sort, head ? head.children.map((c) => plain(c.children)) : [], problem);
        return;
      }

      if (!!src === !!pages) {
        problem('table: give it a file, ::table{src="tables/mobs.csv"}, or pages, ::table{pages="type:Mob"}');
        return;
      }
      let grid: Grid | null = null;
      if (src) {
        const rel = resolveFile(ctx.pageDir, src);
        if (rel === null || !DATA_FILE.test(rel) || /^data(\/|$)/.test(rel)) {
          problem(`table: "${src}" should be a .csv, .tsv or .json file in the wiki (not in data/)`);
          return;
        }
        const body = ctx.readData?.(rel) ?? null;
        if (body === null) {
          problem(`table: missing file "${src}"`);
          return;
        }
        if (Buffer.byteLength(body) > TABLE_LIMITS.bytes) {
          problem(`table: "${src}" is over ${TABLE_LIMITS.bytes / 1024 / 1024} MB; split it`);
          return;
        }
        grid = gridOfFile(src, body, problem);
      } else if (pages) {
        const matched = pagesMatching(ctx.pages?.() ?? [], pages, problem);
        if (!matched.length) problem(`table: no page matches pages="${pages}"`);
        grid = gridOfPages([...matched].sort((a, b) => a.title.localeCompare(b.title)));
      }
      if (!grid) return;
      grid = pick(grid, columns, !!pages, problem);
      if (grid.rows.length > TABLE_LIMITS.rows) {
        problem(
          `table: ${grid.rows.length} rows, more than the ${TABLE_LIMITS.rows} a table shows; the rest are left out`,
        );
        grid.rows = grid.rows.slice(0, TABLE_LIMITS.rows);
      }
      checkSort(sort, grid.columns, problem);
      d.children = [tableOf(grid)] as never;
    });
  };
}

const plain = (nodes: PhrasingContent[]): string =>
  nodes.map((n) => ("value" in n ? n.value : "children" in n ? plain(n.children as PhrasingContent[]) : "")).join("");

/** What a table's foot can show (`stats="sum, avg"`); bare `stats` shows the average, lowest and highest. */
export const TABLE_STATS = ["sum", "avg", "min", "max"];

function checkStats(stats: string | null | undefined, problem: (m: string) => void) {
  for (const s of (stats ?? "").split(/[\s,]+/).filter(Boolean))
    if (!TABLE_STATS.includes(s.toLowerCase())) problem(`table: stats "${s}" isn't one of ${TABLE_STATS.join(", ")}`);
}

/** `sort="HP"` or `sort="-HP"` (highest first) names one of the columns. */
function checkSort(sort: string | null | undefined, columns: string[], problem: (m: string) => void) {
  if (!sort) return;
  const name = sort.replace(/^-/, "");
  if (!columns.some((c) => loose(c) === loose(name))) problem(`table: sort="${sort}" isn't one of the columns`);
}

// What a data table (DataTable.tsx, ADR-0008) does with its cells: read numbers the way people write them, order
// rows, and keep the rows a filter asks for. The filter is words to find, or `column` + an operator + a value:
// `forest`, `hp>20`, `damage<=5`, `biome:forest` (contains), `type=boss` (is), `name!=rat` (doesn't contain).

/** A cell as a number: `1,200`, `12.5`, `-3`, `40%`, `$9.99`, `2.5k`, `1.2M`; null when it isn't one. */
export function numberOf(raw: string): number | null {
  let t = raw
    .trim()
    .replace(/[\s_]/g, "")
    .replace(/^[$€£¥]/, "")
    .replace(/%$/, "");
  if (/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?[kKmM]?$/.test(t)) t = t.replace(/,/g, "");
  else if (/^[-+]?\d+,\d+$/.test(t)) t = t.replace(",", ".");
  const m = /^([-+]?(?:\d+\.?\d*|\.\d+))([kKmM]?)$/.exec(t);
  if (!m) return null;
  const scale = { k: 1e3, m: 1e6 }[m[2].toLowerCase() as "k" | "m"] ?? 1;
  const n = Number(m[1]) * scale;
  return Number.isFinite(n) ? n : null;
}

/** A column is numeric when most of its filled cells are numbers. */
export function isNumeric(values: string[]): boolean {
  const filled = values.filter((v) => v.trim() !== "");
  if (!filled.length) return false;
  return filled.filter((v) => numberOf(v) !== null).length / filled.length >= 0.8;
}

/** Orders two cells: numbers by value, text in the reader's language (with `2` before `10`), empty cells last. */
export function compareCells(a: string, b: string, numeric: boolean, dir: 1 | -1): number {
  const ea = a.trim() === "";
  const eb = b.trim() === "";
  if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1;
  if (numeric) {
    const na = numberOf(a);
    const nb = numberOf(b);
    if (na !== null && nb !== null) return (na - nb) * dir;
    if (na !== null || nb !== null) return na === null ? 1 : -1;
  }
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }) * dir;
}

type Op = ">=" | "<=" | "!=" | ">" | "<" | "=" | ":";
export type Term = { text: string } | { column: number; op: Op; value: string };

const loose = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "");

/** A filter's terms. A `name:value` whose name isn't a column is words to find. Quotes keep words together. */
export function parseFilter(filter: string, columns: string[]): Term[] {
  const words = filter.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  return words.map((raw): Term => {
    const word = raw.replace(/"/g, "");
    const m = /^([^<>=:!]+)(>=|<=|!=|>|<|=|:)(.*)$/.exec(word);
    const column = m ? columns.findIndex((c) => loose(c) === loose(m[1])) : -1;
    if (m && column >= 0) return { column, op: m[2] as Op, value: m[3] };
    return { text: word };
  });
}

/** Whether a row (its cells' text) has everything the terms ask for. */
export function matches(cells: string[], terms: Term[]): boolean {
  return terms.every((term) => {
    if ("text" in term) {
      const want = term.text.toLowerCase();
      return !want || cells.some((c) => c.toLowerCase().includes(want));
    }
    const cell = cells[term.column] ?? "";
    const value = term.value.toLowerCase();
    const have = cell.toLowerCase();
    if (term.op === ":") return have.includes(value);
    if (term.op === "!=") return !have.includes(value);
    const a = numberOf(cell);
    const b = numberOf(term.value);
    if (term.op === "=") return a !== null && b !== null ? a === b : have.trim() === value.trim();
    if (a === null || b === null) return false;
    return term.op === ">" ? a > b : term.op === "<" ? a < b : term.op === ">=" ? a >= b : a <= b;
  });
}

export const STATS = ["sum", "avg", "min", "max"] as const;
export type Stat = (typeof STATS)[number];
/** What `stats` shows when it names nothing. */
export const DEFAULT_STATS: Stat[] = ["avg", "min", "max"];

/** `stats="sum, avg"` → the rows the table's foot shows. */
export function statsOf(attr: string | undefined): Stat[] {
  if (attr === undefined) return [];
  const asked = attr
    .split(/[\s,]+/)
    .map((s) => s.toLowerCase())
    .filter((s): s is Stat => (STATS as readonly string[]).includes(s));
  return asked.length ? asked : DEFAULT_STATS;
}

/** One stat over a column's numbers. */
export function stat(kind: Stat, values: number[]): number | null {
  if (!values.length) return null;
  if (kind === "sum") return values.reduce((a, b) => a + b, 0);
  if (kind === "avg") return values.reduce((a, b) => a + b, 0) / values.length;
  return kind === "min" ? Math.min(...values) : Math.max(...values);
}

/** A stat as people read it: big numbers short (`416k`), whole numbers as they are, others to two places. */
export const formatStat = (n: number) =>
  Math.abs(n) >= 10_000
    ? n.toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 1 })
    : n.toLocaleString(undefined, { maximumFractionDigits: Number.isInteger(n) ? 0 : 2 });

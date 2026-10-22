// Line diffs for a page's history (ADR-0008): two versions of a file → the lines kept, removed and added, cut into
// hunks with a few lines of context. Myers' algorithm, so the result is the shortest edit, as git shows it.

export interface DiffLine {
  kind: "same" | "add" | "del";
  text: string;
  /** Line numbers in the old and the new version (1-based); a line only one side has gets only that side's. */
  old?: number;
  new?: number;
}

/** A run of changed lines with up to `context` lines around it; `skipped` lines before it were the same. */
export interface Hunk {
  skipped: number;
  lines: DiffLine[];
}

export interface FileDiff {
  hunks: Hunk[];
  /** Same lines after the last hunk. */
  skippedAfter: number;
  added: number;
  removed: number;
}

export const splitLines = (text: string): string[] => {
  if (!text) return [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
};

/** Past this many edits, two versions are shown as one removed and one added block. */
const MAX_EDITS = 2000;

/** The shortest edit from `a` to `b`, item by item. */
export function editScript<T>(a: T[], b: T[], same: (x: T, y: T) => boolean = Object.is): ("same" | "add" | "del")[] {
  // Common ends first: most edits touch a few lines in the middle of a page.
  let start = 0;
  while (start < a.length && start < b.length && same(a[start], b[start])) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && same(a[endA - 1], b[endB - 1])) {
    endA--;
    endB--;
  }
  const head = Array<"same">(start).fill("same");
  const tail = Array<"same">(a.length - endA).fill("same");
  const n = endA - start;
  const m = endB - start;
  if (n === 0 || m === 0) {
    return [...head, ...Array<"del">(n).fill("del"), ...Array<"add">(m).fill("add"), ...tail];
  }

  // Myers: for each edit count d, the furthest x reached on each diagonal k = x - y.
  const max = n + m;
  const offset = max;
  const v = new Int32Array(2 * max + 2);
  const trace: Int32Array[] = [];
  let found = false;
  for (let d = 0; d <= max && !found; d++) {
    // A page rewritten from top to bottom: everything changed, without keeping thousands of traces.
    if (d > MAX_EDITS) return [...head, ...Array<"del">(n).fill("del"), ...Array<"add">(m).fill("add"), ...tail];
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x =
        k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && same(a[start + x], b[start + y])) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }
  }

  // Walk back through the trace from the end to the start.
  const middle: ("same" | "add" | "del")[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const vd = trace[d];
    const k = x - y;
    const down = k === -d || (k !== d && vd[offset + k - 1] < vd[offset + k + 1]);
    const prevK = down ? k + 1 : k - 1;
    const prevX = vd[offset + prevK];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      middle.push("same");
      x--;
      y--;
    }
    if (d > 0) {
      middle.push(down ? "add" : "del");
      if (down) y--;
      else x--;
    }
  }
  middle.reverse();
  return [...head, ...middle, ...tail];
}

/** Every line of both versions, in order, marked kept, removed or added. */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = splitLines(before);
  const b = splitLines(after);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  for (const op of editScript(a, b)) {
    if (op === "same") out.push({ kind: "same", text: a[i], old: ++i, new: ++j });
    else if (op === "del") out.push({ kind: "del", text: a[i], old: ++i });
    else out.push({ kind: "add", text: b[j], new: ++j });
  }
  return out;
}

/** The changes between two versions in hunks, with `context` same lines around each. */
export function diffFiles(before: string, after: string, context = 3): FileDiff {
  const lines = diffLines(before, after);
  const changed = lines.map((l) => l.kind !== "same");
  const keep = lines.map((_, i) => {
    for (let d = -context; d <= context; d++) if (changed[i + d]) return true;
    return false;
  });
  const hunks: Hunk[] = [];
  let skipped = 0;
  let current: Hunk | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (!keep[i]) {
      current = null;
      skipped++;
      continue;
    }
    if (!current) {
      current = { skipped, lines: [] };
      hunks.push(current);
      skipped = 0;
    }
    current.lines.push(lines[i]);
  }
  return {
    hunks,
    skippedAfter: skipped,
    added: lines.filter((l) => l.kind === "add").length,
    removed: lines.filter((l) => l.kind === "del").length,
  };
}

/** Words and the spaces between them, for marking what changed inside a changed line. */
export const tokens = (line: string): string[] => line.match(/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) ?? [];

/** A changed line's parts against the line it replaced: the words both have, and the ones only it has. */
export function diffWords(before: string, after: string): { removed: Part[]; added: Part[] } {
  const a = tokens(before);
  const b = tokens(after);
  const removed: Part[] = [];
  const added: Part[] = [];
  const push = (list: Part[], text: string, changed: boolean) => {
    const last = list[list.length - 1];
    if (last && last.changed === changed) last.text += text;
    else list.push({ text, changed });
  };
  let i = 0;
  let j = 0;
  for (const op of editScript(a, b)) {
    if (op === "same") {
      push(removed, a[i++], false);
      push(added, b[j++], false);
    } else if (op === "del") push(removed, a[i++], true);
    else push(added, b[j++], true);
  }
  return { removed, added };
}

export interface Part {
  text: string;
  changed: boolean;
}

// Test boards (ADR-0010): testers report bugs, changes and ideas through a link that shows only the board. Boards and
// reports live in the wiki's `data/wiki.db` beside the comments, so they outlast the links to them. Nothing is
// deleted: removing marks a report, closing marks a board.
import type { Board, BoardVisibility, Report, ReportKind, ReportStatus } from "../shared/api.ts";
import { newUid } from "./ids.ts";
import { authorColumns, authoredOf, dbFor, type Writer } from "./threads.ts";

const now = () => new Date().toISOString();

interface BoardRow {
  uid: string;
  name: string;
  visibility: BoardVisibility;
  created_at: string;
  closed_at: string | null;
  updated_at: string;
}

interface ReportRow {
  id: number;
  uid: string;
  board_uid: string;
  kind: ReportKind;
  title: string;
  body: string;
  images: string;
  author: "user" | "agent" | "guest";
  guest_id: string | null;
  guest_name: string | null;
  status: ReportStatus;
  note: string;
  created_at: string;
  edited_at: string | null;
  hidden: number;
  removed_at: string | null;
  updated_at: string;
}

const boardOf = (r: BoardRow): Board => ({
  uid: r.uid,
  name: r.name,
  visibility: r.visibility,
  createdAt: r.created_at,
  closedAt: r.closed_at,
  updatedAt: r.updated_at,
});

const imagesOf = (raw: string): string[] => {
  try {
    const list = JSON.parse(raw) as unknown;
    return Array.isArray(list) ? list.filter((f): f is string => typeof f === "string") : [];
  } catch {
    return [];
  }
};

const reportOf = (r: ReportRow): Report => ({
  id: r.id,
  uid: r.uid,
  board: r.board_uid,
  kind: r.kind,
  title: r.title,
  body: r.body,
  ...(imagesOf(r.images).length ? { images: imagesOf(r.images) } : {}),
  ...authoredOf(r),
  status: r.status,
  note: r.note,
  createdAt: r.created_at,
  ...(r.edited_at ? { editedAt: r.edited_at } : {}),
  ...(r.hidden ? { hidden: true } : {}),
  ...(r.removed_at ? { removedAt: r.removed_at } : {}),
  updatedAt: r.updated_at,
});

/** A wiki's boards, newest first, with how many reports each has. */
export function listBoards(root: string): Board[] {
  const db = dbFor(root);
  const rows = db.prepare("select * from boards order by created_at desc, id desc").all() as unknown as BoardRow[];
  const counts = db
    .prepare(
      "select board_uid, count(*) as total, sum(status = 'new') as fresh, sum(status in ('fixed', 'wontfix', 'duplicate')) as done from reports where removed_at is null group by board_uid",
    )
    .all() as { board_uid: string; total: number; fresh: number; done: number }[];
  const by = new Map(counts.map((c) => [c.board_uid, c]));
  return rows.map((r) => ({
    ...boardOf(r),
    counts: { total: by.get(r.uid)?.total ?? 0, new: by.get(r.uid)?.fresh ?? 0, done: by.get(r.uid)?.done ?? 0 },
  }));
}

export function getBoard(root: string, uid: string): Board | null {
  const row = dbFor(root).prepare("select * from boards where uid = ?").get(uid) as unknown as BoardRow | undefined;
  return row ? boardOf(row) : null;
}

export function createBoard(root: string, name: string, visibility: BoardVisibility): Board {
  const at = now();
  const uid = newUid();
  dbFor(root)
    .prepare("insert into boards (uid, name, visibility, created_at, updated_at) values (?, ?, ?, ?, ?)")
    .run(uid, name, visibility, at, at);
  return getBoard(root, uid) as Board;
}

/** Renames a board, changes who sees what, or closes and reopens it. Null when there's no such board. */
export function updateBoard(
  root: string,
  uid: string,
  change: { name?: string; visibility?: BoardVisibility; closed?: boolean },
): Board | null {
  const board = getBoard(root, uid);
  if (!board) return null;
  const at = now();
  const closedAt = change.closed === undefined ? board.closedAt : change.closed ? (board.closedAt ?? at) : null;
  dbFor(root)
    .prepare("update boards set name = ?, visibility = ?, closed_at = ?, updated_at = ? where uid = ?")
    .run(change.name ?? board.name, change.visibility ?? board.visibility, closedAt, at, uid);
  return getBoard(root, uid);
}

/**
 * A board's reports, newest first. Removed ones only with `removed` (backups and sync carry them); `guest` keeps one
 * tester's own.
 */
export function listReports(root: string, board: string, filter: { removed?: boolean; guest?: string } = {}): Report[] {
  const where = ["board_uid = ?"];
  const args: string[] = [board];
  if (!filter.removed) where.push("removed_at is null");
  if (filter.guest !== undefined) {
    where.push("author = 'guest' and guest_id = ?");
    args.push(filter.guest);
  }
  const rows = dbFor(root)
    .prepare(`select * from reports where ${where.join(" and ")} order by created_at desc, id desc`)
    .all(...args) as unknown as ReportRow[];
  return rows.map(reportOf);
}

/** Every report of a wiki, oldest first: for `pnpm shiori reports`, backups and sync. */
export function allReports(root: string, filter: { removed?: boolean } = {}): Report[] {
  const rows = dbFor(root)
    .prepare(`select * from reports ${filter.removed ? "" : "where removed_at is null"} order by id`)
    .all() as unknown as ReportRow[];
  return rows.map(reportOf);
}

export function getReport(root: string, id: number): Report | null {
  const row = dbFor(root).prepare("select * from reports where id = ?").get(id) as unknown as ReportRow | undefined;
  return row ? reportOf(row) : null;
}

export function createReport(
  root: string,
  board: string,
  report: { kind: ReportKind; title: string; body: string; images: string[] },
  by: Writer,
): Report {
  const at = now();
  const { lastInsertRowid } = dbFor(root)
    .prepare(
      "insert into reports (uid, board_uid, kind, title, body, images, author, guest_id, guest_name, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      newUid(),
      board,
      report.kind,
      report.title,
      report.body,
      JSON.stringify(report.images),
      ...authorColumns(by),
      at,
      at,
    );
  return getReport(root, Number(lastInsertRowid)) as Report;
}

/** The tester changes what they wrote. The caller checks it's theirs. */
export function editReport(
  root: string,
  id: number,
  change: { kind?: ReportKind; title?: string; body?: string },
): Report | null {
  const r = getReport(root, id);
  if (!r) return null;
  const at = now();
  dbFor(root)
    .prepare("update reports set kind = ?, title = ?, body = ?, edited_at = ?, updated_at = ? where id = ?")
    .run(change.kind ?? r.kind, change.title ?? r.title, change.body ?? r.body, at, at, id);
  return getReport(root, id);
}

/** The owner or an agent: where the report stands, a word to the tester, or hiding it from testers. */
export function triageReport(
  root: string,
  id: number,
  change: { status?: ReportStatus; note?: string; hidden?: boolean },
): Report | null {
  const r = getReport(root, id);
  if (!r) return null;
  dbFor(root)
    .prepare("update reports set status = ?, note = ?, hidden = ?, updated_at = ? where id = ?")
    .run(change.status ?? r.status, change.note ?? r.note, (change.hidden ?? r.hidden) ? 1 : 0, now(), id);
  return getReport(root, id);
}

/** Removes a report: marked, never deleted, gone from every list. False when it's missing or already gone. */
export function removeReport(root: string, id: number): boolean {
  const at = now();
  const { changes } = dbFor(root)
    .prepare("update reports set removed_at = ?, updated_at = ? where id = ? and removed_at is null")
    .run(at, at, id);
  return Number(changes) > 0;
}

/**
 * What one tester may see of a board: every report on a global board, only their own on a private one; never
 * hidden or removed ones.
 */
export function reportsForTester(root: string, board: Board, guest: string): Report[] {
  return listReports(root, board.uid, board.visibility === "private" ? { guest } : {}).filter((r) => !r.hidden);
}

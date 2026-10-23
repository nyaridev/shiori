// Test boards (ADR-0010): testers report bugs, changes and ideas through a link that shows only the board. Boards and
// reports live in the wiki's `data/wiki.db` beside the comments, so they outlast the links to them. Removing marks a
// report, closing marks a board. The one thing deleted for good is a board from the trash (ADR-0014): after
// `BOARD_TRASH_DAYS`, or when the owner empties it, with its reports and their pictures.
import { rmSync } from "node:fs";
import { join } from "node:path";
import {
  BOARD_TRASH_DAYS,
  type Board,
  type BoardVisibility,
  type Report,
  type ReportKind,
  type ReportStatus,
} from "../shared/api.ts";
import { ATTACHMENT_NAME, attachmentsDir } from "./attachments.ts";
import { newUid } from "./ids.ts";
import { authorColumns, authoredOf, dbFor, type Writer } from "./threads.ts";

const now = () => new Date().toISOString();

interface BoardRow {
  uid: string;
  name: string;
  visibility: BoardVisibility;
  created_at: string;
  closed_at: string | null;
  trashed_at: string | null;
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
  trashedAt: r.trashed_at,
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

/**
 * Renames a board, changes who sees what, closes and reopens it, or moves it to the trash and back. Null when there's
 * no such board.
 */
export function updateBoard(
  root: string,
  uid: string,
  change: { name?: string; visibility?: BoardVisibility; closed?: boolean; trashed?: boolean },
): Board | null {
  const board = getBoard(root, uid);
  if (!board) return null;
  const at = now();
  const stamp = (on: boolean | undefined, was: string | null) => (on === undefined ? was : on ? (was ?? at) : null);
  dbFor(root)
    .prepare("update boards set name = ?, visibility = ?, closed_at = ?, trashed_at = ?, updated_at = ? where uid = ?")
    .run(
      change.name ?? board.name,
      change.visibility ?? board.visibility,
      stamp(change.closed, board.closedAt),
      stamp(change.trashed, board.trashedAt),
      at,
      uid,
    );
  return getBoard(root, uid);
}

type Db = ReturnType<typeof dbFor>;

/**
 * Deletes a board's rows for good (ADR-0014): the board and every report on it, removed ones too. Their uids go in
 * `purged`, so a merge from another PC doesn't bring them back. Runs inside the caller's transaction; answers the
 * pictures the reports carried, for `removePictures` once it's committed.
 */
export function deleteBoardRows(db: Db, uid: string, at: string): string[] {
  const reports = db.prepare("select uid, images from reports where board_uid = ?").all(uid) as {
    uid: string;
    images: string;
  }[];
  const mark = db.prepare("insert or ignore into purged (uid, kind, purged_at) values (?, ?, ?)");
  mark.run(uid, "board", at);
  for (const r of reports) mark.run(r.uid, "report", at);
  db.prepare("delete from reports where board_uid = ?").run(uid);
  db.prepare("delete from boards where uid = ?").run(uid);
  return reports.flatMap((r) => imagesOf(r.images));
}

/** Deletes pictures of deleted reports from `data/attachments/`, unless a comment or another report still uses one. */
export function removePictures(root: string, files: string[]) {
  const db = dbFor(root);
  const used = db.prepare(
    "select 1 from messages where images like ? union all select 1 from reports where images like ? limit 1",
  );
  for (const file of files) {
    if (!ATTACHMENT_NAME.test(file)) continue;
    const pattern = `%"${file}"%`;
    if (used.get(pattern, pattern)) continue;
    rmSync(join(attachmentsDir(root), file), { force: true });
  }
}

/** Deletes a board for good, with its reports and their pictures. Null when there's no such board. */
export function purgeBoard(root: string, uid: string): { reports: number } | null {
  const db = dbFor(root);
  if (!getBoard(root, uid)) return null;
  const count = db.prepare("select count(*) as n from reports where board_uid = ?").get(uid) as { n: number };
  db.exec("begin");
  let pictures: string[];
  try {
    pictures = deleteBoardRows(db, uid, now());
    db.exec("commit");
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
  removePictures(root, pictures);
  return { reports: count.n };
}

/** When a board in the trash will be deleted for good. */
export const purgeDate = (trashedAt: string) =>
  new Date(Date.parse(trashedAt) + BOARD_TRASH_DAYS * 24 * 60 * 60 * 1000);

/** Deletes every board that has been in the trash for `BOARD_TRASH_DAYS` (when Shiori starts). Answers their names. */
export function purgeExpired(root: string, at = new Date()): string[] {
  const gone: string[] = [];
  for (const b of listBoards(root))
    if (b.trashedAt && purgeDate(b.trashedAt) <= at && purgeBoard(root, b.uid)) gone.push(b.name);
  return gone;
}

/** What was deleted for good, for backups and sync. */
export function listPurged(root: string): { uid: string; kind: "board" | "report"; purgedAt: string }[] {
  return (
    dbFor(root).prepare("select uid, kind, purged_at from purged order by purged_at, uid").all() as {
      uid: string;
      kind: "board" | "report";
      purged_at: string;
    }[]
  ).map((p) => ({ uid: p.uid, kind: p.kind, purgedAt: p.purged_at }));
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

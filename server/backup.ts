// Backups of a wiki's data (comments, answers, boards and sheet edits) as `backup.json` in the wiki folder: readable
// text beside the committed database (ADR-0014), and the way to load the data on a fresh database. Only the CLI writes
// it: the app itself never writes outside `data/`.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { REACTIONS } from "../shared/api.ts";
import { listAnswers } from "./answers.ts";
import { allReports, listBoards, listPurged } from "./boards.ts";
import { slashes } from "./paths.ts";
import { allEdits } from "./sheets.ts";
import { authorColumns, dbFor, fillUids, listThreads, type Writer } from "./threads.ts";

export const BACKUP_FILE = "backup.json";
const BACKUP_SCHEMA = 1;

// Guests' names and ids came with ADR-0003, and so did hiding their text; older backups have none, and still load.
const guestFields = { name: z.string().optional(), guestId: z.string().optional(), hidden: z.boolean().optional() };
// Ids that never collide and when each item last changed came with two-PC sync; older backups get new ones on restore.
const syncFields = { uid: z.string().optional(), updatedAt: z.string().optional() };

export const backupSchema = z.object({
  schema: z.literal(BACKUP_SCHEMA),
  exportedAt: z.string(),
  threads: z.array(
    z.object({
      id: z.number().int().positive(),
      page: z.string(),
      quote: z.object({ exact: z.string(), prefix: z.string(), suffix: z.string() }),
      status: z.enum(["open", "resolved", "wontfix"]),
      createdAt: z.string(),
      resolvedAt: z.string().nullable(),
      removedAt: z.string().optional(),
      ...syncFields,
      messages: z.array(
        z.object({
          id: z.number().int().positive(),
          author: z.enum(["user", "agent", "guest"]),
          ...guestFields,
          body: z.string(),
          createdAt: z.string(),
          editedAt: z.string().optional(),
          images: z.array(z.string()).optional(),
          reactions: z
            .array(
              z.object({
                emoji: z.enum(REACTIONS),
                by: z.array(
                  z.object({
                    author: z.enum(["user", "guest"]),
                    name: z.string().optional(),
                    guestId: z.string().optional(),
                  }),
                ),
              }),
            )
            .optional(),
          ...syncFields,
        }),
      ),
    }),
  ),
  answers: z.array(
    z.object({
      id: z.number().int().positive(),
      page: z.string(),
      question: z.string(),
      choice: z.string().nullable(),
      body: z.string(),
      author: z.enum(["user", "guest"]).default("user"),
      ...guestFields,
      createdAt: z.string(),
      ...syncFields,
    }),
  ),
  // Test boards and data sheets (ADR-0010). Backups from before them have none.
  boards: z
    .array(
      z.object({
        uid: z.string(),
        name: z.string(),
        visibility: z.enum(["global", "private"]),
        createdAt: z.string(),
        closedAt: z.string().nullable(),
        // The trash (ADR-0014). Older files have none.
        trashedAt: z.string().nullable().default(null),
        updatedAt: z.string().optional(),
      }),
    )
    .default([]),
  // What was deleted for good (ADR-0014), so a merge or restore doesn't bring it back. Older files have none.
  purged: z.array(z.object({ uid: z.string(), kind: z.enum(["board", "report"]), purgedAt: z.string() })).default([]),
  reports: z
    .array(
      z.object({
        id: z.number().int().positive(),
        uid: z.string(),
        board: z.string(),
        kind: z.enum(["bug", "change", "idea"]),
        title: z.string(),
        body: z.string(),
        images: z.array(z.string()).optional(),
        author: z.enum(["user", "agent", "guest"]),
        ...guestFields,
        status: z.enum(["new", "planned", "fixed", "wontfix", "duplicate"]),
        note: z.string(),
        createdAt: z.string(),
        editedAt: z.string().optional(),
        removedAt: z.string().optional(),
        updatedAt: z.string().optional(),
      }),
    )
    .default([]),
  sheetEdits: z
    .array(
      z.object({
        uid: z.string(),
        sheet: z.string(),
        row: z.string(),
        column: z.string(),
        value: z.string(),
        prev: z.string(),
        author: z.enum(["user", "agent", "guest"]),
        name: z.string().optional(),
        guestId: z.string().optional(),
        createdAt: z.string(),
        exportedAt: z.string().nullable(),
        updatedAt: z.string(),
      }),
    )
    .default([]),
});
export type Backup = z.infer<typeof backupSchema>;

export const writer = (r: { author: "user" | "agent" | "guest"; name?: string; guestId?: string }): Writer =>
  r.author === "guest" ? { guest: r.guestId ?? "", name: r.name ?? "Guest" } : r.author;

export function exportData(root: string): Backup {
  return {
    schema: BACKUP_SCHEMA,
    exportedAt: new Date().toISOString(),
    threads: listThreads(root, { removed: true }),
    answers: listAnswers(root),
    boards: listBoards(root).map(({ counts: _, ...b }) => ({ ...b, updatedAt: b.updatedAt ?? b.createdAt })),
    reports: allReports(root, { removed: true }).map(({ mine: _, ...r }) => ({ ...r, uid: r.uid as string })),
    sheetEdits: allEdits(root),
    purged: listPurged(root),
  };
}

/** Write `backup.json` in the wiki folder; returns its path. */
export function writeBackup(root: string): { file: string; threads: number; answers: number } {
  const data = exportData(root);
  const file = join(root, BACKUP_FILE);
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  return { file, threads: data.threads.length, answers: data.answers.length };
}

export function readBackup(root: string): Backup {
  const file = join(root, BACKUP_FILE);
  if (!existsSync(file))
    throw new Error(`No ${BACKUP_FILE} in ${slashes(root)}. Make one with \`pnpm shiori backup\`.`);
  const parsed = backupSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (!parsed.success) throw new Error(`${BACKUP_FILE} isn't a Shiori backup: ${parsed.error.issues[0]?.message}`);
  return parsed.data;
}

type Db = ReturnType<typeof dbFor>;

/**
 * Inserts boards, reports and sheet edits (ADR-0010), and what was deleted for good (ADR-0014), which is never
 * inserted again. `keepIds` keeps reports' numbers (a restore).
 */
export function insertPlayData(
  db: Db,
  data: Pick<Backup, "boards" | "reports" | "sheetEdits" | "purged">,
  {
    keepIds = false,
    only,
  }: { keepIds?: boolean; only?: { boards: Set<string>; reports: Set<string>; edits: Set<string> } } = {},
) {
  const mark = db.prepare("insert or ignore into purged (uid, kind, purged_at) values (?, ?, ?)");
  for (const p of data.purged) mark.run(p.uid, p.kind, p.purgedAt);
  const isPurged = db.prepare("select 1 from purged where uid = ?");
  const gone = (uid: string) => !!isPurged.get(uid);
  for (const b of data.boards)
    if ((!only || only.boards.has(b.uid)) && !gone(b.uid))
      db.prepare(
        "insert into boards (uid, name, visibility, created_at, closed_at, trashed_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)",
      ).run(b.uid, b.name, b.visibility, b.createdAt, b.closedAt, b.trashedAt, b.updatedAt ?? b.createdAt);
  for (const r of data.reports)
    if ((!only || only.reports.has(r.uid)) && !gone(r.uid))
      db.prepare(
        "insert into reports (id, uid, board_uid, kind, title, body, images, author, guest_id, guest_name, status, note, created_at, edited_at, hidden, removed_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        keepIds ? r.id : null,
        r.uid,
        r.board,
        r.kind,
        r.title,
        r.body,
        JSON.stringify(r.images ?? []),
        ...authorColumns(writer(r)),
        r.status,
        r.note,
        r.createdAt,
        r.editedAt ?? null,
        r.hidden ? 1 : 0,
        r.removedAt ?? null,
        r.updatedAt ?? r.createdAt,
      );
  for (const e of data.sheetEdits)
    if (!only || only.edits.has(e.uid))
      db.prepare(
        "insert into sheet_edits (uid, sheet, row_key, column_id, value, prev, author, guest_id, guest_name, created_at, exported_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        e.uid,
        e.sheet,
        e.row,
        e.column,
        e.value,
        e.prev,
        ...authorColumns(writer(e)),
        e.createdAt,
        e.exportedAt,
        e.updatedAt,
      );
}

/**
 * Load a backup into the wiki's database, keeping every id (so "#12" in an agent's note still means thread 12).
 * A database that already has data is only overwritten with `replace`.
 */
export function importData(root: string, data: Backup, { replace = false } = {}): { threads: number; answers: number } {
  const db = dbFor(root);
  const count = (table: string) => (db.prepare(`select count(*) as n from ${table}`).get() as { n: number }).n;
  if (!replace && (count("threads") || count("answers"))) {
    throw new Error("The wiki already has comments or answers. Restore with --replace to overwrite them.");
  }
  db.exec("begin");
  try {
    db.exec(
      "delete from messages; delete from threads; delete from answers; delete from boards; delete from reports; delete from sheet_edits; delete from purged;",
    );
    const thread = db.prepare(
      "insert into threads (id, page, quote, status, created_at, resolved_at, removed_at, uid, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    const message = db.prepare(
      "insert into messages (id, thread_id, author, guest_id, guest_name, body, created_at, edited_at, hidden, reactions, images, uid, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    const answer = db.prepare(
      "insert into answers (id, page, question, choice, body, author, guest_id, guest_name, created_at, hidden, uid, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    for (const t of data.threads) {
      thread.run(
        t.id,
        t.page,
        JSON.stringify(t.quote),
        t.status,
        t.createdAt,
        t.resolvedAt,
        t.removedAt ?? null,
        t.uid ?? null,
        t.updatedAt ?? null,
      );
      for (const m of t.messages)
        message.run(
          m.id,
          t.id,
          ...authorColumns(writer(m)),
          m.body,
          m.createdAt,
          m.editedAt ?? null,
          m.hidden ? 1 : 0,
          JSON.stringify(m.reactions ?? []),
          JSON.stringify(m.images ?? []),
          m.uid ?? null,
          m.updatedAt ?? null,
        );
    }
    for (const a of data.answers)
      answer.run(
        a.id,
        a.page,
        a.question,
        a.choice,
        a.body,
        ...authorColumns(writer(a)),
        a.createdAt,
        a.hidden ? 1 : 0,
        a.uid ?? null,
        a.updatedAt ?? null,
      );
    insertPlayData(db, data, { keepIds: true });
    fillUids(db);
    db.exec("commit");
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
  return { threads: data.threads.length, answers: data.answers.length };
}

// Backups of a wiki's data (comments and answers to questions) as `backup.json` in the wiki folder. The database in
// `data/` is never committed; this file can be, so discussions live with the pages. Only the CLI writes it: the app
// itself never writes outside `data/`.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { listAnswers } from "./answers.ts";
import { slashes } from "./paths.ts";
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
      ...syncFields,
      messages: z.array(
        z.object({
          id: z.number().int().positive(),
          author: z.enum(["user", "agent", "guest"]),
          ...guestFields,
          body: z.string(),
          createdAt: z.string(),
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
});
export type Backup = z.infer<typeof backupSchema>;

export const writer = (r: { author: "user" | "agent" | "guest"; name?: string; guestId?: string }): Writer =>
  r.author === "guest" ? { guest: r.guestId ?? "", name: r.name ?? "Guest" } : r.author;

export function exportData(root: string): Backup {
  return {
    schema: BACKUP_SCHEMA,
    exportedAt: new Date().toISOString(),
    threads: listThreads(root),
    answers: listAnswers(root),
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
  if (!existsSync(file)) throw new Error(`No ${BACKUP_FILE} in ${slashes(root)}. Make one with \`pnpm wiki backup\`.`);
  const parsed = backupSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (!parsed.success) throw new Error(`${BACKUP_FILE} isn't a Shiori backup: ${parsed.error.issues[0]?.message}`);
  return parsed.data;
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
    db.exec("delete from messages; delete from threads; delete from answers;");
    const thread = db.prepare(
      "insert into threads (id, page, quote, status, created_at, resolved_at, uid, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    const message = db.prepare(
      "insert into messages (id, thread_id, author, guest_id, guest_name, body, created_at, hidden, uid, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
          m.hidden ? 1 : 0,
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
    fillUids(db);
    db.exec("commit");
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
  return { threads: data.threads.length, answers: data.answers.length };
}

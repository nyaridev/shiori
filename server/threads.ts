// Comment threads, stored in each wiki's own `data/wiki.db`. The app never writes into its own folder or into a
// wiki's pages; this database is the only thing it writes.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Author, Authored, Thread, ThreadStatus } from "../shared/api.ts";
import type { Quote } from "../shared/quote.ts";

const MIGRATIONS = [
  `create table threads (
     id integer primary key,
     page text not null,
     quote text not null,
     status text not null default 'open' check (status in ('open', 'resolved', 'wontfix')),
     created_at text not null,
     resolved_at text
   );
   create index threads_page on threads(page);
   create table messages (
     id integer primary key,
     thread_id integer not null references threads(id) on delete cascade,
     author text not null check (author in ('user', 'agent')),
     body text not null,
     created_at text not null
   );
   create index messages_thread on messages(thread_id);`,
  // Answers to the open questions in pages' frontmatter (answers.ts).
  `create table answers (
     id integer primary key,
     page text not null,
     question text not null,
     choice text,
     body text not null default '',
     created_at text not null
   );
   create index answers_page on answers(page, question);`,
  // Authors (ADR-0003): guests who came through a share link sign with a name. SQLite can't change a check
  // constraint, so `messages` is rebuilt.
  `create table messages_v3 (
     id integer primary key,
     thread_id integer not null references threads(id) on delete cascade,
     author text not null check (author in ('user', 'agent', 'guest')),
     guest_id text,
     guest_name text,
     body text not null,
     created_at text not null
   );
   insert into messages_v3 (id, thread_id, author, body, created_at)
     select id, thread_id, author, body, created_at from messages;
   drop table messages;
   alter table messages_v3 rename to messages;
   create index messages_thread on messages(thread_id);
   alter table answers add column author text not null default 'user' check (author in ('user', 'guest'));
   alter table answers add column guest_id text;
   alter table answers add column guest_name text;`,
];

const open = new Map<string, DatabaseSync>();

export function dbFor(root: string): DatabaseSync {
  const existing = open.get(root);
  if (existing) return existing;
  const dir = join(root, "data");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    // Comments are local; never commit them by accident in a wiki that has its own git.
    writeFileSync(join(dir, ".gitignore"), "*\n");
  }
  const db = new DatabaseSync(join(dir, "wiki.db"));
  db.exec("pragma journal_mode = wal; pragma foreign_keys = on; pragma busy_timeout = 3000;");
  const version = Number((db.prepare("pragma user_version").get() as { user_version: number }).user_version);
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.exec("begin");
    db.exec(MIGRATIONS[v]);
    db.exec(`pragma user_version = ${v + 1}`);
    db.exec("commit");
  }
  open.set(root, db);
  return db;
}

export function closeAll() {
  for (const db of open.values()) db.close();
  open.clear();
}

const now = () => new Date().toISOString();

/** Who writes: the owner, an agent, or a guest with their id and display name. */
export type Writer = "user" | "agent" | { guest: string; name: string };

/** The `author`, `guest_id` and `guest_name` columns for a writer. */
export function authorColumns(by: Writer): [Author, string | null, string | null] {
  return typeof by === "string" ? [by, null, null] : ["guest", by.guest, by.name];
}

/** The author fields of a row with `author`, `guest_id` and `guest_name`. */
export function authoredOf(row: { author: Author; guest_id: string | null; guest_name: string | null }): Authored {
  return row.author === "guest"
    ? { author: "guest", name: row.guest_name ?? "Guest", guestId: row.guest_id ?? undefined }
    : { author: row.author };
}

interface ThreadRow {
  id: number;
  page: string;
  quote: string;
  status: ThreadStatus;
  created_at: string;
  resolved_at: string | null;
}
interface MessageRow {
  id: number;
  thread_id: number;
  author: Author;
  guest_id: string | null;
  guest_name: string | null;
  body: string;
  created_at: string;
}

function hydrate(db: DatabaseSync, rows: ThreadRow[]): Thread[] {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const messages = db
    .prepare(`select * from messages where thread_id in (${ids.map(() => "?").join(",")}) order by id`)
    .all(...ids) as unknown as MessageRow[];
  return rows.map((r) => ({
    id: r.id,
    page: r.page,
    quote: JSON.parse(r.quote) as Quote,
    status: r.status,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
    messages: messages
      .filter((m) => m.thread_id === r.id)
      .map((m) => ({ id: m.id, ...authoredOf(m), body: m.body, createdAt: m.created_at })),
  }));
}

export function listThreads(root: string, filter: { page?: string; status?: ThreadStatus } = {}): Thread[] {
  const db = dbFor(root);
  const where: string[] = [];
  const args: string[] = [];
  if (filter.page !== undefined) {
    where.push("page = ?");
    args.push(filter.page);
  }
  if (filter.status) {
    where.push("status = ?");
    args.push(filter.status);
  }
  const sql = `select * from threads ${where.length ? `where ${where.join(" and ")}` : ""} order by id`;
  return hydrate(db, db.prepare(sql).all(...args) as unknown as ThreadRow[]);
}

export function getThread(root: string, id: number): Thread | null {
  const db = dbFor(root);
  const row = db.prepare("select * from threads where id = ?").get(id) as unknown as ThreadRow | undefined;
  return row ? hydrate(db, [row])[0] : null;
}

const INSERT_MESSAGE =
  "insert into messages (thread_id, author, guest_id, guest_name, body, created_at) values (?, ?, ?, ?, ?, ?)";

export function createThread(root: string, page: string, quote: Quote, body: string, by: Writer = "user"): Thread {
  const db = dbFor(root);
  const at = now();
  db.exec("begin");
  const { lastInsertRowid } = db
    .prepare("insert into threads (page, quote, created_at) values (?, ?, ?)")
    .run(page, JSON.stringify(quote), at);
  db.prepare(INSERT_MESSAGE).run(lastInsertRowid, ...authorColumns(by), body, at);
  db.exec("commit");
  return getThread(root, Number(lastInsertRowid)) as Thread;
}

export function addMessage(root: string, id: number, by: Writer, body: string): Thread | null {
  const db = dbFor(root);
  if (!getThread(root, id)) return null;
  db.prepare(INSERT_MESSAGE).run(id, ...authorColumns(by), body, now());
  return getThread(root, id);
}

/** The guest who started a thread, if a guest did. */
export const startedBy = (t: Thread): string | undefined => t.messages[0]?.guestId;

export function setStatus(root: string, id: number, status: ThreadStatus): Thread | null {
  dbFor(root)
    .prepare("update threads set status = ?, resolved_at = ? where id = ?")
    .run(status, status === "open" ? null : now(), id);
  return getThread(root, id);
}

/** Open threads whose last message is a person's (the owner's or a guest's): what an agent should look at. */
export function waitingForAgent(threads: Thread[]): Thread[] {
  return threads.filter((t) => t.status === "open" && t.messages.at(-1)?.author !== "agent");
}

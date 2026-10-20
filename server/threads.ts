// Comment threads, stored in each wiki's own `data/wiki.db`. The app never writes into its own folder or into a
// wiki's pages; this database is the only thing it writes.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Message, Thread, ThreadStatus } from "../shared/api.ts";
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
  author: Message["author"];
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
      .map((m) => ({ id: m.id, author: m.author, body: m.body, createdAt: m.created_at })),
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

export function createThread(root: string, page: string, quote: Quote, body: string): Thread {
  const db = dbFor(root);
  const at = now();
  db.exec("begin");
  const { lastInsertRowid } = db
    .prepare("insert into threads (page, quote, created_at) values (?, ?, ?)")
    .run(page, JSON.stringify(quote), at);
  db.prepare("insert into messages (thread_id, author, body, created_at) values (?, 'user', ?, ?)").run(
    lastInsertRowid,
    body,
    at,
  );
  db.exec("commit");
  return getThread(root, Number(lastInsertRowid)) as Thread;
}

export function addMessage(root: string, id: number, author: Message["author"], body: string): Thread | null {
  const db = dbFor(root);
  if (!getThread(root, id)) return null;
  db.prepare("insert into messages (thread_id, author, body, created_at) values (?, ?, ?, ?)").run(
    id,
    author,
    body,
    now(),
  );
  return getThread(root, id);
}

export function setStatus(root: string, id: number, status: ThreadStatus): Thread | null {
  dbFor(root)
    .prepare("update threads set status = ?, resolved_at = ? where id = ?")
    .run(status, status === "open" ? null : now(), id);
  return getThread(root, id);
}

/** Open threads whose last message is the user's: what an agent should look at. */
export function waitingForAgent(threads: Thread[]): Thread[] {
  return threads.filter((t) => t.status === "open" && t.messages.at(-1)?.author === "user");
}

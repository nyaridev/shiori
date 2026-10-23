// Comment threads, stored in each wiki's own `data/wiki.db`. The app never writes into its own folder or into a
// wiki's pages. Every thread, message and answer has a `uid` that never collides between PCs and an `updated_at`, so
// two PCs with the same wiki can merge their comments (`pnpm shiori sync`, sync.ts).

import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Author, Authored, Reaction, ReactionEmoji, Thread, ThreadStatus } from "../shared/api.ts";
import type { Quote } from "../shared/quote.ts";
import { newUid } from "./ids.ts";
import { dataDir } from "./paths.ts";

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
  // Moderation (ADR-0003): the owner hides a guest's text from guests and from the inbox, and can show it again.
  `alter table messages add column hidden integer not null default 0;
   alter table answers add column hidden integer not null default 0;`,
  // Two PCs (ADR-0003, phase 3): ids that never collide, and when each row last changed, for merging. Rows from
  // before get theirs in `fillUids` below.
  `alter table threads add column uid text;
   alter table threads add column updated_at text;
   alter table messages add column uid text;
   alter table messages add column updated_at text;
   alter table answers add column uid text;
   alter table answers add column updated_at text;
   create unique index threads_uid on threads(uid);
   create unique index messages_uid on messages(uid);
   create unique index answers_uid on answers(uid);`,
  // Reactions on messages: JSON, `[{ emoji, by: [{ author, name?, guestId? }] }]`.
  `alter table messages add column reactions text not null default '[]';`,
  // Pictures attached to a message (attachments.ts): JSON, a list of file names in `data/attachments/`.
  `alter table messages add column images text not null default '[]';`,
  // Removing a thread (the host's, or its author's): it stays, marked, and nobody sees it any more.
  `alter table threads add column removed_at text;`,
  // One person's answers, for the question lists (ADR-0009): a wiki can have thousands.
  `create index answers_author on answers(author, guest_id);`,
  // Editing a message (ADR-0010): it keeps its place and says it was edited.
  `alter table messages add column edited_at text;`,
  // Test boards and testers' reports (ADR-0010, boards.ts).
  `create table boards (
     id integer primary key,
     uid text not null unique,
     name text not null,
     visibility text not null default 'global' check (visibility in ('global', 'private')),
     created_at text not null,
     closed_at text,
     updated_at text not null
   );
   create table reports (
     id integer primary key,
     uid text not null unique,
     board_uid text not null,
     kind text not null check (kind in ('bug', 'change', 'idea')),
     title text not null,
     body text not null default '',
     images text not null default '[]',
     author text not null check (author in ('user', 'agent', 'guest')),
     guest_id text,
     guest_name text,
     status text not null default 'new' check (status in ('new', 'planned', 'fixed', 'wontfix', 'duplicate')),
     note text not null default '',
     created_at text not null,
     edited_at text,
     hidden integer not null default 0,
     removed_at text,
     updated_at text not null
   );
   create index reports_board on reports(board_uid, guest_id);`,
  // Data sheets (ADR-0010, sheets.ts): every change to a cell. `value` and `prev` are JSON; a null value is "back to
  // the default".
  `create table sheet_edits (
     id integer primary key,
     uid text not null unique,
     sheet text not null,
     row_key text not null,
     column_id text not null,
     value text not null,
     prev text not null,
     author text not null check (author in ('user', 'agent', 'guest')),
     guest_id text,
     guest_name text,
     created_at text not null,
     exported_at text,
     updated_at text not null
   );
   create index sheet_edits_cell on sheet_edits(sheet, row_key, column_id, id);`,
];

/** Gives rows made before uids (or restored from an old backup) theirs, and an `updated_at`. */
export function fillUids(db: DatabaseSync) {
  for (const table of ["threads", "messages", "answers"]) {
    const rows = db.prepare(`select id from ${table} where uid is null`).all() as { id: number }[];
    const set = db.prepare(`update ${table} set uid = ? where id = ?`);
    for (const r of rows) set.run(newUid(), r.id);
  }
  db.exec(`update threads set updated_at = coalesce(resolved_at, created_at) where updated_at is null;
    update messages set updated_at = created_at where updated_at is null;
    update answers set updated_at = created_at where updated_at is null;`);
}

const open = new Map<string, DatabaseSync>();

export function dbFor(root: string): DatabaseSync {
  const existing = open.get(root);
  if (existing) return existing;
  // Comments are local; `data/` is never committed.
  const db = new DatabaseSync(join(dataDir(root), "wiki.db"));
  db.exec("pragma journal_mode = wal; pragma foreign_keys = on; pragma busy_timeout = 3000;");
  const version = Number((db.prepare("pragma user_version").get() as { user_version: number }).user_version);
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.exec("begin");
    db.exec(MIGRATIONS[v]);
    db.exec(`pragma user_version = ${v + 1}`);
    db.exec("commit");
  }
  fillUids(db);
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
  removed_at: string | null;
  uid: string;
  updated_at: string;
}
interface MessageRow {
  id: number;
  thread_id: number;
  author: Author;
  guest_id: string | null;
  guest_name: string | null;
  body: string;
  created_at: string;
  hidden: number;
  reactions: string;
  images: string;
  edited_at: string | null;
  uid: string;
  updated_at: string;
}

const reactionsOf = (raw: string): Reaction[] => {
  try {
    const list = JSON.parse(raw) as Reaction[];
    return Array.isArray(list) ? list.filter((r) => r.by?.length) : [];
  } catch {
    return [];
  }
};

const imagesOf = (raw: string): string[] => {
  try {
    const list = JSON.parse(raw) as unknown;
    return Array.isArray(list) ? list.filter((f): f is string => typeof f === "string") : [];
  } catch {
    return [];
  }
};

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
    ...(r.removed_at ? { removedAt: r.removed_at } : {}),
    uid: r.uid,
    updatedAt: r.updated_at,
    messages: messages
      .filter((m) => m.thread_id === r.id)
      .map((m) => ({
        id: m.id,
        ...authoredOf(m),
        body: m.body,
        createdAt: m.created_at,
        ...(m.hidden ? { hidden: true } : {}),
        ...(reactionsOf(m.reactions).length ? { reactions: reactionsOf(m.reactions) } : {}),
        ...(imagesOf(m.images).length ? { images: imagesOf(m.images) } : {}),
        ...(m.edited_at ? { editedAt: m.edited_at } : {}),
        uid: m.uid,
        updatedAt: m.updated_at,
      })),
  }));
}

/** A wiki's threads, oldest first. Removed ones only with `removed: true` (backups and sync carry them). */
export function listThreads(
  root: string,
  filter: { page?: string; status?: ThreadStatus; removed?: boolean } = {},
): Thread[] {
  const db = dbFor(root);
  const where: string[] = filter.removed ? [] : ["removed_at is null"];
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
  "insert into messages (thread_id, author, guest_id, guest_name, body, images, created_at, uid, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)";

/** A new thread with its first message, and the pictures attached to it (file names the caller has checked). */
export function createThread(
  root: string,
  page: string,
  quote: Quote,
  body: string,
  by: Writer = "user",
  images: string[] = [],
): Thread {
  const db = dbFor(root);
  const at = now();
  db.exec("begin");
  const { lastInsertRowid } = db
    .prepare("insert into threads (page, quote, created_at, uid, updated_at) values (?, ?, ?, ?, ?)")
    .run(page, JSON.stringify(quote), at, newUid(), at);
  db.prepare(INSERT_MESSAGE).run(lastInsertRowid, ...authorColumns(by), body, JSON.stringify(images), at, newUid(), at);
  db.exec("commit");
  return getThread(root, Number(lastInsertRowid)) as Thread;
}

export function addMessage(root: string, id: number, by: Writer, body: string): Thread | null {
  const db = dbFor(root);
  if (!getThread(root, id)) return null;
  const at = now();
  db.prepare(INSERT_MESSAGE).run(id, ...authorColumns(by), body, "[]", at, newUid(), at);
  return getThread(root, id);
}

/** The guest who started a thread, if a guest did. */
export const startedBy = (t: Thread): string | undefined => t.messages[0]?.guestId;

export function setStatus(root: string, id: number, status: ThreadStatus): Thread | null {
  const at = now();
  dbFor(root)
    .prepare("update threads set status = ?, resolved_at = ?, updated_at = ? where id = ?")
    .run(status, status === "open" ? null : at, at, id);
  return getThread(root, id);
}

/**
 * Hides a guest's message from guests and from the inbox, or shows it again. Only guests' messages can be hidden;
 * null when there's no such message.
 */
export function setHidden(root: string, messageId: number, hidden: boolean): Thread | null | "not a guest's" {
  const db = dbFor(root);
  const row = db.prepare("select thread_id, author from messages where id = ?").get(messageId) as
    | { thread_id: number; author: Author }
    | undefined;
  if (!row) return null;
  if (row.author !== "guest") return "not a guest's";
  db.prepare("update messages set hidden = ?, updated_at = ? where id = ?").run(hidden ? 1 : 0, now(), messageId);
  return getThread(root, row.thread_id);
}

/** Removes a thread: marked, never deleted, and gone from every list, the inbox and search. Null when it's missing. */
export function removeThread(root: string, id: number): boolean {
  const at = now();
  const { changes } = dbFor(root)
    .prepare("update threads set removed_at = ?, updated_at = ? where id = ? and removed_at is null")
    .run(at, at, id);
  return Number(changes) > 0;
}

/** Who wrote a message, and its thread; null when there's no such message. */
export function messageAuthor(
  root: string,
  messageId: number,
): { thread: number; author: Author; guestId: string | null } | null {
  const row = dbFor(root).prepare("select thread_id, author, guest_id from messages where id = ?").get(messageId) as
    | { thread_id: number; author: Author; guest_id: string | null }
    | undefined;
  return row ? { thread: row.thread_id, author: row.author, guestId: row.guest_id } : null;
}

/** Changes a message's text and marks it edited. The caller checks it's the writer's own. Null when it's missing. */
export function editMessage(root: string, messageId: number, body: string): Thread | null {
  const at = now();
  const db = dbFor(root);
  const row = messageAuthor(root, messageId);
  if (!row) return null;
  db.prepare("update messages set body = ?, edited_at = ?, updated_at = ? where id = ?").run(body, at, at, messageId);
  return getThread(root, row.thread);
}

/** The thread a message belongs to, if there's such a message. */
export function threadOfMessage(root: string, messageId: number): number | null {
  const row = dbFor(root).prepare("select thread_id from messages where id = ?").get(messageId) as
    | { thread_id: number }
    | undefined;
  return row?.thread_id ?? null;
}

/** Who reacts: the owner, or a guest with their id and display name. Agents don't react. */
export type Reacter = "user" | { guest: string; name: string };

/**
 * Adds or takes back someone's reaction on a message. Null when there's no such message; else its thread, with the
 * message's `updated_at` moved so two PCs merge the newer set.
 */
export function react(root: string, messageId: number, emoji: ReactionEmoji, by: Reacter, on: boolean): Thread | null {
  const db = dbFor(root);
  const row = db.prepare("select thread_id, reactions from messages where id = ?").get(messageId) as
    | { thread_id: number; reactions: string }
    | undefined;
  if (!row) return null;
  const same = (r: { author: string; guestId?: string }) =>
    typeof by === "string" ? r.author === "user" : r.author === "guest" && r.guestId === by.guest;
  const list = reactionsOf(row.reactions).map((r) =>
    r.emoji === emoji ? { ...r, by: r.by.filter((x) => !same(x)) } : r,
  );
  if (on) {
    const who =
      typeof by === "string"
        ? { author: "user" as const }
        : { author: "guest" as const, name: by.name, guestId: by.guest };
    const at = list.find((r) => r.emoji === emoji);
    if (at) at.by.push(who);
    else list.push({ emoji, by: [who] });
  }
  db.prepare("update messages set reactions = ?, updated_at = ? where id = ?").run(
    JSON.stringify(list.filter((r) => r.by.length)),
    now(),
    messageId,
  );
  return getThread(root, row.thread_id);
}

/**
 * A thread as guests and the inbox see it: without hidden messages, and gone when its first message (the comment
 * itself, with its quote) is hidden.
 */
export function visible(t: Thread): Thread | null {
  if (t.removedAt || t.messages[0]?.hidden) return null;
  return t.messages.some((m) => m.hidden) ? { ...t, messages: t.messages.filter((m) => !m.hidden) } : t;
}
export const visibleThreads = (threads: Thread[]): Thread[] =>
  threads.flatMap((t) => {
    const v = visible(t);
    return v ? [v] : [];
  });

/** Open threads whose last message is a person's (the owner's or a guest's): what an agent should look at. */
export function waitingForAgent(threads: Thread[]): Thread[] {
  return visibleThreads(threads).filter((t) => t.status === "open" && t.messages.at(-1)?.author !== "agent");
}

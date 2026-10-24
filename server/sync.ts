// Two PCs with the same wiki (ADR-0003, phase 3). Pages are files in git; comments and answers live in each PC's
// `data/wiki.db`. To share those too, every PC writes everything it knows to its own file, `sync/<pc>.json`, in the
// wiki folder, and merges every other PC's file into its database. Each PC only ever writes its own file, so git never
// has to merge two versions of one. Items join by their uid; when two PCs changed the same one (a status, a hidden
// flag, its page after a rename), the newer change wins.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { pickColumns } from "./answers.ts";
import { type Backup, backupSchema, exportData, insertPlayData, writer } from "./backup.ts";
import { deleteBoardRows, removePictures } from "./boards.ts";
import { mergeFormRows } from "./forms.ts";
import { dataDir } from "./paths.ts";
import { authorColumns, dbFor } from "./threads.ts";

export const SYNC_DIR = "sync";

export interface Machine {
  id: string;
  name: string;
}

/** This PC, as the wiki's sync files know it: made once, kept in `data/machine.json` (never committed). */
export function machineOf(root: string): Machine {
  const file = join(dataDir(root), "machine.json");
  if (existsSync(file)) {
    try {
      const m = JSON.parse(readFileSync(file, "utf8")) as Partial<Machine>;
      if (typeof m.id === "string" && typeof m.name === "string") return { id: m.id, name: m.name };
    } catch {}
  }
  const name =
    hostname()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "pc";
  const machine = { id: randomBytes(3).toString("hex"), name };
  writeFileSync(file, `${JSON.stringify(machine, null, 2)}\n`);
  return machine;
}

/** This PC's sync file, from the wiki root. */
export const syncFileOf = (m: Machine) => `${SYNC_DIR}/${m.name}-${m.id}.json`;

export interface Merged {
  /** Items this PC didn't have. */
  added: { threads: number; messages: number; answers: number; reports: number; edits: number; forms: number };
  /** Items another PC changed more recently. */
  updated: number;
}

/** Merges another PC's data into this one's database by uid. Items without a uid (an old backup) are skipped. */
export function mergeData(root: string, data: Backup, into: Merged = emptyMerge()): Merged {
  const db = dbFor(root);
  type Local = { id: number; updated_at: string } | undefined;
  const find = (table: string, uid: string) =>
    db.prepare(`select id, updated_at from ${table} where uid = ?`).get(uid) as Local;
  // Pictures of boards another PC deleted for good (ADR-0014), deleted here once the merge is committed.
  const pictures: string[] = [];
  db.exec("begin");
  try {
    for (const t of data.threads) {
      if (!t.uid) continue;
      const changed = t.updatedAt ?? t.resolvedAt ?? t.createdAt;
      const local = find("threads", t.uid);
      let id: number;
      if (!local) {
        id = Number(
          db
            .prepare(
              "insert into threads (page, quote, status, created_at, resolved_at, removed_at, uid, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .run(
              t.page,
              JSON.stringify(t.quote),
              t.status,
              t.createdAt,
              t.resolvedAt,
              t.removedAt ?? null,
              t.uid,
              changed,
            ).lastInsertRowid,
        );
        into.added.threads++;
      } else {
        id = local.id;
        if (changed > local.updated_at) {
          db.prepare(
            "update threads set page = ?, status = ?, resolved_at = ?, removed_at = ?, updated_at = ? where id = ?",
          ).run(t.page, t.status, t.resolvedAt, t.removedAt ?? null, changed, id);
          into.updated++;
        }
      }
      for (const m of t.messages) {
        if (!m.uid) continue;
        const mChanged = m.updatedAt ?? m.createdAt;
        const mine = find("messages", m.uid);
        if (!mine) {
          db.prepare(
            "insert into messages (thread_id, author, guest_id, guest_name, body, created_at, edited_at, hidden, reactions, images, uid, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          ).run(
            id,
            ...authorColumns(writer(m)),
            m.body,
            m.createdAt,
            m.editedAt ?? null,
            m.hidden ? 1 : 0,
            JSON.stringify(m.reactions ?? []),
            JSON.stringify(m.images ?? []),
            m.uid,
            mChanged,
          );
          into.added.messages++;
        } else if (mChanged > mine.updated_at) {
          db.prepare(
            "update messages set body = ?, edited_at = ?, hidden = ?, reactions = ?, updated_at = ? where id = ?",
          ).run(m.body, m.editedAt ?? null, m.hidden ? 1 : 0, JSON.stringify(m.reactions ?? []), mChanged, mine.id);
          into.updated++;
        }
      }
    }
    for (const a of data.answers) {
      if (!a.uid) continue;
      const changed = a.updatedAt ?? a.createdAt;
      const local = find("answers", a.uid);
      if (!local) {
        db.prepare(
          "insert into answers (page, question, choice, choices, body, author, guest_id, guest_name, created_at, hidden, uid, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ).run(
          a.page,
          a.question,
          ...pickColumns(a.choices ?? a.choice),
          a.body,
          ...authorColumns(writer(a)),
          a.createdAt,
          a.hidden ? 1 : 0,
          a.uid,
          changed,
        );
        into.added.answers++;
      } else if (changed > local.updated_at) {
        // Someone changed their answer, or the owner hid it.
        db.prepare(
          "update answers set page = ?, choice = ?, choices = ?, body = ?, hidden = ?, updated_at = ? where id = ?",
        ).run(a.page, ...pickColumns(a.choices ?? a.choice), a.body, a.hidden ? 1 : 0, changed, local.id);
        into.updated++;
      }
    }
    mergePlayData(db, data, into, pictures);
    const forms = mergeFormRows(db, data.formValues, data.formReads);
    into.added.forms += forms.added;
    into.updated += forms.updated;
    db.exec("commit");
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
  removePictures(root, pictures);
  return into;
}

/**
 * Boards, reports and sheet edits (ADR-0010), by uid: new ones are added; for one both PCs have, the newer change
 * wins (a report's status or note, a board closed or trashed, an edit exported). A board another PC deleted for good
 * (ADR-0014) is deleted here too, and never added again.
 */
function mergePlayData(db: ReturnType<typeof dbFor>, data: Backup, into: Merged, pictures: string[]) {
  const has = (table: string, uid: string) =>
    db.prepare(`select id, updated_at from ${table} where uid = ?`).get(uid) as
      | { id: number; updated_at: string }
      | undefined;
  for (const p of data.purged) {
    if (p.kind === "board" && has("boards", p.uid)) pictures.push(...deleteBoardRows(db, p.uid, p.purgedAt));
    if (p.kind === "report") db.prepare("delete from reports where uid = ?").run(p.uid);
  }
  const only = { boards: new Set<string>(), reports: new Set<string>(), edits: new Set<string>() };
  for (const b of data.boards) {
    const local = has("boards", b.uid);
    if (!local) only.boards.add(b.uid);
    else if ((b.updatedAt ?? b.createdAt) > local.updated_at) {
      db.prepare(
        "update boards set name = ?, visibility = ?, closed_at = ?, trashed_at = ?, updated_at = ? where id = ?",
      ).run(b.name, b.visibility, b.closedAt, b.trashedAt, b.updatedAt ?? b.createdAt, local.id);
      into.updated++;
    }
  }
  for (const r of data.reports) {
    const local = has("reports", r.uid);
    if (!local) only.reports.add(r.uid);
    else if ((r.updatedAt ?? r.createdAt) > local.updated_at) {
      db.prepare(
        "update reports set kind = ?, title = ?, body = ?, status = ?, note = ?, hidden = ?, edited_at = ?, removed_at = ?, updated_at = ? where id = ?",
      ).run(
        r.kind,
        r.title,
        r.body,
        r.status,
        r.note,
        r.hidden ? 1 : 0,
        r.editedAt ?? null,
        r.removedAt ?? null,
        r.updatedAt ?? r.createdAt,
        local.id,
      );
      into.updated++;
    }
  }
  for (const e of data.sheetEdits) {
    const local = has("sheet_edits", e.uid);
    if (!local) only.edits.add(e.uid);
    else if (e.updatedAt > local.updated_at) {
      db.prepare("update sheet_edits set exported_at = ?, updated_at = ? where id = ?").run(
        e.exportedAt,
        e.updatedAt,
        local.id,
      );
      into.updated++;
    }
  }
  insertPlayData(db, data, { only });
  into.added.reports += only.reports.size;
  into.added.edits += only.edits.size;
}

const emptyMerge = (): Merged => ({
  added: { threads: 0, messages: 0, answers: 0, reports: 0, edits: 0, forms: 0 },
  updated: 0,
});

export interface FilesSynced {
  merged: Merged;
  /** Other PCs' files that were read. */
  read: string[];
  /** Files that aren't sync files, with why. */
  skipped: string[];
  /** This PC's file, from the wiki root. */
  file: string;
  /** False when this PC's file already said all of it. */
  wrote: boolean;
}

/** Merges every other PC's sync file into this database, then writes this PC's own (only when something changed). */
export function syncFiles(root: string): FilesSynced {
  const machine = machineOf(root);
  const own = syncFileOf(machine);
  const dir = join(root, SYNC_DIR);
  mkdirSync(dir, { recursive: true });
  const merged = emptyMerge();
  const read: string[] = [];
  const skipped: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const rel = `${SYNC_DIR}/${name}`;
    if (!name.endsWith(".json") || rel === own) continue;
    try {
      const parsed = backupSchema.safeParse(JSON.parse(readFileSync(join(dir, name), "utf8")));
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "not a sync file");
      mergeData(root, parsed.data, merged);
      read.push(rel);
    } catch (e) {
      skipped.push(`${rel}: ${(e as Error).message}`);
    }
  }

  // The file changes only when the data does, so a sync with nothing new makes no commit.
  const { threads, answers, boards, reports, sheetEdits, purged, formValues, formReads } = exportData(root);
  const content = { threads, answers, boards, reports, sheetEdits, purged, formValues, formReads };
  const file = join(root, own);
  let previous: unknown = null;
  try {
    const old = JSON.parse(readFileSync(file, "utf8")) as Partial<Backup>;
    previous = {
      threads: old.threads,
      answers: old.answers,
      boards: old.boards ?? [],
      reports: old.reports ?? [],
      sheetEdits: old.sheetEdits ?? [],
      purged: old.purged ?? [],
      formValues: old.formValues ?? [],
      formReads: old.formReads ?? [],
    };
  } catch {}
  const wrote = JSON.stringify(previous) !== JSON.stringify(content);
  if (wrote) {
    const doc = { schema: 1, exportedAt: new Date().toISOString(), machine, ...content };
    writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
  }
  return { merged, read, skipped, file: own, wrote };
}

export interface WikiSynced extends FilesSynced {
  /** What happened with git, in order, for the person. */
  steps: string[];
}

/** Runs git in the wiki folder; throws with git's own message. */
function git(root: string, ...args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    }).trim();
  } catch (e) {
    const err = e as { stderr?: string; message: string };
    throw new Error((err.stderr || err.message).trim().split("\n").slice(-3).join("\n"));
  }
}
const gitOk = (root: string, ...args: string[]) => {
  try {
    git(root, ...args);
    return true;
  } catch {
    return false;
  }
};

/**
 * `pnpm shiori sync`: pulls (when the wiki is in git and has an upstream), merges every PC's comments, writes this PC's
 * file, commits only that file, and pushes unless `push` is false. A wiki that isn't in git (a synced folder) only
 * merges and writes. A pull that stops on a conflict ends the sync before anything is changed.
 */
export function syncWiki(root: string, { push = true } = {}): WikiSynced {
  const steps: string[] = [];
  // A wiki in Shiori's own wikis/ is inside the app's repo but ignored by it: that repo isn't the wiki's.
  const repo = gitOk(root, "rev-parse", "--is-inside-work-tree") && !gitOk(root, "check-ignore", "-q", ".");
  const upstream = repo && gitOk(root, "rev-parse", "--abbrev-ref", "@{u}");
  if (!repo) steps.push("Not in git: merged and wrote the sync files only.");
  else if (!upstream) steps.push("No upstream branch: nothing to pull or push.");
  else {
    try {
      git(root, "pull", "--rebase", "--autostash");
      steps.push("Pulled.");
    } catch (e) {
      throw new Error(
        `git pull didn't finish, so nothing was synced:\n${(e as Error).message}\nFix it, then sync again.`,
      );
    }
  }

  const files = syncFiles(root);
  if (!repo) return { ...files, steps };

  // This PC's sync file, and the designs people made in the app (ADR-0006), which are plain files in the wiki.
  const paths = [files.file, ...(existsSync(join(root, "designs")) ? ["designs"] : [])];
  git(root, "add", "--", ...paths);
  if (!gitOk(root, "diff", "--cached", "--quiet", "--", ...paths)) {
    git(root, "commit", "-m", `Sync comments and designs from ${machineOf(root).name}`, "--", ...paths);
    steps.push(`Committed ${paths.join(" and ")}.`);
  } else steps.push("Nothing new to commit.");
  if (upstream && push) {
    const ahead = Number(git(root, "rev-list", "--count", "@{u}..HEAD"));
    if (ahead > 0) {
      git(root, "push");
      steps.push("Pushed.");
    }
  } else if (upstream) steps.push("Not pushed (--no-push).");
  return { ...files, steps };
}

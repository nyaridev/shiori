// Answers to a page's open questions (ADR-0002), stored in the wiki's `data/wiki.db` next to the comments. People
// answer in the app; agents read them in `pnpm wiki inbox` and write the decision into the page's frontmatter.
import type { Answer } from "../shared/api.ts";
import { newUid } from "./ids.ts";
import { authorColumns, authoredOf, dbFor } from "./threads.ts";

interface AnswerRow {
  id: number;
  page: string;
  question: string;
  choice: string | null;
  body: string;
  author: "user" | "guest";
  guest_id: string | null;
  guest_name: string | null;
  created_at: string;
  hidden: number;
  uid: string;
  updated_at: string;
}

const toAnswer = (r: AnswerRow): Answer => ({
  id: r.id,
  page: r.page,
  question: r.question,
  choice: r.choice,
  body: r.body,
  ...authoredOf(r),
  author: r.author,
  createdAt: r.created_at,
  ...(r.hidden ? { hidden: true } : {}),
  uid: r.uid,
  updatedAt: r.updated_at,
});

/** Who answers: the owner, or a guest from a share link. Agents decide in the page instead. */
export type Answerer = "user" | { guest: string; name: string };

export function listAnswers(root: string, filter: { page?: string } = {}): Answer[] {
  const db = dbFor(root);
  const rows =
    filter.page === undefined
      ? db.prepare("select * from answers order by id").all()
      : db.prepare("select * from answers where page = ? order by id").all(filter.page);
  return (rows as unknown as AnswerRow[]).map(toAnswer);
}

/**
 * Someone's answer to a question. Each person has one answer per question: answering again changes it (the owner's,
 * or that guest's), so the agent reads what they think now.
 */
export function addAnswer(
  root: string,
  page: string,
  question: string,
  choice: string | null,
  body: string,
  by: Answerer = "user",
): Answer {
  const db = dbFor(root);
  const at = new Date().toISOString();
  const [author, guestId, guestName] = authorColumns(by);
  const mine = db
    .prepare(
      "select id from answers where page = ? and question = ? and author = ? and coalesce(guest_id, '') = ? order by id desc limit 1",
    )
    .get(page, question, author, guestId ?? "") as { id: number } | undefined;
  if (mine) {
    db.prepare("update answers set choice = ?, body = ?, guest_name = ?, updated_at = ? where id = ?").run(
      choice,
      body,
      guestName,
      at,
      mine.id,
    );
    return toAnswer(db.prepare("select * from answers where id = ?").get(mine.id) as unknown as AnswerRow);
  }
  const { lastInsertRowid } = db
    .prepare(
      "insert into answers (page, question, choice, body, author, guest_id, guest_name, created_at, uid, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(page, question, choice, body, ...authorColumns(by), at, newUid(), at);
  return toAnswer(db.prepare("select * from answers where id = ?").get(lastInsertRowid) as unknown as AnswerRow);
}

/** Hides a guest's answer from guests and from the inbox, or shows it again. */
export function setAnswerHidden(root: string, id: number, hidden: boolean): Answer | null | "not a guest's" {
  const db = dbFor(root);
  const row = db.prepare("select * from answers where id = ?").get(id) as unknown as AnswerRow | undefined;
  if (!row) return null;
  if (row.author !== "guest") return "not a guest's";
  const at = new Date().toISOString();
  db.prepare("update answers set hidden = ?, updated_at = ? where id = ?").run(hidden ? 1 : 0, at, id);
  return toAnswer({ ...row, hidden: hidden ? 1 : 0, updated_at: at });
}

/** How many answers each question has (hidden ones don't count), keyed `page#question`. */
export function answerCounts(root: string): Map<string, number> {
  const rows = dbFor(root)
    .prepare("select page, question, count(*) as n from answers where hidden = 0 group by page, question")
    .all();
  return new Map(
    (rows as unknown as { page: string; question: string; n: number }[]).map((r) => [`${r.page}#${r.question}`, r.n]),
  );
}

/** Everyone's answers to one question, oldest first. */
export function answersTo(root: string, page: string, question: string): Answer[] {
  const rows = dbFor(root)
    .prepare("select * from answers where page = ? and question = ? order by id")
    .all(page, question);
  return (rows as unknown as AnswerRow[]).map(toAnswer);
}

/** One person's answers: the owner's, or a guest's by their id. */
export function answersBy(root: string, by: "user" | { guest: string }): Answer[] {
  const rows =
    by === "user"
      ? dbFor(root).prepare("select * from answers where author = 'user' order by id").all()
      : dbFor(root).prepare("select * from answers where author = 'guest' and guest_id = ? order by id").all(by.guest);
  return (rows as unknown as AnswerRow[]).map(toAnswer);
}

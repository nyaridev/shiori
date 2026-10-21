// Answers to a page's open questions (ADR-0002), stored in the wiki's `data/wiki.db` next to the comments. People
// answer in the app; agents read them in `pnpm wiki inbox` and write the decision into the page's frontmatter.
import type { Answer } from "../shared/api.ts";
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

export function addAnswer(
  root: string,
  page: string,
  question: string,
  choice: string | null,
  body: string,
  by: Answerer = "user",
): Answer {
  const db = dbFor(root);
  const { lastInsertRowid } = db
    .prepare(
      "insert into answers (page, question, choice, body, author, guest_id, guest_name, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(page, question, choice, body, ...authorColumns(by), new Date().toISOString());
  return toAnswer(db.prepare("select * from answers where id = ?").get(lastInsertRowid) as unknown as AnswerRow);
}

/** Hides a guest's answer from guests and from the inbox, or shows it again. */
export function setAnswerHidden(root: string, id: number, hidden: boolean): Answer | null | "not a guest's" {
  const db = dbFor(root);
  const row = db.prepare("select * from answers where id = ?").get(id) as unknown as AnswerRow | undefined;
  if (!row) return null;
  if (row.author !== "guest") return "not a guest's";
  db.prepare("update answers set hidden = ? where id = ?").run(hidden ? 1 : 0, id);
  return toAnswer({ ...row, hidden: hidden ? 1 : 0 });
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

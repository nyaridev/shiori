// Answers to a page's open questions (ADR-0002), stored in the wiki's `data/wiki.db` next to the comments. People
// answer in the app; agents read them in `pnpm wiki inbox` and write the decision into the page's frontmatter.
import type { Answer } from "../shared/api.ts";
import { dbFor } from "./threads.ts";

interface AnswerRow {
  id: number;
  page: string;
  question: string;
  choice: string | null;
  body: string;
  created_at: string;
}

const toAnswer = (r: AnswerRow): Answer => ({
  id: r.id,
  page: r.page,
  question: r.question,
  choice: r.choice,
  body: r.body,
  createdAt: r.created_at,
});

export function listAnswers(root: string, filter: { page?: string } = {}): Answer[] {
  const db = dbFor(root);
  const rows =
    filter.page === undefined
      ? db.prepare("select * from answers order by id").all()
      : db.prepare("select * from answers where page = ? order by id").all(filter.page);
  return (rows as unknown as AnswerRow[]).map(toAnswer);
}

export function addAnswer(root: string, page: string, question: string, choice: string | null, body: string): Answer {
  const db = dbFor(root);
  const created = new Date().toISOString();
  const { lastInsertRowid } = db
    .prepare("insert into answers (page, question, choice, body, created_at) values (?, ?, ?, ?, ?)")
    .run(page, question, choice, body, created);
  return { id: Number(lastInsertRowid), page, question, choice, body, createdAt: created };
}

/** How many answers each question has, keyed `page#question`. */
export function answerCounts(root: string): Map<string, number> {
  const rows = dbFor(root).prepare("select page, question, count(*) as n from answers group by page, question").all();
  return new Map(
    (rows as unknown as { page: string; question: string; n: number }[]).map((r) => [`${r.page}#${r.question}`, r.n]),
  );
}

// The wiki-wide list of questions and suggestions (Special:Questions, ADR-0009), filtered, sorted and cut into pages
// here, so a wiki with thousands of them sends only the ones on screen. Questions come from the pages (the corpus),
// answers from the wiki's database; both servers use it, each for its own viewer.
import {
  type Answer,
  QUESTION_PAGE_MAX,
  type QuestionCounts,
  type QuestionItem,
  type QuestionPage,
  type QuestionQuery,
  type QuestionsWaiting,
} from "../shared/api.ts";
import { answerCounts, answersBy, answersTo } from "./answers.ts";
import type { Corpus } from "./corpus.ts";

/** Whose list it is: the owner, or a guest by id. The owner also sees answers they hid from guests. */
export type Asker = "user" | { guest: string };

interface Row extends QuestionItem {
  /** Its place in reading order. */
  order: number;
  updated: string;
  words: string;
}

const keyOf = (page: string, id: string) => `${page}#${id}`;

/** Every question of the wiki in reading order, with its answer count and the viewer's own answer. */
function rowsOf(corpus: Corpus, root: string, asker: Asker): Row[] {
  const counts = answerCounts(root);
  const mine = new Map(answersBy(root, asker).map((a) => [keyOf(a.page, a.question), a]));
  const updated = new Map(corpus.index.map((p) => [p.path, p.updatedAt ?? ""]));
  const rows: Row[] = [];
  for (const p of corpus.pages.values()) {
    const at = updated.get(p.path) ?? "";
    for (const q of p.questions) {
      const key = keyOf(p.path, q.id);
      const own = mine.get(key);
      rows.push({
        ...q,
        page: { path: p.path, title: p.title, icon: p.icon, isPage: true },
        trail: p.trail.filter((t) => t.path),
        answers: counts.get(key) ?? 0,
        ...(own ? { mine: own } : {}),
        ...(q.status === "resolved" ? { decidedOn: q.decided ?? at.slice(0, 10) } : {}),
        order: rows.length,
        updated: at,
        words: [q.text, ...q.options, q.answer ?? "", p.title].join(" ").toLowerCase(),
      });
    }
  }
  return rows;
}

/** Whether a row is one the viewer answered during this visit (so it stays in the waiting list). */
const answeredSince = (r: Row, since: string) => !!r.mine && r.status === "open" && r.mine.createdAt >= since;
const waiting = (r: Row, since: string) => r.status === "open" && (!r.mine || answeredSince(r, since));
const answered = (r: Row, since: string) => !!r.mine && !answeredSince(r, since);

const byDue = (a: Row, b: Row) => (a.due ?? "￿").localeCompare(b.due ?? "￿") || a.order - b.order;
const SORTS: Record<NonNullable<QuestionQuery["sort"]>, (a: Row, b: Row) => number> = {
  due: byDue,
  decided: (a, b) => (b.decidedOn ?? "").localeCompare(a.decidedOn ?? "") || a.order - b.order,
  answered: (a, b) =>
    (b.mine?.updatedAt ?? b.mine?.createdAt ?? "").localeCompare(a.mine?.updatedAt ?? a.mine?.createdAt ?? "") ||
    a.order - b.order,
  updated: (a, b) => b.updated.localeCompare(a.updated) || a.order - b.order,
};

/** One page of the questions that match `query`, and how many there are of each kind. */
export function listQuestions(
  corpus: Corpus,
  root: string,
  query: QuestionQuery,
  asker: Asker,
  now = new Date(),
): QuestionPage {
  const at = now.toISOString();
  const since = query.since ?? at;
  const words = (query.q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const all = rowsOf(corpus, root, asker).filter((r) => words.every((w) => r.words.includes(w)));

  const counts: QuestionCounts = {
    open: { question: 0, suggestion: 0 },
    decided: 0,
    waiting: { question: 0, suggestion: 0 },
    answered: 0,
  };
  for (const r of all) {
    if (r.status === "open") counts.open[r.kind]++;
    else counts.decided++;
    if (r.status === "open" && !r.mine) counts.waiting[r.kind]++;
    if (answered(r, since)) counts.answered++;
  }

  const status = query.status ?? "open";
  const shown = all.filter(
    (r) =>
      (status === "all" || (status === "open") === (r.status === "open")) &&
      (!query.kind || r.kind === query.kind) &&
      (query.mine !== "waiting" || waiting(r, since)) &&
      (query.mine !== "answered" || answered(r, since)),
  );
  // Without a sort: the viewer's answers newest first, else open ones by due day, then decided ones newest first.
  const sort = query.sort
    ? SORTS[query.sort]
    : query.mine === "answered"
      ? SORTS.answered
      : (a: Row, b: Row) =>
          Number(a.status !== "open") - Number(b.status !== "open") ||
          (a.status === "open" ? SORTS.due(a, b) : SORTS.decided(a, b));
  shown.sort(sort);

  const offset = Math.max(0, Math.floor(query.offset ?? 0));
  const limit = Math.min(QUESTION_PAGE_MAX, Math.max(1, Math.floor(query.limit ?? 20)));
  const items = shown.slice(offset, offset + limit).map(({ order: _, updated: __, words: ___, ...item }) => item);
  if (query.full) {
    const visible = (a: Answer) => asker === "user" || !a.hidden;
    for (const item of items) item.answerList = answersTo(root, item.page.path, item.id).filter(visible);
  }
  return { items, total: shown.length, offset, counts, at };
}

/** Per page, the open questions and suggestions the viewer hasn't answered; pages with none are left out. */
export function questionsWaiting(corpus: Corpus, root: string, asker: Asker): QuestionsWaiting {
  const mine = new Set(answersBy(root, asker).map((a) => keyOf(a.page, a.question)));
  const pages: QuestionsWaiting["pages"] = {};
  for (const p of corpus.pages.values())
    for (const q of p.questions) {
      if (q.status !== "open" || mine.has(keyOf(p.path, q.id))) continue;
      const w = pages[p.path] ?? { questions: 0, suggestions: 0 };
      pages[p.path] = w;
      if (q.kind === "suggestion") w.suggestions++;
      else w.questions++;
    }
  return { pages };
}

/** How many questions a wiki has, for its index. */
export function questionTotals(corpus: Corpus) {
  const totals = { open: 0, suggestions: 0, decided: 0 };
  for (const p of corpus.pages.values())
    for (const q of p.questions) {
      if (q.status !== "open") totals.decided++;
      else if (q.kind === "suggestion") totals.suggestions++;
      else totals.open++;
    }
  return totals;
}

/** A list query from a URL's search params; anything malformed falls back to the default. */
export function questionQueryFrom(get: (key: string) => string | undefined): QuestionQuery {
  const one = <T extends string>(key: string, values: readonly T[]) => {
    const v = get(key);
    return values.includes(v as T) ? (v as T) : undefined;
  };
  const num = (key: string) => {
    const n = Number(get(key));
    return Number.isFinite(n) ? n : undefined;
  };
  const since = get("since");
  return {
    status: one("status", ["open", "decided", "all"] as const),
    kind: one("kind", ["question", "suggestion"] as const),
    mine: one("mine", ["waiting", "answered"] as const),
    since: since && !Number.isNaN(Date.parse(since)) ? new Date(since).toISOString() : undefined,
    q: get("q")?.slice(0, 200),
    sort: one("sort", ["due", "decided", "answered", "updated"] as const),
    offset: num("offset"),
    limit: num("limit"),
    full: get("full") === "1",
  };
}

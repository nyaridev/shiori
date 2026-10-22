// Special:Questions (ADR-0009), in two views. The overview lists every question and suggestion as rows (open ones,
// suggestions, decided ones), and the answer view shows the open ones this viewer hasn't answered as cards they can
// answer right there. A card they answer stays where it was until they leave the page; when they come back it's
// under "Recently answered". The server filters, sorts and cuts both lists into pages, so a wiki with thousands of
// questions sends only the ones on screen. Everything the viewer picks (view, tab, search, page) is in the URL.
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { Answer, QuestionItem, QuestionPage, QuestionQuery } from "../../../shared/api.ts";
import { canComment, useGuest } from "../../guest/GuestContext.ts";
import { api } from "../../lib/api.ts";
import { ago } from "../../lib/time.ts";
import { Badge, Button, Input, Pagination, Segmented } from "../../ui/index.ts";
import { pageHref } from "../PageHead.tsx";
import { PageIcon } from "../PageIcon.tsx";
import { dayLabel, QuestionCardView } from "../questions/QuestionCard.tsx";
import { useQuestions } from "../questions/useQuestions.ts";

/** Rows on a page of the overview, cards on a page of the answer view, rows of "Recently answered". */
const ROWS = 50;
const CARDS = 10;
const RECENT = 10;

const keyOf = (q: { page: { path: string }; id: string }) => `${q.page.path}#${q.id}`;
const questionHref = (wikiId: string, q: QuestionItem) => `${pageHref(wikiId, q.page.path)}#question-${q.id}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** The list's settings in the URL: `set` changes some and drops the page numbers they make wrong. */
export function useListParams() {
  const [params, setParams] = useSearchParams();
  const set = useCallback(
    (changes: Record<string, string | null>, replace = false) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(changes)) {
            if (v === null || v === "") next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace, preventScrollReset: true },
      ),
    [setParams],
  );
  const pageOf = (key: string) => Math.max(1, Math.floor(Number(params.get(key)) || 1));
  return { params, set, pageOf };
}

/** A search box that tells the list once typing pauses. */
export function ListSearch({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (q: string) => void;
  label: string;
}) {
  const [text, setText] = useState(value);
  const last = useRef(value);
  useEffect(() => {
    // Back or forward changed the URL's search: show it.
    if (value !== last.current) setText(value);
    last.current = value;
  }, [value]);
  useEffect(() => {
    if (text.trim() === last.current) return;
    const t = setTimeout(() => {
      last.current = text.trim();
      onChange(text.trim());
    }, 250);
    return () => clearTimeout(t);
  }, [text, onChange]);
  return (
    <Input
      type="search"
      className="sh-q-search"
      value={text}
      onChange={(e) => setText(e.target.value)}
      placeholder="Search questions, options and pages"
      aria-label={label}
    />
  );
}

/**
 * "1–10 of 460" over a list, which takes focus when the page changes so screen readers hear where they are, and the
 * pager under it. The page in the URL is kept in range when the list gets shorter.
 */
export function Paged({
  data,
  page,
  size,
  onPage,
  label,
  loading,
  children,
}: {
  data: QuestionPage | undefined;
  page: number;
  size: number;
  onPage: (p: number) => void;
  label: string;
  loading: boolean;
  children: ReactNode;
}) {
  const summary = useRef<HTMLParagraphElement>(null);
  const moved = useRef(false);
  const pages = data ? Math.max(1, Math.ceil(data.total / size)) : 1;
  useEffect(() => {
    if (data && page > pages) onPage(pages);
  }, [data, page, pages, onPage]);
  useEffect(() => {
    if (!moved.current || loading || !summary.current) return;
    moved.current = false;
    summary.current.focus({ preventScroll: true });
    if (summary.current.getBoundingClientRect().top < 0) summary.current.scrollIntoView({ block: "start" });
  }, [loading]);
  const go = (p: number) => {
    moved.current = true;
    onPage(p);
  };
  return (
    <div className="sh-q-paged" aria-busy={loading || undefined}>
      {data && data.total > size && (
        <p className="sh-q-summary" ref={summary} tabIndex={-1}>
          {data.offset + 1}–{data.offset + data.items.length} of {data.total.toLocaleString()}
        </p>
      )}
      {children}
      <Pagination page={Math.min(page, pages)} pages={pages} onChange={go} label={label} />
    </div>
  );
}

export function Questions({ wikiId }: { wikiId: string }) {
  const guest = useGuest();
  const writes = canComment(guest);
  const { params, set } = useListParams();
  const view = writes && params.get("view") === "answer" ? "answer" : "overview";
  const q = params.get("q") ?? "";
  const onSearch = useCallback((text: string) => set({ q: text, p: null, rp: null }, true), [set]);
  // When this visit began, by the server's clock: what's answered after it stays in the answer view.
  const [since, setSince] = useState<string>();
  const counts = useQuestions(wikiId, { limit: 1, q }).data?.counts;
  const waiting = counts ? counts.waiting.question + counts.waiting.suggestion : undefined;

  return (
    <>
      {writes && (
        <div className="sh-q-views">
          <Segmented
            label="View"
            value={view}
            onChange={(v) => set({ view: v === "answer" ? "answer" : null, p: null, rp: null, tab: null, kind: null })}
            options={[
              { value: "overview", label: "Overview" },
              {
                value: "answer",
                label: (
                  <>
                    Answer
                    {!!waiting && <span className="sh-q-views-count">{waiting.toLocaleString()}</span>}
                  </>
                ),
              },
            ]}
          />
        </div>
      )}
      {view === "answer" ? (
        <AnswerView wikiId={wikiId} q={q} onSearch={onSearch} since={since} onSince={setSince} />
      ) : (
        <Overview wikiId={wikiId} q={q} onSearch={onSearch} />
      )}
    </>
  );
}

const TABS = {
  open: { status: "open", kind: "question" },
  suggestions: { status: "open", kind: "suggestion" },
  decided: { status: "decided" },
} as const satisfies Record<string, QuestionQuery>;
type Tab = keyof typeof TABS;

function Overview({ wikiId, q, onSearch }: { wikiId: string; q: string; onSearch: (q: string) => void }) {
  const { params, set, pageOf } = useListParams();
  const tab: Tab = (params.get("tab") as Tab) in TABS ? (params.get("tab") as Tab) : "open";
  const page = pageOf("p");
  const list = useQuestions(wikiId, { ...TABS[tab], q, offset: (page - 1) * ROWS, limit: ROWS });
  const onPage = useCallback((p: number) => set({ p: p > 1 ? String(p) : null }), [set]);
  const c = list.data?.counts;
  if (c && !q && !c.open.question && !c.open.suggestion && !c.decided)
    return (
      <p className="sh-special-empty">
        No page asks a question or has a suggestion yet. Add `questions:` or `suggestions:` to a page's frontmatter.
      </p>
    );
  return (
    <>
      <div className="sh-q-bar">
        <Segmented
          label="Show"
          value={tab}
          onChange={(v) => set({ tab: v === "open" ? null : v, p: null })}
          options={[
            { value: "open", label: <Counted label="Open questions" n={c?.open.question} /> },
            { value: "suggestions", label: <Counted label="Suggestions" n={c?.open.suggestion} /> },
            { value: "decided", label: <Counted label="Decided" n={c?.decided} /> },
          ]}
        />
        <ListSearch value={q} onChange={onSearch} label="Search the questions" />
      </div>
      <Paged data={list.data} page={page} size={ROWS} onPage={onPage} label="Question pages" loading={list.loading}>
        {list.data && !list.data.total ? (
          <p className="sh-special-empty">
            {q
              ? `Nothing here matches “${q}”.`
              : tab === "decided"
                ? "Nothing is decided yet."
                : tab === "suggestions"
                  ? "No open suggestions."
                  : "No open questions."}
          </p>
        ) : (
          <ul className="sh-special-list">
            {list.data?.items.map((item) => (
              <li key={keyOf(item)} className="sh-special-row">
                <Link to={questionHref(wikiId, item)} className="sh-special-link">
                  {item.text}
                </Link>
                {item.status === "resolved" ? (
                  <span className="sh-special-answer">→ {item.answer ?? "decided"}</span>
                ) : (
                  <span className="sh-special-count">{plural(item.answers, "answer")}</span>
                )}
                {item.status === "open" && item.due && <Badge>Decide by {dayLabel(item.due)}</Badge>}
                {item.kind === "suggestion" && item.status === "resolved" && <Badge tone="good">Suggestion</Badge>}
                <span className="sh-special-summary">
                  <PageIcon icon={item.page.icon} fallback="page" className="sh-icon-gap" />
                  {item.page.title}
                  {item.options.length > 0 && ` · ${item.options.join(" / ")}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Paged>
    </>
  );
}

function Counted({ label, n }: { label: string; n: number | undefined }) {
  return (
    <>
      {label}
      {n !== undefined && <span className="sh-q-tab-count">{n.toLocaleString()}</span>}
    </>
  );
}

/** Answers sent from this page, by question, so a card shows its new answer before the list comes back. */
function useSent() {
  const [sent, setSent] = useState(new Map<string, Answer>());
  const add = useCallback((key: string, a: Answer) => setSent((m) => new Map(m).set(key, a)), []);
  /** A question's answers with the ones sent from here in place. */
  const merge = useCallback(
    (item: QuestionItem): Answer[] => {
      const a = sent.get(keyOf(item));
      const list = item.answerList ?? [];
      if (!a) return list;
      return list.some((x) => x.id === a.id) ? list.map((x) => (x.id === a.id ? a : x)) : [...list, a];
    },
    [sent],
  );
  return { sent, add, merge };
}

const KINDS = { all: undefined, question: "question", suggestion: "suggestion" } as const;
type Kind = keyof typeof KINDS;

function AnswerView({
  wikiId,
  q,
  onSearch,
  since,
  onSince,
}: {
  wikiId: string;
  q: string;
  onSearch: (q: string) => void;
  since: string | undefined;
  onSince: (at: string) => void;
}) {
  const { params, set, pageOf } = useListParams();
  const kind: Kind = (params.get("kind") as Kind) in KINDS ? (params.get("kind") as Kind) : "all";
  const page = pageOf("p");
  const query: QuestionQuery = {
    mine: "waiting",
    kind: KINDS[kind],
    q,
    offset: (page - 1) * CARDS,
    limit: CARDS,
    full: true,
  };
  const queue = useQuestions(wikiId, query, since);
  const at = queue.data?.at;
  useEffect(() => {
    if (at && !since) onSince(at);
  }, [at, since, onSince]);
  const { sent, add, merge } = useSent();
  const onPage = useCallback((p: number) => set({ p: p > 1 ? String(p) : null }), [set]);
  const list = useRef<HTMLOListElement>(null);

  const answer = (item: QuestionItem) => async (choice: string | null, body: string) => {
    const a = await api.answer(wikiId, item.page.path, item.id, choice, body);
    add(keyOf(item), a);
    queue.reload();
  };
  const hide = async (id: number, hidden: boolean) => {
    await api.hideAnswer(wikiId, id, hidden);
    queue.reload();
  };
  /** After an answer, the next card still waiting takes focus, so answering goes down the list. */
  const next = (key: string) =>
    requestAnimationFrame(() => {
      const cards = [...(list.current?.querySelectorAll<HTMLElement>("[data-card]") ?? [])];
      const at = cards.findIndex((c) => c.dataset.card === key);
      const target = cards.slice(at + 1).find((c) => c.dataset.waiting !== undefined);
      const field = target?.querySelector<HTMLElement>(".sh-question-option, textarea");
      if (!target || !field) return;
      field.focus({ preventScroll: true });
      const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({ block: "nearest", behavior: still ? "auto" : "smooth" });
    });

  const c = queue.data?.counts;
  const left = c ? c.waiting.question + c.waiting.suggestion : 0;
  const done = sent.size;

  return (
    <>
      <div className="sh-q-bar">
        <Segmented
          label="Show"
          value={kind}
          onChange={(v) => set({ kind: v === "all" ? null : v, p: null })}
          options={[
            { value: "all", label: <Counted label="All" n={c && left} /> },
            { value: "question", label: <Counted label="Questions" n={c?.waiting.question} /> },
            { value: "suggestion", label: <Counted label="Suggestions" n={c?.waiting.suggestion} /> },
          ]}
        />
        <ListSearch value={q} onChange={onSearch} label="Search the questions waiting for you" />
      </div>
      {c && (
        <p className="sh-q-progress" aria-live="polite">
          {left ? `${plural(left, "question")} waiting for your answer` : "Nothing is waiting for your answer"}
          {done > 0 && ` · you answered ${done.toLocaleString()} here`}
        </p>
      )}
      <Paged data={queue.data} page={page} size={CARDS} onPage={onPage} label="Question pages" loading={queue.loading}>
        {queue.data && !queue.data.total ? (
          <p className="sh-special-empty">
            {q
              ? `Nothing waiting for you matches “${q}”.`
              : "You've answered everything. The agent takes it from here."}
          </p>
        ) : (
          <ol className="sh-question-list sh-q-queue" ref={list}>
            {queue.data?.items.map((item) => {
              const answers = merge(item);
              const key = keyOf(item);
              const mine = !!item.mine || sent.has(key);
              return (
                <li key={key} data-card={key} data-waiting={mine ? undefined : ""}>
                  <QuestionCardView
                    question={item}
                    answers={answers}
                    onAnswer={answer(item)}
                    onHide={hide}
                    onSent={() => next(key)}
                    from={
                      <Link to={questionHref(wikiId, item)} className="sh-q-from">
                        <PageIcon icon={item.page.icon} fallback="page" className="sh-icon-gap" />
                        {item.page.title}
                      </Link>
                    }
                  />
                </li>
              );
            })}
          </ol>
        )}
      </Paged>
      <Recent wikiId={wikiId} q={q} kind={KINDS[kind]} since={since} />
    </>
  );
}

/** The viewer's answers from before this visit, newest first; each can be changed while its question is open. */
function Recent({
  wikiId,
  q,
  kind,
  since,
}: {
  wikiId: string;
  q: string;
  kind: QuestionQuery["kind"];
  since: string | undefined;
}) {
  const { set, pageOf } = useListParams();
  const page = pageOf("rp");
  const recent = useQuestions(
    wikiId,
    since ? { mine: "answered", kind, q, offset: (page - 1) * RECENT, limit: RECENT, full: true } : null,
    since,
  );
  const { add, merge } = useSent();
  const [changing, setChanging] = useState<string | null>(null);
  const rows = useRef<HTMLUListElement>(null);
  // Focus follows the change: into the card when it opens, back to the row's button when it closes.
  const lastChanged = useRef<string | null>(null);
  useEffect(() => {
    const at = (key: string | null) =>
      rows.current?.querySelector<HTMLElement>(`[data-row="${CSS.escape(key ?? "")}"]`);
    if (changing)
      at(changing)?.querySelector<HTMLElement>('[aria-pressed="true"], .sh-question-option, textarea')?.focus();
    else at(lastChanged.current)?.querySelector<HTMLElement>("button")?.focus();
    lastChanged.current = changing;
  }, [changing]);
  const onPage = useCallback((p: number) => set({ rp: p > 1 ? String(p) : null }), [set]);
  if (!recent.data?.total) return null;

  return (
    <section className="sh-special-group sh-q-recent" aria-labelledby="recently-answered">
      <h2 className="sh-special-heading" id="recently-answered">
        Recently answered <span className="sh-special-count">{recent.data.total.toLocaleString()}</span>
      </h2>
      <Paged
        data={recent.data}
        page={page}
        size={RECENT}
        onPage={onPage}
        label="Answered pages"
        loading={recent.loading}
      >
        <ul className="sh-special-list" ref={rows}>
          {recent.data.items.map((item) => {
            const key = keyOf(item);
            const answers = merge(item);
            const mine = answers.find((a) => a.id === item.mine?.id) ?? item.mine;
            const open = item.status === "open";
            if (changing === key)
              return (
                <li key={key} className="sh-q-recent-edit" data-row={key}>
                  <QuestionCardView
                    question={item}
                    answers={answers}
                    startEditing
                    onCancel={() => setChanging(null)}
                    onAnswer={async (choice, body) => {
                      add(key, await api.answer(wikiId, item.page.path, item.id, choice, body));
                      recent.reload();
                    }}
                    onSent={() => setChanging(null)}
                    from={
                      <Link to={questionHref(wikiId, item)} className="sh-q-from">
                        <PageIcon icon={item.page.icon} fallback="page" className="sh-icon-gap" />
                        {item.page.title}
                      </Link>
                    }
                  />
                </li>
              );
            return (
              <li key={key} className="sh-special-row sh-q-recent-row" data-row={key}>
                <Link to={questionHref(wikiId, item)} className="sh-special-link">
                  {item.text}
                </Link>
                {open ? (
                  <Badge title="The agent reads answers in its inbox and writes the decision into the page">
                    Waiting for the agent
                  </Badge>
                ) : (
                  <Badge tone="good">Decided</Badge>
                )}
                {open && (
                  <Button size="sm" variant="ghost" icon="undo" onClick={() => setChanging(key)}>
                    Change
                  </Button>
                )}
                <span className="sh-q-mine">
                  <span className="sh-question-by">You</span>
                  {mine?.choice && <span className="sh-question-choice">{mine.choice}</span>}
                  {mine?.body && <span>{mine.body}</span>}
                  {!open && item.answer && <span className="sh-special-answer">→ {item.answer}</span>}
                </span>
                <span className="sh-special-summary">
                  <PageIcon icon={item.page.icon} fallback="page" className="sh-icon-gap" />
                  {item.page.title}
                  {mine && ` · ${ago(mine.updatedAt ?? mine.createdAt)}`}
                </span>
              </li>
            );
          })}
        </ul>
      </Paged>
    </section>
  );
}

/** Special:Decisions: the decided questions as a timeline, newest first, by month, a page at a time. */
export function Decisions({ wikiId }: { wikiId: string }) {
  const { params, set, pageOf } = useListParams();
  const q = params.get("q") ?? "";
  const page = pageOf("p");
  const list = useQuestions(wikiId, { status: "decided", q, offset: (page - 1) * ROWS, limit: ROWS });
  const onPage = useCallback((p: number) => set({ p: p > 1 ? String(p) : null }), [set]);
  const onSearch = useCallback((text: string) => set({ q: text, p: null }, true), [set]);
  if (list.data && !list.data.counts.decided && !q)
    return (
      <p className="sh-special-empty">
        Nothing is decided yet. When the agent decides a question, it sets `status: resolved`, `answer` and `decided`.
      </p>
    );
  const months = new Map<string, QuestionItem[]>();
  for (const item of list.data?.items ?? []) {
    const day = item.decidedOn ?? "";
    const month = day
      ? new Date(`${day.slice(0, 7)}-01T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : "Undated";
    months.set(month, [...(months.get(month) ?? []), item]);
  }
  return (
    <>
      <div className="sh-q-bar">
        <ListSearch value={q} onChange={onSearch} label="Search the decisions" />
      </div>
      <Paged data={list.data} page={page} size={ROWS} onPage={onPage} label="Decision pages" loading={list.loading}>
        {list.data && !list.data.total && <p className="sh-special-empty">No decision matches “{q}”.</p>}
        {[...months].map(([month, items]) => (
          <section key={month} className="sh-special-group">
            <h2 className="sh-special-heading">{month}</h2>
            <ol className="sh-decisions">
              {items.map((item) => (
                <li key={keyOf(item)} className="sh-decision">
                  {item.decidedOn && (
                    <time className="sh-decision-day" dateTime={item.decidedOn}>
                      {dayLabel(item.decidedOn)}
                    </time>
                  )}
                  <div className="sh-decision-body">
                    <Link to={questionHref(wikiId, item)} className="sh-special-link">
                      {item.text}
                    </Link>
                    <p className="sh-decision-answer">{item.answer ?? "Decided"}</p>
                    {item.kind === "suggestion" && <Badge tone="good">Suggestion</Badge>}
                    <span className="sh-special-summary">
                      <PageIcon icon={item.page.icon} fallback="page" className="sh-icon-gap" />
                      {item.page.title}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </Paged>
    </>
  );
}

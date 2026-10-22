// Special:Attention: what's waiting for this viewer. Pages that changed since they last opened them (seen.ts),
// their comments the agent has answered, and the first open questions they haven't answered yet, the soonest due
// first, with the way to answer them all (Special:Questions' Answer view, ADR-0009).
import { Link } from "react-router";
import type { PageEntry, Thread } from "../../../shared/api.ts";
import { isPageComment } from "../../../shared/quote.ts";
import { canComment, useGuest } from "../../guest/GuestContext.ts";
import { api } from "../../lib/api.ts";
import { useLive } from "../../lib/live.ts";
import { ago } from "../../lib/time.ts";
import { useResource } from "../../lib/useResource.ts";
import { Badge } from "../../ui/index.ts";
import { pageHref, specialHref } from "../PageHead.tsx";
import { PageIcon } from "../PageIcon.tsx";
import { dayLabel } from "../questions/QuestionCard.tsx";
import { useQuestions } from "../questions/useQuestions.ts";
import { changedPages, useSeenPages } from "../seen.ts";

/** How many waiting questions this page lists before pointing to the Answer view. */
const FIRST = 10;

export function Attention({ wikiId, pages }: { wikiId: string; pages: PageEntry[] }) {
  const guest = useGuest();
  const threads = useResource(`threads:${wikiId}`, () => api.threads(wikiId));
  const waiting = useQuestions(wikiId, canComment(guest) ? { mine: "waiting", limit: FIRST } : null);
  useLive((e) => {
    if (e.type === "threads" && e.wiki === wikiId) threads.reload();
  });
  const seen = useSeenPages(wikiId);
  const titles = new Map(pages.map((p) => [p.path, p]));

  const changed = changedPages(pages, seen).sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  const mine = (t: Thread) => (guest ? !!t.messages[0]?.mine : t.messages[0]?.author === "user");
  const replied = (threads.data ?? []).filter(
    (t) => t.status === "open" && mine(t) && t.messages.length > 1 && t.messages.at(-1)?.author === "agent",
  );
  const unanswered = waiting.data?.items ?? [];
  const left = waiting.data ? waiting.data.counts.waiting.question + waiting.data.counts.waiting.suggestion : 0;

  if (!changed.length && !replied.length && !unanswered.length && threads.data && (waiting.data || !canComment(guest)))
    return <p className="sh-special-empty">You're all caught up. Nothing changed and nothing is waiting for you.</p>;

  return (
    <>
      {changed.length > 0 && (
        <section className="sh-special-group">
          <h2 className="sh-special-heading">Changed since you last looked</h2>
          <ul className="sh-special-list">
            {changed.map((p) => (
              <li key={p.path} className="sh-special-row">
                <Link to={pageHref(wikiId, p.path)} className="sh-special-link">
                  <PageIcon icon={p.icon} fallback="page" />
                  {p.title}
                </Link>
                {p.updatedAt && <span className="sh-special-count">{ago(p.updatedAt)}</span>}
                {p.summary && <span className="sh-special-summary">{p.summary}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {replied.length > 0 && (
        <section className="sh-special-group">
          <h2 className="sh-special-heading">The agent replied to you</h2>
          <ul className="sh-special-list">
            {replied.map((t) => {
              const page = titles.get(t.page);
              const target = isPageComment(t.quote) ? "#changes" : `#comment-${t.id}`;
              return (
                <li key={t.id} className="sh-special-row">
                  <Link to={`${pageHref(wikiId, t.page)}${target}`} className="sh-special-link">
                    {t.quote.exact ? `“${t.quote.exact}”` : (t.messages[0]?.body ?? "A comment")}
                  </Link>
                  <Badge tone="accent">Agent replied</Badge>
                  <span className="sh-special-summary">
                    <PageIcon icon={page?.icon} fallback="page" className="sh-icon-gap" />
                    {page?.title ?? t.page} · {t.messages.at(-1)?.body}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {unanswered.length > 0 && (
        <section className="sh-special-group">
          <h2 className="sh-special-heading">
            Waiting for your answer <span className="sh-special-count">{left}</span>
          </h2>
          <ul className="sh-special-list">
            {unanswered.map((q) => (
              <li key={`${q.page.path}#${q.id}`} className="sh-special-row">
                <Link to={`${pageHref(wikiId, q.page.path)}#question-${q.id}`} className="sh-special-link">
                  {q.text}
                </Link>
                {q.kind === "suggestion" && <Badge tone="good">Suggestion</Badge>}
                {q.due && (
                  <Badge tone={q.due < new Date().toISOString().slice(0, 10) ? "bad" : "neutral"}>
                    Decide by {dayLabel(q.due)}
                  </Badge>
                )}
                <span className="sh-special-summary">
                  <PageIcon icon={q.page.icon} fallback="page" className="sh-icon-gap" />
                  {q.page.title}
                  {q.options.length > 0 && ` · ${q.options.join(" / ")}`}
                </span>
              </li>
            ))}
          </ul>
          <p className="sh-special-more">
            <Link to={`${specialHref(wikiId, "questions")}?view=answer`} className="sh-special-link">
              {left > unanswered.length ? `Answer all ${left} on one page` : "Answer them on one page"}
            </Link>
          </p>
        </section>
      )}
    </>
  );
}

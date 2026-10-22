// The bottom of a page: the questions and suggestions it doesn't place itself, cards for the pages under it, what's
// new (home), its related pages, and last its Changes panel, where people ask for changes to the whole page.
import { Link } from "react-router";
import type { PageData, PageEntry, PageLink, Question } from "../../shared/api.ts";
import { PageDiscussion } from "../comments/PageDiscussion.tsx";
import { ago } from "../lib/time.ts";
import { usePage } from "./PageContext.ts";
import { pageHref, specialHref } from "./PageHead.tsx";
import { PageIcon } from "./PageIcon.tsx";
import { QuestionCard } from "./questions/QuestionCard.tsx";
import { Related } from "./Related.tsx";
import { StatusBadge } from "./StatusBadge.tsx";

/** How many pages "Recently updated" shows on the home page. */
const RECENT = 5;

export function PageCard({ wikiId, page }: { wikiId: string; page: PageLink }) {
  const body = (
    <>
      <span className="sh-section-top">
        <PageIcon icon={page.icon} fallback={page.isPage ? "page" : "folder"} className="sh-section-icon" />
        {page.status && <StatusBadge status={page.status} />}
      </span>
      <span className="sh-section-name">{page.title}</span>
      {page.summary && <span className="sh-section-summary">{page.summary}</span>}
    </>
  );
  return page.isPage ? (
    <Link to={pageHref(wikiId, page.path)} className="sh-section-card">
      {body}
    </Link>
  ) : (
    <div className="sh-section-card" data-folder="">
      {body}
    </div>
  );
}

/** A small link to another page: its icon and title; red for a page not written yet. */
export function PageChip({ wikiId, page }: { wikiId: string; page: PageLink }) {
  return (
    <Link
      to={pageHref(wikiId, page.path)}
      className="sh-page-chip"
      data-missing={page.isPage ? undefined : ""}
      title={page.isPage ? undefined : "This page hasn't been written yet"}
    >
      <PageIcon icon={page.isPage ? page.icon : "puzzle"} fallback="page" />
      {page.title}
    </Link>
  );
}

function RecentlyUpdated({ wikiId, index }: { wikiId: string; index: PageEntry[] }) {
  const recent = index
    .filter((p) => p.path && !p.hidden && p.updatedAt)
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
    .slice(0, RECENT);
  if (!recent.length) return null;
  return (
    <section className="sh-foot-block" aria-labelledby="sh-recent-title">
      <h2 id="sh-recent-title" className="sh-sections-title">
        Recently updated
        <Link to={specialHref(wikiId, "recent")} className="sh-foot-more">
          All changes
        </Link>
      </h2>
      <ul className="sh-recent-list">
        {recent.map((p) => (
          <li key={p.path}>
            <Link to={pageHref(wikiId, p.path)}>
              <PageIcon icon={p.icon} fallback="page" />
              <span className="sh-recent-title">{p.title}</span>
              {p.summary && <span className="sh-recent-summary">{p.summary}</span>}
            </Link>
            {p.updatedAt && <time dateTime={p.updatedAt}>{ago(p.updatedAt)}</time>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A page's questions or suggestions that it doesn't place itself, open ones first. */
function Decisions({ id, title, list }: { id: string; title: string; list: Question[] }) {
  if (!list.length) return null;
  return (
    <section className="sh-foot-block" id={id} aria-labelledby={`sh-${id}-title`}>
      <h2 id={`sh-${id}-title`} className="sh-sections-title">
        {title}
      </h2>
      <div className="sh-question-list">
        {list.map((q) => (
          <QuestionCard key={q.id} question={q} />
        ))}
      </div>
    </section>
  );
}

export function PageFoot({ wikiId, page, index }: { wikiId: string; page: PageData; index?: PageEntry[] }) {
  const home = page.path === "";
  const ctx = usePage();
  const unplaced = page.questions
    .filter((q) => !page.placed.questions.includes(q.id))
    .sort((a, b) => Number(a.status === "resolved") - Number(b.status === "resolved"));
  return (
    <footer className="sh-page-foot">
      <Decisions id="questions" title="Questions" list={unplaced.filter((q) => q.kind === "question")} />
      <Decisions id="suggestions" title="Suggestions" list={unplaced.filter((q) => q.kind === "suggestion")} />
      {page.children.length > 0 && !page.placed.children && (
        <section className="sh-sections" aria-label={home ? "Sections" : "In this section"}>
          <h2 className="sh-sections-title">{home ? "Sections" : "In this section"}</h2>
          <div className="sh-sections-grid">
            {page.children.map((child) => (
              <PageCard key={child.path} wikiId={wikiId} page={child} />
            ))}
          </div>
        </section>
      )}
      {home && index && <RecentlyUpdated wikiId={wikiId} index={index} />}
      {page.related.length > 0 && !page.placed.related && (
        <section className="sh-foot-block" aria-labelledby="sh-related-title">
          <h2 id="sh-related-title" className="sh-sections-title">
            Related
          </h2>
          <Related wikiId={wikiId} page={page} />
        </section>
      )}
      {ctx && <PageDiscussion threads={ctx.threads} />}
    </footer>
  );
}

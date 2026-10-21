// The bottom of a page, as on a wiki website: cards for the pages under it, what's new (home), what links here, its
// categories, the previous and next pages in sidebar order, and when it was last edited.
import { Link } from "react-router";
import type { PageData, PageEntry, PageLink } from "../../shared/api.ts";
import { PageDiscussion } from "../comments/PageDiscussion.tsx";
import { ago } from "../lib/time.ts";
import { Icon } from "../ui/index.ts";
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

function Neighbour({ wikiId, page, dir }: { wikiId: string; page: PageLink; dir: "prev" | "next" }) {
  return (
    <Link to={pageHref(wikiId, page.path)} className="sh-pager-link" data-dir={dir}>
      <span className="sh-pager-hint">
        {dir === "prev" && <Icon name="arrowLeft" size={12} />}
        {dir === "prev" ? "Previous" : "Next"}
        {dir === "next" && <Icon name="arrowRight" size={12} />}
      </span>
      <span className="sh-pager-title">
        <PageIcon icon={page.icon} className="sh-icon-gap" />
        {page.title}
      </span>
    </Link>
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

export function PageFoot({ wikiId, page, index }: { wikiId: string; page: PageData; index?: PageEntry[] }) {
  const home = page.path === "";
  const ctx = usePage();
  // Questions the page doesn't place itself collect here: open ones first.
  const unplaced = page.questions
    .filter((q) => !page.placed.questions.includes(q.id))
    .sort((a, b) => Number(a.status === "resolved") - Number(b.status === "resolved"));
  return (
    <footer className="sh-page-foot">
      {unplaced.length > 0 && (
        <section className="sh-foot-block" id="questions" aria-labelledby="sh-questions-title">
          <h2 id="sh-questions-title" className="sh-sections-title">
            Questions
          </h2>
          <div className="sh-question-list">
            {unplaced.map((q) => (
              <QuestionCard key={q.id} question={q} />
            ))}
          </div>
        </section>
      )}
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
      {ctx && <PageDiscussion threads={ctx.threads} />}
      {page.related.length > 0 && !page.placed.related && (
        <section className="sh-foot-block" aria-labelledby="sh-related-title">
          <h2 id="sh-related-title" className="sh-sections-title">
            Related
          </h2>
          <Related wikiId={wikiId} page={page} />
        </section>
      )}
      {page.backlinks.length > 0 && (
        <section className="sh-foot-block" aria-labelledby="sh-backlinks-title">
          <h2 id="sh-backlinks-title" className="sh-sections-title">
            What links here
          </h2>
          <div className="sh-chips">
            {page.backlinks.map((b) => (
              <PageChip key={b.path} wikiId={wikiId} page={b} />
            ))}
          </div>
        </section>
      )}
      {page.tags.length > 0 && (
        <nav className="sh-categories" aria-label="Categories">
          <Link to={specialHref(wikiId, "categories")} className="sh-categories-label">
            Categories
          </Link>
          {page.tags.map((tag) => (
            <Link key={tag} to={specialHref(wikiId, "categories", tag)} className="sh-category">
              {tag}
            </Link>
          ))}
        </nav>
      )}
      {(page.prev || page.next) && (
        <nav className="sh-pager" aria-label="Previous and next pages">
          {page.prev && <Neighbour wikiId={wikiId} page={page.prev} dir="prev" />}
          {page.next && <Neighbour wikiId={wikiId} page={page.next} dir="next" />}
        </nav>
      )}
      {page.updatedAt && (
        <p className="sh-last-edited">
          This page was last edited{" "}
          <time dateTime={page.updatedAt} title={new Date(page.updatedAt).toLocaleString()}>
            {ago(page.updatedAt)}
          </time>{" "}
          ({new Date(page.updatedAt).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" })})
          {page.file && (
            <>
              {" "}
              · <code>{page.file}</code>
            </>
          )}
        </p>
      )}
    </footer>
  );
}

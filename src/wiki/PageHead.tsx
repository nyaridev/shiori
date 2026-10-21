// The top of a page: where it sits in the wiki, its title, and what state it's in. A page with a `banner` gets a hero
// with that picture. (The home page has its own hero: home/HomeHero.tsx.)
import { Fragment } from "react";
import { Link } from "react-router";
import type { PageData, PageLink, WikiDetail } from "../../shared/api.ts";
import { picture } from "../lib/base.ts";
import { ago } from "../lib/time.ts";
import { Badge, Button, Icon } from "../ui/index.ts";
import { PageIcon } from "./PageIcon.tsx";
import { StatusBadge } from "./StatusBadge.tsx";

export const pageHref = (wikiId: string, path: string) => (path ? `/w/${wikiId}/${path}` : `/w/${wikiId}`);

/** A special page (ADR-0002): `/w/<wiki>/_/recent`, `/w/<wiki>/_/categories/<tag>`. */
export const specialHref = (wikiId: string, ...parts: string[]) =>
  `/w/${wikiId}/_/${parts.map(encodeURIComponent).join("/")}`;

export function Crumbs({ wikiId, trail }: { wikiId: string; trail: PageLink[] }) {
  return (
    <nav className="sh-crumbs" aria-label="Breadcrumb">
      <ol>
        {trail.map((step, i) => (
          <Fragment key={step.path}>
            {i > 0 && <Icon name="chevronRight" size={12} />}
            <li>
              {step.isPage ? (
                <Link to={pageHref(wikiId, step.path)}>
                  <PageIcon icon={step.icon} className="sh-icon-gap" />
                  {step.title}
                </Link>
              ) : (
                <span>{step.title}</span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}

function Meta({ page, wiki }: { page: PageData; wiki: WikiDetail }) {
  const openQuestions = page.questions.filter((q) => q.status === "open");
  const open = openQuestions.length;
  const firstOpen = openQuestions[0]?.id;
  const parts = [page.minutes && `${page.minutes} min read`].filter(Boolean);
  return (
    <div className="sh-page-meta">
      {page.type && <span className="sh-page-type">{page.type}</span>}
      {page.status && <StatusBadge status={page.status} />}
      {page.tags.map((tag) => (
        <Link key={tag} to={specialHref(wiki.id, "categories", tag)} className="sh-tag">
          #{tag}
        </Link>
      ))}
      {open > 0 && (
        <a href={page.placed.questions.length ? `#question-${firstOpen}` : "#questions"} className="sh-page-questions">
          <PageIcon icon="question" className="sh-icon-gap" />
          {open} open question{open === 1 ? "" : "s"}
        </a>
      )}
      {page.updatedAt && (
        <time dateTime={page.updatedAt} title={new Date(page.updatedAt).toLocaleString()}>
          Updated {ago(page.updatedAt)}
        </time>
      )}
      {parts.map((part) => (
        <span key={String(part)}>{part}</span>
      ))}
    </div>
  );
}

export function PageHead({
  wiki,
  page,
  problems,
  onProblems,
}: {
  wiki: WikiDetail;
  page: PageData;
  problems: number;
  onProblems: () => void;
}) {
  return (
    <header
      className="sh-page-head"
      data-hero={page.banner ? "" : undefined}
      data-banner={page.banner ? "" : undefined}
    >
      {page.banner && <img className="sh-hero-backdrop" src={picture(page.banner, 2400)} alt="" aria-hidden="true" />}
      {page.trail.length > 0 && <Crumbs wikiId={wiki.id} trail={page.trail} />}
      <div className="sh-page-heading">
        <div>
          <h1 className="sh-page-title">
            <PageIcon icon={page.icon} className="sh-page-icon" />
            {page.title}
          </h1>
          {page.summary && <p className="sh-page-summary">{page.summary}</p>}
          <Meta page={page} wiki={wiki} />
        </div>
      </div>
      {problems > 0 && (
        <Button size="sm" variant="ghost" onClick={onProblems}>
          <Badge tone="warn">{problems}</Badge> page problem{problems === 1 ? "" : "s"}
        </Button>
      )}
    </header>
  );
}

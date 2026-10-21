// The top of a page: where it sits in the wiki, its title, and what state it's in. The home page gets a hero with the
// wiki's cover art, and any page with a `banner` gets one with that picture.
import { Fragment } from "react";
import { Link } from "react-router";
import type { PageData, PageLink, WikiDetail } from "../../shared/api.ts";
import { picture } from "../lib/base.ts";
import { ago } from "../lib/time.ts";
import { Badge, Button, Icon } from "../ui/index.ts";
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
                  {step.icon && <span aria-hidden="true">{step.icon} </span>}
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
  const home = page.path === "";
  const openQuestions = page.questions.filter((q) => q.status === "open");
  const open = openQuestions.length;
  const firstOpen = openQuestions[0]?.id;
  const parts = [
    home && `${wiki.pages} page${wiki.pages === 1 ? "" : "s"}`,
    home && wiki.nav.length > 0 && `${wiki.nav.length} section${wiki.nav.length === 1 ? "" : "s"}`,
    page.minutes && `${page.minutes} min read`,
  ].filter(Boolean);
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
          ❓ {open} open question{open === 1 ? "" : "s"}
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
  const home = page.path === "";
  const backdrop = page.banner ?? (home ? wiki.coverUrl : undefined);
  return (
    <header className="sh-page-head" data-hero={backdrop ? "" : undefined} data-banner={page.banner ? "" : undefined}>
      {backdrop && <img className="sh-hero-backdrop" src={picture(backdrop, 2400)} alt="" aria-hidden="true" />}
      {page.trail.length > 0 && <Crumbs wikiId={wiki.id} trail={page.trail} />}
      <div className="sh-page-heading">
        {home && <img className="sh-hero-cover" src={picture(wiki.coverUrl, 480)} alt="" />}
        <div>
          <h1 className="sh-page-title">
            {page.icon && (
              <span className="sh-page-icon" aria-hidden="true">
                {page.icon}
              </span>
            )}
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

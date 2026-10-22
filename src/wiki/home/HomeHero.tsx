// The top of a wiki's home page, like a fandom wiki's front page: a framed banner of the wiki's picture (the page's
// `banner`, else its cover art) with its name, where the project stands and when it changed, and a few numbers that
// link to the lists behind them; under it, a bar of the ways in (the pinned pages, then the home's sections).
import { Link } from "react-router";
import type { PageData, PageLink, WikiDetail } from "../../../shared/api.ts";
import { isGuest, picture } from "../../lib/base.ts";
import { ago } from "../../lib/time.ts";
import { Badge, Button, Icon } from "../../ui/index.ts";
import { historyHref } from "../history/HistoryPage.tsx";
import { pageHref, specialHref } from "../PageHead.tsx";
import { PageIcon } from "../PageIcon.tsx";
import { StatusBadge } from "../StatusBadge.tsx";
import { useWikiIndex } from "../WikiIndexContext.ts";
import { GitBadge } from "./GitBadge.tsx";
import "./home.css";

/** How many ways in the bar shows. */
const WAYS_IN = 4;

export function HomeHero({
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
  const index = useWikiIndex()?.index;
  const open = index?.questions.filter((q) => q.status === "open" && q.kind === "question").length;
  const tasks = index?.tasks;
  const done = tasks?.filter((t) => t.done).length ?? 0;
  const stats: { value: number | string; label: string; to: string }[] = [
    { value: wiki.pages, label: `Page${wiki.pages === 1 ? "" : "s"}`, to: specialHref(wiki.id, "pages") },
  ];
  if (open !== undefined)
    stats.push({ value: open, label: `Open question${open === 1 ? "" : "s"}`, to: specialHref(wiki.id, "questions") });
  if (tasks?.length)
    stats.push({ value: `${done}/${tasks.length}`, label: "Tasks done", to: specialHref(wiki.id, "tasks") });
  const ways: PageLink[] = [...wiki.pinned];
  for (const child of page.children) if (child.isPage && !ways.some((w) => w.path === child.path)) ways.push(child);
  const summary = page.summary || wiki.tagline;

  return (
    <header className="sh-hero-banner">
      <div className="sh-hero-banner-art">
        <img src={picture(page.banner ?? wiki.coverUrl, 2400)} alt="" aria-hidden="true" />
        <div className="sh-hero-banner-text">
          {(page.status || page.updatedAt) && (
            <p className="sh-home-pill">
              {page.status && <StatusBadge status={page.status} />}
              {page.status && page.updatedAt && <span aria-hidden="true">/</span>}
              {page.updatedAt && (
                <Link to={historyHref(wiki.id, "")} className="sh-home-pill-link" title="The home page's history">
                  <time dateTime={page.updatedAt}>Updated {ago(page.updatedAt)}</time>
                </Link>
              )}
            </p>
          )}
          <h1 className="sh-home-title">
            <PageIcon icon={page.icon} />
            {page.title}
          </h1>
          {summary && <p className="sh-home-summary">{summary}</p>}
        </div>
        <div className="sh-hero-banner-stats">
          {stats.map((s) => (
            <Link key={s.label} to={s.to} className="sh-home-stat">
              <span className="sh-home-stat-value">{s.value}</span>
              <span className="sh-home-stat-label">{s.label}</span>
            </Link>
          ))}
        </div>
      </div>
      {(ways.length > 0 || problems > 0 || !isGuest) && (
        <div className="sh-hero-banner-bar">
          {ways.length > 0 && (
            <nav className="sh-home-actions" aria-label="Start here">
              {ways.slice(0, WAYS_IN).map((p, i) => (
                <Link
                  key={p.path}
                  to={pageHref(wiki.id, p.path)}
                  className="sh-home-action"
                  data-primary={i === 0 || undefined}
                >
                  <PageIcon icon={p.icon} fallback="page" />
                  {p.title}
                  <Icon name="arrowRight" size={14} />
                </Link>
              ))}
            </nav>
          )}
          <div className="sh-hero-banner-end">
            {problems > 0 && (
              <Button size="sm" variant="ghost" onClick={onProblems}>
                <Badge tone="warn">{problems}</Badge> page problem{problems === 1 ? "" : "s"}
              </Button>
            )}
            {!isGuest && <GitBadge wikiId={wiki.id} />}
          </div>
        </div>
      )}
    </header>
  );
}

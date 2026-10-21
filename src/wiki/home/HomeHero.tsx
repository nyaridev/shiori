// The top of a wiki's home page, in home mode: the wiki's picture (the page's `banner`, else its cover art) behind its
// name, where the project stands and when it changed, a few numbers that link to the lists behind them, and the
// pages the wiki pins as the ways in.
import { Link } from "react-router";
import type { PageData, WikiDetail } from "../../../shared/api.ts";
import { picture } from "../../lib/base.ts";
import { ago } from "../../lib/time.ts";
import { Badge, Button, Icon } from "../../ui/index.ts";
import { pageHref, specialHref } from "../PageHead.tsx";
import { PageIcon } from "../PageIcon.tsx";
import { StatusBadge } from "../StatusBadge.tsx";
import { useWikiIndex } from "../WikiIndexContext.ts";
import "./home.css";

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
  const open = index?.questions.filter((q) => q.status === "open").length;
  const tasks = index?.tasks;
  const done = tasks?.filter((t) => t.done).length ?? 0;
  const stats: { value: number | string; label: string; to: string }[] = [
    { value: wiki.pages, label: `Page${wiki.pages === 1 ? "" : "s"}`, to: specialHref(wiki.id, "pages") },
  ];
  if (open !== undefined)
    stats.push({ value: open, label: `Open question${open === 1 ? "" : "s"}`, to: specialHref(wiki.id, "questions") });
  if (tasks?.length)
    stats.push({ value: `${done}/${tasks.length}`, label: "Tasks done", to: specialHref(wiki.id, "tasks") });
  return (
    <header className="sh-home-hero">
      <img className="sh-home-backdrop" src={picture(page.banner ?? wiki.coverUrl, 2400)} alt="" aria-hidden="true" />
      {(page.status || page.updatedAt) && (
        <p className="sh-home-pill">
          {page.status && <StatusBadge status={page.status} />}
          {page.status && page.updatedAt && <span aria-hidden="true">/</span>}
          {page.updatedAt && <time dateTime={page.updatedAt}>Updated {ago(page.updatedAt)}</time>}
        </p>
      )}
      <h1 className="sh-home-title">
        <PageIcon icon={page.icon} />
        {page.title}
      </h1>
      {(page.summary || wiki.tagline) && <p className="sh-home-summary">{page.summary || wiki.tagline}</p>}
      {stats.length > 0 && (
        <div className="sh-home-stats">
          {stats.map((s) => (
            <Link key={s.label} to={s.to} className="sh-home-stat">
              <span className="sh-home-stat-value">{s.value}</span>
              <span className="sh-home-stat-label">{s.label}</span>
            </Link>
          ))}
        </div>
      )}
      {wiki.pinned.length > 0 && (
        <nav className="sh-home-actions" aria-label="Start here">
          {wiki.pinned.slice(0, 3).map((p, i) => (
            <Link
              key={p.path}
              to={pageHref(wiki.id, p.path)}
              className="sh-home-action"
              data-primary={i === 0 || undefined}
            >
              <PageIcon icon={p.icon} />
              {p.title}
              <Icon name="arrowRight" size={14} />
            </Link>
          ))}
        </nav>
      )}
      {problems > 0 && (
        <Button size="sm" variant="ghost" onClick={onProblems}>
          <Badge tone="warn">{problems}</Badge> page problem{problems === 1 ? "" : "s"}
        </Button>
      )}
    </header>
  );
}

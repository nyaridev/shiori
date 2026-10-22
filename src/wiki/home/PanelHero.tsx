// The top of a panel page (`panel: true`), in place of the page head: the home page's banner, made for one page. Its
// picture is the page's `banner`, else a wash of the wiki's accent; beside the name, the numbers of its roadmap and its
// infobox rows.
import { useMemo } from "react";
import { Link } from "react-router";
import type { PageData, WikiDetail } from "../../../shared/api.ts";
import { picture } from "../../lib/base.ts";
import { ago } from "../../lib/time.ts";
import { Badge, Button } from "../../ui/index.ts";
import { historyHref } from "../history/HistoryPage.tsx";
import { Markdown } from "../markdown/Markdown.tsx";
import { PageIcon } from "../PageIcon.tsx";
import { roadmapSummary, versionLabel } from "../roadmap/model.ts";
import { StatusBadge } from "../StatusBadge.tsx";
import "./home.css";

export function PanelHero({
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
  const roadmap = useMemo(() => roadmapSummary(page.hast), [page.hast]);
  return (
    <header className="sh-hero-banner sh-panel-hero">
      <div className="sh-hero-banner-art" data-plain={page.banner ? undefined : ""}>
        {page.banner && <img src={picture(page.banner, 2400)} alt="" aria-hidden="true" />}
        <div className="sh-hero-banner-text">
          {(page.status || page.updatedAt) && (
            <div className="sh-home-pills">
              <p className="sh-home-pill">
                {page.status && <StatusBadge status={page.status} />}
                {page.status && page.updatedAt && <span aria-hidden="true">/</span>}
                {page.updatedAt && (
                  <Link to={historyHref(wiki.id, page.path)} className="sh-home-pill-link" title="This page's history">
                    <time dateTime={page.updatedAt}>Updated {ago(page.updatedAt)}</time>
                  </Link>
                )}
              </p>
            </div>
          )}
          <h1 className="sh-home-title">
            <PageIcon icon={page.icon} />
            {page.title}
          </h1>
          {page.summary && <p className="sh-home-summary">{page.summary}</p>}
        </div>
        {(roadmap || page.infobox?.rows.length) && (
          <div className="sh-hero-banner-stats">
            {roadmap && (
              <>
                <div className="sh-home-stat" data-now="">
                  <span className="sh-home-stat-value">
                    {roadmap.now.title}
                    {roadmap.now.version && (
                      <span className="sh-panel-version">{versionLabel(roadmap.now.version)}</span>
                    )}
                  </span>
                  <span className="sh-home-stat-label">{roadmap.now.status === "done" ? "Last done" : "Now"}</span>
                </div>
                <div className="sh-home-stat">
                  <span className="sh-home-stat-value">
                    {roadmap.shipped}/{roadmap.milestones}
                  </span>
                  <span className="sh-home-stat-label">Milestones done</span>
                </div>
                {roadmap.total > 0 && (
                  <div className="sh-home-stat">
                    <span className="sh-home-stat-value">
                      {roadmap.done}/{roadmap.total}
                    </span>
                    <span className="sh-home-stat-label">Tasks done</span>
                  </div>
                )}
              </>
            )}
            {page.infobox?.rows.map((row) => (
              <div key={row.label} className="sh-home-stat">
                <span className="sh-home-stat-value">
                  <Markdown hast={row.value} />
                </span>
                <span className="sh-home-stat-label">{row.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {problems > 0 && (
        <div className="sh-hero-banner-bar">
          <div className="sh-hero-banner-end">
            <Button size="sm" variant="ghost" onClick={onProblems}>
              <Badge tone="warn">{problems}</Badge> page problem{problems === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}

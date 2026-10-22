// A page's history (ADR-0008) at `/w/<wiki>/_/history/<page>`: every commit that changed the page, from git on the
// owner's PC, and for the one picked (`?v=<hash>`) what it changed, what changed since, or the page as it was then.
import { useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import type { PageData, PageHistory, PageVersion, WikiDetail } from "../../../shared/api.ts";
import type { Threads } from "../../comments/useThreads.ts";
import { api } from "../../lib/api.ts";
import { isGuest } from "../../lib/base.ts";
import { useLive } from "../../lib/live.ts";
import { ago } from "../../lib/time.ts";
import { useResource } from "../../lib/useResource.ts";
import { Callout, Icon, Segmented } from "../../ui/index.ts";
import { Markdown } from "../markdown/Markdown.tsx";
import { sectioned } from "../markdown/sections.ts";
import { PageContext, type PageInfo } from "../PageContext.ts";
import { Crumbs, pageHref, specialHref } from "../PageHead.tsx";
import { PageIcon } from "../PageIcon.tsx";
import { PageInfobox } from "../PageInfobox.tsx";
import { Churn, DiffView } from "./DiffView.tsx";
import "./history.css";

export const historyHref = (wikiId: string, path: string, version?: string, view?: string) => {
  const query = new URLSearchParams();
  if (version) query.set("v", version);
  if (view && view !== "changes") query.set("view", view);
  const q = query.toString();
  return `/w/${wikiId}/_/history${path ? `/${path}` : ""}${q ? `?${q}` : ""}`;
};

type View = "changes" | "then" | "since";
const WORKING = "working";

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function Versions({
  wikiId,
  path,
  history,
  current,
  view,
}: {
  wikiId: string;
  path: string;
  history: PageHistory;
  current: string;
  /** Kept when another version is picked. */
  view: View;
}) {
  return (
    <ol className="sh-history-list" aria-label="Versions">
      {history.uncommitted && (
        <li>
          <Link
            to={historyHref(wikiId, path, WORKING)}
            className="sh-history-item"
            data-working=""
            aria-current={current === WORKING ? "true" : undefined}
          >
            <span className="sh-history-dot" aria-hidden="true" />
            <span className="sh-history-subject">{history.tracked ? "Not committed yet" : "Never committed"}</span>
            <span className="sh-history-meta">Changes in the file on this PC</span>
          </Link>
        </li>
      )}
      {history.versions.map((v, i) => (
        <li key={v.hash}>
          <Link
            to={historyHref(wikiId, path, v.hash, view)}
            className="sh-history-item"
            aria-current={current === v.hash ? "true" : undefined}
          >
            <span className="sh-history-dot" aria-hidden="true" />
            <span className="sh-history-subject">{v.subject || "(no message)"}</span>
            <span className="sh-history-meta">
              <span>{v.author}</span>
              <time dateTime={v.date} title={when(v.date)}>
                {ago(v.date)}
              </time>
              <Churn added={v.added} removed={v.removed} />
              {i === history.versions.length - 1 && !history.more && <span>Created</span>}
            </span>
          </Link>
        </li>
      ))}
      {history.more && <li className="sh-history-more">Older versions aren't listed.</li>}
    </ol>
  );
}

/** The page as it was, read-only: no comments, answers or folds that would land on today's page. */
function PageThen({ wikiId, page }: { wikiId: string; page: PageData }) {
  const body = useMemo(() => sectioned(page.hast), [page.hast]);
  const context = useMemo<PageInfo>(
    () => ({
      wikiId,
      page,
      answers: [],
      answer: async () => {},
      hideAnswer: async () => {},
      threads: { wikiId, threads: [] } as unknown as Threads,
      activate: () => {},
      changed: new Set(),
      readOnly: true,
    }),
    [wikiId, page],
  );
  return (
    <PageContext.Provider value={context}>
      <article className="sh-history-then">
        <h2 className="sh-history-then-title">
          <PageIcon icon={page.icon} className="sh-icon-gap" />
          {page.title}
        </h2>
        {page.summary && <p className="sh-page-summary">{page.summary}</p>}
        <div className="sh-prose">
          <PageInfobox page={page} />
          <Markdown hast={body} />
        </div>
      </article>
    </PageContext.Provider>
  );
}

function Version({
  wiki,
  path,
  id,
  view,
  onView,
  commitUrl,
}: {
  wiki: WikiDetail;
  path: string;
  id: string;
  view: View;
  onView: (v: View) => void;
  commitUrl?: string;
}) {
  const detail = useResource(`version:${wiki.id}:${path}:${id}`, () => api.version(wiki.id, path, id));
  if (detail.error) return <p className="sh-special-empty">This version can't be shown: {detail.error.message}</p>;
  if (!detail.data) return <p className="sh-special-empty">Loading…</p>;
  const { version, changes, sinceThen, page } = detail.data;
  const shown: View = !version && view !== "changes" ? "changes" : view;
  return (
    <section className="sh-history-version" aria-label="Version">
      <header className="sh-history-version-head">
        <div>
          <h2 className="sh-history-version-title">
            {version ? version.subject || "(no message)" : "Not committed yet"}
          </h2>
          <p className="sh-history-meta">
            {version ? (
              <>
                <span>{version.author}</span>
                <time dateTime={version.date}>{when(version.date)}</time>
                {commitUrl ? (
                  <a
                    href={`${commitUrl}/${version.hash}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="sh-history-hash"
                  >
                    {version.short}
                    <Icon name="arrowRight" size={12} />
                  </a>
                ) : (
                  <code className="sh-history-hash">{version.short}</code>
                )}
              </>
            ) : (
              <span>The page file on this PC, against its last commit.</span>
            )}
            <Churn added={changes.added} removed={changes.removed} />
          </p>
        </div>
        {version && (
          <Segmented<View>
            value={shown}
            onChange={onView}
            options={[
              { value: "changes", label: "What changed" },
              { value: "then", label: "The page then" },
              { value: "since", label: "Since then" },
            ]}
          />
        )}
      </header>
      {shown === "changes" && <DiffView diff={changes} empty="This commit didn't change the page's text." />}
      {shown === "since" && sinceThen && (
        <DiffView diff={sinceThen} empty="The page hasn't changed since this version." />
      )}
      {shown === "then" && (
        <>
          <Callout tone="note" title={`The page as it was ${version ? `on ${when(version.date)}` : ""}`}>
            Links and pictures point at the wiki as it is now.{" "}
            <Link to={pageHref(wiki.id, path)}>Read the page today</Link>
          </Callout>
          <PageThen wikiId={wiki.id} page={page} />
        </>
      )}
    </section>
  );
}

export function HistoryPage({ wiki, path }: { wiki: WikiDetail; path: string }) {
  const [params, setParams] = useSearchParams();
  const page = useResource(`page:${wiki.id}:${path}`, () => api.page(wiki.id, path));
  const history = useResource(`history:${wiki.id}:${path}`, () => api.history(wiki.id, path));
  // Only the owner learns where the repo is online, for links to each commit.
  const git = useResource(isGuest ? null : `git:${wiki.id}`, () => api.git(wiki.id));
  const { reload } = history;
  useLive((e) => {
    if ((e.type === "git" || e.type === "pages") && e.wiki === wiki.id) reload();
  });

  const title = page.data?.title ?? "Page";
  useEffect(() => {
    document.title = `History of ${title} · ${wiki.title}`;
  }, [title, wiki.title]);

  const h = history.data;
  const first: string | undefined = h?.uncommitted ? WORKING : h?.versions[0]?.hash;
  const asked = params.get("v");
  const known = (v: string | null): v is string =>
    !!v && !!h && ((v === WORKING && h.uncommitted) || h.versions.some((x: PageVersion) => x.hash === v));
  const current = known(asked) ? asked : first;
  const view = (["changes", "then", "since"] as const).find((v) => v === params.get("view")) ?? "changes";
  const onView = (v: View) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      if (current) next.set("v", current);
      if (v === "changes") next.delete("view");
      else next.set("view", v);
      return next;
    });

  const trail = [...(page.data?.trail ?? []), ...(page.data ? [{ ...page.data, isPage: true }] : [])];
  const count = h ? h.versions.length + (h.more ? "+" : "") : null;
  return (
    <main className="sh-wiki-main sh-special sh-history" data-path={`_/history/${path}`}>
      <header className="sh-page-head">
        <Crumbs wikiId={wiki.id} trail={trail} />
        <p className="sh-special-kicker">History</p>
        <h1 className="sh-page-title">
          <PageIcon icon="clock" className="sh-page-icon" />
          History of {title}
        </h1>
        <p className="sh-page-summary">
          {h?.git
            ? `${count} version${h.versions.length === 1 && !h.more ? "" : "s"} from git, newest first. `
            : "Every commit that changes this page shows here, from git. "}
          <Link to={pageHref(wiki.id, path)}>Back to the page</Link>
          {" · "}
          <Link to={specialHref(wiki.id, "recent")}>Recent changes</Link>
        </p>
      </header>
      {page.error && <p className="sh-special-empty">There's no page here: {page.error.message}</p>}
      {history.error && <p className="sh-special-empty">The history can't be read: {history.error.message}</p>}
      {!h && !history.error && <p className="sh-special-empty">Loading…</p>}
      {h && !h.git && (
        <Callout tone="note" title="This wiki isn't in git">
          Pages get a history once the wiki's folder is in a git repo: every commit that changes this page shows here,
          with what it changed and the page as it was.
        </Callout>
      )}
      {h?.git && !current && <p className="sh-special-empty">This page hasn't been committed yet.</p>}
      {h?.git && current && (
        <div className="sh-history-body">
          <Versions wikiId={wiki.id} path={path} history={h} current={current} view={view} />
          <Version
            key={current}
            wiki={wiki}
            path={path}
            id={current}
            view={view}
            onView={onView}
            commitUrl={git.data?.remote?.commitUrl}
          />
        </div>
      )}
    </main>
  );
}

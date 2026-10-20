import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import type { PageData } from "../../shared/api.ts";
import { type Anchors, CommentLayer } from "../comments/CommentLayer.tsx";
import { ThreadList } from "../comments/ThreadList.tsx";
import { useThreads } from "../comments/useThreads.ts";
import { api } from "../lib/api.ts";
import { useLive } from "../lib/live.ts";
import { useResource } from "../lib/useResource.ts";
import { useTheme } from "../lib/useTheme.ts";
import { Badge, Button, Callout, IconButton } from "../ui/index.ts";
import { Markdown } from "./markdown/Markdown.tsx";
import { Sidebar } from "./Sidebar.tsx";
import { Toc } from "./Toc.tsx";
import "./wiki.css";

export function WikiLayout() {
  const { wikiId = "", "*": splat = "" } = useParams();
  const path = splat.replace(/\/$/, "");
  const location = useLocation();
  const fromDeck = (location.state as { fromDeck?: boolean } | null)?.fromDeck ?? false;

  const wiki = useResource(`wiki:${wikiId}`, () => api.wiki(wikiId));
  const page = useResource(`page:${wikiId}:${path}`, () => api.page(wikiId, path));
  const { reload: reloadWiki } = wiki;
  const { reload: reloadPage } = page;
  useLive((e) => {
    if (e.type === "wikis" || (e.type === "pages" && e.wiki === wikiId)) reloadWiki();
    if (e.type === "pages" && e.wiki === wikiId) reloadPage();
  });
  useTheme(wiki.data?.theme);

  const [navOpen, setNavOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);

  useEffect(() => {
    if (wiki.data) document.title = page.data?.path ? `${page.data.title} · ${wiki.data.title}` : wiki.data.title;
  }, [wiki.data, page.data]);

  // New page: back to the top, or to the #section in the URL.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the page itself changes.
  useEffect(() => {
    if (!page.data) return;
    const target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) target.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [page.data?.path]);

  if (wiki.error) {
    return (
      <div className="ld-wiki-missing">
        <p>This wiki isn't available: {wiki.error.message}</p>
        <Link to="/">Back to the deck</Link>
      </div>
    );
  }
  const ready = Boolean(wiki.data && (page.data || page.error));

  return (
    <div className="ld-wiki">
      {wiki.data && (
        <>
          <div className="ld-wiki-sidebar" data-open={navOpen || undefined}>
            <Sidebar wiki={wiki.data} onNavigate={() => setNavOpen(false)} />
          </div>
          {navOpen && (
            <button type="button" className="ld-scrim" aria-label="Close menu" onClick={() => setNavOpen(false)} />
          )}
          <div className="ld-wiki-mobilebar">
            <IconButton icon="menu" label="Pages" onClick={() => setNavOpen(true)} />
            <span>{wiki.data.title}</span>
            <IconButton icon="comment" label="Comments" onClick={() => setRailOpen((o) => !o)} />
          </div>
        </>
      )}
      {page.error && wiki.data && (
        <main className="ld-wiki-main">
          <h1 className="ld-page-title">Page not found</h1>
          <p className="ld-page-summary">There's no page at "{path}".</p>
          <Link to={`/w/${wikiId}`}>Go to the home page</Link>
        </main>
      )}
      {page.data && wiki.data && (
        <PageArea
          key={`${wikiId}:${path}`}
          wikiId={wikiId}
          path={path}
          page={page.data}
          problems={[...wiki.data.problems, ...page.data.problems]}
          railOpen={railOpen}
          onCloseRail={() => setRailOpen(false)}
        />
      )}
      <motion.div
        className="ld-wiki-curtain"
        initial={{ opacity: fromDeck ? 1 : 0 }}
        animate={{ opacity: ready ? 0 : fromDeck ? 1 : 0 }}
        transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
      />
    </div>
  );
}

function PageArea({
  wikiId,
  path,
  page,
  problems,
  railOpen,
  onCloseRail,
}: {
  wikiId: string;
  path: string;
  page: PageData;
  problems: string[];
  railOpen: boolean;
  onCloseRail: () => void;
}) {
  const article = useRef<HTMLDivElement>(null);
  const threads = useThreads(wikiId, path);
  const [active, setActive] = useState<number | null>(null);
  const [anchors, setAnchors] = useState<Anchors>(new Map());
  const [showProblems, setShowProblems] = useState(false);
  const onAnchors = useCallback((a: Anchors) => setAnchors(a), []);

  return (
    <>
      <main className="ld-wiki-main">
        <header className="ld-page-head">
          <h1 className="ld-page-title">{page.title}</h1>
          {page.summary && <p className="ld-page-summary">{page.summary}</p>}
          {problems.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setShowProblems((s) => !s)}>
              <Badge tone="warn">{problems.length}</Badge> page problem{problems.length === 1 ? "" : "s"}
            </Button>
          )}
        </header>
        {showProblems && (
          <Callout tone="warning" title="Problems (for the agent: run pnpm wiki check)">
            <ul>
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </Callout>
        )}
        <div ref={article} className="ld-prose">
          <Markdown hast={page.hast} />
        </div>
        <CommentLayer
          container={article}
          contentKey={page.hast}
          threads={threads}
          active={active}
          onActivate={setActive}
          onAnchors={onAnchors}
        />
      </main>
      <aside className="ld-wiki-rail" data-open={railOpen || undefined}>
        <div className="ld-wiki-rail-close">
          <IconButton icon="close" label="Close comments" size="sm" onClick={onCloseRail} />
        </div>
        <Toc entries={page.toc} />
        <ThreadList threads={threads} anchors={anchors} active={active} onActivate={setActive} />
      </aside>
    </>
  );
}

// One page of a wiki: its head, the article (where comments anchor), its foot, and the rail (PageRail.tsx) with the
// contents and comment threads. The home page has a banner instead of the head and its boxes in columns; its rail is a drawer.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";
import type { PageData, PageEntry, WikiDetail } from "../../shared/api.ts";
import { isPageComment } from "../../shared/quote.ts";
import { type Anchors, CommentLayer } from "../comments/CommentLayer.tsx";
import { scrollToRange } from "../comments/ThreadList.tsx";
import { useThreads } from "../comments/useThreads.ts";
import { Callout } from "../ui/index.ts";
import { HomeBoxesContext } from "./home/blocks.tsx";
import { HomeHero } from "./home/HomeHero.tsx";
import { LayoutView } from "./layout/LayoutView.tsx";
import { Markdown } from "./markdown/Markdown.tsx";
import { sectioned } from "./markdown/sections.ts";
import { PageContext } from "./PageContext.ts";
import { PageFoot } from "./PageFoot.tsx";
import { PageHead } from "./PageHead.tsx";
import { PageInfobox } from "./PageInfobox.tsx";
import { PageRail } from "./PageRail.tsx";
import { useAnswers } from "./questions/useAnswers.ts";
import { usePageChanges } from "./seen.ts";
import "./page.css";

export function PageArea({
  wiki,
  path,
  page,
  index,
  problems,
  railOpen,
  onOpenRail,
  onCloseRail,
}: {
  wiki: WikiDetail;
  path: string;
  page: PageData;
  /** The wiki's page index, once loaded (for "Recently updated"). */
  index?: PageEntry[];
  problems: string[];
  railOpen: boolean;
  onOpenRail: () => void;
  onCloseRail: () => void;
}) {
  const article = useRef<HTMLDivElement>(null);
  const threads = useThreads(wiki.id, path);
  const [active, setActive] = useState<number | null>(null);
  // The comment under the pointer in the rail: its text lights up on the page.
  const [hovered, setHovered] = useState<number | null>(null);
  const [anchors, setAnchors] = useState<Anchors>(new Map());
  const [showProblems, setShowProblems] = useState(false);
  const onAnchors = useCallback((a: Anchors) => setAnchors(a), []);
  const { answers, answer, hide: hideAnswer } = useAnswers(wiki.id, path);
  const changed = usePageChanges(wiki.id, page);

  // `#comment-12` (from search, or a shared link): open that comment and bring its text into view, once found.
  const { hash } = useLocation();
  const linked = /^#comment-(\d+)$/.exec(hash)?.[1];
  const shownLink = useRef<string | null>(null);
  useEffect(() => {
    if (!linked || shownLink.current === hash) return;
    const thread = threads.threads.find((t) => t.id === Number(linked));
    // Comments on the whole page sit in the Changes panel at the bottom.
    if (thread && isPageComment(thread.quote)) {
      shownLink.current = hash;
      document.getElementById("changes")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    if (!anchors.has(Number(linked))) return;
    shownLink.current = hash;
    setActive(Number(linked));
    onOpenRail();
    scrollToRange(anchors.get(Number(linked)));
  }, [hash, linked, anchors, onOpenRail, threads.threads]);
  const activate = useCallback(
    (id: number) => {
      setActive(id);
      onOpenRail();
    },
    [onOpenRail],
  );
  const context = useMemo(
    () => ({ wikiId: wiki.id, page, answers, answer, hideAnswer, threads, activate, changed }),
    [wiki.id, page, answers, answer, hideAnswer, threads, activate, changed],
  );

  // Each `##` section shows as a panel (a layout places them itself).
  const body = useMemo(() => sectioned(page.hast), [page.hast]);
  const home = path === "";
  const onProblems = () => setShowProblems((s) => !s);
  return (
    <PageContext.Provider value={context}>
      <main className="sh-wiki-main" data-path={path} data-home={home || undefined}>
        {home ? (
          <HomeHero wiki={wiki} page={page} problems={problems.length} onProblems={onProblems} />
        ) : (
          <PageHead wiki={wiki} page={page} problems={problems.length} onProblems={onProblems} changed={changed} />
        )}
        <div className="sh-page-body">
          {showProblems && (
            <Callout tone="warning" title="Problems (for the agent: run pnpm wiki check)">
              <ul>
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </Callout>
          )}
          {page.layout ? (
            // The wiki's layout arranges the page's parts (ADR-0006); comments anchor in all of them.
            <div ref={article} data-article="">
              <LayoutView wiki={wiki} page={page} layout={page.layout} />
            </div>
          ) : (
            <div ref={article} className="sh-prose" data-article="">
              <PageInfobox page={page} />
              <HomeBoxesContext.Provider value={home}>
                <Markdown hast={body} />
              </HomeBoxesContext.Provider>
            </div>
          )}
          <CommentLayer
            container={article}
            contentKey={page.hast}
            threads={threads}
            active={active}
            hovered={hovered}
            onActivate={setActive}
            onAnchors={onAnchors}
          />
          <PageFoot wikiId={wiki.id} page={page} index={index} />
        </div>
      </main>
      <PageRail
        wikiId={wiki.id}
        toc={page.toc}
        threads={threads}
        anchors={anchors}
        active={active}
        onActivate={setActive}
        onHover={setHovered}
        open={railOpen}
        onClose={onCloseRail}
      />
    </PageContext.Provider>
  );
}

// One page of a wiki: its head, the article (where comments anchor), its foot, and the rail with the contents and
// comment threads.
import { useCallback, useMemo, useRef, useState } from "react";
import type { PageData, PageEntry, WikiDetail } from "../../shared/api.ts";
import { type Anchors, CommentLayer } from "../comments/CommentLayer.tsx";
import { ThreadList } from "../comments/ThreadList.tsx";
import { useThreads } from "../comments/useThreads.ts";
import { Callout, IconButton, ScrollArea } from "../ui/index.ts";
import { Markdown } from "./markdown/Markdown.tsx";
import { PageContext } from "./PageContext.ts";
import { PageFoot } from "./PageFoot.tsx";
import { PageHead } from "./PageHead.tsx";
import { PageInfobox } from "./PageInfobox.tsx";
import { useAnswers } from "./questions/useAnswers.ts";
import { Toc } from "./Toc.tsx";
import "./page.css";

export function PageArea({
  wiki,
  path,
  page,
  index,
  problems,
  railOpen,
  onCloseRail,
}: {
  wiki: WikiDetail;
  path: string;
  page: PageData;
  /** The wiki's page index, once loaded (for "Recently updated"). */
  index?: PageEntry[];
  problems: string[];
  railOpen: boolean;
  onCloseRail: () => void;
}) {
  const article = useRef<HTMLDivElement>(null);
  const threads = useThreads(wiki.id, path);
  const [active, setActive] = useState<number | null>(null);
  const [anchors, setAnchors] = useState<Anchors>(new Map());
  const [showProblems, setShowProblems] = useState(false);
  const onAnchors = useCallback((a: Anchors) => setAnchors(a), []);
  const { answers, answer } = useAnswers(wiki.id, path);
  const context = useMemo(() => ({ wikiId: wiki.id, page, answers, answer }), [wiki.id, page, answers, answer]);

  return (
    <PageContext.Provider value={context}>
      <main className="sh-wiki-main" data-path={path}>
        <PageHead wiki={wiki} page={page} problems={problems.length} onProblems={() => setShowProblems((s) => !s)} />
        {showProblems && (
          <Callout tone="warning" title="Problems (for the agent: run pnpm wiki check)">
            <ul>
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </Callout>
        )}
        <div ref={article} className="sh-prose">
          <PageInfobox page={page} />
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
        <PageFoot wikiId={wiki.id} page={page} index={index} />
      </main>
      <ScrollArea as="aside" className="sh-wiki-rail" data-open={railOpen || undefined}>
        <div className="sh-wiki-rail-close">
          <IconButton icon="close" label="Close comments" size="sm" onClick={onCloseRail} />
        </div>
        <Toc entries={page.toc} />
        <ThreadList threads={threads} anchors={anchors} active={active} onActivate={setActive} />
      </ScrollArea>
    </PageContext.Provider>
  );
}

// The rail beside a page, quiet, as part of the page: its contents (Toc.tsx), and a small pill that swaps them for the
// comments on its text (ThreadList.tsx) and back. The comments come up once one opens on the page. A page without
// contents to swap with shows its comments.
import { useEffect, useMemo, useState } from "react";
import type { TocEntry } from "../../shared/api.ts";
import { isPageComment } from "../../shared/quote.ts";
import type { Anchors } from "../comments/CommentLayer.tsx";
import { ThreadList } from "../comments/ThreadList.tsx";
import type { Threads } from "../comments/useThreads.ts";
import { Icon, IconButton, ScrollArea } from "../ui/index.ts";
import { Toc } from "./Toc.tsx";

export function PageRail({
  wikiId,
  toc,
  threads,
  anchors,
  active,
  onActivate,
  onHover,
  open,
  onClose,
}: {
  wikiId: string;
  toc: TocEntry[];
  threads: Threads;
  anchors: Anchors;
  active: number | null;
  onActivate: (id: number | null) => void;
  onHover: (id: number | null) => void;
  /** Open as a drawer (narrow screens, the home page). */
  open: boolean;
  onClose: () => void;
}) {
  const [view, setView] = useState<"toc" | "comments">("toc");
  useEffect(() => {
    if (active !== null) setView("comments");
  }, [active]);
  const swaps = toc.length >= 2;
  const waiting = useMemo(
    () => threads.threads.filter((t) => t.status === "open" && !isPageComment(t.quote)).length,
    [threads.threads],
  );

  return (
    <ScrollArea as="aside" className="sh-wiki-rail" data-open={open || undefined}>
      <div className="sh-wiki-rail-close">
        <IconButton icon="close" label="Close comments" size="sm" onClick={onClose} />
      </div>
      {swaps && (
        <button type="button" className="sh-rail-pill" onClick={() => setView(view === "toc" ? "comments" : "toc")}>
          {view === "toc" ? (
            <>
              <Icon name="comment" size={14} />
              {waiting ? `${waiting} open comment${waiting === 1 ? "" : "s"}` : "Comments"}
            </>
          ) : (
            <>
              <Icon name="arrowLeft" size={14} />
              Contents
            </>
          )}
        </button>
      )}
      {swaps && view === "toc" && <Toc wikiId={wikiId} entries={toc} />}
      {(!swaps || view === "comments") && (
        <ThreadList threads={threads} anchors={anchors} active={active} onActivate={onActivate} onHover={onHover} />
      )}
    </ScrollArea>
  );
}

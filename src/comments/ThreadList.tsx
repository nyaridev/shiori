import { useEffect, useRef, useState } from "react";
import type { Thread } from "../../shared/api.ts";
import { isPageComment } from "../../shared/quote.ts";
import { canComment, useGuest } from "../guest/GuestContext.ts";
import { Icon, Segmented } from "../ui/index.ts";
import { RailSection } from "../wiki/RailSection.tsx";
import type { Anchors } from "./CommentLayer.tsx";
import { ThreadCard } from "./ThreadCard.tsx";
import type { Threads } from "./useThreads.ts";

type Filter = "open" | "closed";

export function scrollToRange(range: Range | null | undefined) {
  const r = range?.getBoundingClientRect();
  if (r && (r.width || r.height))
    window.scrollTo({ top: window.scrollY + r.top - window.innerHeight / 3, behavior: "smooth" });
}

/** Threads in the order their text comes on the page; those whose text is gone last, oldest first. */
function inPageOrder(list: Thread[], anchors: Anchors): Thread[] {
  return [...list].sort((a, b) => {
    const ra = anchors.get(a.id);
    const rb = anchors.get(b.id);
    if (ra && rb) return ra.compareBoundaryPoints(Range.START_TO_START, rb);
    if (ra || rb) return ra ? -1 : 1;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export function ThreadList({
  threads,
  anchors,
  active,
  onActivate,
  onHover,
}: {
  threads: Threads;
  anchors: Anchors;
  active: number | null;
  onActivate: (id: number | null) => void;
  /** The card under the pointer, so the page can light up its text. */
  onHover?: (id: number | null) => void;
}) {
  const [filter, setFilter] = useState<Filter>("open");
  const writes = canComment(useGuest());
  // Comments on the whole page live in the page's Discussion panel; this rail is for comments on its text.
  const all = threads.threads.filter((t) => !isPageComment(t.quote));
  const onPage = threads.threads.filter((t) => isPageComment(t.quote) && t.status === "open").length;
  const shown = inPageOrder(
    all.filter((t) => (filter === "open") === (t.status === "open")),
    anchors,
  );
  const openCount = all.filter((t) => t.status === "open").length;

  // A thread activated from the page shows up even when the other filter is on. Only when it's activated: the viewer
  // can still switch filters with a thread open, and find it as they left it when they switch back.
  const activeStatus = all.find((x) => x.id === active)?.status;
  const shownActive = useRef<number | null>(null);
  useEffect(() => {
    if (active === shownActive.current) return;
    shownActive.current = active;
    if (activeStatus) setFilter(activeStatus === "open" ? "open" : "closed");
  }, [active, activeStatus]);

  return (
    <RailSection
      wikiId={threads.wikiId}
      id="threads"
      title="Comments"
      count={openCount}
      tools={
        <Segmented
          label="Show comments"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "open", label: "Open" },
            { value: "closed", label: "Closed" },
          ]}
        />
      }
    >
      {onPage > 0 && (
        <a href="#changes" className="sh-threads-page-link">
          <Icon name="comment" size={14} />
          <span>
            {onPage} change{onPage === 1 ? "" : "s"} asked for on the whole page
          </span>
          <Icon name="arrowRight" size={13} />
        </a>
      )}
      {shown.length === 0 && (
        <div className="sh-threads-empty">
          {filter !== "open" ? (
            <p>No closed comments.</p>
          ) : writes ? (
            <p>
              <strong>Select any text on the page</strong> to ask about it or suggest a change. The agent answers here.
            </p>
          ) : (
            <p>No open comments.</p>
          )}
        </div>
      )}
      {shown.map((t) => (
        <ThreadCard
          key={t.id}
          thread={t}
          orphaned={anchors.has(t.id) && !anchors.get(t.id)}
          active={t.id === active}
          threads={threads}
          onHover={onHover}
          onClick={() => {
            onActivate(t.id === active ? null : t.id);
            if (t.id !== active) scrollToRange(anchors.get(t.id));
          }}
        />
      ))}
    </RailSection>
  );
}

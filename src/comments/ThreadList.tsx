import { useEffect, useRef, useState } from "react";
import type { Thread } from "../../shared/api.ts";
import { ago } from "../lib/time.ts";
import { Badge, Button, cx, Segmented, Textarea } from "../ui/index.ts";
import type { Anchors } from "./CommentLayer.tsx";
import type { Threads } from "./useThreads.ts";

type Filter = "open" | "closed";

export function scrollToRange(range: Range | null | undefined) {
  const r = range?.getBoundingClientRect();
  if (r && (r.width || r.height))
    window.scrollTo({ top: window.scrollY + r.top - window.innerHeight / 3, behavior: "smooth" });
}

export function ThreadList({
  threads,
  anchors,
  active,
  onActivate,
}: {
  threads: Threads;
  anchors: Anchors;
  active: number | null;
  onActivate: (id: number | null) => void;
}) {
  const [filter, setFilter] = useState<Filter>("open");
  const all = threads.threads;
  const shown = all.filter((t) => (filter === "open") === (t.status === "open"));
  const openCount = all.filter((t) => t.status === "open").length;

  // A thread activated from the page shows up even when the other filter is on.
  useEffect(() => {
    const t = all.find((x) => x.id === active);
    if (t) setFilter(t.status === "open" ? "open" : "closed");
  }, [active, all]);

  return (
    <section className="sh-threads" aria-label="Comments">
      <header className="sh-threads-head">
        <h2 className="sh-rail-title">Comments</h2>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "open", label: `Open ${openCount || ""}`.trim() },
            { value: "closed", label: "Closed" },
          ]}
        />
      </header>
      {shown.length === 0 && (
        <p className="sh-threads-empty">
          {filter === "open" ? "Select text on the page to leave a comment." : "No closed comments."}
        </p>
      )}
      {shown.map((t) => (
        <ThreadCard
          key={t.id}
          thread={t}
          orphaned={anchors.has(t.id) && !anchors.get(t.id)}
          active={t.id === active}
          threads={threads}
          onClick={() => {
            onActivate(t.id === active ? null : t.id);
            if (t.id !== active) scrollToRange(anchors.get(t.id));
          }}
        />
      ))}
    </section>
  );
}

function ThreadCard({
  thread,
  orphaned,
  active,
  threads,
  onClick,
}: {
  thread: Thread;
  orphaned: boolean;
  active: boolean;
  threads: Threads;
  onClick: () => void;
}) {
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLElement>(null);
  const last = thread.messages.at(-1);

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active]);

  const send = async () => {
    if (!draft.trim()) return;
    await threads.reply(thread.id, draft.trim());
    setDraft("");
  };

  return (
    <article ref={ref} className={cx("sh-thread", active && "is-active")} data-status={thread.status}>
      <button type="button" className="sh-thread-main" onClick={onClick}>
        <span className="sh-thread-meta">
          {thread.status === "open" ? (
            last?.author === "agent" ? (
              <Badge tone="accent">Agent replied</Badge>
            ) : (
              <Badge>Waiting</Badge>
            )
          ) : (
            <Badge tone={thread.status === "resolved" ? "good" : "neutral"}>
              {thread.status === "resolved" ? "Resolved" : "Won't fix"}
            </Badge>
          )}
          {orphaned && <Badge tone="warn">Text changed</Badge>}
          <span className="sh-thread-time">{ago(thread.createdAt)}</span>
        </span>
        <span className="sh-thread-quote">{thread.quote.exact}</span>
        {!active && <span className="sh-thread-preview">{thread.messages[0]?.body}</span>}
      </button>
      {active && (
        <div className="sh-thread-body">
          {thread.messages.map((m) => (
            <div key={m.id} className="sh-message" data-author={m.author}>
              <span className="sh-message-author">{m.author === "user" ? "You" : "Agent"}</span>
              <p>{m.body}</p>
            </div>
          ))}
          {thread.status === "open" ? (
            <>
              <Textarea
                rows={2}
                value={draft}
                placeholder="Reply…"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void send();
                }}
              />
              <div className="sh-thread-actions">
                <Button
                  size="sm"
                  variant="ghost"
                  icon="check"
                  onClick={() => void threads.setStatus(thread.id, "resolved")}
                >
                  Resolve
                </Button>
                <Button size="sm" variant="soft" icon="send" disabled={!draft.trim()} onClick={() => void send()}>
                  Reply
                </Button>
              </div>
            </>
          ) : (
            <div className="sh-thread-actions">
              <Button size="sm" variant="ghost" icon="undo" onClick={() => void threads.setStatus(thread.id, "open")}>
                Reopen
              </Button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

import { useEffect, useRef, useState } from "react";
import type { Thread } from "../../shared/api.ts";
import { isPageComment } from "../../shared/quote.ts";
import { authorName, canComment, canResolve, useGuest } from "../guest/GuestContext.ts";
import { api } from "../lib/api.ts";
import { ago } from "../lib/time.ts";
import { Avatar, Badge, Button, cx, Icon, IconButton, Segmented, Textarea } from "../ui/index.ts";
import { RailSection } from "../wiki/RailSection.tsx";
import type { Anchors } from "./CommentLayer.tsx";
import { Reactions } from "./Reactions.tsx";
import type { Threads } from "./useThreads.ts";

type Filter = "open" | "closed";

/**
 * Unsent replies, by wiki and thread. They outlive the card: switching Open/Closed, folding the card or opening
 * another page hides it, and the reply is still there when it comes back.
 */
const drafts = new Map<string, string>();

function useDraft(key: string): [string, (text: string) => void] {
  const [draft, setDraft] = useState(() => drafts.get(key) ?? "");
  const set = (text: string) => {
    if (text) drafts.set(key, text);
    else drafts.delete(key);
    setDraft(text);
  };
  return [draft, set];
}

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

/** A message's pictures: thumbnails that open the full picture. */
function Pictures({ wikiId, files }: { wikiId: string; files: string[] }) {
  return (
    <ul className="sh-message-pictures">
      {files.map((f) => (
        <li key={f}>
          <a href={api.attachmentUrl(wikiId, f)} target="_blank" rel="noopener" title="Open the picture">
            <img src={api.attachmentUrl(wikiId, f, 480)} alt="Attached to this comment" loading="lazy" />
          </a>
        </li>
      ))}
    </ul>
  );
}

export function ThreadCard({
  thread,
  orphaned,
  active,
  threads,
  onClick,
  onHover,
  removable = false,
}: {
  thread: Thread;
  orphaned: boolean;
  active: boolean;
  threads: Threads;
  onClick: () => void;
  onHover?: (id: number | null) => void;
  /** The Changes panel: the host may remove any change, a guest the ones they started. */
  removable?: boolean;
}) {
  const [draft, setDraft] = useDraft(`${threads.wikiId}:${thread.id}`);
  const [confirming, setConfirming] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const first = thread.messages[0];
  const last = thread.messages.at(-1);
  const replies = thread.messages.length - 1;
  const guest = useGuest();
  const resolves = canResolve(guest, thread);
  const removes = removable && (guest ? guest.kind === "comment" && !!thread.messages[0]?.mine : true);

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active]);

  const send = async () => {
    if (!draft.trim()) return;
    await threads.reply(thread.id, draft.trim());
    setDraft("");
  };

  return (
    <article
      ref={ref}
      className={cx("sh-thread", active && "is-active")}
      data-status={thread.status}
      onPointerEnter={onHover && (() => onHover(thread.id))}
      onPointerLeave={onHover && (() => onHover(null))}
    >
      <button type="button" className="sh-thread-main" onClick={onClick}>
        {first && (
          <span className="sh-thread-who">
            <Avatar id={`${first.author}:${authorName(guest, first)}`} name={authorName(guest, first)} size={22} />
            <span className="sh-thread-author">{authorName(guest, first)}</span>
            <span className="sh-thread-time">{ago(thread.createdAt)}</span>
          </span>
        )}
        <span className="sh-thread-meta">
          {thread.messages[0]?.hidden ? (
            // Hidden by the owner: neither guests nor agents see it, so nobody is waiting on it.
            <Badge tone="warn">Hidden from guests</Badge>
          ) : thread.status === "open" ? (
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
          {replies > 0 && (
            <span className="sh-thread-replies" title={`${replies} repl${replies === 1 ? "y" : "ies"}`}>
              <Icon name="comment" size={12} />
              {replies}
            </span>
          )}
        </span>
        {!isPageComment(thread.quote) && <span className="sh-thread-quote">{thread.quote.exact}</span>}
        {!active && <span className="sh-thread-preview">{thread.messages[0]?.body}</span>}
      </button>
      {!active && !!thread.messages[0]?.images?.length && (
        <Pictures wikiId={threads.wikiId} files={thread.messages[0].images} />
      )}
      {active && (
        <div className="sh-thread-body">
          {thread.messages.map((m) => (
            <div key={m.id} className="sh-message" data-author={m.author} data-hidden={m.hidden || undefined}>
              <div className="sh-message-head">
                <span className="sh-message-author">
                  {authorName(guest, m)}
                  {m.hidden && " · hidden from guests"}
                </span>
                {/* Moderation (ADR-0003): only the owner sees this, only on guests' messages. */}
                {!guest && m.author === "guest" && (
                  <IconButton
                    icon={m.hidden ? "eye" : "eyeOff"}
                    label={m.hidden ? "Show to guests again" : "Hide from guests and the inbox"}
                    size="sm"
                    className="sh-message-hide"
                    onClick={() => void threads.hide(m.id, !m.hidden)}
                  />
                )}
              </div>
              <p>{m.body}</p>
              {!!m.images?.length && <Pictures wikiId={threads.wikiId} files={m.images} />}
              {!m.hidden && <Reactions message={m} onReact={(emoji, on) => threads.react(m.id, emoji, on)} />}
            </div>
          ))}
          {thread.status === "open" && canComment(guest) ? (
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
                {resolves && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="check"
                    onClick={() => void threads.setStatus(thread.id, "resolved")}
                  >
                    Resolve
                  </Button>
                )}
                <Button size="sm" variant="soft" icon="send" disabled={!draft.trim()} onClick={() => void send()}>
                  Reply
                </Button>
              </div>
            </>
          ) : (
            thread.status !== "open" &&
            resolves && (
              <div className="sh-thread-actions">
                <Button size="sm" variant="ghost" icon="undo" onClick={() => void threads.setStatus(thread.id, "open")}>
                  Reopen
                </Button>
              </div>
            )
          )}
          {removes && (
            <div className="sh-thread-actions sh-thread-remove">
              {confirming ? (
                <>
                  <span>Remove it for everyone?</span>
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                    Keep
                  </Button>
                  <Button size="sm" variant="ghost" icon="trash" onClick={() => void threads.remove(thread.id)}>
                    Remove
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="ghost" icon="trash" onClick={() => setConfirming(true)}>
                  Remove
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

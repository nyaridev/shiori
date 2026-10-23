// One comment thread as a card, in the rail and in the Changes panel. What the viewer may do with it sits in one
// "⋯" menu in its top right corner (ADR-0010): reply, edit, resolve or reopen, hide, remove. Each item shows only to
// those who may use it, and the servers check the same rights.
import { useEffect, useRef, useState } from "react";
import type { Message, Thread } from "../../shared/api.ts";
import { isPageComment } from "../../shared/quote.ts";
import { authorName, canComment, canEdit, canHide, canRemove, canResolve, useGuest } from "../guest/GuestContext.ts";
import { api } from "../lib/api.ts";
import { ago } from "../lib/time.ts";
import {
  Avatar,
  Badge,
  Button,
  cx,
  Icon,
  IconButton,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Textarea,
} from "../ui/index.ts";
import { Reactions } from "./Reactions.tsx";
import type { Threads } from "./useThreads.ts";

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

/** A message's text, or the box that changes it. */
function Body({
  message,
  editing,
  onSave,
  onCancel,
}: {
  message: Message;
  editing: boolean;
  onSave: (body: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [text, setText] = useState(message.body);
  const box = useRef<HTMLTextAreaElement>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (!editing) return;
    setText(message.body);
    // After the menu that opened it has let go of focus: at the end of the text.
    const t = setTimeout(() => {
      const el = box.current;
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    }, 0);
    return () => clearTimeout(t);
  }, [editing, message.body]);
  if (!editing)
    return (
      <p>
        {message.body}
        {message.editedAt && (
          <span className="sh-message-edited" title={`Edited ${ago(message.editedAt)}`}>
            {" "}
            (edited)
          </span>
        )}
      </p>
    );
  const save = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    setProblem(null);
    try {
      await onSave(text.trim());
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="sh-message-edit">
      <Textarea
        rows={2}
        value={text}
        ref={box}
        aria-label="Edit your message"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void save();
          if (e.key === "Escape") onCancel();
        }}
      />
      <div className="sh-thread-actions">
        {problem && <span className="sh-discussion-problem">{problem}</span>}
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" variant="soft" icon="check" disabled={!text.trim() || saving} onClick={() => void save()}>
          Save
        </Button>
      </div>
    </div>
  );
}

export function ThreadCard({
  thread,
  orphaned,
  active,
  threads,
  onClick,
  onHover,
}: {
  thread: Thread;
  orphaned: boolean;
  active: boolean;
  threads: Threads;
  /** Opens or folds the card. */
  onClick: () => void;
  onHover?: (id: number | null) => void;
}) {
  const [draft, setDraft] = useDraft(`${threads.wikiId}:${thread.id}`);
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const reply = useRef<HTMLTextAreaElement>(null);
  const guest = useGuest();
  const first = thread.messages[0];
  const last = thread.messages.at(-1);
  const replies = thread.messages.length - 1;
  const open = thread.status === "open";

  const may = {
    reply: open && canComment(guest),
    edit: !!first && canEdit(guest, thread, first),
    resolve: canResolve(guest, thread),
    hide: !!first && canHide(guest, first),
    remove: canRemove(guest, thread),
  };
  const anything = may.reply || may.edit || may.resolve || may.hide || may.remove;
  // A reply box stays open while it holds a draft.
  const composing = active && may.reply && (replying || !!draft);

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    else {
      setEditing(null);
      setConfirming(false);
      setReplying(false);
    }
  }, [active]);

  /** A menu item that opened a box (reply, edit) keeps focus there instead of on the ⋯ button. */
  const boxOpening = useRef(false);
  const keepFocus = (e: Event) => {
    if (boxOpening.current) e.preventDefault();
    boxOpening.current = false;
  };

  /** Runs a menu item on an open card, opening it first. */
  const opened = (then: () => void) => () => {
    if (!active) onClick();
    then();
  };

  const send = async () => {
    if (!draft.trim()) return;
    await threads.reply(thread.id, draft.trim());
    setDraft("");
    setReplying(false);
  };

  const save = (m: Message) => async (body: string) => {
    if (body !== m.body) await threads.edit(m.id, body);
    setEditing(null);
  };

  return (
    <article
      ref={ref}
      className={cx("sh-thread", active && "is-active")}
      data-status={thread.status}
      onPointerEnter={onHover && (() => onHover(thread.id))}
      onPointerLeave={onHover && (() => onHover(null))}
    >
      <button type="button" className="sh-thread-main" onClick={onClick} aria-expanded={active}>
        {first && (
          <span className="sh-thread-who">
            <Avatar id={`${first.author}:${authorName(guest, first)}`} name={authorName(guest, first)} size={22} />
            <span className="sh-thread-author">{authorName(guest, first)}</span>
            <span className="sh-thread-time">{ago(thread.createdAt)}</span>
          </span>
        )}
        <span className="sh-thread-meta">
          {first?.hidden ? (
            // Hidden by the owner: neither guests nor agents see it, so nobody is waiting on it.
            <Badge tone="warn">Hidden from guests</Badge>
          ) : open ? (
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
        {!active && <span className="sh-thread-preview">{first?.body}</span>}
      </button>

      {anything && (
        <Menu>
          <MenuTrigger asChild>
            <IconButton icon="dots" label="Actions for this comment" size="sm" className="sh-thread-menu" />
          </MenuTrigger>
          <MenuContent align="end" onCloseAutoFocus={keepFocus}>
            {may.reply && (
              <MenuItem
                icon="reply"
                onSelect={opened(() => {
                  boxOpening.current = true;
                  setReplying(true);
                  setTimeout(() => reply.current?.focus(), 0);
                })}
              >
                Reply
              </MenuItem>
            )}
            {may.edit && first && (
              <MenuItem
                icon="edit"
                onSelect={opened(() => {
                  boxOpening.current = true;
                  setEditing(first.id);
                })}
              >
                Edit
              </MenuItem>
            )}
            {may.resolve &&
              (open ? (
                <MenuItem icon="check" onSelect={() => void threads.setStatus(thread.id, "resolved")}>
                  Resolve
                </MenuItem>
              ) : (
                <MenuItem icon="undo" onSelect={() => void threads.setStatus(thread.id, "open")}>
                  Reopen
                </MenuItem>
              ))}
            {may.hide && first && (
              <MenuItem
                icon={first.hidden ? "eye" : "eyeOff"}
                onSelect={() => void threads.hide(first.id, !first.hidden)}
              >
                {first.hidden ? "Show to guests again" : "Hide from guests"}
              </MenuItem>
            )}
            {may.remove && (
              <>
                <MenuSeparator />
                <MenuItem icon="trash" danger onSelect={opened(() => setConfirming(true))}>
                  Remove
                </MenuItem>
              </>
            )}
          </MenuContent>
        </Menu>
      )}

      {!active && !!first?.images?.length && <Pictures wikiId={threads.wikiId} files={first.images} />}
      {active && (
        <div className="sh-thread-body">
          {confirming && (
            <div className="sh-thread-confirm" role="alert">
              <span className="sh-thread-confirm-text">Remove it for everyone?</span>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                Keep
              </Button>
              <Button size="sm" variant="ghost" icon="trash" onClick={() => void threads.remove(thread.id)}>
                Remove
              </Button>
            </div>
          )}
          {thread.messages.map((m, i) => {
            const own = i > 0 && canEdit(guest, thread, m);
            const hides = i > 0 && canHide(guest, m);
            return (
              <div key={m.id} className="sh-message" data-author={m.author} data-hidden={m.hidden || undefined}>
                <div className="sh-message-head">
                  <span className="sh-message-author">
                    {authorName(guest, m)}
                    {m.hidden && " · hidden from guests"}
                  </span>
                  {/* Replies have their own small menu; the first message goes with the card's. */}
                  {(own || hides) && (
                    <Menu>
                      <MenuTrigger asChild>
                        <IconButton icon="dots" label="Actions for this reply" size="sm" className="sh-message-menu" />
                      </MenuTrigger>
                      <MenuContent align="end" onCloseAutoFocus={keepFocus}>
                        {own && (
                          <MenuItem
                            icon="edit"
                            onSelect={() => {
                              boxOpening.current = true;
                              setEditing(m.id);
                            }}
                          >
                            Edit
                          </MenuItem>
                        )}
                        {hides && (
                          <MenuItem
                            icon={m.hidden ? "eye" : "eyeOff"}
                            onSelect={() => void threads.hide(m.id, !m.hidden)}
                          >
                            {m.hidden ? "Show to guests again" : "Hide from guests"}
                          </MenuItem>
                        )}
                      </MenuContent>
                    </Menu>
                  )}
                </div>
                <Body message={m} editing={editing === m.id} onSave={save(m)} onCancel={() => setEditing(null)} />
                {!!m.images?.length && <Pictures wikiId={threads.wikiId} files={m.images} />}
                {!m.hidden && <Reactions message={m} onReact={(emoji, on) => threads.react(m.id, emoji, on)} />}
              </div>
            );
          })}
          {composing && (
            <>
              <Textarea
                ref={reply}
                rows={2}
                value={draft}
                placeholder="Reply…"
                aria-label="Reply"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void send();
                  if (e.key === "Escape" && !draft) setReplying(false);
                }}
              />
              <div className="sh-thread-actions">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDraft("");
                    setReplying(false);
                  }}
                >
                  Cancel
                </Button>
                <Button size="sm" variant="soft" icon="send" disabled={!draft.trim()} onClick={() => void send()}>
                  Reply
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </article>
  );
}

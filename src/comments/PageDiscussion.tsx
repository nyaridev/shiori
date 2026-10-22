// Changes to the whole page, as a panel at its bottom (folded until opened): ask for one without selecting text, with
// pictures if they help (a screenshot, a sketch, a reference), and follow the page's change requests. They're comments
// on the whole page; comments on selected text stay in the rail beside it.
import { type ClipboardEvent, useEffect, useRef, useState } from "react";
import { isPageComment, PAGE_QUOTE } from "../../shared/quote.ts";
import { canComment, useGuest } from "../guest/GuestContext.ts";
import { api } from "../lib/api.ts";
import { Button, IconButton, Textarea } from "../ui/index.ts";
import { FootFold } from "../wiki/FootFold.tsx";
import { ThreadCard } from "./ThreadList.tsx";
import type { Threads } from "./useThreads.ts";

/** What a change request may carry, as the server allows (server/attachments.ts). */
const PICTURES = { max: 4, bytes: 6 * 1024 * 1024, types: ["image/png", "image/jpeg", "image/webp", "image/gif"] };

interface Picked {
  blob: Blob;
  /** A local preview until it's sent. */
  url: string;
}

export function PageDiscussion({ threads }: { threads: Threads }) {
  const onPage = threads.threads.filter((t) => isPageComment(t.quote));
  const openCount = onPage.filter((t) => t.status === "open").length;
  const [showClosed, setShowClosed] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [pictures, setPictures] = useState<Picked[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const writes = canComment(useGuest());
  const shown = onPage.filter((t) => showClosed || t.status === "open" || t.id === active);

  // Previews are local object URLs; let them go when they're dropped or the panel closes.
  const previews = useRef(pictures);
  previews.current = pictures;
  useEffect(
    () => () => {
      for (const p of previews.current) URL.revokeObjectURL(p.url);
    },
    [],
  );

  const add = (files: Iterable<Blob>) => {
    const next: Picked[] = [];
    for (const blob of files) {
      if (!PICTURES.types.includes(blob.type)) {
        setProblem("Add a PNG, JPEG, WebP or GIF picture.");
        continue;
      }
      if (blob.size > PICTURES.bytes) {
        setProblem("That picture is too big (at most 6 MB).");
        continue;
      }
      next.push({ blob, url: URL.createObjectURL(blob) });
    }
    setPictures((list) => {
      const all = [...list, ...next];
      if (all.length > PICTURES.max) setProblem(`At most ${PICTURES.max} pictures on one change.`);
      for (const p of all.slice(PICTURES.max)) URL.revokeObjectURL(p.url);
      return all.slice(0, PICTURES.max);
    });
  };

  const remove = (url: string) => {
    URL.revokeObjectURL(url);
    setPictures((list) => list.filter((p) => p.url !== url));
  };

  // A screenshot pasted into the field joins the change.
  const onPaste = (e: ClipboardEvent) => {
    const files = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    e.preventDefault();
    add(files);
  };

  const send = async () => {
    if (!draft.trim() || saving) return;
    setSaving(true);
    setProblem(null);
    try {
      const files = [];
      for (const p of pictures) files.push((await api.attach(threads.wikiId, p.blob)).file);
      const thread = await threads.create(PAGE_QUOTE, draft.trim(), files);
      for (const p of pictures) URL.revokeObjectURL(p.url);
      setPictures([]);
      setDraft("");
      setActive(thread.id);
    } catch (e) {
      setProblem(e instanceof Error ? `Couldn't send: ${e.message}` : "Couldn't send. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <FootFold
      id="changes"
      className="sh-discussion"
      title="Changes"
      count={openCount ? `${openCount} open` : onPage.length ? `${onPage.length} resolved` : undefined}
      tone={openCount ? "accent" : undefined}
      holds={onPage.map((t) => `comment-${t.id}`)}
    >
      {writes && (
        <div className="sh-discussion-compose">
          <Textarea
            rows={2}
            value={draft}
            placeholder="What should change on this page? Paste or add pictures if they help."
            aria-label="Ask for a change to this page"
            onChange={(e) => setDraft(e.target.value)}
            onPaste={onPaste}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void send();
            }}
          />
          {pictures.length > 0 && (
            <ul className="sh-change-pictures" aria-label="Pictures to send">
              {pictures.map((p) => (
                <li key={p.url}>
                  <img src={p.url} alt="" />
                  <IconButton icon="close" label="Remove this picture" size="sm" onClick={() => remove(p.url)} />
                </li>
              ))}
            </ul>
          )}
          <div className="sh-discussion-actions">
            <input
              ref={input}
              type="file"
              accept={PICTURES.types.join(",")}
              multiple
              hidden
              onChange={(e) => {
                add(e.target.files ?? []);
                e.target.value = "";
              }}
            />
            <Button
              size="sm"
              variant="ghost"
              icon="plus"
              disabled={pictures.length >= PICTURES.max}
              onClick={() => input.current?.click()}
            >
              Add picture
            </Button>
            {problem && <span className="sh-discussion-problem">{problem}</span>}
            <Button
              size="sm"
              variant="solid"
              icon="send"
              disabled={!draft.trim() || saving}
              onClick={() => void send()}
            >
              Add change
            </Button>
          </div>
        </div>
      )}
      {!writes && shown.length === 0 && <p className="sh-discussion-empty">No changes asked for on this page yet.</p>}
      {shown.length > 0 && (
        <div className="sh-discussion-threads">
          {shown.map((t) => (
            <ThreadCard
              key={t.id}
              thread={t}
              orphaned={false}
              active={t.id === active}
              threads={threads}
              removable
              onClick={() => setActive((a) => (a === t.id ? null : t.id))}
            />
          ))}
        </div>
      )}
      {onPage.length > openCount && (
        <Button size="sm" variant="ghost" onClick={() => setShowClosed((s) => !s)}>
          {showClosed ? "Hide resolved" : `Show ${onPage.length - openCount} resolved`}
        </Button>
      )}
    </FootFold>
  );
}

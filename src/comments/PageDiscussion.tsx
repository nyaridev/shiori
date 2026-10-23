// Changes to the whole page, as a panel at its bottom (folded until opened): ask for one without selecting text, with
// pictures if they help (a screenshot, a sketch, a reference), and follow the page's change requests. They're comments
// on the whole page; comments on selected text stay in the rail beside it.
import { useState } from "react";
import { isPageComment, PAGE_QUOTE } from "../../shared/quote.ts";
import { canComment, useGuest } from "../guest/GuestContext.ts";
import { api } from "../lib/api.ts";
import { AddPictures, PickedPictures, usePictures } from "../lib/usePictures.tsx";
import { Button, Textarea } from "../ui/index.ts";
import { FootFold } from "../wiki/FootFold.tsx";
import { ThreadCard } from "./ThreadCard.tsx";
import type { Threads } from "./useThreads.ts";

export function PageDiscussion({ threads }: { threads: Threads }) {
  const onPage = threads.threads.filter((t) => isPageComment(t.quote));
  const openCount = onPage.filter((t) => t.status === "open").length;
  const [showClosed, setShowClosed] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const { pictures, add, remove, clear, onPaste, problem, setProblem, full } = usePictures();
  const [saving, setSaving] = useState(false);
  const writes = canComment(useGuest());
  const shown = onPage.filter((t) => showClosed || t.status === "open" || t.id === active);

  const send = async () => {
    if (!draft.trim() || saving) return;
    setSaving(true);
    setProblem(null);
    try {
      const files = [];
      for (const p of pictures) files.push((await api.attach(threads.wikiId, p.blob)).file);
      const thread = await threads.create(PAGE_QUOTE, draft.trim(), files);
      clear();
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
          <PickedPictures pictures={pictures} onRemove={remove} />
          <div className="sh-discussion-actions">
            <AddPictures onAdd={add} disabled={full} />
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

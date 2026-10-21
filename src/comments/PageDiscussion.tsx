// Comments on the whole page, as a Discussion panel at its bottom: write one without selecting text, and read the
// page's discussion. Comments on selected text stay in the rail beside the page.
import { useState } from "react";
import { isPageComment, PAGE_QUOTE } from "../../shared/quote.ts";
import { Button, Textarea } from "../ui/index.ts";
import { ThreadCard } from "./ThreadList.tsx";
import type { Threads } from "./useThreads.ts";

export function PageDiscussion({ threads }: { threads: Threads }) {
  const onPage = threads.threads.filter((t) => isPageComment(t.quote));
  const openCount = onPage.filter((t) => t.status === "open").length;
  const [showClosed, setShowClosed] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const shown = onPage.filter((t) => showClosed || t.status === "open" || t.id === active);

  const send = async () => {
    if (!draft.trim() || saving) return;
    setSaving(true);
    try {
      const thread = await threads.create(PAGE_QUOTE, draft.trim());
      setDraft("");
      setActive(thread.id);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="sh-foot-block sh-discussion" id="discussion" aria-labelledby="sh-discussion-title">
      <h2 id="sh-discussion-title" className="sh-sections-title">
        Discussion
        {openCount > 0 && <span className="sh-discussion-count">{openCount} open</span>}
      </h2>
      <div className="sh-discussion-compose">
        <Textarea
          rows={2}
          value={draft}
          placeholder="Comment on this page…"
          aria-label="Comment on this page"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void send();
          }}
        />
        <div className="sh-discussion-actions">
          <span>For something about the whole page. To comment on a passage, select its text.</span>
          <Button size="sm" variant="soft" icon="send" disabled={!draft.trim() || saving} onClick={() => void send()}>
            Comment
          </Button>
        </div>
      </div>
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
    </section>
  );
}

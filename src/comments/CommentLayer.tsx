// Comments on page text: select text → "Comment" bubble → composer. Anchored threads are painted with the CSS
// Custom Highlight API, so the page's DOM is never changed. Clicking highlighted text opens its thread.
import { type RefObject, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { findQuote, isPageComment, quoteAt } from "../../shared/quote.ts";
import { Button, Icon, Popover, PopoverAnchor, PopoverContent, Textarea } from "../ui/index.ts";
import "./comments.css";
import { offsetsOf, rangeAt, textIndex } from "./textIndex.ts";
import type { Threads } from "./useThreads.ts";

export type Anchors = Map<number, Range | null>;

interface Props {
  container: RefObject<HTMLElement | null>;
  /** Changes whenever the page content re-renders, so anchors are found again. */
  contentKey: unknown;
  threads: Threads;
  active: number | null;
  onActivate: (id: number | null) => void;
  onAnchors: (anchors: Anchors) => void;
}

const HL = { open: "sh-comment", active: "sh-comment-active", pending: "sh-pending" } as const;

function paint(name: string, ranges: Range[]) {
  if (!("highlights" in CSS)) return;
  if (ranges.length) CSS.highlights.set(name, new Highlight(...ranges));
  else CSS.highlights.delete(name);
}

export function CommentLayer({ container, contentKey, threads, active, onActivate, onAnchors }: Props) {
  const [pending, setPending] = useState<{ start: number; end: number } | null>(null);
  const [composing, setComposing] = useState(false);
  // Read by the selection listener, which runs just after the click that opens the composer.
  const composingRef = useRef(false);
  composingRef.current = composing;
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const anchors = useRef<Anchors>(new Map());
  const onAnchorsRef = useRef(onAnchors);
  onAnchorsRef.current = onAnchors;

  // Find every thread's text again when the page or the threads change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: contentKey signals a re-rendered page.
  useLayoutEffect(() => {
    const el = container.current;
    if (!el) return;
    const index = textIndex(el);
    const map: Anchors = new Map();
    for (const t of threads.threads) {
      // Comments on the whole page have no text to find.
      if (isPageComment(t.quote)) continue;
      const at = findQuote(index.text, t.quote);
      map.set(t.id, at && rangeAt(index, at.start, at.end));
    }
    anchors.current = map;
    onAnchorsRef.current(map);
  }, [container, contentKey, threads.threads]);

  const pendingRange = (() => {
    const el = container.current;
    return el && pending ? rangeAt(textIndex(el), pending.start, pending.end) : null;
  })();

  useLayoutEffect(() => {
    const open = threads.threads.filter((t) => t.status === "open" && t.id !== active);
    paint(
      HL.open,
      open.map((t) => anchors.current.get(t.id)).filter((r): r is Range => !!r),
    );
    const a = active === null ? null : anchors.current.get(active);
    paint(HL.active, a ? [a] : []);
    paint(HL.pending, composing && pendingRange ? [pendingRange] : []);
  });
  useEffect(
    () => () => {
      for (const name of Object.values(HL)) paint(name, []);
    },
    [],
  );

  // Track the selection inside the page.
  useEffect(() => {
    // After the browser has updated the selection for this mouseup/keyup.
    const check = () =>
      setTimeout(() => {
        if (composingRef.current) return;
        const el = container.current;
        const sel = getSelection();
        if (!el || !sel || sel.isCollapsed || !sel.rangeCount) return setPending(null);
        const range = sel.getRangeAt(0);
        if (!el.contains(range.commonAncestorContainer)) return setPending(null);
        setPending(offsetsOf(textIndex(el), range));
      }, 0);
    document.addEventListener("mouseup", check);
    document.addEventListener("keyup", check);
    return () => {
      document.removeEventListener("mouseup", check);
      document.removeEventListener("keyup", check);
    };
  }, [container]);

  // Keep the bubble on the text while scrolling.
  useEffect(() => {
    if (!pending) return;
    window.addEventListener("scroll", rerender, { passive: true });
    window.addEventListener("resize", rerender);
    return () => {
      window.removeEventListener("scroll", rerender);
      window.removeEventListener("resize", rerender);
    };
  }, [pending]);

  // Click on highlighted text → open its thread.
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      if (!getSelection()?.isCollapsed) return;
      const pos = document.caretPositionFromPoint?.(e.clientX, e.clientY);
      if (!pos) return;
      for (const t of threads.threads) {
        const r = anchors.current.get(t.id);
        if (t.status === "open" && r?.isPointInRange(pos.offsetNode, pos.offset)) return onActivate(t.id);
      }
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [container, threads.threads, onActivate]);

  const close = () => {
    setComposing(false);
    setPending(null);
    setDraft("");
  };

  const save = async () => {
    const el = container.current;
    if (!el || !pending || !draft.trim()) return;
    setSaving(true);
    try {
      const index = textIndex(el);
      const t = await threads.create(quoteAt(index.text, pending.start, pending.end), draft.trim());
      getSelection()?.removeAllRanges();
      close();
      onActivate(t.id);
    } finally {
      setSaving(false);
    }
  };

  const rect = pendingRange?.getBoundingClientRect();
  if (!pending || !rect || (rect.width === 0 && rect.height === 0)) return null;

  return (
    <>
      {!composing && (
        <button
          type="button"
          className="sh-comment-bubble"
          style={{ left: rect.left + rect.width / 2, top: rect.top }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            composingRef.current = true;
            setComposing(true);
          }}
        >
          <Icon name="comment" size={15} />
          Comment
        </button>
      )}
      <Popover open={composing} onOpenChange={(o) => !o && close()}>
        <PopoverAnchor asChild>
          <div
            className="sh-comment-anchor"
            style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
          />
        </PopoverAnchor>
        <PopoverContent side="bottom" align="start" width={320} onOpenAutoFocus={(e) => e.preventDefault()}>
          <form
            className="sh-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <Textarea
              autoFocus
              value={draft}
              placeholder="What should change here?"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void save();
              }}
            />
            <div className="sh-composer-actions">
              <span className="sh-composer-hint">Ctrl + Enter</span>
              <Button size="sm" variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button size="sm" variant="solid" type="submit" disabled={!draft.trim() || saving}>
                Comment
              </Button>
            </div>
          </form>
        </PopoverContent>
      </Popover>
    </>
  );
}

// Search inside a wiki: Ctrl+K (⌘K) or "/" opens it. Results update as you type; arrows move, Enter opens the page
// at the matching heading, which flashes so the eye finds it.
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import type { Marks, SearchHit, WikiDetail } from "../../shared/api.ts";
import { api } from "../lib/api.ts";
import { cx, Dialog, DialogContent, Icon, Kbd, ScrollArea } from "../ui/index.ts";
import { pageHref } from "./PageHead.tsx";
import "./search.css";
import { PageIcon } from "./PageIcon.tsx";

/** Wait before asking the server, so a fast typist sends one request, not one per key. */
const DEBOUNCE = 90;

export const shortcutLabel = () => (/Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘K" : "Ctrl K");

/** True when a key press belongs to a text field, not to the page. */
export const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

function Marked({ text, marks }: { text: string; marks: Marks }) {
  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const [a, b] of marks) {
    if (a > at) parts.push(text.slice(at, a));
    parts.push(
      <mark key={a} className="sh-search-mark">
        {text.slice(a, b)}
      </mark>,
    );
    at = b;
  }
  parts.push(text.slice(at));
  return <>{parts}</>;
}

/** Once the page at `path` has rendered, bring `id` (or the page top) into view and flash it. */
function reveal(path: string, id: string | undefined) {
  let tries = 0;
  const look = () => {
    const main = document.querySelector<HTMLElement>(`.sh-wiki-main[data-path="${CSS.escape(path)}"]`);
    const target = id ? main?.querySelector<HTMLElement>(`#${CSS.escape(id)}`) : main;
    if (!target) {
      if (tries++ < 120) requestAnimationFrame(look);
      return;
    }
    if (id) target.scrollIntoView({ block: "start", behavior: "smooth" });
    else window.scrollTo({ top: 0, behavior: "smooth" });
    const flash = id ? target : main?.querySelector<HTMLElement>(".sh-page-title");
    flash?.classList.remove("sh-found");
    void flash?.offsetWidth;
    flash?.classList.add("sh-found");
  };
  requestAnimationFrame(look);
}

export function SearchPalette({
  wiki,
  open,
  onOpenChange,
}: {
  wiki: WikiDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (!open || !q) {
      setHits(null);
      return;
    }
    const abort = new AbortController();
    const timer = setTimeout(() => {
      api.search(wiki.id, q, abort.signal).then(
        (found) => {
          setHits(found);
          setActive(0);
        },
        () => {},
      );
    }, DEBOUNCE);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query, open, wiki.id]);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const go = (hit: SearchHit) => {
    onOpenChange(false);
    navigate(`${pageHref(wiki.id, hit.path)}${hit.section ? `#${hit.section.id}` : ""}`);
    reveal(hit.path, hit.section?.id);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const n = hits?.length ?? 0;
    if (e.key === "ArrowDown" && n) setActive((i) => (i + 1) % n);
    else if (e.key === "ArrowUp" && n) setActive((i) => (i - 1 + n) % n);
    else if (e.key === "Enter" && hits?.[active]) go(hits[active]);
    else return;
    e.preventDefault();
  };

  const q = query.trim();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Search ${wiki.title}`} size="palette">
        <div className="sh-search-box">
          <Icon name="search" size={18} />
          <input
            className="sh-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            onFocus={(e) => e.target.select()}
            placeholder={`Search ${wiki.title}…`}
            aria-label={`Search ${wiki.title}`}
            role="combobox"
            aria-expanded={!!hits?.length}
            aria-controls="sh-search-results"
            aria-activedescendant={hits?.length ? `sh-search-hit-${active}` : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          <Kbd>Esc</Kbd>
        </div>
        <ScrollArea className="sh-search-results">
          {!q && <p className="sh-search-empty">Search titles, headings and text across every page.</p>}
          {q && hits?.length === 0 && <p className="sh-search-empty">No pages match “{q}”.</p>}
          {!!hits?.length && (
            <div ref={list} id="sh-search-results" className="sh-search-list" role="listbox" aria-label="Results">
              {hits.map((hit, i) => (
                // biome-ignore lint/a11y/useKeyWithClickEvents: the input above drives the keyboard (combobox).
                <div
                  key={hit.path}
                  id={`sh-search-hit-${i}`}
                  data-index={i}
                  role="option"
                  tabIndex={-1}
                  aria-selected={i === active}
                  className={cx("sh-search-hit", i === active && "is-active")}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(hit)}
                >
                  <PageIcon icon={hit.icon} fallback="page" className="sh-search-icon" />
                  <span className="sh-search-body">
                    <span className="sh-search-title">
                      <Marked text={hit.title} marks={hit.titleMarks} />
                      {hit.section && (
                        <span className="sh-search-section">
                          <Icon name="chevronRight" size={12} />
                          <Marked text={hit.section.heading} marks={hit.section.marks} />
                        </span>
                      )}
                    </span>
                    {hit.snippet && (
                      <span className="sh-search-snippet">
                        <Marked text={hit.snippet} marks={hit.marks} />
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        <footer className="sh-search-foot">
          <span>
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> to move
          </span>
          <span>
            <Kbd>Enter</Kbd> to open
          </span>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

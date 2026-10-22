// Search inside a wiki: Ctrl+P (⌘P) or "/" opens it. Results update as you type; arrows move, Enter opens the page
// at the matching heading, which flashes so the eye finds it. Pages can be narrowed by status, type and tag (with no
// words, that lists every page that fits), and comments and answers that match come after the pages.
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import type { Marks, NoteHit, SearchFilter, SearchHit, WikiDetail } from "../../shared/api.ts";
import { api } from "../lib/api.ts";
import { Badge, cx, Dialog, DialogContent, Icon, Kbd, ScrollArea, Select } from "../ui/index.ts";
import { pageHref } from "./PageHead.tsx";
import "./search.css";
import { PageIcon } from "./PageIcon.tsx";
import { useWikiIndex } from "./WikiIndexContext.ts";

/** "Any" in a filter's menu. */
const ANY = "_any";

type Result = { kind: "page"; hit: SearchHit } | { kind: "note"; note: NoteHit };

/** Wait before asking the server, so a fast typist sends one request, not one per key. */
const DEBOUNCE = 90;

export const shortcutLabel = () => (/Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘P" : "Ctrl P");

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
    // A target in a folded block (FootFold.tsx) waits for the link to open it.
    if (!target || target.closest("[hidden]")) {
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
  const [filter, setFilter] = useState<SearchFilter>({});
  const [results, setResults] = useState<Result[] | null>(null);
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  // What the filters can pick from: the statuses, types and tags the wiki's pages use.
  const index = useWikiIndex();
  const choices = useMemo(() => {
    const pages = (index?.index.pages ?? []).filter((p) => !p.hidden);
    const sorted = (values: (string | undefined)[]) =>
      [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b));
    return {
      status: sorted(pages.map((p) => p.status)),
      type: sorted(pages.map((p) => p.type)),
      tag: sorted(pages.flatMap((p) => p.tags)),
    };
  }, [index]);
  const filtering = !!(filter.status || filter.type || filter.tag);

  useEffect(() => {
    const q = query.trim();
    if (!open || (!q && !filtering)) {
      setResults(null);
      return;
    }
    const abort = new AbortController();
    const timer = setTimeout(() => {
      api.search(wiki.id, q, filter, abort.signal).then(
        (found) => {
          setResults([
            ...found.hits.map((hit) => ({ kind: "page" as const, hit })),
            // Comments and answers belong to no status, type or tag: they show only without filters.
            ...(filtering ? [] : found.notes.map((note) => ({ kind: "note" as const, note }))),
          ]);
          setActive(0);
        },
        () => {},
      );
    }, DEBOUNCE);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query, open, wiki.id, filter, filtering]);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const go = (result: Result) => {
    onOpenChange(false);
    if (result.kind === "page") {
      const { hit } = result;
      navigate(`${pageHref(wiki.id, hit.path)}${hit.section ? `#${hit.section.id}` : ""}`);
      reveal(hit.path, hit.section?.id);
      return;
    }
    // A comment opens in the comments rail; an answer shows on its question.
    const { note } = result;
    const target = note.kind === "comment" ? `comment-${note.ref}` : `question-${note.ref}`;
    navigate(`${pageHref(wiki.id, note.path)}#${target}`);
    if (note.kind === "answer") reveal(note.path, target);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const n = results?.length ?? 0;
    if (e.key === "ArrowDown" && n) setActive((i) => (i + 1) % n);
    else if (e.key === "ArrowUp" && n) setActive((i) => (i - 1 + n) % n);
    else if (e.key === "Enter" && results?.[active]) go(results[active]);
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
            aria-expanded={!!results?.length}
            aria-controls="sh-search-results"
            aria-activedescendant={results?.length ? `sh-search-hit-${active}` : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          <Kbd>Esc</Kbd>
        </div>
        {(choices.status.length > 0 || choices.type.length > 0 || choices.tag.length > 0) && (
          <fieldset className="sh-search-filters">
            <legend className="sh-sr-only">Narrow the pages</legend>
            {(["status", "type", "tag"] as const).map((key) =>
              choices[key].length ? (
                <Select
                  key={key}
                  label={`Filter by ${key}`}
                  value={filter[key] ?? ANY}
                  onChange={(v) => setFilter((f) => ({ ...f, [key]: v === ANY ? undefined : v }))}
                  options={[
                    { value: ANY, label: `Any ${key}` },
                    ...choices[key].map((v) => ({
                      value: v,
                      label: key === "tag" ? `#${v}` : key === "status" ? v[0].toUpperCase() + v.slice(1) : v,
                    })),
                  ]}
                />
              ) : null,
            )}
            {filtering && (
              <button type="button" className="sh-search-clear" onClick={() => setFilter({})}>
                Clear
              </button>
            )}
          </fieldset>
        )}
        <ScrollArea className="sh-search-results">
          {!q && !filtering && (
            <p className="sh-search-empty">Search titles, headings, text, comments and answers across the wiki.</p>
          )}
          {(q || filtering) && results?.length === 0 && (
            <p className="sh-search-empty">{q ? `Nothing matches “${q}”.` : "No page fits these filters."}</p>
          )}
          {!!results?.length && (
            <div ref={list} id="sh-search-results" className="sh-search-list" role="listbox" aria-label="Results">
              {results.map((result, i) => {
                const first = i === 0 || results[i - 1].kind !== result.kind;
                const group = first && (
                  <div key={`group-${result.kind}`} className="sh-search-group" role="presentation">
                    {result.kind === "page" ? "Pages" : "Comments and answers"}
                  </div>
                );
                const option = (
                  // biome-ignore lint/a11y/useKeyWithClickEvents: the input above drives the keyboard (combobox).
                  <div
                    key={
                      result.kind === "page"
                        ? result.hit.path
                        : `${result.note.kind}:${result.note.path}:${result.note.ref}`
                    }
                    id={`sh-search-hit-${i}`}
                    data-index={i}
                    role="option"
                    tabIndex={-1}
                    aria-selected={i === active}
                    className={cx("sh-search-hit", i === active && "is-active")}
                    onMouseMove={() => setActive(i)}
                    onClick={() => go(result)}
                  >
                    {result.kind === "page" ? <PageHit hit={result.hit} /> : <NoteRow note={result.note} />}
                  </div>
                );
                return group ? [group, option] : option;
              })}
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

function PageHit({ hit }: { hit: SearchHit }) {
  return (
    <>
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
    </>
  );
}

function NoteRow({ note }: { note: NoteHit }) {
  return (
    <>
      <span className="sh-search-icon sh-search-note-icon">
        <Icon name={note.kind === "comment" ? "comment" : "check"} size={16} />
      </span>
      <span className="sh-search-body">
        <span className="sh-search-title">
          {note.kind === "comment" ? "Comment" : "Answer"} on {note.title}
          {!note.open && <Badge>{note.kind === "comment" ? "Closed" : "Decided"}</Badge>}
        </span>
        <span className="sh-search-snippet">
          <Marked text={note.snippet} marks={note.marks} />
        </span>
      </span>
    </>
  );
}

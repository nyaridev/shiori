// Page numbers under a long list (ADR-0009): previous and next, the first and last page, the pages around this one,
// and gaps between. Where it's narrow (a phone, a small box), the numbers give way to "Page [3] of 40", whose field
// jumps to any page. The list's owner keeps the page (in the URL, so Back works) and moves focus to the list.
import { type FormEvent, useEffect, useState } from "react";
import { cx } from "./Button.tsx";
import { Icon } from "./Icon.tsx";

/** The page numbers to show, with `null` for a gap: 1 … 4 5 [6] 7 8 … 40. */
export function pageWindow(page: number, pages: number, around = 2): (number | null)[] {
  const out: (number | null)[] = [];
  const from = Math.max(2, page - around);
  const to = Math.min(pages - 1, page + around);
  out.push(1);
  // A gap of one page shows that page instead.
  if (from === 3) out.push(2);
  else if (from > 3) out.push(null);
  for (let p = from; p <= to; p++) out.push(p);
  if (to === pages - 2) out.push(pages - 1);
  else if (to < pages - 2) out.push(null);
  if (pages > 1) out.push(pages);
  return out;
}

interface PaginationProps {
  /** From 1. */
  page: number;
  pages: number;
  onChange: (page: number) => void;
  /** What the pages are of, for screen readers: "Questions pages". */
  label: string;
  className?: string;
}

export function Pagination({ page, pages, onChange, label, className }: PaginationProps) {
  const [typed, setTyped] = useState(String(page));
  useEffect(() => setTyped(String(page)), [page]);
  if (pages <= 1) return null;
  const go = (p: number) => {
    const next = Math.min(pages, Math.max(1, Math.round(p)));
    if (next !== page) onChange(next);
    else setTyped(String(page));
  };
  const jump = (e: FormEvent) => {
    e.preventDefault();
    const n = Number(typed);
    if (Number.isFinite(n)) go(n);
    else setTyped(String(page));
  };
  return (
    <nav className={cx("sh-pager", className)} aria-label={label}>
      <button
        type="button"
        className="sh-pager-step"
        disabled={page <= 1}
        onClick={() => go(page - 1)}
        aria-label="Previous page"
      >
        <Icon name="chevronLeft" size={16} />
        <span className="sh-pager-word">Previous</span>
      </button>
      <ol className="sh-pager-pages">
        {pageWindow(page, pages).map((p, i) =>
          p === null ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: there are at most two gaps, and they keep their place.
            <li key={`gap-${i}`} className="sh-pager-gap" aria-hidden="true">
              …
            </li>
          ) : (
            <li key={p}>
              <button
                type="button"
                className="sh-pager-page"
                aria-current={p === page ? "page" : undefined}
                aria-label={`Page ${p}`}
                onClick={() => go(p)}
              >
                {p}
              </button>
            </li>
          ),
        )}
      </ol>
      <form className="sh-pager-jump" onSubmit={jump}>
        <label>
          Page{" "}
          <input
            className="sh-pager-field"
            inputMode="numeric"
            value={typed}
            onChange={(e) => setTyped(e.target.value.replace(/\D/g, ""))}
            onBlur={jump}
            aria-label={`Page, of ${pages}`}
            size={String(pages).length}
          />{" "}
          of {pages}
        </label>
      </form>
      <button
        type="button"
        className="sh-pager-step"
        disabled={page >= pages}
        onClick={() => go(page + 1)}
        aria-label="Next page"
      >
        <span className="sh-pager-word">Next</span>
        <Icon name="chevronRight" size={16} />
      </button>
    </nav>
  );
}

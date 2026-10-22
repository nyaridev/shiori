// A block of the rail beside a page (the contents, the comments) under a small label: its name, a count, its own
// tools, and a chevron that folds it. Folding is remembered per wiki, in this browser.
import { type ReactNode, useId } from "react";
import { useFolded } from "./sidebar/folded.ts";
import { Fold } from "./sidebar/NavTree.tsx";

export function RailSection({
  wikiId,
  id,
  title,
  count,
  tools,
  as: Tag = "section",
  children,
}: {
  wikiId: string;
  /** Names its fold. */
  id: string;
  title: string;
  /** A number after the title (open comments). */
  count?: number;
  /** Controls at the strip's end, before its chevron. */
  tools?: ReactNode;
  as?: "section" | "nav";
  children: ReactNode;
}) {
  const [folded, toggle] = useFolded(wikiId, `rail:${id}`, false);
  const body = useId();
  const heading = useId();
  return (
    <Tag className={`sh-rail-section sh-${id}`} aria-labelledby={heading}>
      <div className="sh-rail-strip">
        <button
          type="button"
          id={heading}
          className="sh-rail-title"
          onClick={toggle}
          aria-expanded={!folded}
          aria-controls={body}
        >
          {title}
          {!!count && <span className="sh-rail-count">{count}</span>}
        </button>
        {tools}
        <Fold folded={folded} onClick={toggle} label={title} controls={body} />
      </div>
      <div id={body} className="sh-collapse" data-folded={folded || undefined} inert={folded || undefined}>
        <div className="sh-rail-body">{children}</div>
      </div>
    </Tag>
  );
}

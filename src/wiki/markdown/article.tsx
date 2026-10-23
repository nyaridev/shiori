// The end of an article, as on a game wiki: citations and the References list (footnotes, server/markdown/
// references.ts), a changelog for its History, and navboxes of related pages (server/markdown/navbox.ts). The public
// wiki draws the same markup (server/public/html.ts), so article.css styles both.
import { Children, isValidElement, type ReactNode } from "react";
import { Icon, Tooltip } from "../../ui/index.ts";
import "./article.css";

type Props<T = object> = T & { children?: ReactNode };

/** A citation: its number, which previews the reference and jumps to it. */
export function CiteEl({ id, n, note }: Props<{ id?: string; n?: string; note?: string }>) {
  const link = (
    <a href={`#ref-${n}`} aria-label={`Reference ${n}`}>
      {n}
    </a>
  );
  return (
    <sup className="sh-cite" id={id}>
      {note ? <Tooltip content={<span className="sh-cite-tip">{note}</span>}>{link}</Tooltip> : link}
    </sup>
  );
}

export const ReferencesEl = ({ children }: Props) => <ol className="sh-references">{children}</ol>;

/** One reference: its number, what it says, and the way back to each place it's cited. */
export function ReferenceEl({ id, n, cites = "", children }: Props<{ id?: string; n?: string; cites?: string }>) {
  const ids = cites.split(" ").filter(Boolean);
  return (
    <li className="sh-reference" id={id}>
      <span className="sh-reference-n">{n}</span>
      <span className="sh-reference-body">{children}</span>
      <span className="sh-reference-back">
        {ids.length === 1 ? (
          <a href={`#${ids[0]}`} aria-label="Back to the text" title="Back to the text">
            <Icon name="reply" size={13} />
          </a>
        ) : (
          ids.map((c, i) => (
            <a key={c} href={`#${c}`} aria-label={`Back to citation ${i + 1}`}>
              {String.fromCharCode(97 + i)}
            </a>
          ))
        )}
      </span>
    </li>
  );
}

export const ChangelogEl = ({ title, children }: Props<{ title?: string }>) => (
  <div className="sh-changelog">
    {title && <p className="sh-changelog-title">{title}</p>}
    <ol className="sh-changelog-list">{children}</ol>
  </div>
);

export const ChangeEl = ({ version, children }: Props<{ version?: string }>) => (
  <li className="sh-change">
    <span className="sh-change-version">{version}</span>
    <div className="sh-change-body">{children}</div>
  </li>
);

export const NavboxEl = ({ title, children }: Props<{ title?: string }>) => (
  <details className="sh-navbox" open>
    <summary className="sh-navbox-head">
      <span className="sh-navbox-title">{title || "See also"}</span>
      <span className="sh-navbox-fold">
        <Icon name="chevronDown" size={16} />
      </span>
    </summary>
    <div className="sh-navbox-body">{children}</div>
  </details>
);

export const NavboxLabelEl = ({ children }: Props) => <div className="sh-navbox-label">{children}</div>;

/** A row: its label beside its links and the rows inside it. */
export function NavboxGroupEl({ children }: Props) {
  const all = Children.toArray(children).filter((c) => typeof c !== "string" || c.trim());
  const label = all.find((c) => isValidElement(c) && c.type === NavboxLabelEl);
  return (
    <div className="sh-navbox-group" data-bare={label ? undefined : ""}>
      {label}
      <div className="sh-navbox-content">{all.filter((c) => c !== label)}</div>
    </div>
  );
}

export const NavboxItemsEl = ({ children }: Props) => <ul className="sh-navbox-items">{children}</ul>;

export const NavboxItemEl = ({ children }: Props) => <li>{children}</li>;

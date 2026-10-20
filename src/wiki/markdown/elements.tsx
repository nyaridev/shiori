// React components for the `sh-*` elements the server produces (server/markdown/elements.ts).
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { Link } from "react-router";
import { Badge, type BadgeTone, Callout, type CalloutTone, Icon, Kbd, Tabs } from "../../ui/index.ts";

type Props<T = object> = T & { children?: ReactNode };

export function WikiLink({ href, children, ...rest }: Props<{ href?: string; target?: string; rel?: string }>) {
  if (href?.startsWith("/w/") || href?.startsWith("/dev/")) {
    return (
      <Link to={href} className="sh-link">
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className="sh-link" {...rest}>
      {children}
    </a>
  );
}

export const CalloutEl = ({ tone, title, children }: Props<{ tone?: CalloutTone; title?: string }>) => (
  <Callout tone={tone} title={title}>
    {children}
  </Callout>
);

export function InfoboxEl({
  title,
  image,
  caption,
  children,
}: Props<{ title?: string; image?: string; caption?: string }>) {
  return (
    <aside className="sh-infobox">
      {title && <p className="sh-infobox-title">{title}</p>}
      {image && <img className="sh-infobox-image" src={image} alt={title ?? ""} />}
      {caption && <p className="sh-infobox-caption">{caption}</p>}
      <div className="sh-infobox-rows">{children}</div>
    </aside>
  );
}

export const RowEl = ({ children }: Props) => <div className="sh-infobox-row">{children}</div>;
export const KeyEl = ({ children }: Props) => <span className="sh-infobox-key">{children}</span>;
export const ValueEl = ({ children }: Props) => <span className="sh-infobox-value">{children}</span>;

export const TabEl = ({ children }: Props<{ label?: string }>) => <>{children}</>;

export function TabsEl({ children }: Props) {
  const tabs = Children.toArray(children).filter(isValidElement) as ReactElement<Props<{ label?: string }>>[];
  return (
    <Tabs
      items={tabs.map((t, i) => ({
        value: String(i),
        label: t.props.label || `Tab ${i + 1}`,
        content: t.props.children,
      }))}
    />
  );
}

export const ColumnsEl = ({ children }: Props) => <div className="sh-columns">{children}</div>;
export const ColumnEl = ({ children }: Props) => <div className="sh-column">{children}</div>;

export function DetailsEl({ summary, children }: Props<{ summary?: string }>) {
  return (
    <details className="sh-details">
      <summary>
        <Icon name="chevronRight" size={16} />
        {summary || "Details"}
      </summary>
      <div className="sh-details-body">{children}</div>
    </details>
  );
}

export const BadgeEl = ({ tone, children }: Props<{ tone?: BadgeTone }>) => <Badge tone={tone}>{children}</Badge>;
export const KbdEl = ({ children }: Props) => <Kbd>{children}</Kbd>;

export const UnknownEl = ({ name, children }: Props<{ name?: string }>) => (
  <Callout tone="danger" title={`Unknown element ${name ?? ""}`}>
    {children}
  </Callout>
);

/** GFM task list boxes: read-only. */
export function TaskBox({ type, checked }: { type?: string; checked?: boolean }) {
  if (type !== "checkbox") return null;
  return (
    <span className="sh-task" data-checked={checked || undefined} role="img" aria-label={checked ? "done" : "open"}>
      {checked && <Icon name="check" size={12} />}
    </span>
  );
}

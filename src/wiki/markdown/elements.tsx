// React components for the `sh-*` elements the server produces (server/markdown/elements.ts).
import {
  Children,
  createContext,
  type ImgHTMLAttributes,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { Link } from "react-router";
import { picture } from "../../lib/base.ts";
import { SheetBlock } from "../../sheets/SheetBlock.tsx";
import {
  Badge,
  type BadgeTone,
  Callout,
  type CalloutTone,
  CheckMark,
  Dialog,
  DialogContent,
  DialogTrigger,
  HoverCard,
  Icon,
  Kbd,
  ScrollArea,
  type TabItem,
  Tabs,
} from "../../ui/index.ts";
import { PageIcon } from "../PageIcon.tsx";
import { PagePreview } from "../PagePreview.tsx";
import { useViewer } from "../viewer/ViewerContext.ts";
import { Zoom } from "../viewer/Zoom.tsx";
import { usePageAt, useWikiIndex } from "../WikiIndexContext.ts";

type Props<T = object> = T & { children?: ReactNode };

type LinkProps = Props<{
  href?: string;
  target?: string;
  rel?: string;
  "data-missing"?: string;
  "data-chip"?: string;
}>;

/**
 * Links in pages. Links to a page preview it on hover (ADR-0002); a link to a page not written yet is a red link,
 * like on Wikipedia.
 */
export function WikiLink({ href, children, "data-missing": missing, "data-chip": chip, ...rest }: LinkProps) {
  const page = usePageAt(href);
  if (href?.startsWith("/w/") || href?.startsWith("/dev/")) {
    const isMissing = missing !== undefined;
    // `:page[Name]` shows as a chip with the page's icon.
    const link = (
      <Link
        to={href}
        className={chip === undefined ? "sh-link" : "sh-link sh-link-chip"}
        data-missing={isMissing || undefined}
        title={isMissing ? "This page hasn't been written yet" : undefined}
      >
        {chip !== undefined && <PageIcon icon={isMissing ? "puzzle" : page?.icon} fallback="page" />}
        {children}
      </Link>
    );
    return page && !isMissing ? (
      <HoverCard trigger={link}>
        <PagePreview page={page} />
      </HoverCard>
    ) : (
      link
    );
  }
  return (
    <a href={href} className="sh-link" {...rest}>
      {children}
    </a>
  );
}

/** `##` and `###` headings, with a link icon on hover that copies a link to the section. */
function headingWith(Tag: "h2" | "h3") {
  return function Heading({ id, children }: Props<{ id?: string }>) {
    const [copied, setCopied] = useState(false);
    useEffect(() => {
      if (!copied) return;
      const timer = setTimeout(() => setCopied(false), 1400);
      return () => clearTimeout(timer);
    }, [copied]);
    return (
      <Tag id={id}>
        {children}
        {id && (
          <a
            href={`#${id}`}
            className="sh-heading-link"
            aria-label={copied ? "Link copied" : "Copy a link to this section"}
            data-copied={copied || undefined}
            onClick={(e) => {
              e.preventDefault();
              window.history.replaceState(window.history.state, "", `#${id}`);
              navigator.clipboard?.writeText(window.location.href).then(
                () => setCopied(true),
                () => {},
              );
            }}
          >
            <Icon name={copied ? "check" : "link"} size={14} />
          </a>
        )}
      </Tag>
    );
  };
}

/** A table that scrolls sideways inside its panel when it's wider than the page (phones). */
export const TableEl = ({ children, ...rest }: Props<object>) => (
  <ScrollArea axis="x" label="Table" className="sh-table-wrap">
    <table {...rest}>{children}</table>
  </ScrollArea>
);

/** A formula on lines of its own (server/markdown/math.ts) scrolls sideways when it's wider than the page. */
export const DivEl = ({ children, className, ...rest }: Props<{ className?: string }>) =>
  className === "sh-math-block" ? (
    <ScrollArea axis="x" label="Formula" className="sh-math-block" {...rest}>
      {children}
    </ScrollArea>
  ) : (
    <div className={className} {...rest}>
      {children}
    </div>
  );

export const H2El = headingWith("h2");
export const H3El = headingWith("h3");

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
      {image && (
        <Zoom src={image} label={caption ?? title}>
          <img className="sh-infobox-image" src={picture(image, 960)} alt={title ?? ""} />
        </Zoom>
      )}
      {caption && <p className="sh-infobox-caption">{caption}</p>}
      <div className="sh-infobox-rows">{children}</div>
    </aside>
  );
}

export const RowEl = ({ children }: Props) => <div className="sh-infobox-row">{children}</div>;
export const KeyEl = ({ children }: Props) => <span className="sh-infobox-key">{children}</span>;
export const ValueEl = ({ children }: Props) => <span className="sh-infobox-value">{children}</span>;

type TabProps = Props<{ label?: string; tone?: TabItem["tone"] }>;

export const TabEl = ({ children }: TabProps) => <>{children}</>;

export function TabsEl({ children }: Props) {
  const tabs = Children.toArray(children).filter(isValidElement) as ReactElement<TabProps>[];
  return (
    <Tabs
      items={tabs.map((t, i) => ({
        value: String(i),
        label: t.props.label || `Tab ${i + 1}`,
        content: t.props.children,
        tone: t.props.tone,
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

export const StatsEl = ({ children }: Props) => <div className="sh-stats">{children}</div>;

export function StatEl({
  label,
  value,
  change,
  trend,
}: Props<{ label?: string; value?: string; change?: string; trend?: string }>) {
  return (
    <div className="sh-stat" data-trend={trend}>
      <span className="sh-stat-label">{label}</span>
      <span className="sh-stat-value">{value}</span>
      {change && <span className="sh-stat-change">{change}</span>}
    </div>
  );
}

export const TimelineEl = ({ children }: Props) => <ol className="sh-timeline">{children}</ol>;

export function MilestoneEl({ when, state, children }: Props<{ when?: string; state?: string }>) {
  return (
    <li className="sh-milestone" data-state={state}>
      <span className="sh-milestone-dot" aria-hidden="true">
        {state === "done" && <Icon name="check" size={10} />}
      </span>
      {(when || state === "now") && (
        <p className="sh-milestone-when">
          {when}
          {state === "now" && <Badge tone="accent">Now</Badge>}
        </p>
      )}
      <div className="sh-milestone-body">{children}</div>
    </li>
  );
}

export const CardsEl = ({ children }: Props) => <div className="sh-cards">{children}</div>;

/** The whole card is its title link's target (the link stretches over it in CSS). */
export function CardEl({ icon, children }: Props<{ icon?: string }>) {
  return (
    <div className="sh-card">
      <PageIcon icon={icon || undefined} className="sh-card-icon" />
      {children}
    </div>
  );
}

export const CardTitleEl = ({ children }: Props) => <p className="sh-card-title">{children}</p>;

/** `:icon[name]`: one of Shiori's drawn icons, inline. */
export const IconEl = ({ name }: Props<{ name?: string }>) => <PageIcon icon={name} />;

/** Inside a gallery tile, which is already the button that opens the picture. */
const InShot = createContext(false);

/** An image in a page; it opens the image viewer. Its URL is the server's, so a guest's goes under the share link. */
export function ImgEl({ src, alt, ...rest }: ImgHTMLAttributes<HTMLImageElement>) {
  const inShot = useContext(InShot);
  // A gallery tile is small; a picture in the text can be as wide as the article.
  const img = <img src={picture(src, inShot ? 480 : 1600)} alt={alt ?? ""} {...rest} />;
  return inShot ? (
    img
  ) : (
    <Zoom src={src} label={rest.title ?? alt}>
      {img}
    </Zoom>
  );
}

export const GalleryEl = ({ children }: Props) => <div className="sh-gallery">{children}</div>;

/** A gallery tile; it opens the image viewer (in the toolbox, where there's none, a dialog with the image). */
export function ShotEl({ caption, children }: Props<{ caption?: string }>) {
  const viewer = useViewer();
  const src = Children.toArray(children)
    .filter(isValidElement)
    .map((c) => (c.props as { src?: unknown }).src)
    .find((s): s is string => typeof s === "string");
  const tile = (
    <InShot.Provider value={true}>
      {children}
      {caption && <span className="sh-shot-caption">{caption}</span>}
    </InShot.Provider>
  );
  if (viewer && src) {
    return (
      <button type="button" className="sh-shot" onClick={() => viewer.open(src)}>
        {tile}
      </button>
    );
  }
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className="sh-shot">
          {tile}
        </button>
      </DialogTrigger>
      <DialogContent title={caption || "Image"} size="wide">
        <div className="sh-shot-full">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

export function ProgressEl({ value, max, children }: Props<{ value?: string; max?: string }>) {
  const total = Number(max) > 0 ? Number(max) : 100;
  const done = Math.min(Math.max(Number(value) || 0, 0), total);
  const pct = (done / total) * 100;
  return (
    <span className="sh-progress" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total}>
      {children && <span className="sh-progress-label">{children}</span>}
      <span className="sh-progress-track">
        <span className="sh-progress-bar" style={{ width: `${pct}%` }} />
      </span>
      <span className="sh-progress-value">{max ? `${done}/${total}` : `${Math.round(pct)}%`}</span>
    </span>
  );
}

/**
 * `:::private` and `:private[…]` (ADR-0011): shown here, marked, and left out of the public wiki. A block says why
 * when its `note` does.
 */
export function PrivateEl({ note, children, inline }: Props<{ note?: string; inline?: string }>) {
  if (inline !== undefined)
    return (
      <span className="sh-private-inline" title="Not in the public wiki">
        {children}
      </span>
    );
  return (
    <section className="sh-private" aria-label="Private: not in the public wiki">
      <p className="sh-private-label">
        <Icon name="eyeOff" size={13} />
        Not in the public wiki{note ? ` · ${note}` : ""}
      </p>
      {children}
    </section>
  );
}

/** `:spoiler[…]` and `:::spoiler[Title]`: hidden until the reader opens it. */
export function SpoilerEl({ title, children, inline }: Props<{ title?: string; inline?: string }>) {
  const [shown, setShown] = useState(false);
  if (inline !== undefined)
    return (
      <button
        type="button"
        className="sh-spoiler-inline"
        data-shown={shown || undefined}
        aria-pressed={shown}
        aria-label={shown ? undefined : "Spoiler: show it"}
        onClick={() => setShown(true)}
      >
        <span aria-hidden={!shown}>{children}</span>
      </button>
    );
  return (
    <details className="sh-details sh-spoiler">
      <summary>
        <Icon name="chevronRight" size={16} />
        {title || "Spoiler"}
      </summary>
      <div className="sh-details-body">{children}</div>
    </details>
  );
}

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
      {checked && <CheckMark size={13} />}
    </span>
  );
}

/** `::sheet{name}` (ADR-0010): a data sheet, editable for the owner. Outside a wiki (the element reference), a note. */
export function SheetEl({ name }: Props<{ name?: string }>) {
  const wiki = useWikiIndex();
  if (!wiki)
    return <p className="sh-element-placeholder">A data sheet's table shows here, its values ready to tune.</p>;
  if (!name) return null;
  return <SheetBlock wikiId={wiki.wikiId} name={name} />;
}

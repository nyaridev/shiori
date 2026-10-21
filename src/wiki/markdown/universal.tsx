// React components for the universal elements (ADR-0002): related, children, toc, status, steps, compare, quote,
// embed. Elements that list what the page knows read it from PageContext; elsewhere (the /dev/ui reference) they
// say what they'd show.
import type { ReactNode } from "react";
import { Link } from "react-router";
import { PAGE_STATUSES, type PageStatus } from "../../../shared/schema.ts";
import { Badge } from "../../ui/index.ts";
import { usePage } from "../PageContext.ts";
import { PageCard } from "../PageFoot.tsx";
import { pageHref } from "../PageHead.tsx";
import { QuestionCard } from "../questions/QuestionCard.tsx";
import { Related } from "../Related.tsx";
import { StatusBadge } from "../StatusBadge.tsx";
import "./universal.css";

type Props<T = object> = T & { children?: ReactNode };

const Placeholder = ({ children }: Props) => <p className="sh-element-placeholder">{children}</p>;

export function RelatedEl({ kind }: Props<{ kind?: string }>) {
  const ctx = usePage();
  if (!ctx) return <Placeholder>Related pages from the page's `related:` frontmatter show here.</Placeholder>;
  return <Related wikiId={ctx.wikiId} page={ctx.page} kind={kind} />;
}

export function QuestionEl({ id }: Props<{ id?: string }>) {
  const ctx = usePage();
  if (!ctx) return <Placeholder>A question from the page's `questions:` frontmatter shows here.</Placeholder>;
  const question = ctx.page.questions.find((q) => q.id === id);
  if (!question) return <Placeholder>There's no question “{id}” in this page's frontmatter.</Placeholder>;
  return <QuestionCard question={question} />;
}

export function ChildrenEl({ layout = "cards" }: Props<{ layout?: string }>) {
  const ctx = usePage();
  if (!ctx) return <Placeholder>The pages under this one show here.</Placeholder>;
  const { wikiId, page } = ctx;
  if (!page.children.length) return null;
  if (layout === "list") {
    return (
      <ul className="sh-children-list">
        {page.children.map((c) => (
          <li key={c.path}>
            <Link to={pageHref(wikiId, c.path)} className="sh-link">
              {c.icon && <span aria-hidden="true">{c.icon} </span>}
              {c.title}
            </Link>
            {c.summary && <span className="sh-children-summary"> — {c.summary}</span>}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="sh-sections-grid sh-children-cards">
      {page.children.map((c) => (
        <PageCard key={c.path} wikiId={wikiId} page={c} />
      ))}
    </div>
  );
}

/** Contents inside the article, numbered like Wikipedia's (1, 1.1, 2…). */
export function TocEl() {
  const ctx = usePage();
  if (!ctx) return <Placeholder>The page's contents show here.</Placeholder>;
  let major = 0;
  let minor = 0;
  const entries = ctx.page.toc.map((e) => {
    if (e.depth === 2) {
      major++;
      minor = 0;
      return { ...e, number: `${major}` };
    }
    minor++;
    return { ...e, number: `${Math.max(major, 1)}.${minor}` };
  });
  if (!entries.length) return null;
  return (
    <nav className="sh-inline-toc" aria-label="Contents">
      <p className="sh-inline-toc-title">Contents</p>
      <ol>
        {entries.map((e) => (
          <li key={e.id} data-depth={e.depth}>
            <a href={`#${e.id}`}>
              <span className="sh-inline-toc-number">{e.number}</span>
              {e.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function StatusEl({ value, children }: Props<{ value?: string }>) {
  return (PAGE_STATUSES as readonly string[]).includes(value ?? "") ? (
    <StatusBadge status={value as PageStatus} />
  ) : (
    <Badge>{children}</Badge>
  );
}

export function StepsEl({ title, children }: Props<{ title?: string }>) {
  return (
    <div className="sh-steps">
      {title && <p className="sh-steps-title">{title}</p>}
      <ol>{children}</ol>
    </div>
  );
}

export const StepEl = ({ title, children }: Props<{ title?: string }>) => (
  <li className="sh-step">
    {title && <p className="sh-step-title">{title}</p>}
    <div className="sh-step-body">{children}</div>
  </li>
);

export const CompareEl = ({ children }: Props) => <div className="sh-compare">{children}</div>;

export function OptionEl({ name, picked, children }: Props<{ name?: string; picked?: string }>) {
  const chosen = picked !== undefined;
  return (
    <section className="sh-option" data-picked={chosen || undefined} aria-label={name}>
      <header className="sh-option-head">
        <span className="sh-option-name">{name}</span>
        {chosen && <Badge tone="good">Chosen</Badge>}
      </header>
      <div className="sh-option-body">{children}</div>
    </section>
  );
}

const MARKS: Record<string, string> = { pro: "+", con: "−", note: "•" };

export const PointEl = ({ kind = "note", label, children }: Props<{ kind?: string; label?: string }>) => (
  <div className="sh-point" data-kind={kind}>
    <span className="sh-point-mark" aria-hidden="true">
      {MARKS[kind] ?? "•"}
    </span>
    <div className="sh-point-body">
      {kind !== "note" && <span className="sh-sr-only">{kind === "pro" ? "Pro: " : "Con: "}</span>}
      {label && <strong className="sh-point-label">{label}: </strong>}
      {children}
    </div>
  </div>
);

export function QuoteEl({
  by,
  role,
  source,
  url,
  children,
}: Props<{ by?: string; role?: string; source?: string; url?: string }>) {
  const safeUrl = url && /^https?:\/\//i.test(url) ? url : undefined;
  return (
    <figure className="sh-quote">
      <blockquote>{children}</blockquote>
      {(by || source) && (
        <figcaption>
          {by && <strong>{by}</strong>}
          {role && <span>, {role}</span>}
          {source && (
            <span>
              {by ? " · " : ""}
              {safeUrl ? (
                <a href={safeUrl} target="_blank" rel="noreferrer" className="sh-link">
                  {source}
                </a>
              ) : (
                source
              )}
            </span>
          )}
        </figcaption>
      )}
    </figure>
  );
}

export function EmbedEl({
  src,
  provider,
  caption,
  url,
}: Props<{ src?: string; provider?: string; caption?: string; url?: string }>) {
  if (!src) {
    return <Placeholder>Can't play “{url}” here: only YouTube, Vimeo and Figma links can be embedded.</Placeholder>;
  }
  return (
    <figure className="sh-embed" data-provider={provider}>
      <div className="sh-embed-frame">
        <iframe
          src={src}
          title={caption || `${provider} embed`}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

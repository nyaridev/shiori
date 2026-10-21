// The home page's elements (ADR-0002): `::::boxes` of titled `:::box`es, and blocks that show the whole wiki live:
// recent changes, open questions and tasks, the latest discussions, and the directory of sections. Each wiki's home
// places the ones it wants, so every wiki's front page is its own. Outside a wiki (the /dev/ui reference) the blocks
// say what they'd show.
import type { ReactNode } from "react";
import { Link } from "react-router";
import type { Thread } from "../../../shared/api.ts";
import { DesignsGallery } from "../../designs/DesignsGallery.tsx";
import { authorName, useGuest } from "../../guest/GuestContext.ts";
import { api } from "../../lib/api.ts";
import { useLive } from "../../lib/live.ts";
import { ago } from "../../lib/time.ts";
import { useResource } from "../../lib/useResource.ts";
import { Icon } from "../../ui/index.ts";
import { pageHref, specialHref } from "../PageHead.tsx";
import { PageIcon } from "../PageIcon.tsx";
import { useWikiIndex } from "../WikiIndexContext.ts";
import "./home.css";

type Props<T = object> = T & { children?: ReactNode };

const Placeholder = ({ children }: Props) => <p className="sh-element-placeholder">{children}</p>;
const Empty = ({ children }: Props) => <p className="sh-block-empty">{children}</p>;
const howMany = (count: string | undefined, fallback: number) => Math.min(50, Math.max(1, Number(count) || fallback));

/** "See all" under a block, to the special page with the whole list. */
function More({ wikiId, route, children }: Props<{ wikiId: string; route: string }>) {
  return (
    <Link to={specialHref(wikiId, route)} className="sh-block-more">
      {children}
      <Icon name="arrowRight" size={13} />
    </Link>
  );
}

export function BoxesEl({ columns, children }: Props<{ columns?: string }>) {
  return (
    <div className="sh-boxes" data-columns={columns}>
      {children}
    </div>
  );
}

export function BoxEl({ title, icon, span, children }: Props<{ title?: string; icon?: string; span?: string }>) {
  return (
    <section className="sh-box" data-span={span}>
      {title && (
        <h2 className="sh-box-title">
          <PageIcon icon={icon} className="sh-box-icon" />
          {title}
        </h2>
      )}
      <div className="sh-box-body">{children}</div>
    </section>
  );
}

export function RecentChangesEl({ count }: Props<{ count?: string }>) {
  const wiki = useWikiIndex();
  if (!wiki) return <Placeholder>The pages edited most recently show here.</Placeholder>;
  const pages = wiki.index.pages
    .filter((p) => !p.hidden && p.updatedAt)
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
    .slice(0, howMany(count, 6));
  if (!pages.length) return <Empty>No page has been edited yet.</Empty>;
  return (
    <>
      <ul className="sh-block-list">
        {pages.map((p) => (
          <li key={p.path}>
            <Link to={pageHref(wiki.wikiId, p.path)} className="sh-block-link">
              <PageIcon icon={p.icon} fallback="page" />
              <span className="sh-block-name">{p.title}</span>
            </Link>
            {p.updatedAt && (
              <time className="sh-block-when" dateTime={p.updatedAt} title={new Date(p.updatedAt).toLocaleString()}>
                {ago(p.updatedAt)}
              </time>
            )}
          </li>
        ))}
      </ul>
      <More wikiId={wiki.wikiId} route="recent">
        All recent changes
      </More>
    </>
  );
}

export function OpenQuestionsEl({ count }: Props<{ count?: string }>) {
  const wiki = useWikiIndex();
  if (!wiki) return <Placeholder>The decisions the pages ask for, newest pages first, show here.</Placeholder>;
  const updated = (path: string) => wiki.byPath.get(path)?.updatedAt ?? "";
  const open = wiki.index.questions
    .filter((q) => q.status === "open")
    .sort((a, b) => updated(b.page.path).localeCompare(updated(a.page.path)))
    .slice(0, howMany(count, 5));
  if (!open.length) return <Empty>Nothing to decide right now.</Empty>;
  return (
    <>
      <ul className="sh-block-list sh-block-questions">
        {open.map((q) => (
          <li key={`${q.page.path}#${q.id}`}>
            <Link to={`${pageHref(wiki.wikiId, q.page.path)}#question-${q.id}`} className="sh-block-link">
              <span className="sh-block-name">{q.text}</span>
            </Link>
            <span className="sh-block-meta">
              <PageIcon icon={q.page.icon} fallback="page" className="sh-icon-gap" />
              {q.page.title} · {q.answers} answer{q.answers === 1 ? "" : "s"}
            </span>
          </li>
        ))}
      </ul>
      <More wikiId={wiki.wikiId} route="questions">
        All questions
      </More>
    </>
  );
}

export function OpenTasksEl({ count }: Props<{ count?: string }>) {
  const wiki = useWikiIndex();
  if (!wiki) return <Placeholder>The checkboxes still open across the wiki show here.</Placeholder>;
  const open = wiki.index.tasks.filter((t) => !t.done).slice(0, howMany(count, 6));
  if (!open.length) return <Empty>Every task is done.</Empty>;
  return (
    <>
      <ul className="sh-block-list">
        {open.map((t, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: two tasks can read the same; order is stable.
          <li key={i}>
            <span className="sh-block-task">
              <span className="sh-task" aria-hidden="true" />
              <span className="sh-block-name">{t.text}</span>
            </span>
            <Link
              to={`${pageHref(wiki.wikiId, t.page.path)}${t.section ? `#${t.section.id}` : ""}`}
              className="sh-block-meta sh-block-page"
            >
              <PageIcon icon={t.page.icon} fallback="page" className="sh-icon-gap" />
              {t.page.title}
            </Link>
          </li>
        ))}
      </ul>
      <More wikiId={wiki.wikiId} route="tasks">
        All tasks
      </More>
    </>
  );
}

const lastAt = (t: Thread) => t.messages[t.messages.length - 1]?.createdAt ?? t.createdAt;

export function DiscussionsEl({ count }: Props<{ count?: string }>) {
  const wiki = useWikiIndex();
  const guest = useGuest();
  const wikiId = wiki?.wikiId ?? null;
  const threads = useResource(wikiId && `threads:${wikiId}:all`, () => api.threads(wikiId as string));
  const { reload } = threads;
  useLive((e) => {
    if (e.type === "threads" && e.wiki === wikiId) reload();
  });
  if (!wiki) return <Placeholder>The latest comments and replies across the wiki show here.</Placeholder>;
  if (!threads.data) return <Empty>Loading…</Empty>;
  const latest = threads.data
    .filter((t) => t.status === "open" && t.messages.length)
    .sort((a, b) => lastAt(b).localeCompare(lastAt(a)))
    .slice(0, howMany(count, 5));
  if (!latest.length) return <Empty>No open discussions. Select text on any page to start one.</Empty>;
  return (
    <ul className="sh-block-list sh-block-discussions">
      {latest.map((t) => {
        const last = t.messages[t.messages.length - 1];
        const page = wiki.byPath.get(t.page);
        return (
          <li key={t.id}>
            <Link to={pageHref(wiki.wikiId, t.page)} className="sh-block-link">
              <span className="sh-block-name">
                <strong>{authorName(guest, last)}</strong> {last.body}
              </span>
            </Link>
            <span className="sh-block-meta">
              {t.quote.exact ? `on “${t.quote.exact.slice(0, 60)}${t.quote.exact.length > 60 ? "…" : ""}” · ` : ""}
              {page?.title ?? (t.page || "Home")} · {t.messages.length} message{t.messages.length === 1 ? "" : "s"} ·{" "}
              {ago(lastAt(t))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** `::designs{collection=…}`: a collection's designs, with the button that makes a new one (ADR-0006). */
export function DesignsEl({ collection }: Props<{ collection?: string }>) {
  const wiki = useWikiIndex();
  const detail = useResource(wiki ? `wiki:${wiki.wikiId}` : null, () => api.wiki(wiki?.wikiId ?? ""));
  if (!wiki) return <Placeholder>A collection's designs, and the button that starts a new one, show here.</Placeholder>;
  const meta = collection ? detail.data?.collections[collection] : undefined;
  if (!detail.data) return null;
  if (!collection || !meta) return <Empty>There's no collection “{collection}” in this wiki.</Empty>;
  return <DesignsGallery wikiId={wiki.wikiId} collection={collection} title={meta.title} item={meta.item} />;
}

/** Every section of the wiki with its pages, like a wiki portal's directory. */
export function DirectoryEl() {
  const wiki = useWikiIndex();
  if (!wiki) return <Placeholder>Every section of the wiki, with its pages, shows here.</Placeholder>;
  const pages = wiki.index.pages.filter((p) => !p.hidden && p.path);
  const sections = new Map<string, typeof pages>();
  for (const p of pages) {
    const top = p.path.split("/")[0];
    if (p.path === top && !pages.some((q) => q.path.startsWith(`${top}/`))) {
      sections.set("", [...(sections.get("") ?? []), p]);
    } else if (p.path !== top) sections.set(top, [...(sections.get(top) ?? []), p]);
  }
  const titleOf = (top: string) => wiki.byPath.get(top);
  return (
    <div className="sh-directory">
      {[...sections].map(([top, list]) => {
        const head = titleOf(top);
        return (
          <section key={top} className="sh-directory-group">
            <h3 className="sh-directory-title">
              {top && head ? (
                <Link to={pageHref(wiki.wikiId, top)} className="sh-block-link">
                  <PageIcon icon={head.icon} className="sh-icon-gap" />
                  {head.title}
                </Link>
              ) : (
                (head?.title ?? (top || "Pages"))
              )}
            </h3>
            <ul className="sh-directory-list">
              {list
                .sort((a, b) => a.title.localeCompare(b.title))
                .map((p) => (
                  <li key={p.path}>
                    <Link to={pageHref(wiki.wikiId, p.path)} className="sh-block-link">
                      <PageIcon icon={p.icon} fallback="page" />
                      <span className="sh-block-name">{p.title}</span>
                    </Link>
                  </li>
                ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

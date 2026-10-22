// The wiki's sidebar: search, Home and the pages the wiki pins, then the page tree as tabs (SidebarTabs.tsx) with the
// Tools and the Toolbox beside its sections, all scrolling; under them, docked at the bottom, what this viewer opened
// lately. Every list folds; long ones start folded unless they hold the open page, and the viewer's choice is
// remembered in this browser.
import { type ReactNode, useId } from "react";
import { NavLink } from "react-router";
import type { WikiDetail } from "../../../shared/api.ts";
import { cx, Glider, Icon, Kbd, ScrollArea } from "../../ui/index.ts";
import { pageHref } from "../PageHead.tsx";
import { PageIcon } from "../PageIcon.tsx";
import { shortcutLabel } from "../SearchPalette.tsx";
import { useSeenPages } from "../seen.ts";
import { useWikiIndex } from "../WikiIndexContext.ts";
import { useFolded } from "./folded.ts";
import { Fold, flatten, LINKS, PendingDot } from "./NavTree.tsx";
import { usePending } from "./pending.ts";
import { useRecentlyViewed } from "./recent.ts";
import { SidebarTabs } from "./SidebarTabs.tsx";
import "./sidebar.css";

export function Sidebar({
  wiki,
  path,
  onNavigate,
  onSearch,
}: {
  wiki: WikiDetail;
  /** The open page (or `_/…` special page). */
  path: string;
  onNavigate?: () => void;
  onSearch: () => void;
}) {
  // What this browser remembers, with each page's name and icon as they are now.
  const pages = new Map(flatten(wiki.nav).map((n) => [n.path, n]));
  // A page changed since this viewer last had it open (seen.ts) gets a dot.
  const index = useWikiIndex();
  const seen = useSeenPages(wiki.id);
  const changedSince = (p: string) => {
    const at = seen[p]?.at;
    const updated = index?.byPath.get(p)?.updatedAt;
    return !!at && !!updated && updated > at;
  };
  const recent = useRecentlyViewed(wiki.id)
    .filter((p) => p.path !== path)
    .map((p) => {
      const now = pages.get(p.path);
      return { ...(now ? { ...p, title: now.title, icon: now.icon } : p), changed: changedSince(p.path) };
    });
  const changed = recent.filter((p) => p.changed).length;
  const pending = usePending(wiki.id);
  return (
    <nav className="sh-sidebar" aria-label={`${wiki.title} pages`}>
      <ScrollArea className="sh-sidebar-scroll">
        <div className="sh-sidebar-lists sh-glide-host">
          <Glider follow="pointer" select={LINKS} className="sh-side-hover" />
          <Glider follow="current" select={`${LINKS}.active`} className="sh-side-current" />
          <button type="button" className="sh-sidebar-search" onClick={onSearch}>
            <Icon name="search" size={14} />
            Search
            <Kbd>{shortcutLabel()}</Kbd>
          </button>
          <ul className="sh-nav sh-nav-pinned">
            <li>
              <NavLink to={pageHref(wiki.id, "")} end className="sh-nav-link" onClick={onNavigate}>
                <PageIcon icon="home" className="sh-nav-icon" />
                Home
                <PendingDot waiting={pending.get("")} />
              </NavLink>
            </li>
            {wiki.pinned.map((p) => (
              <li key={p.path}>
                <NavLink to={pageHref(wiki.id, p.path)} end className="sh-nav-link" onClick={onNavigate}>
                  <PageIcon icon={p.icon} fallback="page" className="sh-nav-icon" />
                  {p.title}
                  <PendingDot waiting={pending.get(p.path)} />
                </NavLink>
              </li>
            ))}
          </ul>
          <SidebarTabs wiki={wiki} path={path} pending={pending} onNavigate={onNavigate} />
        </div>
      </ScrollArea>
      {recent.length > 0 && (
        <Section
          wikiId={wiki.id}
          id="recent"
          className="sh-side-dock"
          title="Recently viewed"
          note={changed ? `${changed} changed` : undefined}
          long={false}
        >
          {recent.map((p) => (
            <li key={p.path}>
              <NavLink to={pageHref(wiki.id, p.path)} end className="sh-nav-link" onClick={onNavigate}>
                <PageIcon icon={p.icon} fallback="page" className="sh-nav-icon" />
                {p.title}
                <PendingDot waiting={pending.get(p.path)} />
                {p.changed && <span className="sh-nav-changed" title="Changed since you last opened it" />}
              </NavLink>
            </li>
          ))}
        </Section>
      )}
    </nav>
  );
}

function Section({
  wikiId,
  id,
  title,
  long,
  className,
  note,
  children,
}: {
  wikiId: string;
  id: string;
  title: string;
  className?: string;
  /** A short note after the title, like "2 changed". */
  note?: string;
  /** Starts folded until the viewer opens it. */
  long: boolean;
  children: ReactNode;
}) {
  const [folded, toggle] = useFolded(wikiId, `section:${id}`, long);
  const list = useId();
  return (
    <section className={cx("sh-side-section sh-glide-host", className)}>
      <Glider follow="pointer" select={LINKS} className="sh-side-hover" />
      <div className="sh-side-heading">
        <button type="button" className="sh-side-title" onClick={toggle} aria-expanded={!folded} aria-controls={list}>
          {title}
          {note && <span className="sh-side-note">{note}</span>}
        </button>
        <Fold folded={folded} onClick={toggle} label={title} controls={list} />
      </div>
      <div className="sh-collapse" data-folded={folded || undefined} inert={folded || undefined}>
        {/* The fold squeezes this, not the list: a list that scrolls would show its scrollbar while it opens. */}
        <ScrollArea viewClassName="sh-nav-scroll">
          <ul id={list} className="sh-nav">
            {children}
          </ul>
        </ScrollArea>
      </div>
    </section>
  );
}

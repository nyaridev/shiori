// The toolbox, the host's own page (opened in a new tab from the wiki header's Toolbox button), in two parts: the app's
// design system (tokens, primitives, icons, page elements, screens) on a page of its own, and what a wiki's pages can
// use (page kits, elements, page fields, icons, special pages), all in that wiki's theme. A toolbox is always one
// wiki's: its first frame takes the name and theme the header saved when it opened the tab (open.ts), so nothing
// flashes in the default colors while the wiki loads. Guests never get it: the button is the owner's, the route
// exists only in the owner's app, and the guest server has no toolbox routes.
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import type { WikiDetail } from "../../shared/api.ts";
import { DESIGN_SECTIONS, DesignSystem } from "../dev/UiPage.tsx";
import { api } from "../lib/api.ts";
import { useResource } from "../lib/useResource.ts";
import { useTheme } from "../lib/useTheme.ts";
import { Icon } from "../ui/index.ts";
import { pageHref } from "../wiki/PageHead.tsx";
import { PageIcon } from "../wiki/PageIcon.tsx";
import { Elements, Fields, Icons, Kits, Specials } from "../wiki/special/Toolbox.tsx";
import { WikiIndexContext } from "../wiki/WikiIndexContext.ts";
import { openedWiki, toolboxHref } from "./open.ts";
import "../dev/ui-page.css";
import "../wiki/special/special.css";
import "./toolbox.css";

/** What the toolbox holds: the app's design system, then what a wiki's pages can use. */
export const ENTRIES = [
  {
    id: "design",
    group: "app",
    icon: "shapes",
    title: "Design system",
    summary: "The app's tokens, buttons, fields, overlays, icons, every page element and the special screens.",
  },
  {
    id: "kits",
    group: "wiki",
    icon: "toolbox",
    title: "Page kits",
    summary: "The kinds of page agents start from, with what each holds and the command that makes one.",
  },
  {
    id: "elements",
    group: "wiki",
    icon: "blocks",
    title: "Elements",
    summary: "Every element a page can use, as written and as shown in this wiki's theme.",
  },
  {
    id: "fields",
    group: "wiki",
    icon: "bookmark",
    title: "Page fields",
    summary: "What a page's frontmatter can set: title, icon, status, infobox, questions and the rest.",
  },
  {
    id: "icons",
    group: "wiki",
    icon: "palette",
    title: "Icons",
    summary: "Shiori's drawn icons, by name: what a page's `icon` picks from before drawing its own.",
  },
  {
    id: "special",
    group: "wiki",
    icon: "cabinet",
    title: "Special pages",
    summary: "The wiki-wide lists the app makes from the pages.",
  },
] as const;

export function ToolboxPage() {
  const { wikiId } = useParams();
  // A toolbox is always one wiki's.
  if (!wikiId) return <Navigate to="/" replace />;
  return <Toolbox key={wikiId} wikiId={wikiId} />;
}

function Toolbox({ wikiId }: { wikiId: string }) {
  const { entry: raw } = useParams();
  const entry = ENTRIES.find((e) => e.id === raw) ?? ENTRIES[0];
  const wiki = useResource(`wiki:${wikiId}`, () => api.wiki(wikiId));
  const index = useResource(`pages:${wikiId}`, () => api.index(wikiId));
  const pages = useMemo(
    () =>
      index.data ? { wikiId, byPath: new Map(index.data.pages.map((p) => [p.path, p])), index: index.data } : null,
    [index.data, wikiId],
  );
  // Until the wiki answers: what the header saved when it opened this tab.
  const [opened] = useState(() => openedWiki(wikiId));
  const title = wiki.data?.title ?? opened?.title;
  useTheme(wiki.data?.theme ?? opened?.theme);
  useEffect(() => {
    document.title = `${entry.title} · Toolbox${title ? ` · ${title}` : ""}`;
  }, [entry.title, title]);

  if (wiki.error) return <p className="sh-special-empty">Couldn't open this wiki's toolbox: {wiki.error.message}</p>;
  // Opened by its address alone: nothing until the wiki's colors are known, rather than a flash of the default ones.
  if (!title) return null;

  const link = (e: (typeof ENTRIES)[number]) => (
    <Link
      key={e.id}
      to={toolboxHref(wikiId, e.id)}
      className="sh-toolbox-link"
      aria-current={e.id === entry.id ? "page" : undefined}
    >
      <PageIcon icon={e.icon} />
      {e.title}
    </Link>
  );
  return (
    <div className="ui-page sh-toolbox-page">
      <nav className="ui-nav" aria-label="Toolbox">
        <Link to={pageHref(wikiId, "")} className="ui-back">
          <Icon name="arrowLeft" size={16} /> {title}
        </Link>
        <p className="ui-nav-title">Toolbox</p>
        {/* The app's own design system, a page apart; its sections while it's open. */}
        <div className="sh-toolbox-group sh-toolbox-app">
          <p className="sh-toolbox-group-title">The app</p>
          {ENTRIES.filter((e) => e.group === "app").map(link)}
          {entry.group === "app" && (
            <div className="sh-toolbox-sub">
              {DESIGN_SECTIONS.map(([id, label]) => (
                <a key={id} href={`#${id}`}>
                  {label}
                </a>
              ))}
            </div>
          )}
        </div>
        {/* What this wiki's pages can use. */}
        <div className="sh-toolbox-group">
          <p className="sh-toolbox-group-title">This wiki's pages</p>
          {ENTRIES.filter((e) => e.group === "wiki").map(link)}
        </div>
      </nav>
      <main className="ui-main">
        {entry.group === "app" ? (
          <DesignSystem wikiTitle={title} />
        ) : (
          wiki.data && (
            <WikiIndexContext.Provider value={pages}>
              <Body entry={entry} wiki={wiki.data} />
            </WikiIndexContext.Provider>
          )
        )}
      </main>
    </div>
  );
}

function Body({ entry, wiki }: { entry: (typeof ENTRIES)[number]; wiki: WikiDetail }) {
  return (
    <>
      <header className="ui-head">
        <div>
          <h1>{entry.title}</h1>
          <p>{entry.summary}</p>
        </div>
      </header>
      <div className="sh-toolbox-body">
        {entry.id === "kits" ? (
          <Kits wiki={wiki} />
        ) : entry.id === "elements" ? (
          <Elements wiki={wiki} />
        ) : entry.id === "fields" ? (
          <Fields />
        ) : entry.id === "icons" ? (
          <Icons />
        ) : (
          <Specials wikiId={wiki.id} />
        )}
      </div>
    </>
  );
}

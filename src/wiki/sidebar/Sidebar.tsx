// The wiki's sidebar: search, Home and the pages the wiki pins, what this viewer opened lately, the page tree, then
// the Tools and the Toolbox. Every section folds; long ones start folded unless they hold the open page, and the
// viewer's choice is remembered in this browser.
import { type ReactNode, useId } from "react";
import { NavLink } from "react-router";
import type { NavNode, WikiDetail } from "../../../shared/api.ts";
import { Icon, Kbd } from "../../ui/index.ts";
import { pageHref } from "../PageHead.tsx";
import { PageIcon } from "../PageIcon.tsx";
import { shortcutLabel } from "../SearchPalette.tsx";
import { SPECIALS } from "../special/specials.ts";
import { useFolded } from "./folded.ts";
import { useRecentlyViewed } from "./recent.ts";
import "./sidebar.css";

/** A section with more entries than this starts folded. */
const LONG = 8;

/** The sidebar's lists of special pages: the wiki's own, then what pages can use. */
const GROUPS = [
  ["tools", "Tools"],
  ["toolbox", "Toolbox"],
] as const;

const count = (n: NavNode): number => n.children.reduce((sum, c) => sum + 1 + count(c), 0);

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
  const recent = useRecentlyViewed(wiki.id).filter((p) => p.path !== path);
  return (
    <nav className="sh-sidebar" aria-label={`${wiki.title} pages`}>
      <button type="button" className="sh-sidebar-search" onClick={onSearch}>
        <Icon name="search" size={14} />
        Search
        <Kbd>{shortcutLabel()}</Kbd>
      </button>
      <ul className="sh-nav sh-nav-pinned">
        <li>
          <NavLink to={pageHref(wiki.id, "")} end className="sh-nav-link" onClick={onNavigate}>
            <Icon name="home" size={15} />
            Home
          </NavLink>
        </li>
        {wiki.pinned.map((p) => (
          <li key={p.path}>
            <NavLink to={pageHref(wiki.id, p.path)} end className="sh-nav-link" onClick={onNavigate}>
              <PageIcon icon={p.icon} fallback="📄" className="sh-nav-icon" />
              {p.title}
            </NavLink>
          </li>
        ))}
      </ul>
      {recent.length > 0 && (
        <Section wikiId={wiki.id} id="recent" title="Recently viewed" long={false}>
          {recent.map((p) => (
            <li key={p.path}>
              <NavLink to={pageHref(wiki.id, p.path)} end className="sh-nav-link" onClick={onNavigate}>
                <PageIcon icon={p.icon} fallback="📄" className="sh-nav-icon" />
                {p.title}
              </NavLink>
            </li>
          ))}
        </Section>
      )}
      <ul className="sh-nav sh-nav-tree">
        {wiki.nav.map((n) => (
          <NavItem key={n.path} node={n} wikiId={wiki.id} path={path} onNavigate={onNavigate} />
        ))}
      </ul>
      {GROUPS.map(([group, heading]) => {
        const items = SPECIALS.filter((s) => s.group === group);
        return (
          <Section
            key={group}
            wikiId={wiki.id}
            id={group}
            title={heading}
            long={items.length > LONG && !items.some((s) => path === `_/${s.route}`)}
          >
            {items.map((s) => (
              <li key={s.route}>
                <NavLink to={`/w/${wiki.id}/_/${s.route}`} className="sh-nav-link" onClick={onNavigate}>
                  <span className="sh-nav-icon" aria-hidden="true">
                    {s.icon}
                  </span>
                  {s.title}
                </NavLink>
              </li>
            ))}
          </Section>
        );
      })}
    </nav>
  );
}

/** The chevron that folds a section. */
function Fold({
  folded,
  onClick,
  label,
  controls,
}: {
  folded: boolean;
  onClick: () => void;
  label: string;
  controls: string;
}) {
  return (
    <button
      type="button"
      className="sh-fold"
      data-folded={folded || undefined}
      aria-expanded={!folded}
      aria-controls={controls}
      aria-label={`${folded ? "Show" : "Hide"} ${label}`}
      title={`${folded ? "Show" : "Hide"} ${label}`}
      onClick={onClick}
    >
      <Icon name="chevronDown" size={14} />
    </button>
  );
}

function Section({
  wikiId,
  id,
  title,
  long,
  children,
}: {
  wikiId: string;
  id: string;
  title: string;
  /** Starts folded until the viewer opens it. */
  long: boolean;
  children: ReactNode;
}) {
  const [folded, toggle] = useFolded(wikiId, `section:${id}`, long);
  const list = useId();
  return (
    <section className="sh-side-section">
      <div className="sh-side-heading">
        <button type="button" className="sh-side-title" onClick={toggle} aria-expanded={!folded} aria-controls={list}>
          {title}
        </button>
        <Fold folded={folded} onClick={toggle} label={title} controls={list} />
      </div>
      <ul id={list} className="sh-nav" hidden={folded}>
        {children}
      </ul>
    </section>
  );
}

function NavItem({
  node,
  wikiId,
  path,
  onNavigate,
}: {
  node: NavNode;
  wikiId: string;
  path: string;
  onNavigate?: () => void;
}) {
  const isGroup = node.children.length > 0;
  const inside = path === node.path || path.startsWith(`${node.path}/`);
  const [folded, toggle] = useFolded(wikiId, `page:${node.path}`, isGroup && count(node) > LONG && !inside);
  const list = useId();
  const link = node.isPage ? (
    <NavLink
      to={pageHref(wikiId, node.path)}
      end
      className="sh-nav-link"
      data-group={isGroup || undefined}
      onClick={onNavigate}
    >
      <PageIcon icon={node.icon} className="sh-nav-icon" />
      {node.title}
    </NavLink>
  ) : (
    <span className="sh-nav-link sh-nav-heading">{node.title}</span>
  );
  return (
    <li className={isGroup ? "sh-nav-group" : undefined}>
      {isGroup ? (
        <div className="sh-nav-row">
          {link}
          <Fold folded={folded} onClick={toggle} label={node.title} controls={list} />
        </div>
      ) : (
        link
      )}
      {isGroup && (
        <ul id={list} className="sh-nav" hidden={folded}>
          {node.children.map((c) => (
            <NavItem key={c.path} node={c} wikiId={wikiId} path={path} onNavigate={onNavigate} />
          ))}
        </ul>
      )}
    </li>
  );
}

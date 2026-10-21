import { Fragment } from "react";
import { Link, NavLink } from "react-router";
import type { NavNode, WikiDetail } from "../../shared/api.ts";
import { useGuest } from "../guest/GuestContext.ts";
import { picture } from "../lib/base.ts";
import { Icon, Kbd } from "../ui/index.ts";
import { shortcutLabel } from "./SearchPalette.tsx";
import { SPECIALS } from "./special/specials.ts";

/** The sidebar's lists of special pages: the wiki's own, then what pages can use. */
const GROUPS = [
  ["tools", "Tools"],
  ["toolbox", "Toolbox"],
] as const;

export function Sidebar({
  wiki,
  onNavigate,
  onSearch,
}: {
  wiki: WikiDetail;
  onNavigate?: () => void;
  onSearch: () => void;
}) {
  const guest = useGuest();
  return (
    <nav className="sh-sidebar" aria-label={`${wiki.title} pages`}>
      <NavLink to={`/w/${wiki.id}`} end className="sh-sidebar-wiki" onClick={onNavigate}>
        <img src={picture(wiki.coverUrl, 160)} alt="" className="sh-sidebar-cover" />
        <span>
          <span className="sh-sidebar-title">{wiki.title}</span>
          {wiki.tagline && <span className="sh-sidebar-tagline">{wiki.tagline}</span>}
        </span>
      </NavLink>
      <button type="button" className="sh-sidebar-search" onClick={onSearch}>
        <Icon name="search" size={14} />
        Search
        <Kbd>{shortcutLabel()}</Kbd>
      </button>
      <ul className="sh-nav">
        {wiki.nav.map((n) => (
          <NavItem key={n.path} node={n} wikiId={wiki.id} onNavigate={onNavigate} />
        ))}
      </ul>
      {GROUPS.map(([group, heading]) => (
        <Fragment key={group}>
          <p className="sh-nav-heading sh-sidebar-tools-title">{heading}</p>
          <ul className="sh-nav">
            {SPECIALS.filter((s) => s.group === group).map((s) => (
              <li key={s.route}>
                <NavLink to={`/w/${wiki.id}/_/${s.route}`} className="sh-nav-link" onClick={onNavigate}>
                  <span className="sh-nav-icon" aria-hidden="true">
                    {s.icon}
                  </span>
                  {s.title}
                </NavLink>
              </li>
            ))}
          </ul>
        </Fragment>
      ))}
      {!guest && (
        <Link to="/dev/ui" className="sh-sidebar-foot">
          UI primitives
        </Link>
      )}
    </nav>
  );
}

function NavItem({ node, wikiId, onNavigate }: { node: NavNode; wikiId: string; onNavigate?: () => void }) {
  const isGroup = node.children.length > 0;
  return (
    <li className={isGroup ? "sh-nav-group" : undefined}>
      {node.isPage ? (
        <NavLink
          to={`/w/${wikiId}/${node.path}`}
          end
          className="sh-nav-link"
          data-group={isGroup || undefined}
          onClick={onNavigate}
        >
          {node.icon && (
            <span className="sh-nav-icon" aria-hidden="true">
              {node.icon}
            </span>
          )}
          {node.title}
        </NavLink>
      ) : (
        <span className="sh-nav-link sh-nav-heading">{node.title}</span>
      )}
      {isGroup && (
        <ul className="sh-nav">
          {node.children.map((c) => (
            <NavItem key={c.path} node={c} wikiId={wikiId} onNavigate={onNavigate} />
          ))}
        </ul>
      )}
    </li>
  );
}

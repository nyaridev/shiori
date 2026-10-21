import { Link, NavLink, useNavigate } from "react-router";
import type { NavNode, WikiDetail } from "../../shared/api.ts";
import { useGuest } from "../guest/GuestContext.ts";
import { withBase } from "../lib/base.ts";
import { Icon, IconButton, Kbd, Tooltip } from "../ui/index.ts";
import { shortcutLabel } from "./SearchPalette.tsx";
import { SPECIALS } from "./special/SpecialPage.tsx";

export function Sidebar({
  wiki,
  onNavigate,
  onSearch,
}: {
  wiki: WikiDetail;
  onNavigate?: () => void;
  onSearch: () => void;
}) {
  const navigate = useNavigate();
  const guest = useGuest();
  return (
    <nav className="sh-sidebar" aria-label={`${wiki.title} pages`}>
      <div className="sh-sidebar-head">
        {guest ? (
          // A guest has no deck to go back to (ADR-0003).
          <span className="sh-guest-badge">
            <Icon name="comment" size={14} />
            {guest.kind === "comment" ? "Shared with you" : "Shared with you to read"} · {guest.guest?.name}
          </span>
        ) : (
          <Tooltip content="Back to the deck" side="right">
            <IconButton
              icon="deck"
              label="Back to the deck"
              onClick={() => navigate("/", { state: { from: wiki.id } })}
            />
          </Tooltip>
        )}
      </div>
      <NavLink to={`/w/${wiki.id}`} end className="sh-sidebar-wiki" onClick={onNavigate}>
        <img src={withBase(wiki.coverUrl)} alt="" className="sh-sidebar-cover" />
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
      <p className="sh-nav-heading sh-sidebar-tools-title">Tools</p>
      <ul className="sh-nav">
        {SPECIALS.map((s) => (
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

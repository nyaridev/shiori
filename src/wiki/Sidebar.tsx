import { Link, NavLink, useNavigate } from "react-router";
import type { NavNode, WikiDetail } from "../../shared/api.ts";
import { IconButton, Tooltip } from "../ui/index.ts";

export function Sidebar({ wiki, onNavigate }: { wiki: WikiDetail; onNavigate?: () => void }) {
  const navigate = useNavigate();
  return (
    <nav className="ld-sidebar" aria-label={`${wiki.title} pages`}>
      <div className="ld-sidebar-head">
        <Tooltip content="Back to the deck" side="right">
          <IconButton
            icon="deck"
            label="Back to the deck"
            onClick={() => navigate("/", { state: { from: wiki.id } })}
          />
        </Tooltip>
      </div>
      <NavLink to={`/w/${wiki.id}`} end className="ld-sidebar-wiki" onClick={onNavigate}>
        <img src={wiki.coverUrl} alt="" className="ld-sidebar-cover" />
        <span>
          <span className="ld-sidebar-title">{wiki.title}</span>
          {wiki.tagline && <span className="ld-sidebar-tagline">{wiki.tagline}</span>}
        </span>
      </NavLink>
      <ul className="ld-nav">
        {wiki.nav.map((n) => (
          <NavItem key={n.path} node={n} wikiId={wiki.id} onNavigate={onNavigate} />
        ))}
      </ul>
      <Link to="/dev/ui" className="ld-sidebar-foot">
        UI primitives
      </Link>
    </nav>
  );
}

function NavItem({ node, wikiId, onNavigate }: { node: NavNode; wikiId: string; onNavigate?: () => void }) {
  const isGroup = node.children.length > 0;
  return (
    <li className={isGroup ? "ld-nav-group" : undefined}>
      {node.isPage ? (
        <NavLink
          to={`/w/${wikiId}/${node.path}`}
          end
          className="ld-nav-link"
          data-group={isGroup || undefined}
          onClick={onNavigate}
        >
          {node.title}
        </NavLink>
      ) : (
        <span className="ld-nav-link ld-nav-heading">{node.title}</span>
      )}
      {isGroup && (
        <ul className="ld-nav">
          {node.children.map((c) => (
            <NavItem key={c.path} node={c} wikiId={wikiId} onNavigate={onNavigate} />
          ))}
        </ul>
      )}
    </li>
  );
}

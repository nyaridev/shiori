// The page tree's parts (the sidebar's tabs, SidebarTabs.tsx): a page and the pages under it, the chevron that
// folds a group, and the dot for what waits on a page.
import { useId } from "react";
import { NavLink } from "react-router";
import type { NavNode } from "../../../shared/api.ts";
import { Icon } from "../../ui/index.ts";
import { pageHref } from "../PageHead.tsx";
import { PageIcon } from "../PageIcon.tsx";
import { useFolded } from "./folded.ts";
import { addUp, type Waiting } from "./pending.ts";

/** The sidebar's links that the hover and the open page's marker glide between (strips mark themselves). */
export const LINKS = "a.sh-nav-link:not(.sh-side-strip > a):not(.sh-nav-row > a)";

/** A section with more entries than this starts folded. */
export const LONG = 8;

export const count = (n: NavNode): number => n.children.reduce((sum, c) => sum + 1 + count(c), 0);
export const flatten = (nodes: NavNode[]): NavNode[] => nodes.flatMap((n) => [n, ...flatten(n.children)]);

/**
 * A dot for what waits on a page (pending.ts): amber for open questions you haven't answered, else green for
 * suggestions; nothing when nothing waits.
 */
export function PendingDot({ waiting }: { waiting?: Waiting }) {
  if (!waiting) return null;
  const kind = waiting.questions ? "question" : "suggestion";
  const parts = [
    waiting.questions && `${waiting.questions} open question${waiting.questions === 1 ? "" : "s"}`,
    waiting.suggestions && `${waiting.suggestions} suggestion${waiting.suggestions === 1 ? "" : "s"}`,
  ].filter(Boolean);
  const label = `${parts.join(" and ")} waiting for your answer`;
  return <span className="sh-nav-pending" data-kind={kind} title={label} role="img" aria-label={label} />;
}

/** The chevron that folds a section. */
export function Fold({
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

export function NavItem({
  node,
  wikiId,
  path,
  pending,
  onNavigate,
}: {
  node: NavNode;
  wikiId: string;
  path: string;
  pending: Map<string, Waiting>;
  onNavigate?: () => void;
}) {
  const isGroup = node.children.length > 0;
  const inside = path === node.path || path.startsWith(`${node.path}/`);
  const [folded, toggle] = useFolded(wikiId, `page:${node.path}`, isGroup && count(node) > LONG && !inside);
  const list = useId();
  // A folded group shows what waits anywhere inside it; open, each page shows its own.
  const waiting = folded
    ? addUp([node, ...flatten(node.children)].map((n) => pending.get(n.path)))
    : pending.get(node.path);
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
      <PendingDot waiting={waiting} />
    </NavLink>
  ) : (
    <span className="sh-nav-link sh-nav-heading">
      {node.title}
      <PendingDot waiting={waiting} />
    </span>
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
        <div className="sh-collapse" data-folded={folded || undefined} inert={folded || undefined}>
          <ul id={list} className="sh-nav">
            {node.children.map((c) => (
              <NavItem key={c.path} node={c} wikiId={wikiId} path={path} pending={pending} onNavigate={onNavigate} />
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

// The page tree as tabs: the tree's sections, the Tools and the Toolbox as a block of icon tabs, and under it the
// pages of one of them, under a strip (a tinted heading bar, as on a fandom wiki) that folds them; groups inside fold
// the same way. It opens on the section that holds the open page, and follows the reader into another. Pages the wiki
// pins stay beside Home only.
import { useEffect, useId, useRef, useState } from "react";
import { NavLink } from "react-router";
import type { NavNode, WikiDetail } from "../../../shared/api.ts";
import { Glider } from "../../ui/index.ts";
import { pageHref } from "../PageHead.tsx";
import { PageIcon } from "../PageIcon.tsx";
import { SPECIALS } from "../special/specials.ts";
import { useFolded } from "./folded.ts";
import { Fold, flatten, NavItem, PendingDot } from "./NavTree.tsx";
import { addUp, type Waiting } from "./pending.ts";

interface Tab {
  key: string;
  title: string;
  icon?: string;
  /** A section of the tree; else a group of special pages. */
  node?: NavNode;
  group?: "tools" | "toolbox";
}

const holds = (tab: Tab, path: string) =>
  tab.node
    ? path === tab.node.path || path.startsWith(`${tab.node.path}/`)
    : SPECIALS.some((s) => s.group === tab.group && path === `_/${s.route}`);

export function SidebarTabs({
  wiki,
  path,
  pending,
  onNavigate,
}: {
  wiki: WikiDetail;
  path: string;
  pending: Map<string, Waiting>;
  onNavigate?: () => void;
}) {
  // A pinned page shows beside Home; in its section only if it has pages of its own under it.
  const pinned = new Set(wiki.pinned.map((p) => p.path));
  const listed = (n: NavNode) => !pinned.has(n.path) || n.children.length > 0;
  const loose = wiki.nav.filter((n) => !n.children.length && listed(n));
  const tabs: Tab[] = [
    ...wiki.nav.filter((n) => n.children.length).map((n) => ({ key: n.path, title: n.title, icon: n.icon, node: n })),
    { key: "_tools", title: "Tools", icon: "toolbox", group: "tools" },
    { key: "_toolbox", title: "Toolbox", icon: "blocks", group: "toolbox" },
  ];
  const [open, setOpen] = useState(() => (tabs.find((t) => holds(t, path)) ?? tabs[0]).key);
  // Into another section (a link, search): its tab opens.
  // biome-ignore lint/correctness/useExhaustiveDependencies: follows the open page only.
  useEffect(() => {
    const here = tabs.find((t) => holds(t, path));
    if (here) setOpen(here.key);
  }, [path]);
  const tab = tabs.find((t) => t.key === open) ?? tabs[0];
  // The list slides in from the side of the tab it came from.
  const at = tabs.indexOf(tab);
  const moved = useRef<{ at: number; from?: "before" | "after" }>({ at });
  if (moved.current.at !== at) moved.current = { at, from: at > moved.current.at ? "after" : "before" };
  const { from } = moved.current;
  const [folded, toggle] = useFolded(wiki.id, `tab:${tab.key}`, false);
  const list = useId();

  return (
    <div className="sh-side-tabs">
      {loose.length > 0 && (
        <ul className="sh-nav">
          {loose.map((n) => (
            <NavItem key={n.path} node={n} wikiId={wiki.id} path={path} pending={pending} onNavigate={onNavigate} />
          ))}
        </ul>
      )}
      <div className="sh-side-tablist sh-glide-host" role="tablist" aria-label="Sections">
        <Glider follow="current" select='.sh-side-tab[aria-selected="true"]' className="sh-side-tab-glide" />
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={t.key === tab.key}
            className="sh-side-tab"
            onClick={() => setOpen(t.key)}
          >
            <PageIcon icon={t.icon} fallback="folder" className="sh-side-tab-icon" />
            <span className="sh-side-tab-name">{t.title}</span>
            {t.node && (
              <PendingDot
                waiting={addUp(
                  flatten([t.node])
                    .filter((n) => !pinned.has(n.path))
                    .map((n) => pending.get(n.path)),
                )}
              />
            )}
          </button>
        ))}
      </div>
      <div key={tab.key} role="tabpanel" aria-label={tab.title} className="sh-side-tabpanel" data-from={from}>
        <div className="sh-side-strip">
          {tab.node?.isPage ? (
            <NavLink to={pageHref(wiki.id, tab.node.path)} end className="sh-nav-link" onClick={onNavigate}>
              {tab.title}
              <PendingDot waiting={pending.get(tab.node.path)} />
            </NavLink>
          ) : (
            <span className="sh-nav-link">{tab.title}</span>
          )}
          <Fold folded={folded} onClick={toggle} label={tab.title} controls={list} />
        </div>
        <div className="sh-collapse" data-folded={folded || undefined} inert={folded || undefined}>
          <ul id={list} className="sh-nav">
            {tab.node?.children.filter(listed).map((c) => (
              <NavItem key={c.path} node={c} wikiId={wiki.id} path={path} pending={pending} onNavigate={onNavigate} />
            ))}
            {tab.group &&
              SPECIALS.filter((s) => s.group === tab.group).map((s) => (
                <li key={s.route}>
                  <NavLink to={`/w/${wiki.id}/_/${s.route}`} className="sh-nav-link" onClick={onNavigate}>
                    <PageIcon icon={s.icon} className="sh-nav-icon" />
                    {s.title}
                  </NavLink>
                </li>
              ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

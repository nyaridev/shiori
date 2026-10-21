import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { api } from "../lib/api.ts";
import { isGuest } from "../lib/base.ts";
import { useLive } from "../lib/live.ts";
import { useResource } from "../lib/useResource.ts";
import { useTheme } from "../lib/useTheme.ts";
import { usePresence } from "../presence/usePresence.ts";
import { ScrollArea } from "../ui/index.ts";
import { PageArea } from "./PageArea.tsx";
import { SearchPalette, typing } from "./SearchPalette.tsx";
import { Sidebar } from "./Sidebar.tsx";
import { MissingPage } from "./special/MissingPage.tsx";
import { SpecialPage } from "./special/SpecialPage.tsx";
import { ImageViewer } from "./viewer/ImageViewer.tsx";
import { ViewerContext } from "./viewer/ViewerContext.ts";
import { WikiHeader } from "./WikiHeader.tsx";
import { WikiIndexContext } from "./WikiIndexContext.ts";
import "./wiki.css";

export function WikiLayout() {
  const { wikiId = "", "*": splat = "" } = useParams();
  const path = splat.replace(/\/$/, "");
  const location = useLocation();
  const fromDeck = (location.state as { fromDeck?: boolean } | null)?.fromDeck ?? false;

  // `_/…` is a special page (Recent changes, Categories…), not a page file.
  const special = path === "_" || path.startsWith("_/") ? path.slice(2) : null;

  const wiki = useResource(`wiki:${wikiId}`, () => api.wiki(wikiId));
  const page = useResource(special === null ? `page:${wikiId}:${path}` : null, () => api.page(wikiId, path));
  const index = useResource(`pages:${wikiId}`, () => api.index(wikiId));
  const pages = useMemo(
    () => (index.data ? { wikiId, byPath: new Map(index.data.pages.map((p) => [p.path, p])) } : null),
    [index.data, wikiId],
  );
  const { reload: reloadWiki } = wiki;
  const { reload: reloadPage } = page;
  const { reload: reloadIndex } = index;
  useLive((e) => {
    if (e.type === "wikis" || (e.type === "pages" && e.wiki === wikiId)) reloadWiki();
    if (e.type === "pages" && e.wiki === wikiId) {
      reloadPage();
      reloadIndex();
    }
  });
  useTheme(wiki.data?.theme);
  const people = usePresence(wikiId, path);

  const [navOpen, setNavOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // The picture the image viewer shows, if it's open.
  const [viewing, setViewing] = useState<string | null>(null);
  const viewer = useMemo(() => ({ open: setViewing }), []);

  // Ctrl+K / ⌘K anywhere, or "/" outside a text field, opens search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const combo = (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k";
      if (!combo && !(e.key === "/" && !e.ctrlKey && !e.metaKey && !typing(e.target))) return;
      e.preventDefault();
      setSearchOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (wiki.data) document.title = page.data?.path ? `${page.data.title} · ${wiki.data.title}` : wiki.data.title;
  }, [wiki.data, page.data]);

  // New page: back to the top, or to the #section in the URL.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the page itself changes.
  useEffect(() => {
    if (special !== null) {
      window.scrollTo(0, 0);
      return;
    }
    if (!page.data) return;
    const target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) target.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [page.data?.path, special]);

  if (wiki.error) {
    return (
      <div className="sh-wiki-missing">
        <p>This wiki isn't available: {wiki.error.message}</p>
        {!isGuest && <Link to="/">Back to the deck</Link>}
      </div>
    );
  }

  return (
    <WikiIndexContext.Provider value={pages}>
      <ViewerContext.Provider value={viewer}>
        <div className="sh-wiki" data-enter={fromDeck || undefined}>
          {wiki.data && (
            <>
              <ScrollArea className="sh-wiki-sidebar" data-open={navOpen || undefined}>
                <Sidebar wiki={wiki.data} onNavigate={() => setNavOpen(false)} onSearch={() => setSearchOpen(true)} />
              </ScrollArea>
              {navOpen && (
                <button type="button" className="sh-scrim" aria-label="Close menu" onClick={() => setNavOpen(false)} />
              )}
              <WikiHeader
                wiki={wiki.data}
                people={people}
                onPages={() => setNavOpen(true)}
                onSearch={() => setSearchOpen(true)}
                onComments={special === null && !page.error ? () => setRailOpen((o) => !o) : undefined}
              />
              <SearchPalette wiki={wiki.data} open={searchOpen} onOpenChange={setSearchOpen} />
            </>
          )}
          {page.error && wiki.data && <MissingPage wikiId={wikiId} path={path} index={index.data} />}
          {special !== null && wiki.data && <SpecialPage wiki={wiki.data} route={special} index={index.data} />}
          {page.data && !page.error && wiki.data && (
            <PageArea
              key={`${wikiId}:${path}`}
              wiki={wiki.data}
              path={path}
              page={page.data}
              index={index.data?.pages}
              problems={[...wiki.data.problems, ...page.data.problems]}
              railOpen={railOpen}
              onCloseRail={() => setRailOpen(false)}
            />
          )}
        </div>
        <ImageViewer wikiId={wikiId} path={path} open={viewing} onClose={() => setViewing(null)} />
      </ViewerContext.Provider>
    </WikiIndexContext.Provider>
  );
}

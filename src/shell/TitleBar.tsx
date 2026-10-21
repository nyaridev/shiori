// The custom title bar for the desktop window (start-app.bat). It only exists inside Tauri; in a browser tab the
// page has no chrome at all. Over the deck it stays invisible until the pointer reaches the top edge.
import { getCurrentWindow } from "@tauri-apps/api/window";
import { matchPath, useLocation } from "react-router";
import { api } from "../lib/api.ts";
import { useResource } from "../lib/useResource.ts";
import { ShareDialog } from "../sharing/ShareDialog.tsx";
import { Icon } from "../ui/index.ts";
import "./titlebar.css";

export const isDesktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
if (isDesktop) document.documentElement.dataset.shell = "desktop";

export function TitleBar() {
  const { pathname } = useLocation();
  const onDeck = pathname === "/";
  // On a wiki, the title bar has its Share button (ADR-0003).
  const wikiId = isDesktop ? matchPath("/w/:wikiId/*", pathname)?.params.wikiId : undefined;
  const wiki = useResource(wikiId ? `wiki:${wikiId}` : null, () => api.wiki(wikiId ?? ""));
  if (!isDesktop) return null;
  const win = getCurrentWindow();
  return (
    <header className="titlebar" data-tauri-drag-region data-floating={onDeck || undefined}>
      {wikiId && wiki.data && (
        <ShareDialog
          wikiId={wikiId}
          title={wiki.data.title}
          trigger={
            <button type="button" className="titlebar-button titlebar-share" aria-label="Share this wiki">
              <Icon name="share" size={15} />
              Share
            </button>
          }
        />
      )}
      <div className="titlebar-controls">
        <button type="button" className="titlebar-button" aria-label="Minimize" onClick={() => void win.minimize()}>
          <Icon name="minimize" size={15} />
        </button>
        <button
          type="button"
          className="titlebar-button"
          aria-label="Maximize"
          onClick={() => void win.toggleMaximize()}
        >
          <Icon name="maximize" size={13} />
        </button>
        <button
          type="button"
          className="titlebar-button titlebar-close"
          aria-label="Close"
          onClick={() => void win.close()}
        >
          <Icon name="close" size={15} />
        </button>
      </div>
    </header>
  );
}

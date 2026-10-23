// Opening a wiki's toolbox in a new tab. The wiki's name, theme and the colors it has on screen now go into this
// browser's storage first: public/assets/toolbox-theme.js paints those colors before the app loads, and the toolbox
// draws its first frame from the name and theme instead of waiting for the server.
import type { WikiDetail } from "../../shared/api.ts";
import { readStored, writeStored } from "../lib/stored.ts";

export type ToolboxEntry = "design" | "kits" | "elements" | "fields" | "icons" | "special";

/** What the toolbox shows before its wiki loads. */
export interface OpenedWiki {
  title: string;
  theme: WikiDetail["theme"];
  /** The theme's CSS variables as this page has them, in the viewer's day or night (`<html>`'s inline style). */
  vars: string;
}

const key = (wikiId: string) => `shiori:toolbox:${wikiId}`;

export const toolboxHref = (wikiId: string, entry: ToolboxEntry = "design") => `/toolbox/${wikiId}/${entry}`;

export function openToolbox(wiki: WikiDetail) {
  const vars = document.documentElement.style.cssText;
  writeStored<OpenedWiki>(key(wiki.id), { title: wiki.title, theme: wiki.theme, vars });
  window.open(toolboxHref(wiki.id), "_blank", "noopener");
}

export const openedWiki = (wikiId: string) => readStored<OpenedWiki | null>(key(wikiId), null);

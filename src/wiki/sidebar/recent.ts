// The pages this viewer opened lately in a wiki, newest first, kept in the browser for the sidebar.
import { readStored, useStored, writeStored } from "../../lib/stored.ts";

export interface Viewed {
  path: string;
  title: string;
  icon?: string;
}

/** Pages remembered per wiki. */
const KEEP = 8;
const NONE: Viewed[] = [];
const key = (wikiId: string) => `shiori.viewed.${wikiId}`;

export const useRecentlyViewed = (wikiId: string) => useStored(key(wikiId), NONE)[0];

/** This page was opened: it moves to the top. */
export function rememberViewed(wikiId: string, page: Viewed) {
  const list = readStored(key(wikiId), NONE).filter((p) => p.path !== page.path);
  writeStored(key(wikiId), [{ path: page.path, title: page.title, icon: page.icon }, ...list].slice(0, KEEP));
}

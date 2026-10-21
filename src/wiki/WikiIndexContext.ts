// The open wiki's page index, for anything deep in a page that needs to know about other pages (link previews).
import { createContext, useContext } from "react";
import type { PageEntry } from "../../shared/api.ts";

export interface WikiPages {
  wikiId: string;
  byPath: Map<string, PageEntry>;
}

export const WikiIndexContext = createContext<WikiPages | null>(null);

/** The page an app link (`/w/<wiki>/<path>#…`) points to, if it's in the open wiki's index. */
export function usePageAt(href: string | undefined): PageEntry | undefined {
  const wiki = useContext(WikiIndexContext);
  if (!wiki || !href) return undefined;
  const prefix = `/w/${wiki.wikiId}`;
  if (href !== prefix && !href.startsWith(`${prefix}/`) && !href.startsWith(`${prefix}#`)) return undefined;
  const path = decodeURIComponent(href.slice(prefix.length).split("#")[0].replace(/^\//, ""));
  return wiki.byPath.get(path);
}

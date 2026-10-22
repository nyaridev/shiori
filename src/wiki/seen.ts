// What this viewer last saw of each page, per wiki, kept in the browser: when the page had last changed, and a
// fingerprint of each section (markdown/sections.ts). Opening a page again shows which sections changed since then;
// the sidebar and Special:Attention list the pages that did.
import { useEffect, useMemo, useRef } from "react";
import type { PageData, PageEntry } from "../../shared/api.ts";
import { readStored, useStored, writeStored } from "../lib/stored.ts";
import { fingerprints } from "./markdown/sections.ts";

export interface Seen {
  /** The page's `updatedAt` when the viewer last had it open. */
  at?: string;
  sections: Record<string, string>;
}
export type SeenPages = Record<string, Seen>;

const NONE: SeenPages = {};
const key = (wikiId: string) => `shiori.seen.${wikiId}`;

export const useSeenPages = (wikiId: string) => useStored(key(wikiId), NONE)[0];

/** Pages that changed since the viewer last opened them. Pages they never opened aren't news to them. */
export function changedPages(pages: PageEntry[], seen: SeenPages): PageEntry[] {
  return pages.filter((p) => {
    const last = seen[p.path]?.at;
    return !p.hidden && !!last && !!p.updatedAt && p.updatedAt > last;
  });
}

/**
 * The sections of the open page that changed since the viewer's last visit (by anchor; the intro as `INTRO`), and
 * remembers this visit. While the page stays open, an agent's edits show as changes too, until the next visit.
 */
export function usePageChanges(wikiId: string, page: PageData): Set<string> {
  const now = useMemo(() => fingerprints(page.hast), [page.hast]);
  // What the viewer had seen before this visit; the visit itself doesn't count as seeing new edits made during it.
  const before = useRef<Seen | undefined>(undefined);
  const visit = useRef<string | null>(null);
  if (visit.current !== `${wikiId}:${page.path}`) {
    visit.current = `${wikiId}:${page.path}`;
    before.current = readStored(key(wikiId), NONE)[page.path];
  }
  const changed = useMemo(() => {
    const last = before.current;
    if (!last) return new Set<string>();
    return new Set(Object.keys(now).filter((anchor) => last.sections[anchor] !== now[anchor]));
  }, [now]);

  useEffect(() => {
    const all = readStored(key(wikiId), NONE);
    writeStored(key(wikiId), { ...all, [page.path]: { at: page.updatedAt, sections: now } });
  }, [wikiId, page.path, page.updatedAt, now]);
  return changed;
}

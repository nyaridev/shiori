// Where a gallery is (which group) and its search and filters. On a collection's own page they live in the URL
// (`?in=<group>&q=…&status=…&by=…&sort=…&scope=all`), so back, forward and shared links keep them; a gallery placed
// in a page keeps them to itself, so two galleries on one page don't fight over the URL.
import { useCallback, useMemo, useState } from "react";
import { useListParams } from "../wiki/special/Questions.tsx";
import { type Filters, NO_FILTERS, type Sort } from "./collection.ts";

export interface GalleryState extends Filters {
  /** The group being looked at, or null at the top. */
  at: string | null;
}
const KEYS = { at: "in", q: "q", status: "status", by: "by", sort: "sort", scope: "scope" } as const;
const SORTS: Sort[] = ["best", "new", "changed", "old", "name"];
const STATUSES = ["all", "draft", "ready", "done"] as const;

export function useGallery(urlBacked: boolean) {
  const { params, set: setParams } = useListParams();
  const [local, setLocal] = useState<GalleryState>({ ...NO_FILTERS, at: null });

  const state = useMemo<GalleryState>(() => {
    if (!urlBacked) return local;
    const status = params.get("status");
    const sort = params.get("sort") as Sort;
    return {
      at: params.get("in") || null,
      q: params.get("q") ?? "",
      status: STATUSES.find((s) => s === status) ?? "all",
      by: params.get("by") || "anyone",
      sort: SORTS.includes(sort) ? sort : "best",
      scope: params.get("scope") === "all" ? "all" : "here",
    };
  }, [urlBacked, local, params]);

  /** Changes some of it. Moving to another group is a step back can undo; changing a filter isn't. */
  const set = useCallback(
    (changes: Partial<GalleryState>) => {
      if (!urlBacked) return setLocal((s) => ({ ...s, ...changes }));
      const defaults: GalleryState = { ...NO_FILTERS, at: null };
      const next: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(changes) as [keyof GalleryState, string | null][])
        next[KEYS[k]] = v === defaults[k] ? null : v;
      setParams(next, !("at" in changes));
    },
    [urlBacked, setParams],
  );

  /**
   * The link that opens a group, on a collection's page; null elsewhere (a gallery in a page opens groups in place).
   * Opening a group leaves the search: it shows what's in it.
   */
  const hrefOf = useCallback(
    (at: string | null) => {
      if (!urlBacked) return null;
      const next = new URLSearchParams(params);
      for (const k of ["q", "status", "by", "scope"]) next.delete(k);
      if (at) next.set("in", at);
      else next.delete("in");
      const s = next.toString();
      return s ? `?${s}` : "?";
    },
    [urlBacked, params],
  );
  const open = useCallback(
    (at: string | null) => set({ at, q: "", status: "all", by: "anyone", scope: "here" }),
    [set],
  );

  return { state, set, hrefOf, open };
}

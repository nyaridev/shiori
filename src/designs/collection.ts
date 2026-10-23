// A collection's designs and groups as a tree (ADR-0006, groups), and the search and filters over it. Plain functions,
// so the gallery stays about drawing and these are tested on their own (collection.spec.ts).
import type { DesignCollection, DesignGroupInfo, DesignInfo, DesignStatus } from "../../shared/api.ts";

export interface Tree {
  groups: Map<string, DesignGroupInfo>;
  /** The groups in each group (null: the top), by name. */
  children: Map<string | null, DesignGroupInfo[]>;
  /** The designs right in each group (null: the top). */
  designs: Map<string | null, DesignInfo[]>;
  /** Where a group really sits: a missing parent, or a loop made by hand, puts it at the top. */
  parentOf: (id: string) => string | null;
  /** Where a design really sits: a group that's gone puts it at the top. */
  placeOf: (d: DesignInfo) => string | null;
}

const push = <K, V>(map: Map<K, V[]>, key: K, value: V) => {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
};

export function buildTree({ designs, groups }: DesignCollection): Tree {
  const byId = new Map(groups.map((g) => [g.id, g]));
  // A parent counts only when following parents up reaches the top without coming back round.
  const parents = new Map<string, string | null>();
  for (const g of groups) {
    const seen = new Set([g.id]);
    let p = g.parent;
    while (p && byId.has(p) && !seen.has(p)) {
      seen.add(p);
      p = byId.get(p)?.parent ?? null;
    }
    parents.set(g.id, g.parent && byId.has(g.parent) && p === null ? g.parent : null);
  }
  const parentOf = (id: string) => parents.get(id) ?? null;
  const placeOf = (d: DesignInfo) => (d.group && byId.has(d.group) ? d.group : null);
  const children = new Map<string | null, DesignGroupInfo[]>();
  for (const g of groups) push(children, parentOf(g.id), g);
  for (const list of children.values()) list.sort((a, b) => byName(a.name, b.name));
  const inGroup = new Map<string | null, DesignInfo[]>();
  for (const d of designs) push(inGroup, placeOf(d), d);
  return { groups: byId, children, designs: inGroup, parentOf, placeOf };
}

export const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

/** The groups from the top down to `id`, itself last. */
export function pathTo(tree: Tree, id: string | null): DesignGroupInfo[] {
  const path: DesignGroupInfo[] = [];
  for (let g = id ? tree.groups.get(id) : undefined; g; ) {
    path.unshift(g);
    const p = tree.parentOf(g.id);
    g = p ? tree.groups.get(p) : undefined;
  }
  return path;
}

/** `id` and every group under it, however deep (null: every group). */
export function within(tree: Tree, id: string | null): Set<string | null> {
  const all = new Set<string | null>([id]);
  const walk = (at: string | null) => {
    for (const g of tree.children.get(at) ?? []) {
      all.add(g.id);
      walk(g.id);
    }
  };
  walk(id);
  return all;
}

/** Every design in `id` and the groups under it. */
export function designsWithin(tree: Tree, id: string | null): DesignInfo[] {
  return [...within(tree, id)].flatMap((g) => tree.designs.get(g) ?? []);
}

/** What a group holds, however deep: designs, groups, and the newest drawings for its card. */
export function contents(tree: Tree, id: string) {
  const inside = designsWithin(tree, id);
  return {
    designs: inside.length,
    groups: within(tree, id).size - 1,
    drawings: inside
      .filter((d) => d.board)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 3),
  };
}

export type Sort = "best" | "new" | "changed" | "old" | "name";
export interface Filters {
  q: string;
  status: "all" | DesignStatus;
  /** "anyone", "me", or an author's name. */
  by: string;
  sort: Sort;
  /** Search the group being looked at and everything under it, or the whole collection. */
  scope: "here" | "all";
}
export const NO_FILTERS: Filters = { q: "", status: "all", by: "anyone", sort: "best", scope: "here" };

/** Search or a filter is on: the gallery lists what matches, from every level, instead of one group. */
export const searching = (f: Filters) => !!f.q.trim() || f.status !== "all" || f.by !== "anyone";

/** Lower case without accents, so "Pokemon" finds "Pokémon". */
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const words = (q: string) => fold(q).split(/\s+/).filter(Boolean);

/**
 * How well a design matches every word, or 0 when one is missing. A word in the name counts most (more at its
 * start), then the groups it's in, then the description and who made it.
 */
export function score(d: DesignInfo, place: string, q: string): number {
  const name = fold(d.name);
  const where = fold(place);
  const rest = fold(`${d.description} ${d.author.name}`);
  let total = 0;
  for (const w of words(q)) {
    const s =
      name.startsWith(w) || name.includes(` ${w}`)
        ? 4
        : name.includes(w)
          ? 3
          : where.includes(w)
            ? 2
            : rest.includes(w)
              ? 1
              : 0;
    if (!s) return 0;
    total += s;
  }
  return total || 1;
}

/** A group's path as names: "Monsters / World 1". */
export const placeName = (tree: Tree, id: string | null) =>
  pathTo(tree, id)
    .map((g) => g.name)
    .join(" / ");

const SORTS: Record<Exclude<Sort, "best">, (a: DesignInfo, b: DesignInfo) => number> = {
  new: (a, b) => b.createdAt.localeCompare(a.createdAt),
  old: (a, b) => a.createdAt.localeCompare(b.createdAt),
  changed: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  name: (a, b) => byName(a.name, b.name),
};

/** Puts designs in the order picked; "best" is the best match when searching and the newest otherwise. */
export function sortDesigns(list: DesignInfo[], sort: Sort, scores?: Map<string, number>): DesignInfo[] {
  if (sort !== "best") return [...list].sort(SORTS[sort]);
  return [...list].sort((a, b) => (scores?.get(b.id) ?? 0) - (scores?.get(a.id) ?? 0) || SORTS.new(a, b));
}

/** What a search finds under `at`: groups whose name matches, and designs that pass every filter, best first. */
export function search(tree: Tree, at: string | null, f: Filters) {
  const scope = f.scope === "all" ? null : at;
  const inside = within(tree, scope);
  const q = f.q.trim();
  const scores = new Map<string, number>();
  const designs = designsWithin(tree, scope).filter((d) => {
    if (f.status !== "all" && d.status !== f.status) return false;
    if (f.by === "me" ? !d.mine : f.by !== "anyone" && d.author.name !== f.by) return false;
    if (!q) return true;
    const s = score(d, placeName(tree, tree.placeOf(d)), q);
    scores.set(d.id, s);
    return s > 0;
  });
  const groups = q
    ? [...inside]
        .filter((id): id is string => id !== null && id !== scope)
        .map((id) => tree.groups.get(id) as DesignGroupInfo)
        .filter((g) => words(q).every((w) => fold(g.name).includes(w)))
        .sort((a, b) => byName(a.name, b.name))
    : [];
  return { groups, designs: sortDesigns(designs, f.sort, scores) };
}

/** The people who made designs here, for the "Made by" filter. */
export const authors = (designs: DesignInfo[]) =>
  [...new Set(designs.filter((d) => !d.mine).map((d) => d.author.name))].sort(byName);

import { describe, expect, it } from "vitest";
import type { DesignGroupInfo, DesignInfo } from "../../shared/api.ts";
import { authors, buildTree, contents, NO_FILTERS, pathTo, placeName, search, searching } from "./collection.ts";

const g = (id: string, name: string, parent: string | null = null): DesignGroupInfo => ({
  id,
  name,
  parent,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  author: { kind: "owner", name: "Host" },
  editable: true,
  mine: true,
});
const d = (id: string, name: string, group: string | null, extra: Partial<DesignInfo> = {}): DesignInfo => ({
  id,
  collection: "mobs",
  name,
  description: "",
  status: "draft",
  createdAt: `2026-10-0${id.length}T00:00:00Z`,
  updatedAt: "2026-10-01T00:00:00Z",
  author: { kind: "owner", name: "Host" },
  board: null,
  images: [],
  page: null,
  note: "",
  editable: true,
  mine: true,
  group,
  ...extra,
});

const groups = [g("m", "Monsters"), g("w", "World 1", "m"), g("f", "Forest", "w"), g("s", "Sea", "w")];
const designs = [
  d("a", "Moss Fox", "f", { description: "A sleepy fox", board: "/b.png" }),
  d("bb", "Ember Moth", "w", { status: "ready", author: { kind: "guest", name: "Mika" }, mine: false }),
  d("ccc", "Pokémon-like crab", "s"),
  d("dddd", "Loose idea", null),
  d("eeeee", "Lost one", "gone"),
];
const tree = buildTree({ designs, groups });

describe("a collection's tree", () => {
  it("nests groups and finds every design's place", () => {
    expect(tree.children.get(null)?.map((x) => x.name)).toEqual(["Monsters"]);
    expect(tree.children.get("w")?.map((x) => x.name)).toEqual(["Forest", "Sea"]);
    expect(pathTo(tree, "f").map((x) => x.name)).toEqual(["Monsters", "World 1", "Forest"]);
    expect(placeName(tree, "s")).toBe("Monsters / World 1 / Sea");
    // A design whose group is gone shows at the top.
    expect(tree.designs.get(null)?.map((x) => x.id)).toEqual(["dddd", "eeeee"]);
    expect(contents(tree, "m")).toMatchObject({ designs: 3, groups: 3 });
    expect(contents(tree, "m").drawings.map((x) => x.id)).toEqual(["a"]);
  });

  it("puts groups with a missing parent or in a loop at the top", () => {
    const odd = buildTree({ designs: [], groups: [g("x", "X", "y"), g("y", "Y", "x"), g("o", "Orphan", "nope")] });
    expect(odd.children.get(null)?.map((x) => x.id)).toEqual(["o", "x", "y"]);
    expect(pathTo(odd, "x").map((x) => x.id)).toEqual(["x"]);
  });
});

describe("searching designs", () => {
  it("looks through every level under the group, by name, group, description and person", () => {
    const at = (q: string, from: string | null = null) =>
      search(tree, from, { ...NO_FILTERS, q }).designs.map((x) => x.name);
    expect(at("fox")).toEqual(["Moss Fox"]);
    expect(at("sleepy")).toEqual(["Moss Fox"]);
    expect(at("forest")).toEqual(["Moss Fox"]);
    expect(at("mika")).toEqual(["Ember Moth"]);
    expect(at("pokemon")).toEqual(["Pokémon-like crab"]);
    // Equal matches: newest first.
    expect(at("world")).toEqual(["Pokémon-like crab", "Ember Moth", "Moss Fox"]);
    // Every word must match.
    expect(at("moss sea")).toEqual([]);
    // Inside Forest only, unless the whole collection is asked for.
    expect(at("moth", "f")).toEqual([]);
    expect(search(tree, "f", { ...NO_FILTERS, q: "moth", scope: "all" }).designs.map((x) => x.name)).toEqual([
      "Ember Moth",
    ]);
  });

  it("ranks a name match over a group or description match", () => {
    const t = buildTree({
      designs: [d("a", "Cave bat", "m", { description: "lives near the fox den" }), d("bb", "Fox", null)],
      groups: [g("m", "Monsters")],
    });
    expect(search(t, null, { ...NO_FILTERS, q: "fox" }).designs.map((x) => x.name)).toEqual(["Fox", "Cave bat"]);
  });

  it("filters by status and by who made it, and finds groups by name", () => {
    expect(search(tree, null, { ...NO_FILTERS, status: "ready" }).designs.map((x) => x.name)).toEqual(["Ember Moth"]);
    expect(search(tree, null, { ...NO_FILTERS, by: "Mika" }).designs.map((x) => x.name)).toEqual(["Ember Moth"]);
    expect(search(tree, null, { ...NO_FILTERS, by: "me" }).designs).toHaveLength(4);
    expect(search(tree, null, { ...NO_FILTERS, q: "sea" }).groups.map((x) => x.name)).toEqual(["Sea"]);
    expect(search(tree, null, { ...NO_FILTERS, sort: "name" }).designs.map((x) => x.name)[0]).toBe("Ember Moth");
    expect(searching(NO_FILTERS)).toBe(false);
    expect(searching({ ...NO_FILTERS, status: "done" })).toBe(true);
    expect(authors(designs)).toEqual(["Mika"]);
  });
});

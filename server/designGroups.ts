// Groups of designs (ADR-0006, groups): folders people make inside a collection to sort its designs, nested as deep as
// they like (Monsters › World 1 › Forest). Each group is its own small file, `designs/<collection>/_groups/<id>.json`,
// so two PCs that each make groups never edit the same file. A design names its group in its own `group` field, so
// moving one never moves its folder. Removing a group moves what's inside it up a level and the group's file into
// `designs/_removed/`, like everything else here.
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { type Author, type Design, ID, listDesigns, removedPath, updateDesign, writeAtomic } from "./designs.ts";
import { slug } from "./markdown/wikilinks.ts";
import type { Wiki } from "./registry.ts";

export const GROUP_LIMITS = {
  name: 60,
  /** Groups in one collection. */
  groups: 1000,
  /** Levels from the top of a collection: deep enough for any sorting, short of a runaway loop. */
  depth: 32,
} as const;

const authorSchema = z.strictObject({
  kind: z.enum(["owner", "guest"]),
  name: z.string(),
  guestId: z.string().optional(),
});
export const groupSchema = z.strictObject({
  id: z.string(),
  collection: z.string(),
  name: z.string(),
  /** The group it sits in, or null at the top of the collection. */
  parent: z.string().nullable(),
  author: authorSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Group = z.infer<typeof groupSchema>;

const groupsDir = (wiki: Wiki, collection: string) => join(wiki.root, "designs", collection, "_groups");
const groupFile = (wiki: Wiki, collection: string, id: string) => join(groupsDir(wiki, collection), `${id}.json`);
const nowIso = () => new Date().toISOString();

const save = (wiki: Wiki, g: Group) =>
  writeAtomic(groupFile(wiki, g.collection, g.id), `${JSON.stringify(g, null, 2)}\n`);

export function getGroup(wiki: Wiki, collection: string, id: string): Group | null {
  if (!ID.test(collection) || !ID.test(id)) return null;
  const file = groupFile(wiki, collection, id);
  if (!existsSync(file)) return null;
  try {
    const parsed = groupSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
    return parsed.success && parsed.data.id === id ? parsed.data : null;
  } catch {
    return null;
  }
}

/** A collection's groups, by name. */
export function listGroups(wiki: Wiki, collection: string): Group[] {
  const dir = groupsDir(wiki, collection);
  if (!ID.test(collection) || !existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => getGroup(wiki, collection, f.slice(0, -5)))
    .filter((g): g is Group => g !== null)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
}

/**
 * The groups from the top of the collection down to `id`, itself last. A group whose parent is missing (its file
 * removed by hand) counts as at the top; a loop (two files edited by hand) stops where it closes.
 */
export function groupPath(groups: Map<string, Group>, id: string | null): Group[] {
  const path: Group[] = [];
  const seen = new Set<string>();
  for (let g = id ? groups.get(id) : undefined; g && !seen.has(g.id); g = g.parent ? groups.get(g.parent) : undefined) {
    seen.add(g.id);
    path.unshift(g);
  }
  return path;
}

const byId = (groups: Group[]) => new Map(groups.map((g) => [g.id, g]));

/** Why a group can't sit in `parent`, or null when it can. `moving` is the group being moved, when one is. */
function placeProblem(groups: Map<string, Group>, parent: string | null, moving?: string): string | null {
  if (parent === null) return null;
  if (!groups.has(parent)) return "no such group";
  const path = groupPath(groups, parent);
  if (moving && path.some((g) => g.id === moving)) return "a group can't go inside itself";
  // The moved group's own levels below it count too.
  const below = moving ? depthBelow(groups, moving) : 0;
  if (path.length + 1 + below > GROUP_LIMITS.depth) return `groups go at most ${GROUP_LIMITS.depth} levels deep`;
  return null;
}

/** How many levels of groups sit under `id`. */
function depthBelow(groups: Map<string, Group>, id: string, seen = new Set<string>()): number {
  if (seen.has(id)) return 0;
  seen.add(id);
  let most = 0;
  for (const g of groups.values()) if (g.parent === id) most = Math.max(most, 1 + depthBelow(groups, g.id, seen));
  return most;
}

/** Makes a group, inside `parent` or at the top. Answers why not when it can't go there. */
export function createGroup(
  wiki: Wiki,
  collection: string,
  name: string,
  parent: string | null,
  author: Author,
): Group | string {
  const groups = listGroups(wiki, collection);
  if (groups.length >= GROUP_LIMITS.groups) return `a collection holds at most ${GROUP_LIMITS.groups} groups`;
  const problem = placeProblem(byId(groups), parent);
  if (problem) return problem;
  mkdirSync(groupsDir(wiki, collection), { recursive: true });
  const base = slug(name).slice(0, 40) || "group";
  let id = "";
  do id = `${base}-${randomBytes(3).toString("hex").slice(0, 4)}`;
  while (existsSync(groupFile(wiki, collection, id)));
  const at = nowIso();
  const group: Group = { id, collection, name, parent, author, createdAt: at, updatedAt: at };
  save(wiki, group);
  return group;
}

/** Renames a group or moves it into another (or to the top). Answers why not when it can't go there. */
export function updateGroup(wiki: Wiki, g: Group, patch: { name?: string; parent?: string | null }): Group | string {
  if (patch.parent !== undefined && patch.parent !== g.parent) {
    const problem = placeProblem(byId(listGroups(wiki, g.collection)), patch.parent, g.id);
    if (problem) return problem;
  }
  const next = { ...g, ...patch, updatedAt: nowIso() };
  save(wiki, next);
  return next;
}

/** Whether a design may go into `group` (null: the top). */
export const groupExists = (wiki: Wiki, collection: string, group: string | null) =>
  group === null || getGroup(wiki, collection, group) !== null;

/**
 * Removes a group: the groups and designs inside it move up to its parent, and its file goes to `_removed/`. Nothing
 * inside is lost or hidden. Answers what moved.
 */
export function removeGroup(wiki: Wiki, g: Group): { groups: number; designs: number } {
  const moved = { groups: 0, designs: 0 };
  for (const child of listGroups(wiki, g.collection))
    if (child.parent === g.id) {
      save(wiki, { ...child, parent: g.parent, updatedAt: nowIso() });
      moved.groups++;
    }
  for (const d of listDesigns(wiki, g.collection))
    if (d.group === g.id) {
      updateDesign(wiki, d, { group: g.parent });
      moved.designs++;
    }
  renameSync(groupFile(wiki, g.collection, g.id), removedPath(wiki, g.collection, "group", `${g.id}.json`));
  return moved;
}

/** The group path of a design, as names: "Monsters / World 1". Empty at the top. */
export function designPlace(groups: Group[], d: Design): string {
  return groupPath(byId(groups), d.group)
    .map((g) => g.name)
    .join(" / ");
}

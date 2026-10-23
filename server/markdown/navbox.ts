// Navboxes, as at the foot of a game wiki's article: a box of related pages in labelled rows, which folds. Written by
// hand as a list (`- Creatures: [[Moss fox]] · [[Ember moth]]`, with nested lists for rows inside a row), or built
// from a section of the page tree (`::navbox{from="world"}`): a row for each folder, its pages as the links. The page
// it sits on is marked in it.
import type { Element, Root as HastRoot } from "hast";
import type { Link, List, ListItem, PhrasingContent, Root, RootContent } from "mdast";
import type { ContainerDirective, LeafDirective, TextDirective } from "mdast-util-directive";
import { visit } from "unist-util-visit";
import type { NavNode } from "../../shared/api.ts";

type Directive = ContainerDirective | LeafDirective | TextDirective;

const el = (hName: string, children: unknown[]) =>
  ({ type: hName, data: { hName, hProperties: {} }, children }) as unknown as RootContent;

/** Splits a row's links at ` · ` (or ` • `): each piece is one item. */
function splitItems(phrasing: PhrasingContent[]): PhrasingContent[][] {
  const out: PhrasingContent[][] = [[]];
  for (const node of phrasing) {
    if (node.type !== "text") {
      out[out.length - 1].push(node);
      continue;
    }
    node.value.split(/[·•]/).forEach((part, i) => {
      if (i > 0) out.push([]);
      if (part) out[out.length - 1].push({ type: "text", value: part });
    });
  }
  return out
    .map((item) => {
      const first = item[0];
      const last = item[item.length - 1];
      if (first?.type === "text") first.value = first.value.trimStart();
      if (last?.type === "text") last.value = last.value.trimEnd();
      return item.filter((n) => n.type !== "text" || n.value);
    })
    .filter((item) => item.length);
}

/** A row's label and links: what's before the first `:` outside a link, and what's after it. */
function splitLabel(phrasing: PhrasingContent[]): { label: PhrasingContent[]; links: PhrasingContent[] } | null {
  const at = phrasing.findIndex((n) => n.type === "text" && n.value.includes(":"));
  if (at < 0) return null;
  const node = phrasing[at] as { value: string };
  const colon = node.value.indexOf(":");
  const before = node.value.slice(0, colon).trimEnd();
  const after = node.value.slice(colon + 1).trimStart();
  return {
    label: [...phrasing.slice(0, at), ...(before ? [{ type: "text", value: before } as PhrasingContent] : [])],
    links: [...(after ? [{ type: "text", value: after } as PhrasingContent] : []), ...phrasing.slice(at + 1)],
  };
}

function row(label: PhrasingContent[], links: PhrasingContent[][], rows: RootContent[]): RootContent {
  return el("sh-navbox-group", [
    ...(label.length ? [el("sh-navbox-label", label)] : []),
    ...(links.length
      ? [
          el(
            "sh-navbox-items",
            links.map((l) => el("sh-navbox-item", l)),
          ),
        ]
      : []),
    ...rows,
  ]);
}

/** A list item as a row: "Label: link · link", "Label" over a nested list of rows, or links alone. */
function itemRow(item: ListItem): RootContent {
  const [first, ...rest] = item.children;
  const phrasing = first?.type === "paragraph" ? first.children : [];
  const nested = rest.filter((c): c is List => c.type === "list").flatMap((l) => l.children.map(itemRow));
  const split = splitLabel(phrasing);
  if (split) return row(split.label, splitItems(split.links), nested);
  return nested.length ? row(phrasing, [], nested) : row([], splitItems(phrasing), []);
}

/** `transform` for `:::navbox`: its list as rows. The leaf form is filled in by `remarkNavboxFrom`. */
export function navboxRows(node: Directive, problem: (message: string) => void) {
  const from = node.attributes?.from;
  if (node.type === "leafDirective") {
    if (!from)
      problem('navbox: write its rows inside ":::navbox[Title]", or build it from a section: ::navbox{from="world"}');
    return;
  }
  if (from) problem('navbox: "from" builds the rows from the pages; write it as a leaf, ::navbox{from="…"}');
  const rows: RootContent[] = [];
  for (const child of node.children as RootContent[]) {
    if (child.type === "list") rows.push(...child.children.map(itemRow));
    else problem('navbox: write each row as a list item, "- Creatures: [[Moss fox]] · [[Ember moth]]"');
  }
  if (!rows.length) problem('navbox: add rows, as "- Creatures: [[Moss fox]] · [[Ember moth]]"');
  node.children = rows as never;
}

const linkTo = (n: NavNode): Link => ({
  type: "link",
  url: `/${n.path}`,
  children: [{ type: "text", value: n.title }],
  data: { hProperties: { dataWikilink: "" } },
});

function findNode(nav: NavNode[], path: string): NavNode | undefined {
  for (const n of nav) {
    if (n.path === path) return n;
    if (path.startsWith(`${n.path}/`)) return findNode(n.children, path);
  }
  return undefined;
}

/** A folder's rows: its loose pages first, without a label, then a row per folder under it (nested further down). */
function treeRows(node: NavNode): RootContent[] {
  const loose = node.children.filter((c) => !c.children.length && c.isPage);
  const folders = node.children.filter((c) => c.children.length);
  const folderRow = (f: NavNode): RootContent => {
    const pages = f.children.filter((c) => !c.children.length && c.isPage).map((c) => [linkTo(c)]);
    const label: PhrasingContent[] = f.isPage ? [linkTo(f)] : [{ type: "text", value: f.title }];
    return row(label, pages, f.children.filter((c) => c.children.length).map(folderRow));
  };
  return [
    ...(loose.length
      ? [
          row(
            [],
            loose.map((c) => [linkTo(c)]),
            [],
          ),
        ]
      : []),
    ...folders.map(folderRow),
  ];
}

/** remark plugin, after `remarkElements`: `::navbox{from="world"}` gets that section's rows, and its title. */
export function remarkNavboxFrom(nav: (() => NavNode[]) | undefined, problems: string[], lineOffset = 0) {
  return (tree: Root) => {
    visit(tree, "leafDirective", (node: LeafDirective) => {
      const from = node.name === "navbox" ? node.attributes?.from?.replace(/^\/+|\/+$/g, "") : undefined;
      if (from === undefined) return;
      const line = (node.position?.start.line ?? 0) + lineOffset;
      const section = nav && (from ? findNode(nav(), from) : { path: "", title: "", isPage: true, children: nav() });
      if (!section) {
        problems.push(`line ${line}: navbox: there's no section "${from}"`);
        return;
      }
      const props = (node.data?.hProperties ?? {}) as Record<string, string>;
      if (!props.title && section.title) props.title = section.title;
      node.data = { ...node.data, hProperties: props };
      node.children = treeRows(section) as never;
    });
  };
}

/** rehype plugin: links in a navbox to the page it sits on are marked, so the row shows where the reader is. */
export function rehypeNavboxHere(href: string | undefined) {
  return (tree: HastRoot) => {
    if (href === undefined) return;
    visit(tree, "element", (box: Element) => {
      if (box.tagName !== "sh-navbox") return;
      visit(box, "element", (a: Element) => {
        if (a.tagName === "a" && a.properties.href === href) a.properties.ariaCurrent = "page";
      });
    });
  };
}

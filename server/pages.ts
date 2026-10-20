// A wiki's pages: `pages/**/*.md`. The page path is the file path without `.md`; `index.md` is its folder's page.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix } from "node:path";
import type { NavNode, PageData } from "../shared/api.ts";
import { type Frontmatter, frontmatterSchema, issues } from "../shared/schema.ts";
import { splitFrontmatter } from "./markdown/frontmatter.ts";
import { renderMarkdown } from "./markdown/render.ts";
import { inside } from "./paths.ts";
import type { Wiki } from "./registry.ts";

export interface PageFile {
  path: string;
  /** From the wiki root: `pages/systems/combat.md`. */
  file: string;
  title: string;
  order: number;
  hidden: boolean;
}

function walk(dir: string, base: string, out: string[]) {
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith(".") || name.startsWith("_")) continue;
    const full = join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    if (statSync(full).isDirectory()) walk(full, rel, out);
    else if (name.endsWith(".md")) out.push(rel);
  }
}

export const pathOf = (rel: string) => rel.replace(/\.md$/, "").replace(/(^|\/)index$/, "");

const humanize = (s: string) => s.replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function readPage(wiki: Wiki, rel: string) {
  const split = splitFrontmatter(readFileSync(join(wiki.root, "pages", rel), "utf8"));
  const parsed = frontmatterSchema.safeParse(split.data);
  const problems = split.error ? [split.error] : [];
  if (!parsed.success) problems.push(...issues(parsed.error).map((i) => `frontmatter: ${i}`));
  const fm: Frontmatter = parsed.success ? parsed.data : {};
  const path = pathOf(rel);
  const heading = /^#\s+(.+)$/m.exec(split.body)?.[1]?.trim();
  const title = fm.title ?? heading ?? (path ? humanize(posix.basename(path)) : "Home");
  return { split, fm, problems, path, title };
}

export function listPages(wiki: Wiki): PageFile[] {
  const dir = join(wiki.root, "pages");
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  walk(dir, "", files);
  return files.map((rel) => {
    const { fm, path, title } = readPage(wiki, rel);
    return { path, file: `pages/${rel}`, title, order: fm.order ?? 0, hidden: fm.hidden ?? false };
  });
}

/** Sidebar tree. The home page ("") isn't in it; the wiki title links there. */
export function buildNav(pages: PageFile[]): NavNode[] {
  const root: NavNode = { path: "", title: "", isPage: true, children: [] };
  const order = new Map<NavNode, number>();
  const nodeAt = (path: string): NavNode => {
    let node = root;
    let at = "";
    for (const part of path.split("/")) {
      at = at ? `${at}/${part}` : part;
      let next = node.children.find((c) => c.path === at);
      if (!next) {
        next = { path: at, title: humanize(part), isPage: false, children: [] };
        node.children.push(next);
      }
      node = next;
    }
    return node;
  };
  for (const page of pages) {
    if (!page.path || page.hidden) continue;
    const node = nodeAt(page.path);
    node.title = page.title;
    node.isPage = true;
    order.set(node, page.order);
  }
  const sort = (nodes: NavNode[]) => {
    nodes.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0) || a.title.localeCompare(b.title));
    for (const n of nodes) sort(n.children);
  };
  sort(root.children);
  return root.children;
}

export function renderPage(wiki: Wiki, pages: PageFile[], path: string): PageData | null {
  const page = pages.find((p) => p.path === path);
  if (!page) return null;
  const { split, fm, problems, title } = readPage(wiki, page.file.slice("pages/".length));
  const known = new Set(pages.map((p) => p.path));
  const rendered = renderMarkdown(
    split.body,
    {
      wikiId: wiki.id,
      pageDir: posix.dirname(page.file.slice("pages/".length)).replace(/^\.$/, ""),
      pageExists: (p) => known.has(p),
      fileExists: (rel) => {
        const full = inside(wiki.root, rel);
        return full !== null && existsSync(full);
      },
    },
    split.bodyLine - 1,
  );
  return {
    path,
    title,
    summary: fm.summary ?? "",
    toc: rendered.toc,
    hast: rendered.hast,
    problems: [...problems, ...rendered.problems],
  };
}

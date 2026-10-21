// A wiki's pages: `pages/**/*.md`. The page path is the file path without `.md`; `index.md` is its folder's page.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix } from "node:path";
import { visit } from "unist-util-visit";
import type { NavNode, PageData, PageLink } from "../shared/api.ts";
import { type Frontmatter, frontmatterSchema, issues, type PageStatus } from "../shared/schema.ts";
import { splitFrontmatter } from "./markdown/frontmatter.ts";
import { fileUrl, type LinkContext, resolveFile } from "./markdown/links.ts";
import { renderMarkdown } from "./markdown/render.ts";
import { type Found, slug } from "./markdown/wikilinks.ts";
import { inside } from "./paths.ts";
import type { Wiki } from "./registry.ts";

export interface PageFile {
  path: string;
  /** From the wiki root: `pages/systems/combat.md`. */
  file: string;
  title: string;
  order: number;
  hidden: boolean;
  icon?: string;
  summary?: string;
  status?: PageStatus;
}

/** About 220 words a minute, never under one. */
const READING_SPEED = 220;

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
    return {
      path,
      file: `pages/${rel}`,
      title,
      order: fm.order ?? 0,
      hidden: fm.hidden ?? false,
      icon: fm.icon,
      summary: fm.summary,
      status: fm.status,
    };
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
    node.icon = page.icon;
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

/** Case, accents and spacing don't matter when matching a wikilink to a file name or title. */
const loose = (s: string) => slug(s.normalize("NFD").replace(/\p{M}/gu, "")).replace(/[-_]+/g, "-");

/**
 * Resolves `[[name]]` for a page in `pageDir`: as a path from the root, then from the page's folder, then by file
 * name, then by title. Several pages matching the same way is ambiguous; the first one wins and the rest are returned.
 */
export function pageFinder(pages: PageFile[], pageDir: string): (name: string) => Found {
  const byPath = new Map(pages.map((p) => [p.path, p]));
  const ref = (p: PageFile) => ({ path: p.path, title: p.title });
  return (name) => {
    const bare = name.replace(/^\/+|\/+$/g, "");
    const exact = byPath.get(bare) ?? (name.startsWith("/") ? undefined : byPath.get(posix.join(pageDir, bare)));
    if (exact) return { page: ref(exact), others: [] };
    const want = loose(posix.basename(bare));
    for (const matches of [
      pages.filter((p) => p.path && loose(posix.basename(p.path)) === want),
      pages.filter((p) => loose(p.title) === loose(bare)),
    ]) {
      if (matches.length) return { page: ref(matches[0]), others: matches.slice(1).map(ref) };
    }
    return { page: null, others: [] };
  };
}

/** The sidebar tree in reading order, home page first: what previous/next walk through. */
export function readingOrder(nav: NavNode[]): string[] {
  const out = [""];
  const walk = (nodes: NavNode[]) => {
    for (const n of nodes) {
      if (n.isPage) out.push(n.path);
      walk(n.children);
    }
  };
  walk(nav);
  return out;
}

function findNode(nav: NavNode[], path: string): NavNode | undefined {
  for (const n of nav) {
    if (n.path === path) return n;
    if (path.startsWith(`${n.path}/`)) return findNode(n.children, path);
  }
  return undefined;
}

export function renderPage(wiki: Wiki, pages: PageFile[], path: string): PageData | null {
  const page = pages.find((p) => p.path === path);
  if (!page) return null;
  const { split, fm, problems, title } = readPage(wiki, page.file.slice("pages/".length));
  const byPath = new Map(pages.map((p) => [p.path, p]));
  const link = (at: string, fallback?: string): PageLink => {
    const p = byPath.get(at);
    return p
      ? { path: at, title: p.title, icon: p.icon, summary: p.summary, status: p.status, isPage: true }
      : { path: at, title: fallback ?? humanize(posix.basename(at)), isPage: false };
  };

  const nav = buildNav(pages);
  const below = path ? (findNode(nav, path)?.children ?? []) : nav;
  const order = readingOrder(nav);
  const at = order.indexOf(path);
  const parts = path ? path.split("/") : [];
  const words = split.body.split(/\s+/).filter(Boolean).length;
  const known = new Set(pages.map((p) => p.path));
  const pageDir = posix.dirname(page.file.slice("pages/".length)).replace(/^\.$/, "");
  const ctx: LinkContext = {
    wikiId: wiki.id,
    pageDir,
    findPage: pageFinder(pages, pageDir),
    pageExists: (p) => known.has(p),
    fileExists: (rel) => {
      const full = inside(wiki.root, rel);
      return full !== null && existsSync(full);
    },
  };
  const rendered = renderMarkdown(split.body, ctx, split.bodyLine - 1);

  // Frontmatter pictures resolve like Markdown images: from the root with a leading `/`, else from the page's folder.
  const picture = (src: string | undefined, field: string) => {
    if (!src) return undefined;
    if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(src)) return src;
    const rel = resolveFile(ctx.pageDir, src);
    if (rel === null || !ctx.fileExists(rel)) problems.push(`frontmatter: ${field}: missing file "${src}"`);
    return rel === null ? src : fileUrl(wiki.id, rel);
  };
  const cell = (label: string, value: unknown) => {
    const text = Array.isArray(value)
      ? value.join(", ")
      : typeof value === "boolean"
        ? value
          ? "Yes"
          : "No"
        : String(value);
    const r = renderMarkdown(text, ctx);
    problems.push(...r.problems.map((p) => `frontmatter: infobox "${label}": ${p.replace(/^line \d+: /, "")}`));
    return r.hast;
  };
  const infobox =
    fm.infobox || fm.image
      ? {
          image: picture(fm.image, "image"),
          caption: fm.caption,
          rows: Object.entries(fm.infobox ?? {}).map(([label, value]) => ({ label, value: cell(label, value) })),
        }
      : undefined;

  // `related:` names resolve like wikilinks; ones not written yet stay, as red links.
  const kinds = new Map<string, PageLink[]>();
  for (const entry of fm.related ?? []) {
    const { to, kind = "Related" } = typeof entry === "string" ? { to: entry } : entry;
    const found = ctx.findPage?.(to);
    const target = found?.page
      ? link(found.page.path)
      : { path: to.split("/").map(slug).join("/"), title: to, isPage: false };
    kinds.set(kind, [...(kinds.get(kind) ?? []), target]);
  }
  let relatedPlaced = false;
  let childrenPlaced = false;
  const placedQuestions: string[] = [];
  visit(rendered.hast, "element", (el) => {
    if (el.tagName === "sh-related") relatedPlaced = true;
    if (el.tagName === "sh-children") childrenPlaced = true;
    if (el.tagName === "sh-question" && el.properties.id) placedQuestions.push(String(el.properties.id));
  });
  const questions = (fm.questions ?? []).map((q) => ({ ...q, options: q.options ?? [] }));
  const ids = questions.map((q) => q.id);
  for (const id of new Set(ids.filter((id, i) => ids.indexOf(id) !== i))) {
    problems.push(`frontmatter: questions: "${id}" is used twice`);
  }
  for (const id of placedQuestions) {
    if (!ids.includes(id)) problems.push(`::question{id=${id}}: there's no question "${id}" in the frontmatter`);
  }

  return {
    path,
    title,
    summary: fm.summary ?? "",
    icon: fm.icon,
    status: fm.status,
    tags: fm.tags ?? [],
    type: fm.type,
    infobox,
    banner: picture(fm.banner, "banner"),
    file: page.file,
    backlinks: [],
    related: [...kinds].map(([kind, pages]) => ({ kind, pages })),
    questions,
    placed: { related: relatedPlaced, children: childrenPlaced, questions: placedQuestions },
    updatedAt: statSync(join(wiki.root, page.file)).mtime.toISOString(),
    minutes: Math.max(1, Math.round(words / READING_SPEED)),
    trail: path ? ["", ...parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/"))].map((p) => link(p)) : [],
    children: below.map((n) => link(n.path, n.title)),
    prev: at > 0 ? link(order[at - 1]) : null,
    next: at >= 0 && at < order.length - 1 ? link(order[at + 1]) : null,
    toc: fm.toc === false ? [] : rendered.toc,
    hast: rendered.hast,
    problems: [...problems, ...rendered.problems],
  };
}

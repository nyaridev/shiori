// A wiki's pages: `pages/**/*.md`. The page path is the file path without `.md`; `index.md` is its folder's page.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix } from "node:path";
import { visit } from "unist-util-visit";
import type { NavNode, PageData, PageLink } from "../shared/api.ts";
import { type Frontmatter, frontmatterSchema, issues, type PageStatus } from "../shared/schema.ts";
import { ICON_NAME, iconSet } from "./icons.ts";
import { FRONT_LAYOUT, type Layouts, loadLayouts } from "./layouts.ts";
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
  type?: string;
  tags?: string[];
  /** The page's own facts, for tables of pages (`::table{pages}`): its infobox rows and frontmatter of its own. */
  fields?: Record<string, string>;
  /** A panel page (a dashboard); the public wiki leaves these out (ADR-0011). */
  panel?: boolean;
  /** Its own say on the public wiki: in (`true`), out (`false`), or as wiki.json's `public.pages` decides. */
  public?: boolean;
  /** Infobox rows and fields the public wiki leaves out. */
  private?: string[];
}

/** Frontmatter keys Shiori reads; any other key is one of the page's own fields. */
const KNOWN_KEYS = new Set(Object.keys(frontmatterSchema.shape));

/** A field as a table shows it: lists joined, days as written, nested values left out. */
function fieldText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return value.every((v) => typeof v !== "object") ? value.join(", ") : null;
  if (typeof value === "object") return null;
  return String(value);
}

function fieldsOf(fm: Frontmatter): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (key: string, value: unknown) => {
    const text = fieldText(value);
    if (text !== null && !(key in out)) out[key] = text;
  };
  for (const [key, value] of Object.entries(fm.infobox ?? {})) put(key, value);
  for (const [key, value] of Object.entries(fm)) if (!KNOWN_KEYS.has(key)) put(key, value);
  return out;
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

/** An icon that names a picture (`/assets/icons/sword.svg`) rather than an emoji. */
export const isIconFile = (icon: string) => /\.(svg|png|webp|gif|avif|jpe?g)$/i.test(icon);

/**
 * A page's icon as the app shows it: a name from Shiori's icon set as that icon's URL, a picture of the wiki's own as
 * its URL (from the root with a leading `/`, else from the page's folder, like images), an emoji as written. A name
 * that isn't in the set or a picture that isn't there is reported and shows no icon.
 */
function iconOf(wiki: Wiki, pageDir: string, raw: string | undefined, problems?: string[]): string | undefined {
  if (raw && ICON_NAME.test(raw)) {
    if (iconSet().has(raw)) return raw;
    problems?.push(`frontmatter: icon: "${raw}" isn't in Shiori's icon set (Toolbox → Icons lists them)`);
    return undefined;
  }
  if (!raw || !isIconFile(raw)) return raw;
  if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(raw)) {
    problems?.push(`frontmatter: icon: "${raw}" must be a picture in the wiki, not a link`);
    return undefined;
  }
  const rel = resolveFile(pageDir, raw);
  const full = rel === null ? null : inside(wiki.root, rel);
  if (rel === null || full === null || !existsSync(full)) {
    problems?.push(`frontmatter: icon: missing file "${raw}"`);
    return undefined;
  }
  return fileUrl(wiki.id, rel);
}

export const pathOf = (rel: string) => rel.replace(/\.md$/, "").replace(/(^|\/)index$/, "");

const humanize = (s: string) => s.replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** A page file read and split; `text` instead of the file is an older version of it (ADR-0008). */
function readPage(wiki: Wiki, rel: string, text?: string) {
  const split = splitFrontmatter(text ?? readFileSync(join(wiki.root, "pages", rel), "utf8"));
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
      icon: iconOf(wiki, posix.dirname(rel).replace(/^\.$/, ""), fm.icon),
      summary: fm.summary,
      status: fm.status,
      type: fm.type,
      tags: fm.tags ?? [],
      fields: fieldsOf(fm),
      ...(fm.panel ? { panel: true } : {}),
      ...(fm.public !== undefined ? { public: fm.public } : {}),
      ...(fm.private?.length ? { private: fm.private } : {}),
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

/** A page rendered with the wiki around it. `text` renders an older version of its file instead (ADR-0008). */
export function renderPage(
  wiki: Wiki,
  pages: PageFile[],
  path: string,
  layouts: Layouts = loadLayouts(wiki),
  text?: string,
): PageData | null {
  const page = pages.find((p) => p.path === path);
  if (!page) return null;
  const { split, fm, problems, title } = readPage(wiki, page.file.slice("pages/".length), text);
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
    tables: {
      readData: (rel) => {
        const full = inside(wiki.root, rel);
        try {
          return full === null ? null : readFileSync(full, "utf8");
        } catch {
          return null;
        }
      },
      // A table of pages never lists the page it sits on.
      pages: () => pages.filter((p) => p.path !== path),
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
    if ((el.tagName === "sh-question" || el.tagName === "sh-suggestion") && el.properties.id)
      placedQuestions.push(String(el.properties.id));
  });
  // A layout (ADR-0006): one the wiki has and that's valid, else the plain page and a problem.
  let layout: PageData["layout"];
  if (fm.layout) {
    const found = layouts.layouts.get(fm.layout);
    if (!found) {
      const broken = layouts.problems.some((p) => p.startsWith(`layouts/${fm.layout}.json`));
      problems.push(
        fm.layout === FRONT_LAYOUT
          ? "frontmatter: layout: layouts/front.json is the public wiki's front page, not a page layout"
          : broken
            ? `frontmatter: layout: layouts/${fm.layout}.json has problems (pnpm shiori check lists them)`
            : `frontmatter: layout: there's no layouts/${fm.layout}.json`,
      );
    } else {
      layout = { name: fm.layout, ...found };
      for (const block of Object.values(found.blocks)) {
        if (block.type === "designs" && !wiki.manifest.collections[block.collection])
          problems.push(`layout "${fm.layout}": there's no collection "${block.collection}" in wiki.json`);
      }
    }
  }
  const [collection, designId] = fm.design?.split("/") ?? [];
  if (collection && !wiki.manifest.collections[collection])
    problems.push(`frontmatter: design: there's no collection "${collection}" in wiki.json`);
  // Questions ask about what's there; suggestions (the agent's, from reviewing the page) propose what to add or improve.
  // Both are answered the same way, so their ids share one namespace.
  const questions = [
    ...(fm.questions ?? []).map((q) => ({ ...q, kind: "question" as const, options: q.options ?? [] })),
    ...(fm.suggestions ?? []).map((q) => ({ ...q, kind: "suggestion" as const, options: q.options ?? [] })),
  ];
  const ids = questions.map((q) => q.id);
  for (const id of new Set(ids.filter((id, i) => ids.indexOf(id) !== i))) {
    problems.push(`frontmatter: questions and suggestions: "${id}" is used twice`);
  }
  for (const id of placedQuestions) {
    if (!ids.includes(id))
      problems.push(`::question{id=${id}}: there's no question or suggestion "${id}" in the frontmatter`);
  }
  // Each wiki's settings.json caps how many are open at once on a page.
  for (const [kind, max] of [
    ["question", wiki.settings.maxQuestions],
    ["suggestion", wiki.settings.maxSuggestions],
  ] as const) {
    const open = questions.filter((q) => q.kind === kind && q.status === "open").length;
    if (open > max)
      problems.push(
        `frontmatter: ${open} open ${kind}s, more than the ${max} settings.json allows; decide or drop some`,
      );
  }

  return {
    path,
    title,
    summary: fm.summary ?? "",
    icon: iconOf(wiki, pageDir, fm.icon, problems),
    status: fm.status,
    tags: fm.tags ?? [],
    type: fm.type,
    infobox,
    banner: picture(fm.banner, "banner"),
    ...(fm.panel ? { panel: true } : {}),
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
    ...(layout ? { layout } : {}),
    ...(collection && designId ? { design: { collection, id: designId } } : {}),
    hast: rendered.hast,
    problems: [...problems, ...rendered.problems],
  };
}

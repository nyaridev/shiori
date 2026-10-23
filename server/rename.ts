// `pnpm shiori rename` (ADR-0002): moves a page, or a section with everything under it, and keeps the wiki whole. Every
// page's links are checked against the old layout; a link whose target moved, or that no longer resolves from its own
// page's new folder, is rewritten to the new path. Wikilinks that find a page by its title keep working and stay as
// written. Comments and answers move with their pages. Code blocks are never touched.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import type { Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { resolveFile, resolvePageLink } from "./markdown/links.ts";
import { WIKILINK } from "./markdown/wikilinks.ts";
import { listPages, type PageFile, pageFinder, pathOf } from "./pages.ts";
import type { Wiki } from "./registry.ts";
import { dbFor } from "./threads.ts";

const EXTERNAL = /^([a-z][a-z0-9+.-]*:|\/\/)/i;
const FRONTMATTER = /^---\n[\s\S]*?\n---(?:\n|$)/;
/** `[text](target "title")` and `![alt](target)`; the target may be in `<…>`. */
const MD_LINK = /(!?)\[((?:[^[\]]|\[[^\]]*\])*)\]\(\s*(<[^>]*>|[^)\s]+)/g;
/** `[id]: target`, a reference link's definition. */
const DEFINITION = /^ {0,3}\[[^\]]+\]:[ \t]*(<[^>]*>|\S+)/gm;
const PAGE_CHIP = /:page\[([^\]#]+)(#[^\]]*)?\]/g;
/** Frontmatter fields that name a page (`related: - to:`) or a picture (`image:`, `banner:`). */
const FM_PAGE = /^([ \t]*(?:-[ \t]+)?to:[ \t]*)(["']?)(.+?)\2[ \t]*$/gm;
const FM_PICTURE = /^([ \t]*(?:image|banner):[ \t]*)(["']?)(.+?)\2[ \t]*$/gm;

/** A page as typed on the command line: `plan/goals`, `/plan/goals`, `pages/plan/goals.md`, `plan/index.md`. */
export function pagePathOf(raw: string): string {
  const bare = raw
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/^pages\//, "");
  return bare ? pathOf(bare.endsWith(".md") ? bare : `${bare}.md`) : "";
}

export interface RenamePlan {
  /** Files or folders to move, from the wiki root. */
  moves: { from: string; to: string }[];
  /** Every page whose path changes: old → new. */
  paths: Map<string, string>;
  /** Pages whose text changes (by their current file), with how many links were fixed. */
  edits: { file: string; text: string; links: number }[];
}

interface Replacement {
  start: number;
  end: number;
  text: string;
}

/** Where code is in a page body (fences, indented blocks, inline code), so links shown as code stay as written. */
function codeRanges(body: string): [number, number][] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(body) as Root;
  const out: [number, number][] = [];
  visit(tree, (node) => {
    if ((node.type === "code" || node.type === "inlineCode") && node.position) {
      out.push([node.position.start.offset ?? 0, node.position.end.offset ?? 0]);
    }
  });
  return out;
}

const splitHash = (target: string): [string, string] => {
  const at = target.indexOf("#");
  return at < 0 ? [target, ""] : [target.slice(0, at), target.slice(at)];
};

/** Plans a rename without changing anything; throws with a message for the person when it can't be done. */
export function planRename(wiki: Wiki, fromRaw: string, toRaw: string): RenamePlan {
  const pages = listPages(wiki);
  const from = pagePathOf(fromRaw);
  const to = pagePathOf(toRaw);
  if (!from) throw new Error("The home page can't be renamed.");
  if (!to) throw new Error("A page can't become the home page.");
  if (from === to) throw new Error("The page is already there.");
  const page = pages.find((p) => p.path === from);
  if (!page) throw new Error(`No page "${from}". \`pnpm shiori check\` lists the wiki's pages.`);
  const section = page.file.endsWith("/index.md");
  if (section && to.startsWith(`${from}/`)) throw new Error("A section can't move into itself.");
  const taken = (p: string) =>
    pages.some((x) => x.path === p) ||
    existsSync(join(wiki.root, "pages", `${p}.md`)) ||
    existsSync(join(wiki.root, "pages", p));
  if (taken(to)) throw new Error(`pages/${to} already exists. Pick another name, or move that page first.`);

  const moves = section ? [{ from: `pages/${from}`, to: `pages/${to}` }] : [{ from: page.file, to: `pages/${to}.md` }];
  const moved = (rel: string) => {
    for (const m of moves) if (rel === m.from || rel.startsWith(`${m.from}/`)) return m.to + rel.slice(m.from.length);
    return rel;
  };
  const paths = new Map<string, string>();
  for (const p of pages) {
    if (p.path === from || (section && p.path.startsWith(`${from}/`)))
      paths.set(p.path, to + p.path.slice(from.length));
  }
  const after: PageFile[] = pages.map((p) => ({ ...p, path: paths.get(p.path) ?? p.path, file: moved(p.file) }));
  const known = new Set(pages.map((p) => p.path));
  const dirOf = (file: string) => posix.dirname(file.slice("pages/".length)).replace(/^\.$/, "");

  const edits: RenamePlan["edits"] = [];
  for (const p of pages) {
    const raw = readFileSync(join(wiki.root, p.file), "utf8");
    const crlf = raw.includes("\r\n");
    const text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
    const oldDir = dirOf(p.file);
    const newDir = dirOf(moved(p.file));
    const findBefore = pageFinder(pages, oldDir);
    const findAfter = pageFinder(after, newDir);

    /** A Markdown link's or picture's target, rewritten when the move breaks it; null when it still works. */
    const fixTarget = (target: string, picture: boolean): string | null => {
      if (!target || EXTERNAL.test(target) || target.startsWith("#")) return null;
      const [part, hash] = splitHash(target);
      let decoded: string;
      try {
        decoded = decodeURI(part);
      } catch {
        return null;
      }
      if (picture || (/\.[a-z0-9]+$/i.test(decoded) && !decoded.endsWith(".md"))) {
        const rel = resolveFile(oldDir, decoded);
        if (rel === null) return null;
        const now = moved(rel);
        return resolveFile(newDir, decoded) === now ? null : encodeURI(`/${now}`) + hash;
      }
      const path = resolvePageLink(oldDir, decoded);
      if (path === null || !known.has(path)) return null;
      const want = paths.get(path) ?? path;
      return resolvePageLink(newDir, decoded) === want ? null : encodeURI(`/${want}`) + hash;
    };
    /**
     * A wikilink's name, rewritten to the page's new path when the name no longer finds it, or when it was the old
     * path itself (it would still find the page by file name, but a path should say where the page is). Names that
     * find a page by its title stay as written; red links stay red.
     */
    const fixName = (name: string): string | null => {
      const found = findBefore(name).page;
      if (!found) return null;
      const want = paths.get(found.path) ?? found.path;
      const bare = name.replace(/^\/+|\/+$/g, "");
      const byPath = bare.includes("/") && (bare === found.path || posix.join(oldDir, bare) === found.path);
      if (byPath && want !== found.path) return want;
      return findAfter(name).page?.path === want ? null : want;
    };

    const fm = FRONTMATTER.exec(text)?.[0] ?? "";
    const code = codeRanges(text.slice(fm.length)).map(([a, b]): [number, number] => [a + fm.length, b + fm.length]);
    const inCode = (at: number) => code.some(([a, b]) => at >= a && at < b);
    const out: Replacement[] = [];
    const each = (re: RegExp, within: string, offset: number, fn: (m: RegExpMatchArray, at: number) => void) => {
      for (const m of within.matchAll(re)) {
        const at = offset + (m.index ?? 0);
        if (!inCode(at)) fn(m, at);
      }
    };

    // Markdown links, pictures and reference definitions, in the body and in frontmatter values (infobox rows).
    each(MD_LINK, text, 0, (m, at) => {
      const raw = m[3];
      const angled = raw.startsWith("<");
      const fixed = fixTarget(angled ? raw.slice(1, -1) : raw, m[1] === "!");
      if (fixed === null) return;
      const start = at + m[0].length - raw.length;
      out.push({ start, end: start + raw.length, text: angled ? `<${fixed}>` : fixed });
    });
    each(DEFINITION, text, 0, (m, at) => {
      const raw = m[1];
      const angled = raw.startsWith("<");
      const fixed = fixTarget(angled ? raw.slice(1, -1) : raw, false);
      if (fixed === null) return;
      const start = at + m[0].length - raw.length;
      out.push({ start, end: start + raw.length, text: angled ? `<${fixed}>` : fixed });
    });
    // Wikilinks; in a table the bar before the label is escaped (`[[page\|Label]]`).
    each(WIKILINK, text, 0, (m, at) => {
      const escaped = m[1].endsWith("\\");
      const name = (escaped ? m[1].slice(0, -1) : m[1]).trim();
      const fixed = fixName(name);
      if (fixed === null) return;
      out.push({ start: at + 2, end: at + 2 + m[1].length, text: escaped ? `${fixed}\\` : fixed });
    });
    each(PAGE_CHIP, text, 0, (m, at) => {
      const fixed = fixName(m[1].trim());
      if (fixed !== null) out.push({ start: at + 6, end: at + 6 + m[1].length, text: fixed });
    });
    // Frontmatter: related pages by name, pictures by path.
    each(FM_PAGE, fm, 0, (m, at) => {
      const fixed = fixName(m[3].trim());
      if (fixed === null) return;
      const start = at + m[1].length + m[2].length;
      out.push({ start, end: start + m[3].length, text: fixed });
    });
    each(FM_PICTURE, fm, 0, (m, at) => {
      const fixed = fixTarget(m[3].trim(), true);
      if (fixed === null) return;
      const start = at + m[1].length + m[2].length;
      out.push({ start, end: start + m[3].length, text: fixed });
    });

    if (!out.length) continue;
    let next = text;
    for (const r of out.sort((a, b) => b.start - a.start)) next = next.slice(0, r.start) + r.text + next.slice(r.end);
    edits.push({ file: p.file, text: crlf ? next.replace(/\n/g, "\r\n") : next, links: out.length });
  }
  return { moves, paths, edits };
}

/** Carries out a plan: edits the pages, moves the files, then moves comments and answers to the new paths. */
export function applyRename(wiki: Wiki, plan: RenamePlan): { threads: number; answers: number } {
  for (const e of plan.edits) writeFileSync(join(wiki.root, e.file), e.text);
  for (const m of plan.moves) {
    mkdirSync(dirname(join(wiki.root, m.to)), { recursive: true });
    renameSync(join(wiki.root, m.from), join(wiki.root, m.to));
  }
  const db = dbFor(wiki.root);
  let threads = 0;
  let answers = 0;
  db.exec("begin");
  try {
    // A new `updated_at`, so the move reaches the wiki's other PCs when they sync.
    const at = new Date().toISOString();
    for (const [from, to] of plan.paths) {
      threads += Number(
        db.prepare("update threads set page = ?, updated_at = ? where page = ?").run(to, at, from).changes,
      );
      answers += Number(
        db.prepare("update answers set page = ?, updated_at = ? where page = ?").run(to, at, from).changes,
      );
    }
    db.exec("commit");
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
  return { threads, answers };
}

// A wiki rendered whole: every page once, plus what only all of them together can tell (which pages link where),
// the page index that lists and special pages read, and the search index. Kept in memory and rebuilt when a page
// changes; nothing is written.
import type { Element, Root } from "hast";
import { visit } from "unist-util-visit";
import type { PageData, PageEntry, PageLink, TaskEntry, WantedPage } from "../shared/api.ts";
import { textOf } from "./markdown/elements.ts";
import { type PageFile, renderPage } from "./pages.ts";
import type { Wiki } from "./registry.ts";
import { indexPage, type SearchDoc } from "./search.ts";

export interface Corpus {
  pages: Map<string, PageData>;
  index: PageEntry[];
  /** Every checkbox in the wiki, page by page in reading order. */
  tasks: TaskEntry[];
  /** Pages red links point to, most wanted first. */
  wanted: WantedPage[];
  search: SearchDoc[];
}

/** About two lines of a page's text, cut at a space. */
const EXCERPT = 220;

const linkOf = (p: PageData): PageLink => ({
  path: p.path,
  title: p.title,
  icon: p.icon,
  summary: p.summary || undefined,
  status: p.status,
  isPage: true,
});

/** The pages `tree` links to (app routes `/w/<wiki>/<path>`), with the text of each link. */
function linksIn(tree: Root, wikiId: string): Map<string, string> {
  const prefix = `/w/${wikiId}`;
  const out = new Map<string, string>();
  visit(tree, "element", (el: Element) => {
    const href = el.tagName === "a" ? el.properties.href : undefined;
    if (
      typeof href !== "string" ||
      !(href === prefix || href.startsWith(`${prefix}/`) || href.startsWith(`${prefix}#`))
    ) {
      return;
    }
    const path = decodeURIComponent(href.slice(prefix.length).split("#")[0].replace(/^\//, ""));
    if (!out.has(path)) out.set(path, textOf(el as never));
  });
  return out;
}

const isCheckbox = (n: unknown) => {
  const el = n as Element;
  return el?.type === "element" && el.tagName === "input" && el.properties.type === "checkbox";
};

/** A list item's own text, without the lists nested in it. */
function ownText(li: Element): string {
  const parts: string[] = [];
  const walk = (node: Element | Root) => {
    for (const c of node.children) {
      if (c.type === "text") parts.push(c.value);
      else if (c.type === "element" && c.tagName !== "ul" && c.tagName !== "ol") walk(c);
    }
  };
  walk(li);
  return parts.join("").replace(/\s+/g, " ").trim();
}

/** The task list items of a page (GFM `- [ ]`), each under the `##`/`###` heading it follows. */
function tasksIn(page: PageData): TaskEntry[] {
  const out: TaskEntry[] = [];
  let section: TaskEntry["section"];
  const ref = { path: page.path, title: page.title, icon: page.icon, isPage: true };
  for (const node of page.hast.children) {
    const el = node as Element;
    if (el.type === "element" && (el.tagName === "h2" || el.tagName === "h3")) {
      section = el.properties.id ? { id: String(el.properties.id), heading: textOf(el as never).trim() } : undefined;
      continue;
    }
    visit(node as unknown as Root, "element", (li: Element) => {
      if (li.tagName !== "li") return;
      // The box is the item's first child, or the first thing in its first paragraph (loose lists).
      const first = li.children.find((c) => c.type === "element") as Element | undefined;
      const box = isCheckbox(first) ? first : first?.tagName === "p" ? first.children.find(isCheckbox) : undefined;
      if (!box) return;
      out.push({ page: ref, section, text: ownText(li), done: (box as Element).properties.checked === true });
    });
  }
  return out;
}

function excerpt(doc: SearchDoc): string {
  const text = doc.sections.find((s) => s.text)?.text ?? "";
  if (text.length <= EXCERPT) return text;
  const cut = text.lastIndexOf(" ", EXCERPT);
  return `${text.slice(0, cut > 0 ? cut : EXCERPT)}…`;
}

export function buildCorpus(wiki: Wiki, files: PageFile[]): Corpus {
  const pages = new Map<string, PageData>();
  for (const f of files) {
    const page = renderPage(wiki, files, f.path);
    if (page) pages.set(f.path, page);
  }

  // Backlinks: who links to whom, from the article and its infobox.
  const from = new Map<string, Set<string>>();
  const wanted = new Map<string, { title: string; from: Set<string> }>();
  for (const [path, page] of pages) {
    const trees = [page.hast, ...(page.infobox?.rows.map((r) => r.value) ?? [])];
    const named = new Map<string, string>();
    for (const tree of trees) for (const [to, text] of linksIn(tree, wiki.id)) named.set(to, text);
    for (const group of page.related) for (const p of group.pages) if (!named.has(p.path)) named.set(p.path, p.title);
    for (const [to, text] of named) {
      if (to === path) continue;
      if (!pages.has(to)) {
        if (!wanted.has(to)) wanted.set(to, { title: text, from: new Set() });
        wanted.get(to)?.from.add(path);
        continue;
      }
      if (!from.has(to)) from.set(to, new Set());
      from.get(to)?.add(path);
    }
  }
  for (const [to, sources] of from) {
    const page = pages.get(to);
    if (!page) continue;
    page.backlinks = [...sources]
      .map((s) => pages.get(s))
      .filter((p): p is PageData => !!p)
      .map(linkOf)
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  const hidden = new Map(files.map((f) => [f.path, f.hidden]));
  const search = [...pages.values()].map(indexPage);
  const index = [...pages.values()].map(
    (p, i): PageEntry => ({
      ...linkOf(p),
      type: p.type,
      tags: p.tags,
      updatedAt: p.updatedAt,
      hidden: hidden.get(p.path) ?? false,
      excerpt: excerpt(search[i]),
      image: p.infobox?.image ?? p.banner,
    }),
  );
  const linkTo = (p: string) => pages.get(p);
  const wantedList = [...wanted].map(
    ([path, w]): WantedPage => ({
      path,
      title: w.title,
      from: [...w.from]
        .map(linkTo)
        .filter((p): p is PageData => !!p)
        .map(linkOf),
    }),
  );
  wantedList.sort((a, b) => b.from.length - a.from.length || a.title.localeCompare(b.title));
  const tasks = [...pages.values()].flatMap(tasksIn);
  return { pages, index, tasks, wanted: wantedList, search };
}

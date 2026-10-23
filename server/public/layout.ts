// The public wiki's layouts (ADR-0012): its front page, from the wiki's `layouts/front.json` or the built-in one, and
// a page arranged by its page layout (ADR-0006) when that layout says `public: true`. Blocks are drawn as plain HTML
// from what the edition already made public: the stripped pages, the public page links, the public pictures. A block
// with nothing to show is left out, and the areas around it close up, so a reader never sees an empty box.
import type { Element, Root, RootContent } from "hast";
import {
  type Block,
  closeUp,
  type FrontBlock,
  type FrontLayout,
  frontLayoutSchema,
  gridOf,
  type Layout,
  PUBLIC_PAGE_BLOCKS,
} from "../../shared/layout.ts";
import {
  h,
  html,
  iconOf,
  type PublicLink,
  pageCards,
  relatedChips,
  type StaticContext,
  staticHtml,
  tocNav,
  uiIcon,
} from "./html.ts";
import type { SiteInfo } from "./site.ts";

/** The front page as ADR-0011 drew it: the name, the banner, the text, then "Where to start". */
export const DEFAULT_FRONT: FrontLayout = frontLayoutSchema.parse({
  areas: [["title"], ["banner"], ["intro"], ["start"]],
  blocks: {
    title: { type: "title" },
    banner: { type: "banner" },
    intro: { type: "intro" },
    start: { type: "start" },
  },
});

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const root = (children: RootContent[]): Root => ({ type: "root", children });
const raw = (value: string) => ({ type: "raw", value }) as never;
const textOf = (node: RootContent): string =>
  node.type === "text" ? node.value : "children" in node ? node.children.map(textOf).join("") : "";

/** A page's stripped Markdown cut at its `##` headings (as the app's `sections.ts`): the text before, then each one. */
function split(tree: Root) {
  const intro: RootContent[] = [];
  const sections: { heading: string; nodes: RootContent[] }[] = [];
  for (const node of tree.children) {
    if (node.type === "element" && node.tagName === "h2")
      sections.push({ heading: textOf(node).trim(), nodes: [node] });
    else if (sections.length) sections[sections.length - 1].nodes.push(node);
    else intro.push(node);
  }
  return { intro, sections };
}

/** Whether some nodes hold anything a reader would see. */
const shows = (nodes: RootContent[]) =>
  nodes.some((n) => n.type === "element" || (n.type === "text" && n.value.trim() !== ""));

/** The text the layout's `body` (or `intro`) shows, and the one a `section` block shows, as HTML. */
function textParts(tree: Root, ctx: StaticContext, placed: string[]) {
  const { intro, sections } = split(tree);
  const rest = sections.filter((s) => !placed.some((p) => same(p, s.heading)));
  const body = [...intro, ...rest.flatMap((s) => s.nodes)];
  return {
    body: shows(body) ? staticHtml(root(body), ctx, { sections: true }) : null,
    section: (heading: string, ownTitle: boolean) => {
      const found = sections.find((s) => same(s.heading, heading));
      if (!found) return null;
      // With its own title, the block doesn't repeat the heading.
      const nodes = ownTitle ? found.nodes.slice(1) : found.nodes;
      return shows(nodes) ? staticHtml(root(nodes), ctx, { sections: !ownTitle }) : null;
    },
  };
}

/** Rows of areas closed up around the empty ones, as the grid's CSS variables; null when nothing is left. */
function gridStyle(areas: string[][], blocks: Record<string, { type: string }>, keep: (area: string) => boolean) {
  const rows = closeUp(areas, keep);
  if (!rows) return null;
  const grid = gridOf({ areas: rows, blocks });
  // Area names are checked (`shared/layout.ts`), so they're safe in CSS.
  const wide = new Set(rows.flatMap((row) => (row.every((a) => a === row[0]) ? [row[0]] : [])));
  const order = [...new Set(areas.flat())].filter(keep);
  return { style: `--areas: ${grid.areas}; --columns: ${grid.columns}`, wide, order };
}

/** A list as the app's home blocks draw one (home.css styles it inside page text). */
const blockList = (items: Element[]) =>
  h("div", { className: ["sh-prose"] }, h("ul", { className: ["sh-block-list"] }, items));

/** Pages as cards (their pictures on top) or a list, `columns` across on wide screens. */
function pageList(pages: PublicLink[], style: "cards" | "list", columns?: number): Element {
  if (style === "list")
    return blockList(
      pages.map((p) =>
        h(
          "li",
          {},
          h("a", { className: ["sh-block-link"], href: p.href }, iconOf(p.icon, "sh-icon-gap"), p.title),
          p.summary ? h("span", { className: ["sh-block-meta"] }, p.summary) : null,
        ),
      ),
    );
  const grid = pageCards(pages, `sh-sections-grid pw-start-grid${columns ? " pw-columns" : ""}`);
  if (columns) grid.properties.style = `--pw-columns: ${columns}`;
  return grid;
}

export interface FrontParts {
  site: SiteInfo;
  /** `public.banner`, as a URL from the root. */
  banner?: string;
  /** The front page's text, stripped, with its context; absent without `public.front`. */
  text?: { tree: Root; ctx: StaticContext };
  /** A card per top section. */
  start: PublicLink[];
  /** A public page by the path or name a block gives, or null when it isn't one. */
  page: (ref: string) => PublicLink | null;
  /** Public pages, last changed first, with when. */
  recent: (PublicLink & { updatedAt: string })[];
  /** Each top section and how many public pages it has. */
  stats: { title: string; count: number }[];
  problems: string[];
}

/** The front page: the wiki's `layouts/front.json`, or the built-in one. */
export function frontArticle(layout: FrontLayout | undefined, parts: FrontParts): string {
  const front = layout ?? DEFAULT_FRONT;
  const { site } = parts;
  const where = "layouts/front.json";
  const placed = Object.values(front.blocks).flatMap((b) => (b.type === "section" ? [b.heading] : []));
  const text = parts.text ? textParts(parts.text.tree, parts.text.ctx, placed) : null;
  if (layout && !Object.values(layout.blocks).some((b) => ["title", "intro", "start"].includes(b.type)))
    parts.problems.push(
      `${where}: it shows neither the wiki's name (title), its text (intro) nor its sections (start)`,
    );

  const titleOf = (block: FrontBlock) =>
    block.title ??
    (block.type === "start" ? site.words.start : block.type === "recent" ? site.words.recent : undefined);

  const draw = (block: FrontBlock): Element | string | null => {
    switch (block.type) {
      case "title":
        return h(
          "header",
          { className: ["sh-page-head", "pw-front-head"] },
          h(
            "div",
            { className: ["sh-page-heading"] },
            h(
              "div",
              {},
              h("h1", { className: ["sh-page-title"] }, site.title),
              site.tagline ? h("p", { className: ["sh-page-summary"] }, site.tagline) : null,
            ),
          ),
        );
      case "banner":
        return parts.banner ? h("img", { className: ["pw-front-banner"], src: parts.banner, alt: "" }) : null;
      case "intro":
        return text?.body ? h("div", { className: ["sh-prose", "pw-front-intro"] }, raw(text.body)) : null;
      case "section": {
        const body = text?.section(block.heading, !!block.title) ?? null;
        if (!body && parts.text) parts.problems.push(`${where}: the front page has no "${block.heading}" section`);
        return body ? h("div", { className: ["sh-prose"] }, raw(body)) : null;
      }
      case "start":
        return parts.start.length ? pageList(parts.start, block.style, block.columns) : null;
      case "pages": {
        const pages = block.pages.flatMap((ref) => {
          const link = parts.page(ref);
          if (!link) parts.problems.push(`${where}: "${ref}" isn't a public page`);
          return link ? [link] : [];
        });
        return pages.length ? pageList(pages, block.style, block.columns) : null;
      }
      case "recent": {
        const pages = parts.recent.slice(0, block.count);
        return pages.length
          ? blockList(
              pages.map((p) =>
                h(
                  "li",
                  {},
                  h("a", { className: ["sh-block-link"], href: p.href }, iconOf(p.icon, "sh-icon-gap"), p.title),
                  h("time", { className: ["sh-block-when"], dateTime: p.updatedAt }, p.updatedAt.slice(0, 10)),
                ),
              ),
            )
          : null;
      }
      case "search":
        return h(
          "button",
          { type: "button", className: ["pw-search-big"], dataPwSearch: "" },
          uiIcon("search", 18),
          h("span", {}, site.words.search),
        );
      case "stats":
        return parts.stats.length
          ? h(
              "div",
              { className: ["sh-stats"] },
              parts.stats.map((s) =>
                h(
                  "div",
                  { className: ["sh-stat"] },
                  h("span", { className: ["sh-stat-label"] }, s.title),
                  h("span", { className: ["sh-stat-value"] }, String(s.count)),
                ),
              ),
            )
          : null;
    }
  };

  const drawn = new Map(
    Object.entries(front.blocks).flatMap(([area, block]) => {
      const out = draw(block);
      return out ? [[area, out] as const] : [];
    }),
  );
  const grid = gridStyle(front.areas, front.blocks, (a) => drawn.has(a));
  return html(
    h(
      "article",
      { className: ["pw-article", "pw-front"] },
      grid
        ? h(
            "div",
            { className: ["pw-front-grid"], style: grid.style },
            grid.order.map((area) => {
              const block = front.blocks[area];
              const title = titleOf(block);
              return h(
                "div",
                {
                  className: ["pw-area"],
                  dataBlock: block.type,
                  dataWide: grid.wide.has(area) ? "" : undefined,
                  style: `--area: ${area}`,
                },
                title ? h("h2", { className: ["pw-area-title"] }, title) : null,
                drawn.get(area) as Element,
              );
            }),
          )
        : null,
    ),
  );
}

export interface PageParts {
  tree: Root;
  ctx: StaticContext;
  infobox: Element | null;
  /** The page's public pictures, as URLs from the page. */
  pictures: string[];
}

/** The pictures in a stripped page, as the edition made them (only public ones are left). */
export function picturesIn(tree: Root): string[] {
  const out: string[] = [];
  const walk = (n: Root | Element) => {
    for (const c of n.children)
      if (c.type === "element") {
        const cls = c.properties.className;
        const icon = Array.isArray(cls) && cls.includes("sh-icon-img");
        if (c.tagName === "img" && typeof c.properties.src === "string" && !icon) out.push(c.properties.src);
        walk(c);
      }
  };
  walk(tree);
  return [...new Set(out)];
}

/**
 * A page arranged by its layout, with only the blocks the public wiki draws, or null when the layout isn't for the
 * public wiki or leaves nothing to show. Also says which of the page's lists it placed, so the foot doesn't repeat them.
 */
export function pageLayout(
  layout: (Layout & { name: string }) | undefined,
  parts: PageParts,
): { html: string; placed: { children: boolean; related: boolean } } | null {
  if (!layout?.public) return null;
  const { ctx } = parts;
  const placed = Object.values(layout.blocks).flatMap((b) => (b.type === "section" ? [b.heading] : []));
  const text = textParts(parts.tree, ctx, placed);

  const draw = (block: Block): Element | string | null => {
    if (!PUBLIC_PAGE_BLOCKS.has(block.type)) return null;
    switch (block.type) {
      case "body":
        return text.body;
      case "section":
        return text.section(block.heading, !!block.title);
      case "infobox":
        return parts.infobox;
      case "gallery":
        return parts.pictures.length
          ? h(
              "div",
              { className: ["sh-gallery"] },
              parts.pictures.map((src) =>
                h("a", { className: ["sh-shot", "pw-zoom"], href: src }, h("img", { src, alt: "", loading: "lazy" })),
              ),
            )
          : null;
      case "related":
        return ctx.page.related.length ? relatedChips(ctx.page.related) : null;
      case "children":
        return ctx.page.children.length ? pageList(ctx.page.children, block.style) : null;
      case "toc":
        return ctx.page.toc.length ? tocNav(ctx.page.toc, ctx.words) : null;
      default:
        return null;
    }
  };

  const drawn = new Map(
    Object.entries(layout.blocks).flatMap(([area, block]) => {
      const out = draw(block);
      return out ? [[area, out] as const] : [];
    }),
  );
  const grid = gridStyle(layout.areas, layout.blocks, (a) => drawn.has(a));
  if (!grid) return null;
  const types = new Set([...drawn.keys()].map((a) => layout.blocks[a].type));
  return {
    html: html(
      h(
        "div",
        { className: ["sh-layout"], dataLayout: layout.name, style: grid.style },
        grid.order.map((area) => {
          const block = layout.blocks[area];
          const out = drawn.get(area);
          return h(
            "section",
            { className: ["sh-layout-area"], dataBlock: block.type, style: `--area: ${area}` },
            block.title ? h("h2", { className: ["sh-layout-title"] }, block.title) : null,
            h(
              "div",
              { className: ["sh-layout-body", "sh-prose"] },
              typeof out === "string" ? raw(out) : (out as Element),
            ),
          );
        }),
      ),
    ),
    placed: { children: types.has("children"), related: types.has("related") },
  };
}

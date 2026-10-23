// The public wiki (ADR-0011) as a set of files: one HTML page per public page, a front page, the stylesheet and
// scripts, the fonts the theme uses, and the public pictures. The export zips them, and the public link serves them
// as they are. Nothing private is in any file: pages that aren't public, private blocks and fields, private pictures,
// comments, answers, designs and the app itself never go in.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import type { Element, Root } from "hast";
import type { NavNode, PageData, PublicReport } from "../../shared/api.ts";
import { type Frame, frameSchema } from "../../shared/schema.ts";
import { type FontKey, type Mode, themeColors, themeVars } from "../../shared/theme.ts";
import type { Corpus } from "../corpus.ts";
import { pictureAt, publicPicture } from "../files.ts";
import { ICON_NAME, ICONS_DIR, iconSet } from "../icons.ts";
import { FRONT_LAYOUT, loadLayouts } from "../layouts.ts";
import { resolveFile } from "../markdown/links.ts";
import { buildNav, type PageFile, pageFinder, readingOrder } from "../pages.ts";
import { APP_ROOT } from "../paths.ts";
import type { Wiki } from "../registry.ts";
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
} from "./html.ts";
import { frontArticle, pageLayout, picturesIn } from "./layout.ts";
import { fieldKey, isPrivateFile, isPublicPage, publicSettings, unusedPatterns } from "./rules.ts";
import { article, crumbs, encodePath, pager, rootOf, type SiteInfo, sectionBlock, shell } from "./site.ts";
import { noneRemoved, type StripContext, stripFragment, stripPage } from "./strip.ts";
import { wordsOf } from "./words.ts";

/** A file of the public wiki: text or bytes made now, a picture made when it's asked for, or a file copied. */
export type EditionFile =
  | { type: string; body: string | Uint8Array }
  | { type: string; picture: { rel: string; width: number } }
  | { type: string; copy: string };

export interface Edition {
  files: Map<string, EditionFile>;
  report: PublicReport;
}

/** Pictures are made at most this wide: plenty for a page, small enough for a zip. */
export const PICTURE_WIDTH = 1600;
const ASSETS = join(APP_ROOT, "server", "public", "assets");
const FONT_PACKAGES: Partial<Record<FontKey, string>> = {
  sans: "inter",
  grotesk: "space-grotesk",
  serif: "fraunces",
  pixel: "pixelify-sans",
  mono: "jetbrains-mono",
};

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
};
export const typeOf = (name: string) => TYPES[posix.extname(name).toLowerCase()] ?? "application/octet-stream";

const text = (name: string, body: string): [string, EditionFile] => [name, { type: typeOf(name), body }];

/** The fonts a theme uses, from the app's own packages: their @font-face rules and files. */
function fonts(keys: FontKey[]): { css: string; files: [string, string][] } {
  const files: [string, string][] = [];
  const css: string[] = [];
  for (const key of new Set(keys)) {
    const pkg = FONT_PACKAGES[key];
    if (!pkg) continue;
    const dir = join(APP_ROOT, "node_modules", "@fontsource-variable", pkg);
    const index = join(dir, "index.css");
    if (!existsSync(index)) continue;
    css.push(
      readFileSync(index, "utf8").replace(/url\(\.\/files\/([^)]+)\)/g, (_, file: string) => {
        files.push([`_site/fonts/${file}`, join(dir, "files", file)]);
        return `url(fonts/${file})`;
      }),
    );
  }
  return { css: css.join("\n"), files };
}

/** KaTeX's stylesheet and its WOFF2 fonts, for pages with math. */
function katexFiles(): [string, EditionFile][] {
  const dist = join(APP_ROOT, "node_modules", "katex", "dist");
  const out: [string, EditionFile][] = [
    text("_site/katex/katex.min.css", readFileSync(join(dist, "katex.min.css"), "utf8")),
  ];
  for (const f of readdirSync(join(dist, "fonts")).filter((f) => f.endsWith(".woff2")))
    out.push([`_site/katex/fonts/${f}`, { type: "font/woff2", copy: join(dist, "fonts", f) }]);
  return out;
}

const cssVars = (vars: Record<string, string>) =>
  Object.entries(vars)
    .map(([k, v]) => `${k}:${v};`)
    .join("");

/**
 * The app's own stylesheets the public pages use: its tokens, base and primitives, and how it draws a page and its
 * elements. The public wiki shares their classes (html.ts, site.ts), so it looks like the wiki in the app.
 */
export const APP_STYLES = [
  "src/styles/tokens.css",
  "src/styles/base.css",
  "src/ui/ui.css",
  "src/wiki/header.css",
  "src/wiki/sidebar/sidebar.css",
  "src/wiki/page.css",
  "src/wiki/markdown/prose.css",
  "src/wiki/markdown/planning.css",
  "src/wiki/markdown/universal.css",
  "src/wiki/markdown/data.css",
  "src/wiki/markdown/code.css",
  "src/wiki/markdown/diagram.css",
  "src/wiki/home/home.css",
  "src/wiki/layout/layout.css",
];

/**
 * The site's stylesheet: its fonts, the app's styles, the wiki's theme in both day and night, then the frame, and a
 * picture backdrop (ADR-0012) as a URL from `_site/`.
 */
function stylesheet(wiki: Wiki, fontCss: string, backdrop: string | null): string {
  const app = APP_STYLES.map((f) => `/* ${f} */\n${readFileSync(join(APP_ROOT, f), "utf8")}`);
  const modes = (["dark", "light"] as Mode[]).map(
    (mode) => `:root[data-mode="${mode}"]{${cssVars(themeVars(wiki.theme, mode))}}`,
  );
  // The file's name is percent-encoded (`encodePath`), so it can't close the string.
  const picture = backdrop ? [`body.pw{--pw-backdrop-image:url("../${encodePath(backdrop)}")}`] : [];
  return [fontCss, ...app, ...modes, readFileSync(join(ASSETS, "site.css"), "utf8"), ...picture].join("\n");
}

/** The frame's presets that differ from the defaults, for the owner: "width: wide". */
function frameSummary(frame: Frame): string[] {
  const plain = frameSchema.parse({});
  const out: string[] = [];
  for (const key of ["width", "sidebar", "backdrop"] as const)
    if (frame[key] !== plain[key]) out.push(`${key}: ${frame[key]}`);
  if (frame.cards.picture !== plain.cards.picture) out.push(`cards: ${frame.cards.picture}`);
  if (frame.cards.shape) out.push(`card pictures: ${frame.cards.shape}`);
  if (frame.footer) out.push("footer text");
  return out;
}

/** The wiki's icon as the browser tab's, in its accent. */
function favicon(wiki: Wiki): string {
  const c = themeColors(wiki.theme);
  const name = wiki.manifest.icon && iconSet().has(wiki.manifest.icon) ? wiki.manifest.icon : "books";
  const inner = existsSync(join(ICONS_DIR, `${name}.svg`))
    ? readFileSync(join(ICONS_DIR, `${name}.svg`), "utf8")
        .replace(/^[\s\S]*?<svg[^>]*>/, "")
        .replace(/<\/svg>\s*$/, "")
        .replace(/<title>[\s\S]*?<\/title>/, "")
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><style>*{fill:${c.accent}}.t{fill:${c.muted}}.d{fill:${c.bg}}.is{fill:none;stroke:${c.accent}}.ts{fill:none;stroke:${c.muted}}.ds{fill:none;stroke:${c.bg}}</style>${inner}</svg>`;
}

/** Words of a page for search: its text, with blocks kept apart. */
function plainText(tree: Root | Element): string {
  const parts: string[] = [];
  const walk = (n: Root | Element) => {
    for (const c of n.children) {
      if (c.type === "text") parts.push(c.value);
      else if (c.type === "element") {
        walk(c);
        if (/^(p|li|h\d|td|th|dd|dt|div|section|figure|blockquote|pre)$/.test(c.tagName)) parts.push(" ");
      }
    }
  };
  walk(tree);
  return parts.join("").replace(/\s+/g, " ").trim();
}

const idsIn = (tree: Root) => {
  const ids = new Set<string>();
  const walk = (n: Root | Element) => {
    for (const c of n.children)
      if (c.type === "element") {
        if (typeof c.properties.id === "string") ids.add(c.properties.id);
        walk(c);
      }
  };
  walk(tree);
  return ids;
};

const hasTag = (tree: Root, tag: string, test: (el: Element) => boolean = () => true): boolean => {
  const walk = (n: Root | Element): boolean =>
    n.children.some((c) => c.type === "element" && ((c.tagName === tag && test(c)) || walk(c)));
  return walk(tree);
};

const day = (iso?: string) => iso?.slice(0, 10);

/** Builds the public wiki from the wiki's pages as the app rendered them. */
export function buildEdition(wiki: Wiki, files: PageFile[], corpus: Corpus): Edition {
  const settings = publicSettings(wiki);
  const words = wordsOf(settings);
  const problems: string[] = [];
  const removed = noneRemoved();
  const privateFields = new Set(settings.privateFields.map(fieldKey));

  // The front page's text comes from `public.front`, which isn't listed again.
  const find = pageFinder(files, "");
  const front = settings.front ? find(settings.front).page : null;
  if (settings.front && !front) problems.push(`public.front: there's no page "${settings.front}"`);
  const publicFiles = files.filter((f) => isPublicPage(settings, f) && f.path !== front?.path);
  const publicPaths = new Set(publicFiles.map((f) => f.path));
  for (const p of unusedPatterns(
    settings.pages,
    files.map((f) => f.path),
  ))
    problems.push(`public.pages: "${p}" names no page`);

  const fileOf = (path: string) => (path === "" || path === front?.path ? "index.html" : `${path}.html`);
  // A site that's one folder (`world/**`, its page the front page) starts at that folder's sections.
  const fullNav = buildNav(publicFiles);
  const nav = fullNav.length === 1 && !fullNav[0].isPage && fullNav[0].children.length ? fullNav[0].children : fullNav;
  const order = readingOrder(nav).slice(1);

  // Pictures: only public ones, each once, made when they're asked for.
  const media = new Map<string, string>();
  const output = new Map<string, EditionFile>();
  const prefix = `/api/wikis/${wiki.id}/files/`;
  /** A wiki picture's URL → its file in the site (from the root), or null when it's private or missing. */
  const pictureFile = (url: string): string | null => {
    if (!url.startsWith(prefix)) return null;
    let rel: string;
    try {
      rel = decodeURIComponent(url.slice(prefix.length).split("?")[0]);
    } catch {
      return null;
    }
    if (isPrivateFile(settings, rel)) return null;
    let out = media.get(rel);
    if (out === undefined) {
      const found = pictureAt(wiki.root, rel);
      if (!found) return null;
      out = found.type === "image/svg+xml" ? `_media/${rel}` : `_media/${rel}.webp`;
      media.set(rel, out);
      output.set(out, { type: typeOf(out), picture: { rel, width: PICTURE_WIDTH } });
    }
    return out;
  };
  /** A picture named in wiki.json, from the wiki root. */
  const settingPicture = (field: string, src: string | undefined) => {
    if (!src) return undefined;
    const rel = resolveFile("", src);
    const url = rel === null ? null : pictureFile(`${prefix}${encodePath(rel)}`);
    if (url === null) problems.push(`public.${field}: "${src}" is missing or private`);
    return url ?? undefined;
  };
  /** An icon as the site shows it: a drawn icon's name, an emoji, or a picture's file from the root. */
  const iconFor = (icon?: string) => (icon?.startsWith("/") ? (pictureFile(icon) ?? undefined) : icon);

  const pageOf = (path: string) => corpus.pages.get(path);
  /** A page's picture for cards: its infobox picture, else its banner. */
  const imageOf = (p: PageData | undefined) => {
    const src = p?.infobox?.image ?? p?.banner;
    return src?.startsWith("/") ? (pictureFile(src) ?? undefined) : undefined;
  };
  const linkFrom =
    (root: string) =>
    (path: string): PublicLink | null => {
      if (!publicPaths.has(path)) return null;
      const p = pageOf(path);
      if (!p) return null;
      const image = imageOf(p);
      const icon = iconFor(p.icon);
      return {
        path,
        title: p.title,
        summary: p.summary || undefined,
        isPage: true,
        href: root + encodePath(fileOf(path)),
        ...(icon ? { icon: icon.includes("/") ? root + encodePath(icon) : icon } : {}),
        ...(image ? { image: root + encodePath(image) } : {}),
      };
    };
  const navOf = (nodes: NavNode[]): NavNode[] =>
    nodes.map((n) => {
      const icon = iconFor(n.icon);
      return { ...n, icon: icon?.includes("/") ? encodePath(icon) : icon, children: navOf(n.children) };
    });

  const needs = { math: false, diagrams: false, code: false };
  const strip = (root: string, extraPrivate: string[] = []): StripContext => ({
    wikiId: wiki.id,
    pageHref: (path, hash) => {
      const anchor = hash ? `#${hash}` : "";
      if (path === "" || path === front?.path) return `${root}index.html${anchor}`;
      return publicPaths.has(path) ? `${root}${encodePath(fileOf(path))}${anchor}` : null;
    },
    fileHref: (url) => {
      const file = pictureFile(url);
      return file === null ? null : root + encodePath(file);
    },
    code: settings.code,
    privateFields: new Set([...privateFields, ...extraPrivate.map(fieldKey)]),
    removed,
  });

  const search: { u: string; t: string; s?: string; x: string }[] = [];
  let spoilers = false;

  const site: SiteInfo = {
    title: settings.title ?? wiki.manifest.title,
    tagline: settings.tagline ?? wiki.manifest.tagline,
    lang: settings.lang,
    mode: wiki.theme.mode,
    words,
    logo: null,
    nav: navOf(nav),
    fileOf,
    spoilers: false,
    diagrams: false,
    version: "",
    math: false,
    frame: settings.frame,
  };
  const layouts = loadLayouts(wiki);
  for (const p of layouts.problems) if (p.startsWith(`layouts/${FRONT_LAYOUT}.json`)) problems.push(p);
  const backdrop = settings.frame.backdrop.startsWith("/")
    ? (settingPicture("frame.backdrop", settings.frame.backdrop) ?? null)
    : null;
  // A picture backdrop that can't go falls back to the slate.
  if (settings.frame.backdrop.startsWith("/") && !backdrop) site.frame = { ...settings.frame, backdrop: "slate" };
  const usedLayouts = new Set<string>();
  const logo = settingPicture("logo", settings.logo);
  site.logo = logo
    ? { src: encodePath(logo) }
    : wiki.manifest.icon && ICON_NAME.test(wiki.manifest.icon) && iconSet().has(wiki.manifest.icon)
      ? { icon: wiki.manifest.icon }
      : null;

  /** A page's body, stripped and turned into HTML (its `##` sections as the app's), with what it needs noted. */
  const render = (p: PageData, root: string, local: StaticContext["page"], extraPrivate: string[] = []) => {
    const tree = stripPage(p.hast, strip(root, extraPrivate));
    if (hasTag(tree, "sh-spoiler")) spoilers = true;
    const ctx: StaticContext = {
      root: wiki.root,
      words,
      privateFields: new Set([...privateFields, ...extraPrivate.map(fieldKey)]),
      page: local,
      needs,
    };
    return { tree, ctx, html: staticHtml(tree, ctx, { sections: true }) };
  };

  const pages: { path: string; html: string }[] = [];
  for (const path of [...publicPaths].sort()) {
    const p = pageOf(path);
    const f = publicFiles.find((x) => x.path === path);
    if (!p || !f) continue;
    const root = rootOf(path);
    const link = linkFrom(root);
    const children = p.children.map((c) => link(c.path)).filter((c): c is PublicLink => !!c);
    const related = p.related
      .map((g) => ({ kind: g.kind, pages: g.pages.map((x) => link(x.path)).filter((x): x is PublicLink => !!x) }))
      .filter((g) => g.pages.length);
    const own = f.private ?? [];
    const ctx = strip(root, own);
    // The toc first, so `::toc` lists only headings that are still there.
    const stripped = stripPage(p.hast, { ...ctx, removed: noneRemoved() });
    const ids = idsIn(stripped);
    const toc = p.toc.filter((e) => ids.has(e.id));
    const body = render(p, root, { toc, children, related }, own);

    // The infobox (PageInfobox): its picture and the rows that aren't private, their values cleaned like the page.
    let infobox: Element | null = null;
    const image = p.infobox?.image?.startsWith("/") ? ctx.fileHref(p.infobox.image) : null;
    if (p.infobox) {
      if (p.infobox.image && image === null) removed.pictures++;
      const rows = p.infobox.rows.filter((r) => {
        const hidden = ctx.privateFields.has(fieldKey(r.label));
        if (hidden) removed.fields++;
        return !hidden;
      });
      if (image || rows.length) {
        const icon = iconFor(p.icon);
        infobox = h(
          "aside",
          { className: ["sh-page-infobox"], ariaLabel: p.title },
          h(
            "header",
            { className: ["sh-page-infobox-head"] },
            h(
              "span",
              { className: ["sh-page-infobox-title"] },
              iconOf(icon?.includes("/") ? root + encodePath(icon) : icon, "sh-icon-gap"),
              p.title,
            ),
            p.type ? h("span", { className: ["sh-page-infobox-type"] }, p.type) : null,
          ),
          image
            ? h(
                "figure",
                { className: ["sh-page-infobox-figure"] },
                h(
                  "a",
                  { href: image, className: ["pw-zoom"] },
                  h("img", { src: image, alt: p.infobox.caption ?? p.title }),
                ),
                p.infobox.caption ? h("figcaption", {}, p.infobox.caption) : null,
              )
            : null,
          rows.length
            ? h(
                "dl",
                { className: ["sh-page-infobox-rows"] },
                rows.map((r) =>
                  h(
                    "div",
                    {},
                    h("dt", {}, r.label),
                    h("dd", {}, {
                      type: "raw",
                      value: staticHtml(stripFragment(r.value, ctx), body.ctx),
                    } as never),
                  ),
                ),
              )
            : null,
        );
      }
    }

    // Breadcrumbs: home, then each section above that's public (a folder without its own page is only a name).
    const trail = [
      { title: words.home, href: `${root}index.html` },
      ...p.trail
        .filter((t) => t.path && t.path !== front?.path)
        .map((t) => ({ title: t.title, href: publicPaths.has(t.path) ? root + encodePath(fileOf(t.path)) : null })),
    ];
    const at = order.indexOf(path);
    const prev = at > 0 ? link(order[at - 1]) : null;
    const next = at >= 0 && at < order.length - 1 ? link(order[at + 1]) : null;
    const icon = iconFor(p.icon);
    const banner = p.banner?.startsWith("/") ? pictureFile(p.banner) : null;
    if (p.banner && !banner) removed.pictures++;
    // A page layout made for the public wiki too (ADR-0012) arranges the page; any other leaves it plain.
    const laid = pageLayout(p.layout, {
      tree: body.tree,
      ctx: body.ctx,
      infobox,
      pictures: [...new Set([...(image ? [image] : []), ...picturesIn(body.tree)])],
    });
    if (laid && p.layout) usedLayouts.add(p.layout.name);
    const main =
      html(crumbs(trail, p.title) ?? h("span")) +
      article({
        title: p.title,
        icon: iconOf(icon ? (icon.includes("/") ? root + encodePath(icon) : icon) : undefined, "sh-page-icon"),
        summary: p.summary || undefined,
        banner: banner ? root + encodePath(banner) : undefined,
        meta: [
          p.type ? h("span", { className: ["sh-page-type"] }, p.type) : null,
          p.updatedAt ? h("time", { dateTime: p.updatedAt }, `${words.updated} ${day(p.updatedAt)}`) : null,
        ],
        infobox,
        prose:
          (toc.length >= 3 && !hasTag(stripped, "sh-toc") ? html(tocNav(toc, words) ?? h("span")) : "") + body.html,
        layout: laid?.html,
        foot: [
          children.length && !p.placed.children && !laid?.placed.children
            ? sectionBlock(words.inSection, pageCards(children))
            : null,
          related.length && !p.placed.related && !laid?.placed.related
            ? sectionBlock(words.related, relatedChips(related))
            : null,
          pager(words, prev, next),
        ],
      });
    pages.push({ path, html: main });
    search.push({
      u: encodePath(fileOf(path)),
      t: p.title,
      ...(p.summary ? { s: p.summary } : {}),
      x: plainText(body.tree).slice(0, 4000),
    });
  }

  // The front page: the chosen page's text, then a card for each top section.
  const startLink = linkFrom("");
  const firstPage = (n: NavNode): string | null =>
    n.isPage ? n.path : (n.children.map(firstPage).find((x) => x) ?? null);
  const start = nav.flatMap((n): PublicLink[] => {
    const path = firstPage(n);
    const card = path ? startLink(path) : null;
    if (!card) return [];
    // A folder without a page of its own shows its name, and the picture of the first page in it that has one.
    const image = card.image ?? n.children.map((c) => startLink(c.path)?.image).find((x) => x);
    return [{ ...card, title: n.title, ...(image ? { image } : {}) }];
  });
  const frontPage = front ? pageOf(front.path) : undefined;
  const frontBody = frontPage ? render(frontPage, "", { toc: [], children: [], related: [] }) : null;
  if (frontPage)
    search.push({
      u: "index.html",
      t: site.title,
      x: plainText(frontBody?.tree ?? { type: "root", children: [] }).slice(0, 4000),
    });
  const banner = settingPicture("banner", settings.banner);

  // The site's own files first: their hash goes after their URLs in every page.
  const font = fonts([
    wiki.theme.font.body ?? "sans",
    wiki.theme.font.heading ?? wiki.theme.font.body ?? "sans",
    "mono",
  ]);
  const own: [string, string][] = [
    ["_site/style.css", stylesheet(wiki, font.css, backdrop)],
    ...["site.js", "mode.js"].map((name): [string, string] => [
      `_site/${name}`,
      readFileSync(join(ASSETS, name), "utf8"),
    ]),
    ["_site/search.js", `window.PW_SEARCH=${JSON.stringify(search).replace(/</g, "\u003c")};\n`],
  ];
  const hash = createHash("sha256");
  for (const [name, body] of own) {
    output.set(...text(name, body));
    hash.update(body);
  }
  for (const [name, full] of font.files) output.set(name, { type: "font/woff2", copy: full });
  site.version = hash.digest("hex").slice(0, 10);
  site.spoilers = spoilers;
  site.diagrams = needs.diagrams;
  site.math = needs.math;

  output.set("index.html", {
    type: typeOf("index.html"),
    body: shell(site, {
      path: "",
      title: site.title,
      description: site.tagline || undefined,
      main: frontArticle(layouts.front, {
        site,
        banner: banner ? encodePath(banner) : undefined,
        text: frontBody ? { tree: frontBody.tree, ctx: frontBody.ctx } : undefined,
        start,
        page: (ref) => {
          const found = find(ref).page;
          return found ? startLink(found.path) : null;
        },
        recent: [...publicPaths]
          .flatMap((path) => {
            const updatedAt = pageOf(path)?.updatedAt;
            const link = updatedAt ? startLink(path) : null;
            return link && updatedAt ? [{ ...link, updatedAt }] : [];
          })
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        stats: nav.flatMap((n) => {
          const count = (x: NavNode): number => (x.isPage ? 1 : 0) + x.children.reduce((s, c) => s + count(c), 0);
          const total = count(n);
          return total ? [{ title: n.title, count: total }] : [];
        }),
        problems,
      }),
    }),
  });
  for (const p of pages) {
    const data = pageOf(p.path);
    output.set(fileOf(p.path), {
      type: typeOf("page.html"),
      body: shell(site, {
        path: p.path,
        title: data?.title ?? p.path,
        description: data?.summary || undefined,
        main: p.html,
      }),
    });
  }
  output.set("404.html", {
    type: typeOf("page.html"),
    body: shell(site, {
      path: null,
      title: words.notFound,
      main: article({
        title: "404",
        prose: html(h("p", {}, words.notFound, " ", h("a", { href: "index.html" }, words.home))),
      }),
    }),
  });

  output.set(...text("_site/icon.svg", favicon(wiki)));
  if (needs.math) for (const [name, f] of katexFiles()) output.set(name, f);
  if (needs.diagrams)
    output.set("_site/mermaid.min.js", {
      type: typeOf("script.js"),
      copy: join(APP_ROOT, "node_modules", "mermaid", "dist", "mermaid.min.js"),
    });
  // GitHub Pages would hide the `_site` and `_media` folders without it.
  output.set(".nojekyll", { type: "text/plain", body: "" });

  const ordered = new Map([...output].sort(([a], [b]) => a.localeCompare(b)));
  return {
    files: ordered,
    report: {
      title: site.title,
      pages: [...publicPaths].sort().map((path) => ({ path, title: pageOf(path)?.title ?? path, file: fileOf(path) })),
      privatePages: files.length - publicPaths.size - (front ? 1 : 0),
      front: front ? { path: front.path, title: pageOf(front.path)?.title ?? front.title } : null,
      removed,
      pictures: media.size,
      problems,
      layout: {
        frame: frameSummary(settings.frame),
        front: !!layouts.front,
        pages: [...usedLayouts].sort(),
      },
    },
  };
}

/** Pictures and copied files read when the file is asked for. */
export async function readEditionFile(wiki: Wiki, file: EditionFile): Promise<Uint8Array | string | null> {
  if ("body" in file) return file.body;
  if ("copy" in file) return existsSync(file.copy) ? readFileSync(file.copy) : null;
  const out = await publicPicture(wiki.root, file.picture.rel, file.picture.width);
  return out?.body ?? null;
}

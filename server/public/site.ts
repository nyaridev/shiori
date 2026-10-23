// The public wiki's page shell (ADR-0011): laid out like a fandom wiki (a header with the wiki's name, search and the
// reader's switches; a sidebar card of sections; the page as a card, its infobox beside the text), and drawn with the
// app's own parts and classes (the wiki header's project and search, the sidebar's tree, the page head, section
// cards), so it looks like the wiki in the app. Every URL is relative, so the same files work from a folder, a zip,
// any static host and the public link.
import type { Element } from "hast";
import type { NavNode } from "../../shared/api.ts";
import { glyph, h, html, iconOf, type PublicLink, pageCards, uiIcon } from "./html.ts";
import type { Words } from "./words.ts";

export interface SiteInfo {
  title: string;
  tagline: string;
  lang: string;
  mode: "dark" | "light";
  words: Words;
  /** The header's picture (its URL from the site root), or a drawn icon's name. */
  logo: { src: string } | { icon: string } | null;
  /** The public pages in the sidebar, as the app's tree; picture icons are URLs from the site root. */
  nav: NavNode[];
  /** A page path → its file from the site root (`mobs/rat.html`). */
  fileOf: (path: string) => string;
  /** Spoilers on any page: the header shows the switch that opens them all. */
  spoilers: boolean;
  /** Mermaid's script ships with the site. */
  diagrams: boolean;
  /** KaTeX's stylesheet ships with the site. */
  math: boolean;
  /** A hash of the site's own scripts, styles and search index, after their URLs, so browsers never keep old ones. */
  version: string;
}

export interface ShellPage {
  /** The page path; "" is the front page, null the 404 page. */
  path: string | null;
  title: string;
  description?: string;
  /** The page's own `<main>`, already HTML. */
  main: string;
}

/** `../` for each folder the page is in, so links reach the site root. */
export const rootOf = (path: string | null) => "../".repeat(path ? path.split("/").length - 1 : 0);

export const encodePath = (file: string) => file.split("/").map(encodeURIComponent).join("/");

const raw = (value: string) => ({ type: "raw", value }) as never;

/** The wiki header's project: its logo or icon on a round tile, its name and tagline, linking to the front page. */
function brand(site: SiteInfo, root: string): Element {
  const logo =
    site.logo && "src" in site.logo
      ? h("img", { className: ["pw-logo"], src: root + site.logo.src, alt: "" })
      : site.logo && "icon" in site.logo
        ? h("span", { className: ["sh-head-badge"] }, glyph(site.logo.icon))
        : null;
  return h(
    "a",
    { className: ["sh-head-project", "pw-brand"], href: `${root}index.html` },
    logo,
    h(
      "span",
      { className: ["sh-head-names"] },
      h("span", { className: ["sh-head-title"] }, site.title),
      site.tagline ? h("span", { className: ["sh-head-tagline"] }, site.tagline) : null,
    ),
  );
}

const iconButton = (props: Record<string, unknown>, ...children: Element[]) =>
  h(
    "button",
    { type: "button", className: ["sh-button", "sh-icon-button"], dataVariant: "ghost", dataSize: "md", ...props },
    children,
  );

function header(site: SiteInfo, root: string): Element {
  const w = site.words;
  return h(
    "header",
    { className: ["pw-header"] },
    h(
      "div",
      { className: ["pw-head-start"] },
      iconButton(
        {
          className: ["sh-button", "sh-icon-button", "pw-menu"],
          ariaControls: ["pw-nav"],
          ariaExpanded: "false",
          ariaLabel: w.pages,
        },
        uiIcon("menu", 18),
      ),
      brand(site, root),
    ),
    h(
      "div",
      { className: ["pw-search"], role: "search" },
      uiIcon("search", 15),
      h("input", {
        type: "search",
        id: "pw-q",
        placeholder: w.search,
        ariaLabel: w.search,
        autoComplete: ["off"],
        spellCheck: "false",
        dataNoResults: w.noResults,
      }),
      h("kbd", { className: ["sh-kbd", "pw-search-key"], ariaHidden: "true" }, "/"),
      h("div", { className: ["pw-results"], id: "pw-results", role: "listbox", hidden: true }),
    ),
    h(
      "div",
      { className: ["pw-head-end"] },
      // The app's Switch (ui/Toggles.tsx), for opening every spoiler at once.
      site.spoilers
        ? h(
            "label",
            { className: ["pw-spoilers"] },
            h(
              "button",
              {
                type: "button",
                role: "switch",
                id: "pw-spoilers",
                className: ["sh-switch"],
                ariaChecked: "false",
                dataState: "unchecked",
                ariaLabel: w.spoilers,
              },
              h("span", { className: ["sh-switch-thumb"] }),
            ),
            h("span", { className: ["pw-spoilers-label"] }, w.spoilers),
          )
        : null,
      iconButton(
        { id: "pw-mode", dataDay: w.day, dataNight: w.night, ariaLabel: `${w.day} / ${w.night}` },
        h("span", { className: ["pw-sun"] }, uiIcon("sun", 18)),
        h("span", { className: ["pw-moon"] }, uiIcon("moon", 18)),
      ),
    ),
  );
}

/** The sidebar: home and the loose top pages first, then each top section under its own label, as the app's tree. */
function sidebar(site: SiteInfo, root: string, current: string | null): Element {
  const href = (path: string) => root + encodePath(site.fileOf(path));
  const icon = (n: NavNode) =>
    iconOf(n.icon ? (n.icon.includes("/") ? root + n.icon : n.icon) : undefined, "sh-nav-icon");
  const item = (n: NavNode): Element => {
    const here = n.path === current;
    const link = n.isPage
      ? h(
          "a",
          {
            className: here ? ["sh-nav-link", "active"] : ["sh-nav-link"],
            href: href(n.path),
            ...(here ? { ariaCurrent: "page" } : {}),
          },
          icon(n),
          n.title,
        )
      : h("span", { className: ["sh-nav-link", "sh-nav-heading"] }, n.title);
    return h(
      "li",
      n.children.length ? { className: ["sh-nav-group"] } : {},
      link,
      n.children.length ? h("ul", { className: ["sh-nav"] }, n.children.map(item)) : null,
    );
  };
  const loose = site.nav.filter((n) => !n.children.length);
  const sections = site.nav.filter((n) => n.children.length);
  const home = h(
    "li",
    {},
    h(
      "a",
      {
        className: current === "" ? ["sh-nav-link", "active"] : ["sh-nav-link"],
        href: `${root}index.html`,
        ...(current === "" ? { ariaCurrent: "page" } : {}),
      },
      glyph("home", "sh-nav-icon"),
      site.words.home,
    ),
  );
  return h(
    "nav",
    { className: ["pw-nav"], id: "pw-nav", ariaLabel: site.words.pages },
    h("ul", { className: ["sh-nav", "pw-nav-top"] }, home, loose.map(item)),
    sections.map((s) =>
      h(
        "section",
        { className: ["pw-nav-section"] },
        h(
          "p",
          { className: ["pw-nav-label"] },
          s.isPage
            ? h(
                "a",
                { href: href(s.path), ...(s.path === current ? { ariaCurrent: "page", className: ["active"] } : {}) },
                icon(s),
                s.title,
              )
            : s.title,
        ),
        h("ul", { className: ["sh-nav"] }, s.children.map(item)),
      ),
    ),
  );
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

/** A whole page of the public wiki. */
export function shell(site: SiteInfo, page: ShellPage): string {
  const root = rootOf(page.path);
  const v = `?v=${site.version}`;
  const title = page.path === "" ? site.title : `${page.title} — ${site.title}`;
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(title)}</title>`,
    page.description ? `<meta name="description" content="${esc(page.description)}">` : "",
    '<meta name="generator" content="Shiori">',
    `<link rel="icon" href="${root}_site/icon.svg" type="image/svg+xml">`,
    `<link rel="stylesheet" href="${root}_site/style.css${v}">`,
    site.math ? `<link rel="stylesheet" href="${root}_site/katex/katex.min.css">` : "",
    `<script src="${root}_site/mode.js${v}"></script>`,
  ]
    .filter(Boolean)
    .join("\n");
  const body = html([
    h("a", { className: ["pw-skip"], href: "#pw-content" }, site.words.skip),
    header(site, root),
    h(
      "div",
      { className: ["pw-body"] },
      sidebar(site, root, page.path),
      h("main", { className: ["pw-main"], id: "pw-content", tabIndex: -1 }, raw(page.main)),
    ),
    h(
      "footer",
      { className: ["pw-site-foot"] },
      h("span", {}, site.title),
      h("span", { ariaHidden: "true" }, "·"),
      h("span", {}, "Made with Shiori"),
    ),
  ]);
  const scripts = [
    `<script src="${root}_site/site.js${v}" defer></script>`,
    site.diagrams ? `<script src="${root}_site/mermaid.min.js" defer></script>` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return `<!doctype html>
<html lang="${esc(site.lang)}" data-mode="${site.mode}" data-root="${root}" data-version="${site.version}">
<head>
${head}
</head>
<body class="pw">
${body}
${scripts}
</body>
</html>
`;
}

/** Breadcrumbs (the app's Crumbs): the front page, then the sections above the page. */
export function crumbs(trail: { title: string; href: string | null }[]): Element | null {
  if (!trail.length) return null;
  const items: Element[] = [];
  trail.forEach((t, i) => {
    if (i > 0) items.push(uiIcon("chevronRight", 12));
    items.push(h("li", {}, t.href ? h("a", { href: t.href }, t.title) : h("span", {}, t.title)));
  });
  return h("nav", { className: ["sh-crumbs", "pw-crumbs"], ariaLabel: "Breadcrumb" }, h("ol", {}, items));
}

export interface ArticleParts {
  title: string;
  icon?: Element | null;
  summary?: string;
  /** A wide picture across the top (the page's `banner`), already a URL from this page. */
  banner?: string;
  /** The line under the title: the page's type, when it was updated. */
  meta?: (Element | null)[];
  /** The infobox beside the text. */
  infobox?: Element | null;
  prose: string;
  /** Under the text: the pages in this section, related pages, previous and next. */
  foot?: (Element | null)[];
}

/** One page as the app draws it: its head, then the article with the infobox floating right, then its foot. */
export function article(parts: ArticleParts): string {
  const meta = (parts.meta ?? []).filter((m): m is Element => !!m);
  return html(
    h(
      "article",
      { className: ["pw-article"] },
      h(
        "header",
        { className: ["sh-page-head"] },
        parts.banner ? h("img", { className: ["pw-banner"], src: parts.banner, alt: "" }) : null,
        h(
          "div",
          { className: ["sh-page-heading"] },
          h(
            "div",
            {},
            h("h1", { className: ["sh-page-title"] }, parts.icon ?? null, parts.title),
            parts.summary ? h("p", { className: ["sh-page-summary"] }, parts.summary) : null,
            meta.length ? h("div", { className: ["sh-page-meta"] }, meta) : null,
          ),
        ),
      ),
      h("div", { className: ["sh-prose"] }, parts.infobox ?? null, raw(parts.prose)),
      h(
        "footer",
        { className: ["sh-page-foot"] },
        (parts.foot ?? []).filter((f): f is Element => !!f),
      ),
    ),
  );
}

/** The front page: the wiki's name and tagline over its banner, the chosen page's text, a card per section. */
export function frontArticle(site: SiteInfo, parts: { banner?: string; prose: string; start: PublicLink[] }): string {
  return html(
    h(
      "article",
      { className: ["pw-article", "pw-front"] },
      h(
        "header",
        { className: ["sh-page-head", "pw-front-head"] },
        parts.banner ? h("img", { className: ["pw-banner"], src: parts.banner, alt: "" }) : null,
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
      ),
      parts.prose ? h("div", { className: ["sh-prose"] }, raw(parts.prose)) : null,
      parts.start.length
        ? h(
            "footer",
            { className: ["sh-page-foot"] },
            sectionBlock(site.words.start, pageCards(parts.start, "sh-sections-grid pw-start-grid")),
          )
        : null,
    ),
  );
}

/** A block of the page's foot under its small heading, as the app's "In this section". */
export const sectionBlock = (title: string, body: Element | null) =>
  body
    ? h(
        "section",
        { className: ["sh-sections"], ariaLabel: title },
        h("h2", { className: ["sh-sections-title"] }, title),
        body,
      )
    : null;

/** Previous and next, in the sidebar's order. */
export function pager(words: Words, prev: PublicLink | null, next: PublicLink | null): Element | null {
  if (!prev && !next) return null;
  const card = (p: PublicLink, label: string, dir: string) =>
    h(
      "a",
      { className: ["sh-section-card", "pw-pager-card"], href: p.href, dataDir: dir },
      h("span", { className: ["pw-pager-label"] }, label),
      h("span", { className: ["sh-section-name"] }, iconOf(p.icon, "sh-icon-gap"), p.title),
    );
  return h(
    "nav",
    { className: ["pw-pager"], ariaLabel: `${words.previous} / ${words.next}` },
    prev ? card(prev, words.previous, "prev") : h("span"),
    next ? card(next, words.next, "next") : null,
  );
}

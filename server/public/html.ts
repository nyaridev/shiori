// The public wiki's pages are plain HTML (ADR-0011) that looks like the app: each `sh-*` element the stripped hast
// still has becomes the same markup, with the same classes, as the app's component for it draws, so the app's own
// stylesheets (ui.css, prose.css, planning.css…, bundled by edition.ts) style it. assets/site.js brings back what
// the components do (tabs, folding sections, sorting, spoilers). Nothing here needs the app: the pages work from a
// folder, a zip or the public link alike.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Element, ElementContent, Properties, Root, RootContent } from "hast";
import { toHtml } from "hast-util-to-html";
import type { PageLink, TocEntry } from "../../shared/api.ts";
import type { Cell } from "../../shared/sheet.ts";
import { ICON_NAME, ICONS_DIR, iconSet } from "../icons.ts";
import { APP_ROOT } from "../paths.ts";
import { readSheet } from "../sheets.ts";
import { fieldKey } from "./rules.ts";
import { textIn } from "./strip.ts";
import type { Words } from "./words.ts";

/** What a page's elements need to know about the page and the public wiki around it. */
export interface StaticContext {
  /** The wiki folder, for its data sheets. */
  root: string;
  words: Words;
  privateFields: Set<string>;
  /** The page's own lists, already only public pages, with their URLs. */
  page: { toc: TocEntry[]; children: PublicLink[]; related: { kind: string; pages: PublicLink[] }[] };
  /** What the page uses that the site must bring along. */
  needs: { math: boolean; diagrams: boolean; code: boolean };
}

export interface PublicLink extends PageLink {
  href: string;
  image?: string;
}

type Child = ElementContent | string | null | undefined | false;

/** A hast element: `h("p", { className: ["x"] }, "text", h(...))`. */
export function h(tagName: string, properties: Properties = {}, ...children: (Child | Child[])[]): Element {
  const out: ElementContent[] = [];
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    out.push(typeof c === "string" ? { type: "text", value: c } : c);
  }
  return { type: "element", tagName, properties, children: out };
}

const str = (v: unknown) => (typeof v === "string" ? v : v === undefined || v === null ? "" : String(v));
const raw = (value: string) => ({ type: "raw", value }) as unknown as ElementContent;

/** Shiori's drawn icons, inline, in the wiki's colors (`.sh-glyph` in the app's base.css), as PageIcon draws them. */
const glyphs = new Map<string, string>();
export function glyph(name: string, className = ""): Element | null {
  if (!ICON_NAME.test(name) || !iconSet().has(name)) return null;
  let inner = glyphs.get(name);
  if (inner === undefined) {
    inner = readFileSync(join(ICONS_DIR, `${name}.svg`), "utf8")
      .replace(/^[\s\S]*?<svg[^>]*>/, "")
      .replace(/<\/svg>\s*$/, "")
      .replace(/<title>[\s\S]*?<\/title>/, "")
      .trim();
    glyphs.set(name, inner);
  }
  return h(
    "svg",
    { viewBox: "0 0 24 24", className: `sh-glyph ${className}`.trim().split(" "), ariaHidden: "true" },
    raw(inner),
  );
}

/** A page icon (PageIcon): a drawn icon by name, a picture of the wiki's (its public URL), or an emoji. */
export function iconOf(icon: string | undefined, className = ""): Element | null {
  if (!icon) return null;
  if (ICON_NAME.test(icon)) return glyph(icon, className);
  if (icon.includes("/") || icon.includes("."))
    return h("img", {
      src: icon,
      alt: "",
      ariaHidden: "true",
      className: `sh-icon-img ${className}`.trim().split(" "),
    });
  return h("span", { className: className ? className.split(" ") : undefined, ariaHidden: "true" }, icon);
}

/** The app's small stroke icons (src/ui/Icon.tsx), read from its own file so they stay the same. */
let uiPaths: Map<string, string> | null = null;
export function uiIcon(name: string, size = 16): Element {
  uiPaths ??= new Map(
    [...readFileSync(join(APP_ROOT, "src", "ui", "Icon.tsx"), "utf8").matchAll(/^ {2}(\w+): "([^"]+)",?$/gm)].map(
      (m) => [m[1], m[2]],
    ),
  );
  return h(
    "svg",
    {
      className: ["sh-icon"],
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      ariaHidden: "true",
    },
    h("path", { d: uiPaths.get(name) ?? "" }),
  );
}

/** Only links and pictures a browser can't run code from. */
const SAFE_URL = /^(https?:|mailto:|#|\.{0,2}\/|[^:]*$)/i;

const CALLOUT_ICONS: Record<string, string> = { note: "info", tip: "tip", warning: "warning", danger: "danger" };

/** A table that scrolls sideways inside its panel when it's wider than the page. */
const tableWrap = (table: Element) => h("div", { className: ["sh-table-wrap", "pw-scroll-x"] }, table);

const badge = (tone: string, ...children: Child[]) => h("span", { className: ["sh-badge"], dataTone: tone }, children);

function cellText(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "✓" : "—";
  return String(v);
}

/** A data table (DataTable.tsx): its caption, headers that sort, and a filter once it's long. */
function dataTable(table: Element, caption: string, ctx: StaticContext): Element {
  const rows = table.children.filter((c): c is Element => c.type === "element" && c.tagName === "tbody")[0];
  const count = rows ? rows.children.filter((r) => r.type === "element").length : 0;
  const filter =
    count >= 6
      ? h(
          "div",
          { className: ["sh-data-filter"] },
          uiIcon("search", 14),
          h("input", {
            type: "search",
            className: ["sh-field", "pw-data-filter"],
            placeholder: "Filter…",
            ariaLabel: "Filter the rows",
            spellCheck: "false",
          }),
          h("span", { className: ["sh-data-count"], ariaLive: "polite" }, `${count} rows`),
        )
      : null;
  return h(
    "figure",
    { className: ["sh-data"] },
    caption || filter
      ? h(
          "div",
          { className: ["sh-data-bar"] },
          caption ? h("figcaption", { className: ["sh-data-caption"] }, caption) : null,
          filter,
        )
      : null,
    tableWrap(h("table", { dataSortable: "" }, sortHeads(convertAll(table.children, ctx)))),
  );
}

/** The header cells as DataTable's sort buttons; site.js does the sorting. */
function sortHeads(children: ElementContent[]): ElementContent[] {
  for (const part of children) {
    if (part.type !== "element" || part.tagName !== "thead") continue;
    for (const row of part.children) {
      if (row.type !== "element") continue;
      for (const th of row.children) {
        if (th.type !== "element" || th.tagName !== "th") continue;
        th.properties.ariaSort = "none";
        th.children = [
          h(
            "button",
            { type: "button", className: ["sh-data-sort"], title: `Sort by ${textIn(th).trim()}` },
            h("span", {}, th.children),
            uiIcon("chevronDown", 12),
          ),
        ];
      }
    }
  }
  return children;
}

/** `::sheet{name}`: the sheet's values from its file, as a data table. Private columns stay out. */
function sheetTable(name: string, ctx: StaticContext): Element | null {
  const sheet = readSheet(ctx.root, name);
  if (!sheet) return null;
  const columns = sheet.file.columns.filter((c) => !ctx.privateFields.has(fieldKey(c.label ?? c.id)));
  const unit = (c: (typeof columns)[number]) => (c.type === "number" && c.unit ? ` ${c.unit}` : "");
  const table = h(
    "table",
    {},
    h(
      "thead",
      {},
      h(
        "tr",
        {},
        columns.map((c) => h("th", {}, c.label ?? c.id)),
      ),
    ),
    h(
      "tbody",
      {},
      [...sheet.rows.values()].map((row) =>
        h(
          "tr",
          {},
          columns.map((c) => h("td", {}, `${cellText(row[c.id] ?? null)}${row[c.id] == null ? "" : unit(c)}`)),
        ),
      ),
    ),
  );
  const caption = sheet.file.description ? `${sheet.file.title} — ${sheet.file.description}` : sheet.file.title;
  return dataTable(table, caption, ctx);
}

/** Section cards for pages (PageCard), with the page's picture on top when the public wiki has one. */
export function pageCards(pages: PublicLink[], className = "sh-sections-grid"): Element {
  return h(
    "div",
    { className: className.split(" ") },
    pages.map((p) =>
      h(
        "a",
        { className: ["sh-section-card", ...(p.image ? ["pw-card-art"] : [])], href: p.href },
        p.image
          ? h("span", { className: ["pw-card-picture"] }, h("img", { src: p.image, alt: "", loading: "lazy" }))
          : null,
        h(
          "span",
          { className: ["sh-section-top"] },
          iconOf(p.icon, "sh-section-icon") ?? glyph("page", "sh-section-icon"),
        ),
        h("span", { className: ["sh-section-name"] }, p.title),
        p.summary ? h("span", { className: ["sh-section-summary"] }, p.summary) : null,
      ),
    ),
  );
}

/** Related pages (Related.tsx): each kind with its pages as chips. */
export function relatedChips(groups: { kind: string; pages: PublicLink[] }[]): Element | null {
  if (!groups.length) return null;
  return h(
    "div",
    { className: ["sh-related"] },
    groups.map((g) =>
      h(
        "div",
        { className: ["sh-related-group"] },
        h("span", { className: ["sh-related-kind"] }, g.kind),
        h(
          "span",
          { className: ["sh-chips"] },
          g.pages.map((p) =>
            h("a", { className: ["sh-page-chip"], href: p.href }, iconOf(p.icon) ?? glyph("page"), p.title),
          ),
        ),
      ),
    ),
  );
}

/**
 * The page's contents in the article, numbered like Wikipedia's (1., 1.1.), in a box whose header folds it (TocEl).
 * A `<details>`, so it folds without the script.
 */
export function tocNav(toc: TocEntry[], words: Words): Element | null {
  if (!toc.length) return null;
  let major = 0;
  let minor = 0;
  return h(
    "details",
    { className: ["sh-inline-toc"], open: true },
    h(
      "summary",
      { className: ["sh-inline-toc-title"] },
      uiIcon("contents", 16),
      h("span", {}, words.contents),
      h("span", { className: ["sh-inline-toc-chevron"] }, uiIcon("chevronDown", 16)),
    ),
    h(
      "nav",
      { ariaLabel: words.contents },
      h(
        "ol",
        {},
        toc.map((e) => {
          if (e.depth === 2) {
            major++;
            minor = 0;
          } else minor++;
          const n = e.depth === 2 ? `${major}.` : `${Math.max(major, 1)}.${minor}.`;
          return h(
            "li",
            { dataDepth: String(e.depth) },
            h(
              "a",
              { href: `#${e.id}` },
              h("span", { className: ["sh-inline-toc-number"] }, n),
              h("span", { className: ["sh-inline-toc-text"] }, e.text),
            ),
          );
        }),
      ),
    ),
  );
}

const LANGS: Record<string, string> = {
  ts: "TypeScript",
  js: "JavaScript",
  json: "JSON",
  lua: "Lua",
  luau: "Luau",
  py: "Python",
  python: "Python",
  gdscript: "GDScript",
  cs: "C#",
  sh: "Shell",
  bash: "Shell",
};

/** One element of the stripped page as the app's markup. */
function convert(el: Element, ctx: StaticContext): ElementContent | ElementContent[] | null {
  const p = el.properties;
  const kids = () => convertAll(el.children, ctx);
  const cls = (...names: string[]) => ({ className: names });
  switch (el.tagName) {
    case "a": {
      const href = str(p.href);
      if (!SAFE_URL.test(href)) return kids();
      const external = /^https?:/i.test(href);
      const chip = p.dataChip !== undefined;
      return h(
        "a",
        {
          href,
          className: chip ? ["sh-link", "sh-link-chip"] : ["sh-link"],
          ...(external ? { target: "_blank", rel: ["noreferrer"] } : {}),
        },
        chip ? glyph("page") : null,
        kids(),
      );
    }
    case "img": {
      const src = str(p.src);
      if (!SAFE_URL.test(src)) return null;
      return h("img", {
        src,
        alt: str(p.alt),
        ...(p.title ? { title: str(p.title) } : {}),
        loading: "lazy",
        decoding: "async",
      });
    }
    case "table":
      return tableWrap(h("table", {}, kids()));
    case "pre": {
      ctx.needs.code = true;
      const lang = str(p.dataLang);
      return h(
        "figure",
        cls("sh-code-block"),
        h("figcaption", cls("sh-code-head"), h("span", cls("sh-code-lang"), lang ? (LANGS[lang] ?? lang) : "Text")),
        h("div", cls("sh-code-scroll", "pw-scroll-x"), h("pre", { className: ["sh-code"] }, kids())),
      );
    }
    case "div":
      if (Array.isArray(p.className) && p.className.includes("sh-math-block")) {
        ctx.needs.math = true;
        return h("div", cls("sh-math-block", "pw-scroll-x"), kids());
      }
      break;
    case "span":
      if (Array.isArray(p.className) && p.className.some((c) => String(c).startsWith("katex"))) ctx.needs.math = true;
      break;
    case "input":
      return p.type === "checkbox"
        ? h(
            "span",
            {
              className: ["sh-task"],
              dataChecked: p.checked ? "" : undefined,
              role: "img",
              ariaLabel: p.checked ? "done" : "open",
            },
            p.checked
              ? raw(
                  '<svg class="sh-checkmark" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M3.4 8.6 6.6 11.6 12.6 4.6"/></svg>',
                )
              : null,
          )
        : null;
    case "sh-callout": {
      const tone = str(p.tone) || "note";
      return h(
        "aside",
        { className: ["sh-callout"], dataTone: tone },
        h("span", cls("sh-callout-icon"), uiIcon(CALLOUT_ICONS[tone] ?? "info", 18)),
        h("div", cls("sh-callout-body"), p.title ? h("p", cls("sh-callout-title"), str(p.title)) : null, kids()),
      );
    }
    case "sh-infobox":
      return h(
        "aside",
        cls("sh-infobox"),
        p.title ? h("p", cls("sh-infobox-title"), str(p.title)) : null,
        p.image ? h("img", { className: ["sh-infobox-image"], src: str(p.image), alt: str(p.title) }) : null,
        p.caption ? h("p", cls("sh-infobox-caption"), str(p.caption)) : null,
        h("div", cls("sh-infobox-rows"), kids()),
      );
    case "sh-row":
      return h("div", cls("sh-infobox-row"), kids());
    case "sh-key":
      return h("span", cls("sh-infobox-key"), kids());
    case "sh-value":
      return h("span", cls("sh-infobox-value"), kids());
    case "sh-tabs": {
      const tabs = el.children.filter((c): c is Element => c.type === "element" && c.tagName === "sh-tab");
      return h(
        "div",
        cls("sh-tabs"),
        h(
          "div",
          { className: ["sh-tabs-list"], role: "tablist" },
          tabs.map((t, i) =>
            h(
              "button",
              {
                type: "button",
                role: "tab",
                className: ["sh-tabs-trigger"],
                dataState: i === 0 ? "active" : "inactive",
                ariaSelected: i === 0 ? "true" : "false",
                dataTone: t.properties.tone ? str(t.properties.tone) : undefined,
              },
              str(t.properties.label) || `Tab ${i + 1}`,
            ),
          ),
        ),
        tabs.map((t, i) =>
          h(
            "div",
            {
              className: ["sh-tabs-panel"],
              role: "tabpanel",
              dataState: i === 0 ? "active" : "inactive",
              dataTone: t.properties.tone ? str(t.properties.tone) : undefined,
            },
            convertAll(t.children, ctx),
          ),
        ),
      );
    }
    case "sh-columns":
      return h("div", cls("sh-columns"), kids());
    case "sh-column":
      return h("div", cls("sh-column"), kids());
    case "sh-details":
      return h(
        "details",
        cls("sh-details"),
        h("summary", {}, uiIcon("chevronRight", 16), str(p.summary) || "Details"),
        h("div", cls("sh-details-body"), kids()),
      );
    case "sh-spoiler":
      if (p.inline !== undefined)
        // A span, not the app's button, so a long secret wraps with the sentence around it.
        return h(
          "span",
          { className: ["sh-spoiler-inline"], role: "button", tabIndex: 0, ariaLabel: "Spoiler: show it" },
          h("span", { ariaHidden: "true" }, kids()),
        );
      return h(
        "details",
        cls("sh-details", "sh-spoiler"),
        h("summary", {}, uiIcon("chevronRight", 16), str(p.title) || "Spoiler"),
        h("div", cls("sh-details-body"), kids()),
      );
    case "sh-badge":
      return badge(str(p.tone) || "neutral", ...kids());
    case "sh-kbd":
      return h("kbd", cls("sh-kbd"), kids());
    case "sh-stats":
      return h("div", cls("sh-stats"), kids());
    case "sh-stat":
      return h(
        "div",
        { className: ["sh-stat"], dataTrend: str(p.trend) || undefined },
        h("span", cls("sh-stat-label"), str(p.label)),
        h("span", cls("sh-stat-value"), str(p.value)),
        p.change ? h("span", cls("sh-stat-change"), str(p.change)) : null,
      );
    case "sh-timeline":
      return h("ol", cls("sh-timeline"), kids());
    case "sh-milestone": {
      const state = str(p.state);
      return h(
        "li",
        { className: ["sh-milestone"], dataState: state || undefined },
        h(
          "span",
          { className: ["sh-milestone-dot"], ariaHidden: "true" },
          state === "done" ? uiIcon("check", 10) : null,
        ),
        p.when || state === "now"
          ? h("p", cls("sh-milestone-when"), str(p.when), state === "now" ? badge("accent", "Now") : null)
          : null,
        h("div", cls("sh-milestone-body"), kids()),
      );
    }
    case "sh-cards":
      return h("div", cls("sh-cards"), kids());
    case "sh-card":
      return h("div", cls("sh-card"), iconOf(str(p.icon) || undefined, "sh-card-icon"), kids());
    case "sh-card-title":
      return h("p", cls("sh-card-title"), kids());
    case "sh-icon":
      return glyph(str(p.name));
    case "sh-gallery":
      return h("div", cls("sh-gallery"), kids());
    case "sh-shot": {
      const img = el.children.find((c): c is Element => c.type === "element" && c.tagName === "img");
      const src = img ? str(img.properties.src) : "";
      return h(
        "a",
        { className: ["sh-shot", "pw-zoom"], href: src },
        kids(),
        p.caption ? h("span", cls("sh-shot-caption"), str(p.caption)) : null,
      );
    }
    case "sh-progress": {
      const total = Number(p.max) > 0 ? Number(p.max) : 100;
      const done = Math.min(Math.max(Number(p.value) || 0, 0), total);
      const pct = (done / total) * 100;
      return h(
        "span",
        {
          className: ["sh-progress"],
          role: "progressbar",
          ariaValuenow: String(done),
          ariaValuemin: "0",
          ariaValuemax: String(total),
        },
        el.children.length ? h("span", cls("sh-progress-label"), kids()) : null,
        h("span", cls("sh-progress-track"), h("span", { className: ["sh-progress-bar"], style: `width:${pct}%` })),
        h("span", cls("sh-progress-value"), p.max ? `${done}/${total}` : `${Math.round(pct)}%`),
      );
    }
    case "sh-related": {
      const kind = str(p.kind);
      return relatedChips(ctx.page.related.filter((g) => !kind || g.kind.toLowerCase() === kind.toLowerCase()));
    }
    case "sh-children":
      if (!ctx.page.children.length) return null;
      if (str(p.layout) === "list")
        return h(
          "ul",
          cls("sh-children-list"),
          ctx.page.children.map((c) =>
            h(
              "li",
              {},
              h("a", { href: c.href, className: ["sh-link"] }, iconOf(c.icon, "sh-icon-gap"), c.title),
              c.summary ? h("span", cls("sh-children-summary"), ` — ${c.summary}`) : null,
            ),
          ),
        );
      return pageCards(ctx.page.children, "sh-sections-grid sh-children-cards");
    case "sh-toc":
      return tocNav(ctx.page.toc, ctx.words);
    case "sh-steps":
      return h(
        "div",
        cls("sh-steps"),
        p.title ? h("p", cls("sh-steps-title"), str(p.title)) : null,
        h("ol", {}, kids()),
      );
    case "sh-step":
      return h(
        "li",
        cls("sh-step"),
        p.title ? h("p", cls("sh-step-title"), str(p.title)) : null,
        h("div", cls("sh-step-body"), kids()),
      );
    case "sh-compare":
      return h("div", cls("sh-compare"), kids());
    case "sh-option": {
      const picked = p.picked !== undefined;
      return h(
        "section",
        { className: ["sh-option"], dataPicked: picked ? "" : undefined, ariaLabel: str(p.name) },
        h(
          "header",
          cls("sh-option-head"),
          h("span", cls("sh-option-name"), str(p.name)),
          picked ? badge("good", "Chosen") : null,
        ),
        h("div", cls("sh-option-body"), kids()),
      );
    }
    case "sh-point": {
      const kind = str(p.kind) || "note";
      return h(
        "div",
        { className: ["sh-point"], dataKind: kind },
        h(
          "span",
          { className: ["sh-point-mark"], ariaHidden: "true" },
          kind === "pro" ? "+" : kind === "con" ? "−" : "•",
        ),
        h(
          "div",
          cls("sh-point-body"),
          kind !== "note" ? h("span", cls("sh-sr-only"), kind === "pro" ? "Pro: " : "Con: ") : null,
          p.label ? h("strong", cls("sh-point-label"), `${str(p.label)}: `) : null,
          kids(),
        ),
      );
    }
    case "sh-quote": {
      const url = /^https?:\/\//i.test(str(p.url)) ? str(p.url) : "";
      const source = p.source
        ? url
          ? h("a", { href: url, target: "_blank", rel: ["noreferrer"], className: ["sh-link"] }, str(p.source))
          : str(p.source)
        : null;
      return h(
        "figure",
        cls("sh-quote"),
        h("blockquote", {}, kids()),
        p.by || p.source
          ? h(
              "figcaption",
              {},
              p.by ? h("strong", {}, str(p.by)) : null,
              p.role ? h("span", {}, `, ${str(p.role)}`) : null,
              source ? h("span", {}, p.by ? " · " : "", source) : null,
            )
          : null,
      );
    }
    case "sh-embed": {
      const src = str(p.src);
      if (!/^https:\/\/(www\.youtube-nocookie\.com|player\.vimeo\.com|www\.figma\.com)\//.test(src)) return null;
      return h(
        "figure",
        { className: ["sh-embed"], dataProvider: str(p.provider) || undefined },
        h(
          "div",
          cls("sh-embed-frame"),
          h("iframe", {
            src,
            title: str(p.caption) || `${str(p.provider)} embed`,
            loading: "lazy",
            allow:
              "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen",
            allowFullScreen: true,
            referrerPolicy: "strict-origin-when-cross-origin",
          }),
        ),
        p.caption ? h("figcaption", {}, str(p.caption)) : null,
      );
    }
    case "sh-boxes":
      return h("div", { className: ["sh-boxes"], dataColumns: str(p.columns) || undefined }, kids());
    case "sh-box":
      return h(
        "section",
        { className: ["sh-box"], dataSpan: str(p.span) || undefined },
        p.title ? h("h2", cls("sh-box-title"), iconOf(str(p.icon) || undefined, "sh-box-icon"), str(p.title)) : null,
        h("div", cls("sh-box-body"), kids()),
      );
    case "sh-table": {
      const table = el.children.find((c): c is Element => c.type === "element" && c.tagName === "table");
      return table ? dataTable(table, str(p.caption), ctx) : null;
    }
    case "sh-sheet":
      return sheetTable(str(p.name), ctx);
    case "sh-diagram":
      ctx.needs.diagrams = true;
      return h("figure", cls("sh-diagram", "pw-scroll-x"), h("pre", cls("pw-diagram"), textIn(el)));
  }
  if (el.tagName.startsWith("sh-")) return null;
  // Ordinary HTML from Markdown: kept, without what only the app used.
  const { dataWikilink: _w, dataMissing: _m, ...rest } = p;
  return { ...el, properties: rest, children: kids() };
}

function convertAll(children: ElementContent[], ctx: StaticContext): ElementContent[] {
  const out: ElementContent[] = [];
  for (const c of children) {
    // Raw HTML never comes from a page (the renderer drops it); only this file's own icons are raw.
    if ((c as { type: string }).type === "raw") continue;
    if (c.type !== "element") {
      out.push(c);
      continue;
    }
    const done = convert(c, ctx);
    if (Array.isArray(done)) out.push(...done);
    else if (done) out.push(done);
  }
  return out;
}

/**
 * Each `##` section as the app's Section.tsx draws it: the heading over a thin line with its fold button, then its
 * body. The text before the first `##` stays as it is.
 */
function sectioned(nodes: RootContent[]): RootContent[] {
  const out: RootContent[] = [];
  let body: Element | null = null;
  for (const node of nodes) {
    if (node.type === "element" && node.tagName === "h2") {
      const heading = textIn(node).trim();
      body = h("div", { className: ["sh-section-body"] });
      out.push(
        h(
          "section",
          { className: ["sh-section"] },
          h(
            "div",
            { className: ["sh-section-head"] },
            node,
            h(
              "div",
              { className: ["sh-section-tools"] },
              h(
                "button",
                {
                  type: "button",
                  className: ["sh-section-tool", "sh-section-fold-button"],
                  ariaExpanded: "true",
                  ariaLabel: `Fold “${heading}”`,
                  title: "Fold this section",
                },
                uiIcon("chevronDown", 15),
              ),
            ),
          ),
          h("div", { className: ["sh-section-fold"] }, h("div", {}, body)),
        ),
      );
    } else if (body) body.children.push(node as ElementContent);
    else out.push(node);
  }
  return out;
}

/** A stripped page (or fragment) as the public wiki's HTML; `sections` cuts it into the app's `##` sections. */
export function staticHtml(tree: Root, ctx: StaticContext, { sections = false } = {}): string {
  const children = convertAll(tree.children as ElementContent[], ctx) as RootContent[];
  return toHtml({ type: "root", children: sections ? sectioned(children) : children }, { allowDangerousHtml: true });
}

/** Markup made here (the layout), as HTML. */
export const html = (node: Element | Element[]) =>
  toHtml({ type: "root", children: [node].flat() as RootContent[] }, { allowDangerousHtml: true });

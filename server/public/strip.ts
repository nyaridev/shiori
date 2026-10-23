// A page's rendered hast as the public wiki (ADR-0011) may show it: private blocks, owner-only elements, code, private
// fields and pictures, and links to pages that aren't public are taken out. It works on a copy; the app's own page
// is untouched. What's taken out is counted, so the owner sees what stayed home.
import type { Element, ElementContent, Root, RootContent } from "hast";
import type { PublicRemoved } from "../../shared/api.ts";
import { isNavbox } from "../markdown/references.ts";
import { fieldKey } from "./rules.ts";

export type Removed = PublicRemoved;

export const noneRemoved = (): Removed => ({
  private: 0,
  code: 0,
  questions: 0,
  fields: 0,
  pictures: 0,
  links: 0,
  elements: 0,
});

export interface StripContext {
  wikiId: string;
  /** A page's URL in the public wiki (from the page being made), or null when the page isn't public. */
  pageHref: (path: string, hash?: string) => string | null;
  /** A wiki picture's URL as the server made it (`/api/wikis/<id>/files/…`) → its URL in the public wiki, or null. */
  fileHref: (url: string) => string | null;
  /** Keep code blocks. */
  code: boolean;
  /** Field labels to leave out, as `fieldKey` makes them. */
  privateFields: Set<string>;
  removed: Removed;
}

/** Elements that are the app's alone: what's being worked on, who answered, live lists of the whole wiki. */
const OWNER_ONLY = new Set([
  "sh-recent-changes",
  "sh-open-questions",
  "sh-open-tasks",
  "sh-discussions",
  "sh-directory",
  "sh-designs",
  "sh-roadmap",
  "sh-roadmap-milestone",
  "sh-status",
  "sh-unknown",
]);

export const textIn = (node: RootContent | ElementContent | Root): string =>
  node.type === "text" ? node.value : "children" in node ? node.children.map((c) => textIn(c)).join("") : "";

const isElement = (n: unknown): n is Element => (n as Element)?.type === "element";
const elementsIn = (n: Element) => n.children.filter(isElement);
const classes = (el: Element): string[] => {
  const c: unknown = el.properties.className;
  return Array.isArray(c) ? c.map(String) : typeof c === "string" ? c.split(/\s+/) : [];
};

/** The page a link inside the wiki points to (`/w/<wiki>/<path>#hash`), or null for any other link. */
export function internalTarget(wikiId: string, href: unknown): { path: string; hash?: string } | null {
  if (typeof href !== "string") return null;
  const prefix = `/w/${wikiId}`;
  if (!(href === prefix || href.startsWith(`${prefix}/`) || href.startsWith(`${prefix}#`))) return null;
  const [path, hash] = href.slice(prefix.length).replace(/^\//, "").split("#");
  try {
    return { path: decodeURIComponent(path), ...(hash ? { hash } : {}) };
  } catch {
    return { path, ...(hash ? { hash } : {}) };
  }
}

/** The first link in `el` to a page of this wiki that isn't public. */
function linksPrivatePage(el: Element, ctx: StripContext): boolean {
  let found = false;
  const walk = (n: ElementContent) => {
    if (found || !isElement(n)) return;
    const target = n.tagName === "a" ? internalTarget(ctx.wikiId, n.properties.href) : null;
    if (target && ctx.pageHref(target.path) === null) found = true;
    n.children.forEach(walk);
  };
  walk(el);
  return found;
}

/** Table columns whose heading is a private field, and body rows whose first cell is one, or that link a private page. */
function stripTable(table: Element, ctx: StripContext, ofPages: boolean) {
  const sections = elementsIn(table);
  const rows = sections.flatMap((s) => (s.tagName === "tr" ? [s] : elementsIn(s).filter((r) => r.tagName === "tr")));
  const head = sections.find((s) => s.tagName === "thead");
  const headRow = head ? elementsIn(head).find((r) => r.tagName === "tr") : undefined;
  const hidden = new Set<number>();
  if (headRow) {
    elementsIn(headRow).forEach((cell, i) => {
      if (ctx.privateFields.has(fieldKey(textIn(cell).trim()))) hidden.add(i);
    });
  }
  if (hidden.size) ctx.removed.fields += hidden.size;
  for (const row of rows) {
    if (hidden.size) {
      let i = 0;
      row.children = row.children.filter((c) => !isElement(c) || !hidden.has(i++));
    }
  }
  for (const section of sections.filter((s) => s.tagName === "tbody")) {
    section.children = section.children.filter((row) => {
      if (!isElement(row) || row.tagName !== "tr") return true;
      const first = elementsIn(row)[0];
      if (first && ctx.privateFields.has(fieldKey(textIn(first).trim()))) {
        ctx.removed.fields++;
        return false;
      }
      // A table of pages never names a page that isn't public.
      if (ofPages && linksPrivatePage(row, ctx)) {
        ctx.removed.links++;
        return false;
      }
      return true;
    });
  }
}

/** One element, cleaned: null to drop it, an array to put its children in its place. */
function stripElement(el: Element, ctx: StripContext): Element | ElementContent[] | null {
  const tag = el.tagName;
  const props = el.properties;
  if (tag === "sh-private") {
    ctx.removed.private++;
    return null;
  }
  if (tag === "sh-question" || tag === "sh-suggestion") {
    ctx.removed.questions++;
    return null;
  }
  if (OWNER_ONLY.has(tag) || (tag.startsWith("sh-") && !KNOWN.has(tag))) {
    ctx.removed.elements++;
    return null;
  }
  if (tag === "pre" && !ctx.code && !classes(el).includes("sh-math-block")) {
    ctx.removed.code++;
    return null;
  }
  if (tag === "a") {
    const target = internalTarget(ctx.wikiId, props.href);
    if (target || props.dataMissing !== undefined) {
      const href = target ? ctx.pageHref(target.path, target.hash) : null;
      if (href === null || props.dataMissing !== undefined) {
        ctx.removed.links++;
        return stripChildren(el.children, ctx);
      }
      el.properties = {
        href,
        ...(props.dataChip !== undefined ? { dataChip: "" } : {}),
        ...(props.ariaCurrent ? { ariaCurrent: props.ariaCurrent } : {}),
      };
    }
  }
  if (tag === "img") {
    const src = typeof props.src === "string" ? props.src : "";
    if (src.startsWith("/")) {
      const url = ctx.fileHref(src);
      if (url === null) {
        ctx.removed.pictures++;
        return null;
      }
      props.src = url;
    }
  }
  if (tag === "sh-infobox" && typeof props.image === "string" && props.image.startsWith("/")) {
    const url = ctx.fileHref(props.image);
    if (url === null) {
      ctx.removed.pictures++;
      delete props.image;
    } else props.image = url;
  }
  if (tag === "sh-box" && typeof props.icon === "string" && props.icon.startsWith("/")) {
    const url = ctx.fileHref(props.icon);
    if (url === null) delete props.icon;
    else props.icon = url;
  }
  if (tag === "sh-row") {
    const key = elementsIn(el).find((c) => c.tagName === "sh-key");
    if (key && ctx.privateFields.has(fieldKey(textIn(key).trim()))) {
      ctx.removed.fields++;
      return null;
    }
  }
  if (tag === "sh-stat" && ctx.privateFields.has(fieldKey(String(props.label ?? "")))) {
    ctx.removed.fields++;
    return null;
  }
  if ((tag === "sh-card" || tag === "sh-navbox-item") && linksPrivatePage(el, ctx)) {
    ctx.removed.links++;
    return null;
  }
  if (tag === "table") stripTable(el, ctx, false);
  if (tag === "sh-table") {
    const table = elementsIn(el).find((c) => c.tagName === "table");
    if (table) stripTable(table, ctx, props.pages !== undefined);
  }
  el.children = stripChildren(el.children, ctx);
  // A gallery tile whose picture was private, a paragraph whose only words were.
  if (tag === "sh-shot" && !elementsIn(el).some((c) => c.tagName === "img")) return null;
  if ((tag === "sh-gallery" || tag === "sh-cards" || tag === "sh-stats") && !elementsIn(el).length) return null;
  // A navbox row whose pages were all private, and a navbox left with no rows.
  if (tag === "sh-navbox-items" && !elementsIn(el).length) return null;
  if (tag === "sh-navbox-group" && !elementsIn(el).some((c) => c.tagName !== "sh-navbox-label")) return null;
  if (tag === "sh-navbox" && !elementsIn(el).length) return null;
  if (tag === "p" && !el.children.some((c) => c.type !== "text" || c.value.trim())) return null;
  return el;
}

function stripChildren(children: ElementContent[], ctx: StripContext): ElementContent[] {
  const out: ElementContent[] = [];
  for (const child of children) {
    if (!isElement(child)) {
      out.push(child);
      continue;
    }
    const kept = stripElement(child, ctx);
    if (Array.isArray(kept)) out.push(...kept);
    else if (kept) out.push(kept);
  }
  return out;
}

const level = (n: RootContent) => (isElement(n) && /^h[2-4]$/.test(n.tagName) ? Number(n.tagName[1]) : 0);

/** Headings left with nothing under them, once what was under them was private. */
function dropEmptyHeadings(nodes: RootContent[]): RootContent[] {
  const out = [...nodes];
  for (let i = out.length - 1; i >= 0; i--) {
    const l = level(out[i]);
    if (!l) continue;
    let j = i + 1;
    while (j < out.length && out[j].type === "text" && !(out[j] as { value: string }).value.trim()) j++;
    const next = out[j];
    // The navboxes closing the page aren't under its last heading.
    if (!next || (level(next) && level(next) <= l) || isNavbox(next)) out.splice(i, j - i);
  }
  return out;
}

/** Every `sh-*` element the public wiki knows how to show; any other is left out. */
const KNOWN = new Set([
  "sh-callout",
  "sh-infobox",
  "sh-row",
  "sh-key",
  "sh-value",
  "sh-tabs",
  "sh-tab",
  "sh-columns",
  "sh-column",
  "sh-details",
  "sh-badge",
  "sh-kbd",
  "sh-stats",
  "sh-stat",
  "sh-timeline",
  "sh-milestone",
  "sh-cards",
  "sh-card",
  "sh-card-title",
  "sh-icon",
  "sh-gallery",
  "sh-shot",
  "sh-progress",
  "sh-related",
  "sh-children",
  "sh-toc",
  "sh-steps",
  "sh-step",
  "sh-compare",
  "sh-option",
  "sh-point",
  "sh-quote",
  "sh-embed",
  "sh-boxes",
  "sh-box",
  "sh-table",
  "sh-sheet",
  "sh-diagram",
  "sh-spoiler",
  "sh-cite",
  "sh-references",
  "sh-reference",
  "sh-changelog",
  "sh-change",
  "sh-navbox",
  "sh-navbox-group",
  "sh-navbox-label",
  "sh-navbox-items",
  "sh-navbox-item",
]);

/**
 * References only for the citations still on the page (one in a private block went with it), numbered again in the
 * order they're cited; the list goes when none are left.
 */
function renumberReferences(nodes: RootContent[]): RootContent[] {
  const cites: Element[] = [];
  const walk = (n: RootContent | ElementContent) => {
    if (!isElement(n)) return;
    if (n.tagName === "sh-cite") cites.push(n);
    n.children.forEach(walk);
  };
  nodes.forEach(walk);
  const next = new Map<string, number>();
  const ids = new Map<number, string[]>();
  for (const cite of cites) {
    const old = String(cite.properties.n);
    if (!next.has(old)) next.set(old, next.size + 1);
    const n = next.get(old) as number;
    const seen = ids.get(n) ?? [];
    cite.properties.n = String(n);
    cite.properties.id = seen.length ? `cite-${n}-${seen.length + 1}` : `cite-${n}`;
    ids.set(n, [...seen, String(cite.properties.id)]);
  }
  return nodes.flatMap((node): RootContent[] => {
    if (!isElement(node) || node.tagName !== "sh-references") return [node];
    const kept = elementsIn(node)
      .filter((r) => next.has(String(r.properties.n)))
      .map((r): Element => {
        const n = next.get(String(r.properties.n)) as number;
        return { ...r, properties: { id: `ref-${n}`, n: String(n), cites: (ids.get(n) ?? []).join(" ") } };
      })
      .sort((a, b) => Number(a.properties.n) - Number(b.properties.n));
    return kept.length ? [{ ...node, children: kept }] : [];
  });
}

/** The public copy of a page's hast. */
export function stripPage(tree: Root, ctx: StripContext): Root {
  const copy = structuredClone(tree);
  const children = stripChildren(copy.children as ElementContent[], ctx) as RootContent[];
  return { type: "root", children: dropEmptyHeadings(renumberReferences(children)) };
}

/** An infobox value (frontmatter) cleaned the same way. */
export const stripFragment = (tree: Root, ctx: StripContext): Root => ({
  type: "root",
  children: stripChildren(structuredClone(tree).children as ElementContent[], ctx) as RootContent[],
});

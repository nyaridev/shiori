// Shiori elements: Markdown directives (`:::callout`, `:badge[…]`) that become `sh-*` elements, which the browser
// renders with the app's components. The full syntax reference is docs/elements.md.

import type { BlockContent, Image, ListItem, Node, Paragraph, Parent, PhrasingContent, Root, RootContent } from "mdast";
import type { ContainerDirective, LeafDirective, TextDirective } from "mdast-util-directive";
import { SKIP, visit } from "unist-util-visit";
import { PAGE_STATUSES } from "../../shared/schema.ts";
import { SHEET_NAME } from "../../shared/sheet.ts";
import { iconSet } from "../icons.ts";

type Directive = ContainerDirective | LeafDirective | TextDirective;

interface ElementSpec {
  /** How it's written; a few elements can be either (`::table{src}` reads a file, `:::table` wraps a table). */
  type: Directive["type"] | Directive["type"][];
  tag: string;
  /** Allowed attributes, with their allowed values when the list isn't open-ended. */
  attrs: Record<string, readonly string[] | null>;
  /** The attribute that the `[label]` fills in when it isn't given. */
  label?: string;
  /** Reshapes the node's content; may return more properties for the element (a value worked out from the input). */
  transform?: (
    node: Directive,
    problem: (message: string) => void,
    parent: Parent,
    // biome-ignore lint/suspicious/noConfusingVoidType: most transforms only reshape the node and return nothing.
  ) => Record<string, string> | undefined | void;
}

export const CALLOUT_TONES = ["note", "tip", "warning", "danger"] as const;
export const BADGE_TONES = ["neutral", "accent", "good", "warn", "bad"] as const;
/** A tab can stand out in a color: green for suggestions, amber for what's open, red for problems. */
export const TAB_TONES = ["accent", "good", "warn", "bad"] as const;
/** Where a roadmap's milestone stands. */
export const MILESTONE_STATUSES = ["done", "now", "next", "later"] as const;

export const ELEMENTS: Record<string, ElementSpec> = {
  callout: {
    type: "containerDirective",
    tag: "sh-callout",
    attrs: { tone: CALLOUT_TONES, title: null },
    label: "title",
  },
  infobox: {
    type: "containerDirective",
    tag: "sh-infobox",
    attrs: { title: null, image: null, caption: null },
    label: "title",
    transform: infoboxRows,
  },
  tabs: { type: "containerDirective", tag: "sh-tabs", attrs: {}, transform: onlyTabs },
  tab: { type: "containerDirective", tag: "sh-tab", attrs: { label: null, tone: TAB_TONES }, label: "label" },
  columns: { type: "containerDirective", tag: "sh-columns", attrs: {}, transform: splitColumns },
  details: { type: "containerDirective", tag: "sh-details", attrs: { summary: null }, label: "summary" },
  badge: { type: "textDirective", tag: "sh-badge", attrs: { tone: BADGE_TONES } },
  kbd: { type: "textDirective", tag: "sh-kbd", attrs: {} },
  // Planning: numbers, roadmaps, link hubs, mood boards, progress.
  stats: { type: "containerDirective", tag: "sh-stats", attrs: {}, transform: statTiles },
  timeline: { type: "containerDirective", tag: "sh-timeline", attrs: {}, transform: milestones },
  // A roadmap of milestones (versions, releases or goals), each with its tasks; each viewer picks how it's drawn.
  roadmap: { type: "containerDirective", tag: "sh-roadmap", attrs: {}, transform: roadmapMilestones },
  milestone: {
    type: "containerDirective",
    tag: "sh-roadmap-milestone",
    attrs: { title: null, status: MILESTONE_STATUSES, version: null, when: null, goal: null, icon: null },
    label: "title",
    transform: milestoneTasks,
  },
  cards: { type: "containerDirective", tag: "sh-cards", attrs: {}, transform: linkCards },
  gallery: { type: "containerDirective", tag: "sh-gallery", attrs: {}, transform: galleryShots },
  progress: {
    type: "textDirective",
    tag: "sh-progress",
    attrs: { value: null, max: null },
    transform: checkProgress,
  },
  // Universal elements (ADR-0002): page relations, structure, how-tos, decisions, sources, media.
  related: { type: "leafDirective", tag: "sh-related", attrs: { kind: null } },
  question: { type: "leafDirective", tag: "sh-question", attrs: { id: null }, transform: needsId },
  suggestion: { type: "leafDirective", tag: "sh-suggestion", attrs: { id: null }, transform: needsId },
  children: { type: "leafDirective", tag: "sh-children", attrs: { layout: ["cards", "list"] } },
  toc: { type: "leafDirective", tag: "sh-toc", attrs: {} },
  status: { type: "textDirective", tag: "sh-status", attrs: {}, transform: checkStatus },
  // `:icon[compass]`: one of Shiori's drawn icons, in a sentence, a table or before a card's link.
  icon: { type: "textDirective", tag: "sh-icon", attrs: {}, transform: checkIcon },
  // `:page[Name]` becomes a page chip when wikilinks resolve it (wikilinks.ts).
  page: { type: "textDirective", tag: "sh-page", attrs: {} },
  steps: { type: "containerDirective", tag: "sh-steps", attrs: { title: null }, label: "title", transform: stepItems },
  compare: { type: "containerDirective", tag: "sh-compare", attrs: { pick: null }, transform: compareOptions },
  quote: { type: "containerDirective", tag: "sh-quote", attrs: { by: null, role: null, source: null, url: null } },
  embed: { type: "leafDirective", tag: "sh-embed", attrs: { url: null }, label: "caption", transform: embedSource },
  // A wiki's own home (ADR-0002, the home page): titled boxes in a grid, and blocks that show the whole wiki live.
  boxes: { type: "containerDirective", tag: "sh-boxes", attrs: { columns: ["2", "3", "4"] }, transform: onlyBoxes },
  box: {
    type: "containerDirective",
    tag: "sh-box",
    attrs: { title: null, icon: null, span: ["2", "3"] },
    label: "title",
  },
  "recent-changes": { type: "leafDirective", tag: "sh-recent-changes", attrs: { count: null }, transform: checkCount },
  "open-questions": { type: "leafDirective", tag: "sh-open-questions", attrs: { count: null }, transform: checkCount },
  "open-tasks": { type: "leafDirective", tag: "sh-open-tasks", attrs: { count: null }, transform: checkCount },
  discussions: { type: "leafDirective", tag: "sh-discussions", attrs: { count: null }, transform: checkCount },
  directory: { type: "leafDirective", tag: "sh-directory", attrs: {} },
  // Data (ADR-0008): a table people sort and filter, from a file (`src`), the wiki's pages (`pages`), or the Markdown
  // table inside it. markdown/tables.ts builds the rows.
  table: {
    type: ["leafDirective", "containerDirective"],
    tag: "sh-table",
    attrs: { src: null, pages: null, columns: null, sort: null, stats: null, caption: null },
    label: "caption",
  },
  // A collection's designs (ADR-0006), with the button that makes a new one.
  designs: { type: "leafDirective", tag: "sh-designs", attrs: { collection: null }, transform: needsCollection },
  // The public wiki (ADR-0011): `:::private` and `:private[…]` never leave the app; spoilers hide story secrets until
  // a reader opens them, in the app and the public wiki alike.
  private: {
    type: ["containerDirective", "textDirective"],
    tag: "sh-private",
    attrs: { note: null },
    label: "note",
    transform: markInline,
  },
  spoiler: {
    type: ["containerDirective", "textDirective"],
    tag: "sh-spoiler",
    attrs: { title: null },
    label: "title",
    transform: markInline,
  },
  // A data sheet (ADR-0010): `sheets/<name>.json`, its values editable by the owner and shared by its own link.
  sheet: { type: "leafDirective", tag: "sh-sheet", attrs: { name: null }, transform: needsSheetName },
};

const COLONS: Record<Directive["type"], string> = {
  containerDirective: ":::",
  leafDirective: "::",
  textDirective: ":",
};

/** remark plugin: turn known directives into `sh-*` elements and report misuse into `problems`. */
export function remarkElements(problems: string[], lineOffset = 0) {
  return (tree: Root) => {
    visit(tree, (node, index, parent) => {
      if (!isDirective(node) || !parent || index === undefined) return;
      const line = (node.position?.start.line ?? 0) + lineOffset;
      const problem = (message: string) => problems.push(`line ${line}: ${message}`);
      const spec = ELEMENTS[node.name];

      const types = spec ? [spec.type].flat() : [];
      if (!spec || !types.includes(node.type)) {
        // `time:now` in prose parses as a text directive. Unknown ones go back to being text.
        if (node.type === "textDirective") {
          parent.children.splice(index, 1, { type: "text", value: `:${node.name}` }, ...(node.children as never[]));
          return [SKIP, index];
        }
        problem(
          `unknown element "${COLONS[node.type]}${node.name}"${spec ? ` (use ${types.map((t) => `${COLONS[t]}${node.name}`).join(" or ")})` : ""}`,
        );
        node.data = { hName: "sh-unknown", hProperties: { name: `${COLONS[node.type]}${node.name}` } };
        return;
      }

      const props: Record<string, string> = {};
      for (const [key, value] of Object.entries(node.attributes ?? {})) {
        const allowed = spec.attrs[key];
        if (allowed === undefined) {
          problem(`${node.name}: unknown attribute "${key}"`);
          continue;
        }
        const v = value ?? "";
        if (allowed && !allowed.includes(v)) {
          problem(`${node.name}: ${key}="${v}" isn't one of ${allowed.join(", ")}`);
          continue;
        }
        props[key] = v;
      }
      if (spec.label && node.type === "containerDirective") {
        const first = node.children[0];
        if (first?.type === "paragraph" && first.data?.directiveLabel) {
          node.children.shift();
          props[spec.label] ??= textOf(first);
        }
      }
      // A leaf's `::name[label]` is its whole content.
      if (spec.label && node.type === "leafDirective" && node.children.length) {
        props[spec.label] ??= textOf(node);
        node.children = [];
      }
      const extra = spec.transform?.(node, problem, parent);
      node.data = { hName: spec.tag, hProperties: { ...props, ...(extra ?? {}) } };
    });
  };
}

function isDirective(node: Node): node is Directive {
  return node.type === "containerDirective" || node.type === "leafDirective" || node.type === "textDirective";
}

export function textOf(node: Node): string {
  if ("value" in node && typeof node.value === "string") return node.value;
  if ("children" in node) return (node as Parent).children.map(textOf).join("");
  return "";
}

/** An mdast node that becomes the `hName` element. */
const el = (hName: string, children: unknown[], hProperties: Record<string, string> = {}) =>
  ({ type: hName, data: { hName, hProperties }, children }) as unknown as RootContent;

/** A list item "Key: rest…" → the key and the item's content without it; no key when there's no colon. */
function splitKey(item: ListItem): { key: string | null; body: RootContent[] } {
  const [first, ...rest] = item.children;
  const head = first?.type === "paragraph" ? first.children[0] : undefined;
  if (first?.type === "paragraph" && head?.type === "text") {
    const colon = head.value.indexOf(":");
    if (colon > 0) {
      const phrasing: PhrasingContent[] = [
        { type: "text", value: head.value.slice(colon + 1).trimStart() },
        ...first.children.slice(1),
      ];
      return { key: head.value.slice(0, colon).trim(), body: [{ type: "paragraph", children: phrasing }, ...rest] };
    }
  }
  return { key: null, body: item.children };
}

/** The list items of a list-only element; anything else is reported and dropped. */
function items(node: Directive, problem: (message: string) => void, hint: string): ListItem[] {
  const out: ListItem[] = [];
  for (const child of node.children as RootContent[]) {
    if (child.type === "list") out.push(...child.children);
    else problem(`${node.name}: ${hint}`);
  }
  return out;
}

/** Infobox lists become rows: `- Health: 20` → key "Health", value "20". */
function infoboxRows(node: Directive) {
  const out: RootContent[] = [];
  for (const child of node.children as RootContent[]) {
    if (child.type === "list") out.push(...child.children.map(row));
    else out.push(child);
  }
  node.children = out as BlockContent[];
}

function row(item: ListItem): RootContent {
  const { key, body } = splitKey(item);
  if (key === null) return el("sh-row", [el("sh-value", item.children)]);
  const [value, ...rest] = body as [Paragraph, ...RootContent[]];
  return el("sh-row", [el("sh-key", [{ type: "text", value: key }]), el("sh-value", [...value.children, ...rest])]);
}

function onlyTabs(node: Directive, problem: (message: string) => void) {
  const strays = (node.children as RootContent[]).filter((c) => !(c.type === "containerDirective" && c.name === "tab"));
  if (strays.length) problem('tabs: put all content inside ":::tab[Label]" blocks (and use "::::tabs" outside)');
  node.children = node.children.filter((c) => !strays.includes(c as RootContent)) as never;
}

/**
 * Roadmap: only `:::milestone` blocks. A milestone without a `status` gets one from its tasks: all ticked is done, the
 * first one that isn't is now (unless another one says it is), the rest are next.
 */
function roadmapMilestones(node: Directive, problem: (message: string) => void) {
  const all = node.children as RootContent[];
  const list = all.filter((c): c is ContainerDirective => c.type === "containerDirective" && c.name === "milestone");
  if (list.length < all.length) {
    problem('roadmap: put all content inside ":::milestone[Name]" blocks (and use "::::roadmap" outside)');
  }
  if (!list.length) problem('roadmap: add milestones, as ":::milestone[Prototype]{version="0.1"}"');
  const nows = list.filter((m) => m.attributes?.status === "now").length;
  if (nows > 1) problem("roadmap: only one milestone can be now");
  let reachedNow = nows > 0;
  for (const m of list) {
    if (m.attributes?.status) continue;
    const { done, total } = countTasks(m);
    let status = "next";
    if (total > 0 && done === total) status = "done";
    else if (!reachedNow) {
      status = "now";
      reachedNow = true;
    }
    m.attributes = { ...m.attributes, status };
  }
  node.children = list;
}

/** A milestone's tasks, ticked and all, for its progress. */
function milestoneTasks(node: Directive, problem: (message: string) => void, parent: Parent) {
  if (!(parent.type === "containerDirective" && (parent as ContainerDirective).name === "roadmap")) {
    problem('milestone: put it inside a "::::roadmap" block');
  }
  const { done, total } = countTasks(node);
  return { done: String(done), total: String(total) };
}

function countTasks(node: Node) {
  let done = 0;
  let total = 0;
  visit(node, "listItem", (item: ListItem) => {
    if (typeof item.checked !== "boolean") return;
    total++;
    if (item.checked) done++;
  });
  return { done, total };
}

function onlyBoxes(node: Directive, problem: (message: string) => void) {
  const strays = (node.children as RootContent[]).filter((c) => !(c.type === "containerDirective" && c.name === "box"));
  if (strays.length) problem('boxes: put all content inside ":::box[Title]" blocks (and use "::::boxes" outside)');
  node.children = node.children.filter((c) => !strays.includes(c as RootContent)) as never;
}

function checkIcon(node: Directive, problem: (message: string) => void) {
  const name = textOf(node).trim();
  if (!iconSet().has(name)) problem(`icon: "${name}" isn't in Shiori's icon set (Toolbox → Icons lists them)`);
  node.children = [];
  return { name };
}

function needsCollection(node: Directive, problem: (message: string) => void) {
  if (!node.attributes?.collection) problem('designs: name the collection, as ::designs{collection="mobs"}');
}

function needsSheetName(node: Directive, problem: (message: string) => void) {
  const name = node.attributes?.name;
  if (!name) problem('sheet: name the sheet, as ::sheet{name="mobs"} for sheets/mobs.json');
  else if (!SHEET_NAME.test(name)) problem(`sheet: "${name}" isn't a sheet's name (lowercase letters, digits and -)`);
}

/** How many entries a home block lists: 1 to 50. */
function checkCount(node: Directive, problem: (message: string) => void) {
  const count = node.attributes?.count;
  if (count != null && !/^([1-9]|[1-4]\d|50)$/.test(count)) problem(`${node.name}: count is a number from 1 to 50`);
}

/** An element written both ways says which: `:private[…]` in a sentence, `:::private` around blocks. */
function markInline(node: Directive) {
  if (node.type === "textDirective") return { inline: "" };
}

/** Columns are separated by `---` lines. */
function splitColumns(node: Directive) {
  const columns: RootContent[][] = [[]];
  for (const child of node.children as RootContent[]) {
    if (child.type === "thematicBreak") columns.push([]);
    else columns[columns.length - 1].push(child);
  }
  node.children = columns.map(
    (children) => ({ type: "ldColumn", data: { hName: "sh-column" }, children }) as unknown,
  ) as BlockContent[];
}

/** Stats: `- Subscribers: 12.4k | +8% this month` → a tile with its label, value and change. */
function statTiles(node: Directive, problem: (message: string) => void) {
  const tiles: RootContent[] = [];
  for (const item of items(node, problem, 'write each stat as a list item, "- Label: value | change"')) {
    const text = textOf(item).trim();
    const colon = text.indexOf(":");
    if (colon <= 0) {
      problem(`stats: "${text}" needs a label, as "Label: value"`);
      continue;
    }
    const [value = "", change = ""] = text
      .slice(colon + 1)
      .split("|")
      .map((part) => part.trim());
    const trend = /^[+↑]/.test(change) ? "up" : /^[-−↓]/.test(change) ? "down" : "flat";
    tiles.push(el("sh-stat", [], { label: text.slice(0, colon).trim(), value, change, trend }));
  }
  node.children = tiles as BlockContent[];
}

/** Timeline: `- [x] March: Prototype` → milestones. Ticked ones are done, the first open one is now. */
function milestones(node: Directive, problem: (message: string) => void) {
  const out: RootContent[] = [];
  let reachedNow = false;
  for (const item of items(node, problem, 'write each milestone as a list item, "- [ ] When: what"')) {
    let state = "item";
    if (item.checked === true) state = "done";
    else if (item.checked === false) {
      state = reachedNow ? "next" : "now";
      reachedNow = true;
    }
    const { key, body } = splitKey(item);
    out.push(el("sh-milestone", body, key === null ? { state } : { when: key, state }));
  }
  node.children = out as BlockContent[];
}

/** Cards: `- 🎯 [Goals](goals) — what we aim for` → a card: optional emoji, the link as its title, a description. */
function linkCards(node: Directive, problem: (message: string) => void) {
  const out: RootContent[] = [];
  for (const item of items(node, problem, 'write each card as a list item, "- [Title](page) — description"')) {
    const [first, ...rest] = item.children;
    const at = first?.type === "paragraph" ? first.children.findIndex((c) => c.type === "link") : -1;
    if (first?.type !== "paragraph" || at < 0) {
      problem(`cards: "${textOf(item).trim()}" needs a link, as "- [Title](page) — description"`);
      continue;
    }
    const icon = first.children.slice(0, at).map(textOf).join("").trim();
    const after = first.children.slice(at + 1);
    if (after[0]?.type === "text") {
      after[0] = { ...after[0], value: after[0].value.replace(/^\s*[—–:-]\s*/, "") };
    }
    const description = after.some((c) => textOf(c).trim()) ? [{ type: "paragraph", children: after }] : [];
    out.push(el("sh-card", [el("sh-card-title", [first.children[at]]), ...description, ...rest], icon ? { icon } : {}));
  }
  node.children = out as BlockContent[];
}

/** Gallery: images, one per line or several on a line → tiles. The image's title, else its alt text, is the caption. */
function galleryShots(node: Directive, problem: (message: string) => void) {
  const shots: RootContent[] = [];
  visit(node, "image", (image: Image) => {
    shots.push(el("sh-shot", [image], { caption: image.title || image.alt || "" }));
  });
  if (!shots.length) problem("gallery: add images, one per line: ![Caption](/assets/picture.png)");
  node.children = shots as BlockContent[];
}

/** Progress: `:progress[Launch]{value="60"}`, out of 100 unless `max` says otherwise. */
function checkProgress(node: Directive, problem: (message: string) => void) {
  const value = Number(node.attributes?.value);
  const max = Number(node.attributes?.max ?? 100);
  if (node.attributes?.value == null || !Number.isFinite(value) || !(max > 0)) {
    problem('progress: give it a number, as :progress[Label]{value="60"} (out of max="100")');
  }
}

/** `:status[active]`: one of the page statuses. */
function checkStatus(node: Directive, problem: (message: string) => void) {
  const value = textOf(node).trim().toLowerCase();
  if (!(PAGE_STATUSES as readonly string[]).includes(value)) {
    problem(`status: "${value}" isn't one of ${PAGE_STATUSES.join(", ")}`);
  }
  return { value };
}

/** Steps: a list, `- Title: what to do` or just `- what to do` → numbered steps. */
function stepItems(node: Directive, problem: (message: string) => void) {
  node.children = items(node, problem, 'write each step as a list item, "1. Title: what to do"').map((item) => {
    const { key, body } = splitKey(item);
    return el("sh-step", key === null ? item.children : body, key === null ? {} : { title: key });
  }) as BlockContent[];
}

const POINT_KINDS: Record<string, string> = {
  pro: "pro",
  pros: "pro",
  "+": "pro",
  con: "con",
  cons: "con",
  "-": "con",
};

/**
 * Compare: options side by side, each under a heading, with `- Pro: …` and `- Con: …` points (any other `Key: …` is
 * a plain fact). `pick` marks the chosen option.
 */
function compareOptions(node: Directive, problem: (message: string) => void) {
  const options: { name: string; children: RootContent[] }[] = [];
  for (const child of node.children as RootContent[]) {
    if (child.type === "heading") {
      options.push({ name: textOf(child).trim(), children: [] });
      continue;
    }
    const current = options[options.length - 1];
    if (!current) {
      problem('compare: start each option with a heading, as "### Option name"');
      continue;
    }
    if (child.type !== "list") {
      current.children.push(child);
      continue;
    }
    for (const item of child.children) {
      const { key, body } = splitKey(item);
      const kind = key === null ? "note" : (POINT_KINDS[key.toLowerCase()] ?? "note");
      const props: Record<string, string> = { kind };
      if (key !== null && kind === "note") props.label = key;
      current.children.push(el("sh-point", kind === "note" && key === null ? item.children : body, props));
    }
  }
  if (options.length < 2) problem("compare: give at least two options, each under its own heading");
  const pick = node.attributes?.pick?.trim().toLowerCase();
  if (pick && !options.some((o) => o.name.toLowerCase() === pick)) {
    problem(
      `compare: pick="${node.attributes?.pick}" isn't one of the options (${options.map((o) => o.name).join(", ")})`,
    );
  }
  node.children = options.map((o) =>
    el("sh-option", o.children, o.name.toLowerCase() === pick ? { name: o.name, picked: "" } : { name: o.name }),
  ) as BlockContent[];
}

/** Hosts `::embed` plays from, and how each turns a page URL into its player. */
const EMBEDS: { provider: string; match: RegExp; src: (m: RegExpMatchArray, url: string) => string }[] = [
  {
    provider: "YouTube",
    match:
      /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/,
    src: (m) => `https://www.youtube-nocookie.com/embed/${m[1]}`,
  },
  {
    provider: "Vimeo",
    match: /^https?:\/\/(?:www\.)?vimeo\.com\/(\d+)/,
    src: (m) => `https://player.vimeo.com/video/${m[1]}`,
  },
  {
    provider: "Figma",
    match: /^https:\/\/(?:www\.)?figma\.com\/(?:file|design|proto|board)\//,
    src: (_m, url) => `https://www.figma.com/embed?embed_host=shiori&url=${encodeURIComponent(url)}`,
  },
];

/** Embed: a video or design from an allowed host, played in place. */
function embedSource(node: Directive, problem: (message: string) => void) {
  const url = node.attributes?.url?.trim() ?? "";
  for (const e of EMBEDS) {
    const m = url.match(e.match);
    if (m) return { src: e.src(m, url), provider: e.provider };
  }
  problem(`embed: "${url}" isn't a YouTube, Vimeo or Figma link`);
}

/**
 * `::question{id=q1}` and `::suggestion{id=s1}` place a question or a suggestion from the page's frontmatter; the page
 * checks the id exists.
 */
function needsId(node: Directive, problem: (message: string) => void) {
  if (!node.attributes?.id) problem(`${node.name}: give its id, as ::${node.name}{id=${node.name[0]}1}`);
}

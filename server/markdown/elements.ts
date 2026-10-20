// Shiori elements: Markdown directives (`:::callout`, `:badge[…]`) that become `sh-*` elements, which the browser
// renders with the app's components. The full syntax reference is docs/elements.md.
import type { BlockContent, ListItem, Node, Parent, PhrasingContent, Root, RootContent } from "mdast";
import type { ContainerDirective, LeafDirective, TextDirective } from "mdast-util-directive";
import { SKIP, visit } from "unist-util-visit";

type Directive = ContainerDirective | LeafDirective | TextDirective;

interface ElementSpec {
  type: Directive["type"];
  tag: string;
  /** Allowed attributes, with their allowed values when the list isn't open-ended. */
  attrs: Record<string, readonly string[] | null>;
  /** The attribute that the `[label]` fills in when it isn't given. */
  label?: string;
  transform?: (node: Directive, problem: (message: string) => void) => void;
}

export const CALLOUT_TONES = ["note", "tip", "warning", "danger"] as const;
export const BADGE_TONES = ["neutral", "accent", "good", "warn", "bad"] as const;

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
  tab: { type: "containerDirective", tag: "sh-tab", attrs: { label: null }, label: "label" },
  columns: { type: "containerDirective", tag: "sh-columns", attrs: {}, transform: splitColumns },
  details: { type: "containerDirective", tag: "sh-details", attrs: { summary: null }, label: "summary" },
  badge: { type: "textDirective", tag: "sh-badge", attrs: { tone: BADGE_TONES } },
  kbd: { type: "textDirective", tag: "sh-kbd", attrs: {} },
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

      if (!spec || spec.type !== node.type) {
        // `time:now` in prose parses as a text directive. Unknown ones go back to being text.
        if (node.type === "textDirective") {
          parent.children.splice(index, 1, { type: "text", value: `:${node.name}` }, ...(node.children as never[]));
          return [SKIP, index];
        }
        problem(
          `unknown element "${COLONS[node.type]}${node.name}"${spec ? ` (use ${COLONS[spec.type]}${node.name})` : ""}`,
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
      spec.transform?.(node, problem);
      node.data = { hName: spec.tag, hProperties: props };
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
  const make = (type: string, hName: string, children: unknown[]) =>
    ({ type, data: { hName }, children }) as unknown as RootContent;
  const [first, ...rest] = item.children;
  const head = first?.type === "paragraph" ? first.children[0] : undefined;
  if (first?.type === "paragraph" && head?.type === "text") {
    const colon = head.value.indexOf(":");
    if (colon > 0) {
      const value: PhrasingContent[] = [{ type: "text", value: head.value.slice(colon + 1).trimStart() }];
      value.push(...first.children.slice(1));
      return make("ldRow", "sh-row", [
        make("ldKey", "sh-key", [{ type: "text", value: head.value.slice(0, colon).trim() }]),
        make("ldValue", "sh-value", [...value, ...rest]),
      ]);
    }
  }
  return make("ldRow", "sh-row", [make("ldValue", "sh-value", item.children)]);
}

function onlyTabs(node: Directive, problem: (message: string) => void) {
  const strays = (node.children as RootContent[]).filter((c) => !(c.type === "containerDirective" && c.name === "tab"));
  if (strays.length) problem('tabs: put all content inside ":::tab[Label]" blocks (and use "::::tabs" outside)');
  node.children = node.children.filter((c) => !strays.includes(c as RootContent)) as never;
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

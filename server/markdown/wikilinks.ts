// Wikilinks (ADR-0002): `[[Page]]`, `[[folder/page|label]]`, `[[Page#Section|label]]`. The target is found by path,
// then by file name, then by title, so `[[Goals]]` works from anywhere. A link to a page that doesn't exist yet stays
// a link, a "red link" as on Wikipedia: it marks a page worth writing. Inside tables, escape the bar: `[[page\|label]]`.
import type { Link, Parent, PhrasingContent, Root, Text } from "mdast";
import type { TextDirective } from "mdast-util-directive";
import { visit } from "unist-util-visit";
import { textOf } from "./elements.ts";

export interface PageRef {
  path: string;
  title: string;
}

/** What a wikilink found: the page, or nothing; `others` are further pages that matched as well as it did. */
export interface Found {
  page: PageRef | null;
  others: PageRef[];
}

export const WIKILINK = /\[\[([^[\]|#]+?)(#[^[\]|]+)?(?:\|([^[\]]+))?\]\]/g;

/** A heading's anchor as rehype-slug makes it, and a page name as a file name: lowercase, punctuation dropped, dashes. */
export const slug = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");

/** Adjacent text nodes (a table cell's escaped `\|` splits them) become one, so a wikilink is never cut in two. */
function mergeText(parent: Parent) {
  const out: Parent["children"] = [];
  for (const child of parent.children) {
    const last = out[out.length - 1];
    if (child.type === "text" && last?.type === "text") last.value += child.value;
    else out.push(child);
  }
  parent.children = out;
}

/** remark plugin. `find` resolves what the author wrote; ambiguous names are reported into `problems`. */
export function remarkWikilinks(find: (name: string) => Found, problems: string[], lineOffset = 0) {
  /** The link for a name, as written, with the page's title (or the name) as its text. */
  const linkTo = (name: string, hash: string, label: string | undefined, line: number, chip: boolean): Link => {
    const { page, others } = find(name);
    if (page && others.length) {
      const all = [page, ...others].map((p) => p.path || "(home)").join(", ");
      problems.push(`line ${line}: [[${name}]] matches several pages (${all}); write its path`);
    }
    // A page not written yet gets a tidy path from its name: [[Character Creation]] → /character-creation.
    const path = page ? page.path : name.split("/").map(slug).join("/");
    return {
      type: "link",
      url: `/${path}${hash ? `#${slug(hash)}` : ""}`,
      children: [{ type: "text", value: (label ?? page?.title ?? name).trim() }],
      data: { hProperties: chip ? { dataWikilink: "", dataChip: "" } : { dataWikilink: "" } },
    };
  };

  return (tree: Root) => {
    // `:page[Name]` is a wikilink shown as a chip.
    visit(tree, "textDirective", (node: TextDirective, index, parent) => {
      if (node.name !== "page" || !parent || index === undefined) return;
      const [name, hash = ""] = textOf(node).trim().split("#");
      const line = (node.position?.start.line ?? 0) + lineOffset;
      parent.children[index] = linkTo(name.trim(), hash, undefined, line, true);
    });

    visit(tree, (node) => {
      if (!("children" in node) || node.type === "link" || node.type === "linkReference") return;
      const parent = node as Parent;
      if (!parent.children.some((c) => c.type === "text" && c.value.includes("[["))) return;
      mergeText(parent);
      parent.children = parent.children.flatMap((child) => {
        if (child.type !== "text" || !child.value.includes("[[")) return [child];
        const line = (child.position?.start.line ?? parent.position?.start.line ?? 0) + lineOffset;
        const parts: PhrasingContent[] = [];
        let at = 0;
        for (const m of child.value.matchAll(WIKILINK)) {
          const [whole, raw, hash = "", label] = m;
          const name = raw.trim();
          if (m.index > at) parts.push({ type: "text", value: child.value.slice(at, m.index) });
          parts.push(linkTo(name, hash.slice(1), label, line, false));
          at = m.index + whole.length;
        }
        if (at < child.value.length) parts.push({ type: "text", value: child.value.slice(at) } as Text);
        return parts;
      }) as Parent["children"];
    });
  };
}

// References, as on a game wiki: footnotes (`[^src]` in the text, `[^src]: Where it's from.` anywhere in the page)
// become numbered citations, `sh-cite`, and a list at the end of the article, `sh-references`. The list goes under
// the page's last heading when nothing is written under it (`## References`, or the same in the wiki's language);
// otherwise it gets a "References" heading of its own. Navboxes at the very end stay after it.
import type { Element, ElementContent, Root, RootContent } from "hast";
import { visit } from "unist-util-visit";

const isElement = (n: unknown): n is Element => (n as Element)?.type === "element";
const isBlank = (n: RootContent | ElementContent) => n.type === "text" && !n.value.trim();
export const isNavbox = (n: RootContent | ElementContent) => isElement(n) && n.tagName === "sh-navbox";

/** What a citation previews: the reference's words, without private notes, spoilers or the way back. */
function plain(nodes: ElementContent[]): string {
  return nodes
    .map((n) => {
      if (n.type === "text") return n.value;
      if (!isElement(n) || n.tagName === "sh-private" || n.tagName === "sh-spoiler") return "";
      if (n.properties.dataFootnoteBackref !== undefined) return "";
      return plain(n.children);
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/** The footnote's content without remark's ↩ links; a single paragraph is unwrapped, so it reads as one line. */
function content(li: Element): ElementContent[] {
  const strip = (nodes: ElementContent[]): ElementContent[] =>
    nodes
      .filter((n) => !(isElement(n) && n.properties.dataFootnoteBackref !== undefined))
      .map((n) => (isElement(n) ? { ...n, children: strip(n.children) } : n));
  const kept = strip(li.children).filter((n) => !isBlank(n));
  const only = kept.length === 1 && isElement(kept[0]) && kept[0].tagName === "p" ? [...kept[0].children] : kept;
  // remark puts a space before the ↩ it adds.
  while (only.length && isBlank(only[only.length - 1])) only.pop();
  const last = only[only.length - 1];
  if (last?.type === "text") last.value = last.value.trimEnd();
  return only;
}

/** An id no element of the page has yet. */
function freeId(tree: Root, want: string): string {
  const taken = new Set<string>();
  visit(tree, "element", (el) => {
    if (typeof el.properties.id === "string") taken.add(el.properties.id);
  });
  let id = want;
  for (let i = 1; taken.has(id); i++) id = `${want}-${i}`;
  return id;
}

/** rehype plugin, after the headings have their ids. */
export function rehypeReferences() {
  return (tree: Root) => {
    const at = tree.children.findIndex(
      (n) => isElement(n) && n.tagName === "section" && n.properties.dataFootnotes !== undefined,
    );
    if (at < 0) return;
    const [section] = tree.children.splice(at, 1) as Element[];
    const list = section.children.find((c): c is Element => isElement(c) && c.tagName === "ol");
    const items = (list?.children ?? []).filter((c): c is Element => isElement(c) && c.tagName === "li");
    if (!items.length) return;

    // remark numbers footnotes by their first citation; the list is already in that order.
    const numberOf = new Map(items.map((li, i) => [String(li.properties.id), i + 1]));
    const notes = items.map((li) => plain(li.children));
    const cites = new Map<number, string[]>();
    visit(tree, "element", (el, index, parent) => {
      if (el.tagName !== "sup" || !parent || index === undefined) return;
      const a = el.children.find((c): c is Element => isElement(c) && c.properties.dataFootnoteRef !== undefined);
      const n = a && numberOf.get(String(a.properties.href).replace(/^#/, ""));
      if (!n) return;
      const ids = cites.get(n) ?? [];
      const id = ids.length ? `cite-${n}-${ids.length + 1}` : `cite-${n}`;
      cites.set(n, [...ids, id]);
      parent.children[index] = {
        type: "element",
        tagName: "sh-cite",
        properties: { id, n: String(n), note: notes[n - 1] },
        children: [],
      };
    });

    const references: Element = {
      type: "element",
      tagName: "sh-references",
      properties: {},
      children: items.map((li, i) => ({
        type: "element",
        tagName: "sh-reference",
        properties: { id: `ref-${i + 1}`, n: String(i + 1), cites: (cites.get(i + 1) ?? []).join(" ") },
        children: content(li),
      })),
    };

    // Before the navboxes that close the page; under its last heading when that heading is still empty.
    let end = tree.children.length;
    while (end > 0 && (isBlank(tree.children[end - 1]) || isNavbox(tree.children[end - 1]))) end--;
    let last = -1;
    for (let i = 0; i < end; i++) {
      const n = tree.children[i];
      if (isElement(n) && n.tagName === "h2") last = i;
    }
    const empty = last >= 0 && tree.children.slice(last + 1, end).every(isBlank);
    const heading: Element = {
      type: "element",
      tagName: "h2",
      properties: { id: freeId(tree, "references") },
      children: [{ type: "text", value: "References" }],
    };
    tree.children.splice(end, 0, ...(empty ? [references] : [heading, references]));
  };
}

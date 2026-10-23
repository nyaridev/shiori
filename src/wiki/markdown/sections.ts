// A page's Markdown cut at its `##` headings: layouts place the parts in their areas (ADR-0006), and a plain page
// shows each part as a panel (Section.tsx) that folds, says when it changed, and takes feedback.
import type { Element, Root, RootContent } from "hast";

export interface Section {
  heading: string;
  /** The heading's id, its anchor in links and the contents. */
  anchor: string;
  nodes: RootContent[];
}

const textOf = (node: RootContent): string =>
  node.type === "text" ? node.value : "children" in node ? node.children.map(textOf).join("") : "";

/** The Markdown before its first `##`, and each `##` section with its heading. */
export function split(hast: Root): { intro: RootContent[]; sections: Section[] } {
  const intro: RootContent[] = [];
  const sections: Section[] = [];
  for (const node of hast.children) {
    if (node.type === "element" && node.tagName === "h2")
      sections.push({ heading: textOf(node).trim(), anchor: String(node.properties.id ?? ""), nodes: [node] });
    else if (sections.length) sections[sections.length - 1].nodes.push(node);
    else intro.push(node);
  }
  return { intro, sections };
}

/** A short fingerprint of some text (FNV-1a), to tell whether a section changed between two visits. */
function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

/** The text before the first `##`, in `fingerprints`. */
export const INTRO = "_intro";

/** Each section's fingerprint by anchor, and the intro's under `INTRO`. */
export function fingerprints(hast: Root): Record<string, string> {
  const { intro, sections } = split(hast);
  const out: Record<string, string> = {};
  if (intro.length) out[INTRO] = fingerprint(intro.map(textOf).join(""));
  for (const s of sections) out[s.anchor] = fingerprint(s.nodes.map(textOf).join(""));
  return out;
}

/**
 * The page with each `##` section wrapped as an `sh-section` element (Section.tsx): its heading, then a body with
 * the rest. It carries the heading's anchor and text.
 */
export function sectioned(hast: Root): Root {
  // The navboxes that close the page come after its last section, not inside it.
  const all = hast.children;
  let end = all.length;
  const navbox = (n: RootContent) => n.type === "element" && n.tagName === "sh-navbox";
  while (end > 0 && (navbox(all[end - 1]) || (all[end - 1].type === "text" && !textOf(all[end - 1]).trim()))) end--;
  const outro = all.slice(end);
  const { intro, sections } = split({ ...hast, children: all.slice(0, end) });
  if (!sections.length) return hast;
  const body = (children: RootContent[]): Element => ({
    type: "element",
    tagName: "div",
    properties: { className: ["sh-section-body"] },
    children: children as Element["children"],
  });
  return {
    type: "root",
    children: [
      ...intro,
      ...sections.map(
        ({ anchor, heading, nodes: [h2, ...rest] }): Element => ({
          type: "element",
          tagName: "sh-section",
          properties: { anchor, heading },
          children: [h2 as Element, body(rest)],
        }),
      ),
      ...outro,
    ],
  };
}

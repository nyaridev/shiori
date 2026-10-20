// Maps between a page container's text and DOM Ranges. Text inside `[data-noquote]` (tab buttons…) is skipped, so
// anchors only cover page content.

export interface TextIndex {
  text: string;
  nodes: { node: Text; start: number }[];
}

export function textIndex(root: HTMLElement): TextIndex {
  const nodes: TextIndex["nodes"] = [];
  let text = "";
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.parentElement?.closest("[data-noquote]") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    nodes.push({ node: n as Text, start: text.length });
    text += (n as Text).data;
  }
  return { text, nodes };
}

function locate(index: TextIndex, offset: number, preferNext: boolean): { node: Text; offset: number } | null {
  for (let i = 0; i < index.nodes.length; i++) {
    const { node, start } = index.nodes[i];
    const end = start + node.data.length;
    if (offset < end || (offset === end && !(preferNext && i + 1 < index.nodes.length))) {
      return { node, offset: offset - start };
    }
  }
  return null;
}

export function rangeAt(index: TextIndex, start: number, end: number): Range | null {
  const a = locate(index, start, true);
  const b = locate(index, end, false);
  if (!a || !b) return null;
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  return range;
}

function offsetOf(index: TextIndex, node: Node, offset: number): number | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const hit = index.nodes.find((n) => n.node === node);
    return hit ? hit.start + offset : null;
  }
  // An element boundary: the first indexed text node at or after that child.
  const child = node.childNodes[offset] ?? null;
  for (const n of index.nodes) {
    if (child ? child === n.node || child.contains(n.node) || isAfter(n.node, child) : isAfter(n.node, node)) {
      return n.start;
    }
  }
  return index.text.length;
}

function isAfter(a: Node, b: Node) {
  return Boolean(b.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING) && !b.contains(a);
}

/** A Range → [start, end) in the index, trimmed of surrounding whitespace. Null when empty or outside. */
export function offsetsOf(index: TextIndex, range: Range): { start: number; end: number } | null {
  let start = offsetOf(index, range.startContainer, range.startOffset);
  let end = offsetOf(index, range.endContainer, range.endOffset);
  if (start === null || end === null) return null;
  while (start < end && /\s/.test(index.text[start])) start++;
  while (end > start && /\s/.test(index.text[end - 1])) end--;
  return end > start ? { start, end } : null;
}

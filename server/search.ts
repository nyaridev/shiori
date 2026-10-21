// Search inside a wiki. Each page is cut into sections at its `##`/`###` headings and kept in memory (rebuilt when
// pages change, never written to disk). Every word of the query must appear somewhere in a page; matches count most
// in the title, then headings, then the summary and tags, then the text, and more at the start of a word. Accents
// and case don't matter. The best section of each page is the hit, with a snippet around the match.
import type { Element, ElementContent, Root, RootContent } from "hast";
import type { PageData, SearchHit } from "../shared/api.ts";

export interface Section {
  /** The heading's anchor; null for the text before the first heading. */
  id: string | null;
  heading: string;
  text: string;
}

export interface SearchDoc {
  path: string;
  title: string;
  icon?: string;
  summary: string;
  tags: string[];
  sections: Section[];
}

const WEIGHT = { title: 12, heading: 6, meta: 4, text: 1 };
/** A page whose every word sits in one section ranks above one where they're scattered. */
const TOGETHER = 3;
const SNIPPET = 150;

/** Lowercased, without accents, and where each folded character came from in the original text. */
export function fold(text: string): { folded: string; from: number[] } {
  let folded = "";
  const from: number[] = [];
  let at = 0;
  for (const ch of text) {
    const f = ch.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    for (let i = 0; i < f.length; i++) from.push(at);
    folded += f;
    at += ch.length;
  }
  from.push(at);
  return { folded, from };
}

const isWordChar = (ch: string | undefined) => !!ch && /[\p{L}\p{N}]/u.test(ch);

export function terms(query: string): string[] {
  return [
    ...new Set(
      fold(query)
        .folded.split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean),
    ),
  ];
}

/** Every place `term` occurs in `folded`. */
function occurrences(folded: string, term: string): number[] {
  const out: number[] = [];
  for (let i = folded.indexOf(term); i >= 0; i = folded.indexOf(term, i + term.length)) out.push(i);
  return out;
}

/** How much `term` adds in a field of the given weight: more at the start of a word, a little more if repeated. */
function score(folded: string, term: string, weight: number): number {
  const found = occurrences(folded, term);
  if (!found.length) return 0;
  const atWordStart = found.some((i) => !isWordChar(folded[i - 1]));
  return weight * (atWordStart ? 1.5 : 1) * (1 + Math.min(found.length - 1, 3) * 0.2);
}

/** The ranges of `text` (original positions) where any of `words` occur, merged and sorted. */
export function marksIn(text: string, words: string[]): [number, number][] {
  const { folded, from } = fold(text);
  const ranges = words
    .flatMap((w) => occurrences(folded, w).map((i) => [from[i], from[i + w.length]] as [number, number]))
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}

/** About `SNIPPET` characters of `text` around the first match, cut at spaces, with the matches marked. */
export function snippet(text: string, words: string[]): { snippet: string; marks: [number, number][] } {
  const { folded, from } = fold(text);
  const first = Math.min(...words.map((w) => folded.indexOf(w)).filter((i) => i >= 0), Number.POSITIVE_INFINITY);
  let start = Number.isFinite(first) ? Math.max(0, first - 40) : 0;
  let end = Math.min(folded.length, start + SNIPPET);
  if (end === folded.length) start = Math.max(0, end - SNIPPET);
  if (start > 0) {
    const space = folded.indexOf(" ", start);
    if (space >= 0 && space < start + 20) start = space + 1;
  }
  if (end < folded.length) {
    const space = folded.lastIndexOf(" ", end);
    if (space > start + 20) end = space;
  }
  const lead = start > 0 ? "…" : "";
  const piece = text.slice(from[start], from[end]).trim();
  const marks = marksIn(piece, words).map(([a, b]) => [a + lead.length, b + lead.length] as [number, number]);
  return { snippet: `${lead}${piece}${end < folded.length ? "…" : ""}`, marks };
}

// Text of rendered hast. Elements carry some of their text in properties (a stat's label, a milestone's date).
const TEXT_PROPS = ["label", "value", "change", "when", "caption", "title", "summary", "alt"];
const isBlock = (tag: string) => /^(p|li|h[1-6]|td|th|tr|pre|blockquote|figcaption|sh-.*)$/.test(tag);

function textOf(node: Root | RootContent | ElementContent): string {
  if (node.type === "text") return node.value;
  if (node.type !== "element" && node.type !== "root") return "";
  const own =
    node.type === "element" ? TEXT_PROPS.map((k) => node.properties[k]).filter((v) => typeof v === "string") : [];
  const inner = node.children.map(textOf).join("");
  const text = [...own, inner].join(" ");
  return node.type === "element" && isBlock(node.tagName) ? ` ${text} ` : text;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** A rendered page → its search entry, cut into sections at the `##`/`###` headings. */
export function indexPage(page: Pick<PageData, "path" | "title" | "icon" | "summary" | "tags" | "hast">): SearchDoc {
  const sections: Section[] = [{ id: null, heading: "", text: "" }];
  for (const node of page.hast.children) {
    const el = node as Element;
    if (el.type === "element" && (el.tagName === "h2" || el.tagName === "h3")) {
      sections.push({ id: el.properties.id ? String(el.properties.id) : null, heading: clean(textOf(el)), text: "" });
    } else sections[sections.length - 1].text += textOf(node);
  }
  for (const s of sections) s.text = clean(s.text);
  return {
    path: page.path,
    title: page.title,
    icon: page.icon,
    summary: page.summary,
    tags: page.tags,
    sections: sections.filter((s, i) => i > 0 || s.text),
  };
}

export function search(docs: SearchDoc[], query: string, limit = 20): SearchHit[] {
  const words = terms(query);
  if (!words.length) return [];
  const scored: { hit: SearchHit; score: number }[] = [];
  for (const doc of docs) {
    const title = fold(doc.title).folded;
    const meta = fold([doc.summary, ...doc.tags].join(" ")).folded;
    const sections = doc.sections.map((s) => ({ s, head: fold(s.heading).folded, text: fold(s.text).folded }));
    const inPage = (w: string) =>
      title.includes(w) || meta.includes(w) || sections.some((x) => x.head.includes(w) || x.text.includes(w));
    if (!words.every(inPage)) continue;

    let total = words.reduce((sum, w) => sum + score(title, w, WEIGHT.title) + score(meta, w, WEIGHT.meta), 0);
    let best: (typeof sections)[number] | null = null;
    let bestScore = 0;
    for (const x of sections) {
      let s = words.reduce((sum, w) => sum + score(x.head, w, WEIGHT.heading) + score(x.text, w, WEIGHT.text), 0);
      if (words.length > 1 && words.every((w) => x.head.includes(w) || x.text.includes(w))) s += TOGETHER;
      if (s > bestScore) {
        best = x;
        bestScore = s;
      }
    }
    total += bestScore;

    const from = best?.s.text || doc.summary || doc.sections[0]?.text || "";
    const { snippet: text, marks } = snippet(from, words);
    scored.push({
      score: total,
      hit: {
        path: doc.path,
        title: doc.title,
        icon: doc.icon,
        titleMarks: marksIn(doc.title, words),
        section: best?.s.id
          ? { id: best.s.id, heading: best.s.heading, marks: marksIn(best.s.heading, words) }
          : undefined,
        snippet: text,
        marks,
      },
    });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.hit.title.localeCompare(b.hit.title))
    .slice(0, limit)
    .map((s) => s.hit);
}

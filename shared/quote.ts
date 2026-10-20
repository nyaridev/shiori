// Text-quote anchors for comments (the W3C TextQuoteSelector idea, as in the FOUMA wiki): the selected text plus a
// little context on each side. Anchors survive edits elsewhere on the page; when the text itself is gone, the
// comment is "orphaned" and still listed, never lost.

export const CONTEXT = 32;

export interface Quote {
  exact: string;
  prefix: string;
  suffix: string;
}

/** The quote for text[start, end). */
export function quoteAt(text: string, start: number, end: number): Quote {
  return {
    exact: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - CONTEXT), start),
    suffix: text.slice(end, end + CONTEXT),
  };
}

/**
 * Where a quote is in text. Every occurrence of `exact` is scored by how much of its prefix and suffix still
 * match, and the best wins. Null when `exact` no longer appears.
 */
export function findQuote(text: string, quote: Quote): { start: number; end: number } | null {
  if (!quote.exact) return null;
  let best: { start: number; score: number } | null = null;
  for (let i = text.indexOf(quote.exact); i !== -1; i = text.indexOf(quote.exact, i + 1)) {
    const before = text.slice(Math.max(0, i - quote.prefix.length), i);
    const after = text.slice(i + quote.exact.length, i + quote.exact.length + quote.suffix.length);
    const score = sharedEnd(before, quote.prefix) + sharedStart(after, quote.suffix);
    if (!best || score > best.score) best = { start: i, score };
  }
  return best && { start: best.start, end: best.start + quote.exact.length };
}

function sharedStart(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

function sharedEnd(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

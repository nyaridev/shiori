import { describe, expect, it } from "vitest";
import { findQuote, quoteAt } from "./quote.ts";

describe("quotes", () => {
  const text = "The rat steals one ember. Later, the rat steals one ember again and runs.";

  it("finds the quoted occurrence, not the first one", () => {
    const second = text.lastIndexOf("steals one ember");
    const q = quoteAt(text, second, second + "steals one ember".length);
    expect(findQuote(text, q)).toEqual({ start: second, end: second + q.exact.length });
  });

  it("survives edits before the quote", () => {
    const start = text.indexOf("runs");
    const q = quoteAt(text, start, start + 4);
    const edited = `A new opening sentence. ${text}`;
    expect(findQuote(edited, q)?.start).toBe(edited.indexOf("runs"));
  });

  it("is null when the text is gone", () => {
    const q = quoteAt(text, 4, 7);
    expect(findQuote(text.replaceAll("rat", "mouse"), q)).toBeNull();
  });
});

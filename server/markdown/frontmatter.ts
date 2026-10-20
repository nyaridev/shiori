import { parse } from "yaml";

export interface Split {
  data: unknown;
  body: string;
  /** 1-based line where the body starts, for problem messages. */
  bodyLine: number;
  error: string | null;
}

/** Split `---` YAML frontmatter from a Markdown file. */
export function splitFrontmatter(source: string): Split {
  const text = source.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(text);
  if (!match) return { data: {}, body: text, bodyLine: 1, error: null };
  const body = text.slice(match[0].length);
  const bodyLine = match[0].split("\n").length;
  try {
    return { data: parse(match[1]) ?? {}, body, bodyLine, error: null };
  } catch (e) {
    return { data: {}, body, bodyLine, error: `frontmatter: ${(e as Error).message.split("\n")[0]}` };
  }
}

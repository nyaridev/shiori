import type { Element, Root } from "hast";
import rehypeSlug from "rehype-slug";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import type { TocEntry } from "../../shared/api.ts";
import { remarkElements, textOf } from "./elements.ts";
import { type LinkContext, rehypeLinks } from "./links.ts";

export interface Rendered {
  hast: Root;
  toc: TocEntry[];
  problems: string[];
}

/** Markdown body → hast for the browser. Raw HTML is dropped: pages use elements instead. */
export function renderMarkdown(body: string, ctx: LinkContext, lineOffset = 0): Rendered {
  const problems: string[] = [];
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkDirective)
    .use(remarkElements, problems, lineOffset)
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypeLinks, ctx, problems, lineOffset);
  const hast = processor.runSync(processor.parse(body)) as Root;

  const toc: TocEntry[] = [];
  visit(hast, (node) => {
    delete node.position;
    const el = node as Element;
    if (el.type === "element" && (el.tagName === "h2" || el.tagName === "h3") && el.properties.id) {
      toc.push({ id: String(el.properties.id), text: textOf(el as never), depth: el.tagName === "h2" ? 2 : 3 });
    }
  });
  return { hast, toc, problems };
}

// Links and files in rendered pages: internal links become app routes, files become API URLs, and both are checked.
import { posix } from "node:path";
import type { Element, Root } from "hast";
import { visit } from "unist-util-visit";
import type { Found } from "./wikilinks.ts";

export interface LinkContext {
  wikiId: string;
  /** Folder of the page file inside `pages/`: "" for pages/index.md, "systems" for pages/systems/combat.md. */
  pageDir: string;
  pageExists: (path: string) => boolean;
  /** `rel` is relative to the wiki root. */
  fileExists: (rel: string) => boolean;
  /** What a `[[wikilink]]` names (a path, file name or title) → the page; none when it isn't written yet. */
  findPage?: (name: string) => Found;
  /** The URL of a file from the wiki root; `fileUrl` by default. The element reference serves the app's docs. */
  files?: (rel: string) => string;
}

const EXTERNAL = /^([a-z][a-z0-9+.-]*:|\/\/)/i;

/** A page link as written → the page path (`systems/combat`), or null when it leaves `pages/`. */
export function resolvePageLink(pageDir: string, target: string): string | null {
  const rooted = target.startsWith("/");
  let p = target.replace(/\.md$/, "").replace(/^\/|\/$/g, "");
  p = rooted ? posix.normalize(p || ".") : posix.join(pageDir, p);
  if (p === "." || p === "") return "";
  if (p.startsWith("..")) return null;
  return p.replace(/(^|\/)index$/, "");
}

/** A file reference as written → a path from the wiki root, or null when it leaves the wiki. */
export function resolveFile(pageDir: string, src: string): string | null {
  const rel = src.startsWith("/") ? posix.normalize(src.slice(1)) : posix.join("pages", pageDir, src);
  return rel.startsWith("..") || rel.startsWith("/") ? null : rel;
}

export function fileUrl(wikiId: string, rel: string): string {
  return `/api/wikis/${wikiId}/files/${rel.split("/").map(encodeURIComponent).join("/")}`;
}

/** rehype plugin. */
export function rehypeLinks(ctx: LinkContext, problems: string[], lineOffset = 0) {
  const where = (node: Element) => (node.position ? `line ${node.position.start.line + lineOffset}: ` : "");

  const file = (node: Element, value: unknown): string | undefined => {
    if (typeof value !== "string" || !value || EXTERNAL.test(value)) return value as string | undefined;
    const rel = resolveFile(ctx.pageDir, decodeURI(value));
    if (rel === null || !ctx.fileExists(rel)) problems.push(`${where(node)}missing file "${value}"`);
    return rel === null ? value : (ctx.files?.(rel) ?? fileUrl(ctx.wikiId, rel));
  };

  return (tree: Root) => {
    visit(tree, "element", (node) => {
      const props = node.properties;
      if (node.tagName === "a" && typeof props.href === "string") {
        const href = props.href;
        if (EXTERNAL.test(href)) {
          props.target = "_blank";
          props.rel = ["noreferrer"];
        } else if (!href.startsWith("#")) {
          const [target, hash] = href.split("#");
          const path = resolvePageLink(ctx.pageDir, decodeURI(target));
          // A wikilink to a page not written yet is a red link, on purpose; a Markdown link to nowhere is a mistake.
          if (path === null || !ctx.pageExists(path)) {
            props.dataMissing = "";
            if (props.dataWikilink === undefined) problems.push(`${where(node)}broken link "${href}"`);
          }
          if (path !== null) props.href = `/w/${ctx.wikiId}${path ? `/${path}` : ""}${hash ? `#${hash}` : ""}`;
        }
      }
      if (node.tagName === "img") props.src = file(node, props.src);
      if (node.tagName === "sh-infobox" && props.image) props.image = file(node, props.image);
    });
  };
}

// The toolbox: what a wiki can use, for the special pages Page kits and Elements. The owner's server and the guest
// server both serve it, read-only. Kits never send their file paths, and the element reference's pictures come from
// the app's own `docs/assets/`.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { KitInfo, PageData } from "../shared/api.ts";
import { listKits } from "./kits.ts";
import { splitFrontmatter } from "./markdown/frontmatter.ts";
import { fileUrl, type LinkContext, resolveFile } from "./markdown/links.ts";
import { renderMarkdown } from "./markdown/render.ts";
import { isIconFile, type PageFile, pageFinder } from "./pages.ts";
import type { Wiki } from "./registry.ts";
import { templateDir } from "./template.ts";

/** A kit's icon as the app shows it: a name from the set or an emoji as written, the wiki's own picture as its URL. */
function kitIcon(wiki: Wiki, raw: string | undefined): string | undefined {
  if (!raw || !isIconFile(raw)) return raw;
  const rel = resolveFile("", raw);
  return rel === null ? undefined : fileUrl(wiki.id, rel);
}

/** The kits a wiki can use, as the toolbox shows them. */
export function kitsOf(wiki: Wiki, appRoot: string): KitInfo[] {
  return listKits(wiki, appRoot).map((kit) => {
    const text = readFileSync(kit.file, "utf8");
    const split = splitFrontmatter(text);
    const data = split.data as Record<string, unknown>;
    const word = (v: unknown) => (typeof v === "string" && v ? v : undefined);
    // New wikis start with a copy of the template's kits; a copy nobody changed is still the template's.
    const original = join(templateDir(appRoot), "kits", `${kit.name}.md`);
    const copied = kit.source === "wiki" && existsSync(original) && readFileSync(original, "utf8") === text;
    return {
      name: kit.name,
      description: kit.description,
      source: copied ? "template" : kit.source,
      icon: kitIcon(wiki, word(data.icon)),
      type: word(data.type),
      sections: [...split.body.matchAll(/^## +(.+)$/gm)].map((m) => m[1].trim().replaceAll("{{page.title}}", "…")),
      fields: Object.keys(data).filter((k) => k !== "kit"),
    };
  });
}

/** The URL of a picture in the element reference (`docs/assets/…`), served by the toolbox route of `wikiId`. */
export const toolboxFile = (wikiId: string, rel: string) =>
  `/api/wikis/${wikiId}/toolbox/${rel.split("/").map(encodeURIComponent).join("/")}`;

/** Only the element reference's pictures (`assets/<file>`, still percent-encoded): never the ADRs or its Markdown. */
export function isToolboxFile(encoded: string): boolean {
  try {
    return /^assets\/(?!\.)[^/\\]+$/.test(decodeURIComponent(encoded));
  } catch {
    return false;
  }
}

/**
 * The element reference (`docs/elements.md`) as a page. For a wiki, its links point at the wiki's own pages (red
 * when it has no such page) and its pictures at the toolbox route; for /dev/ui (`_dev`) every link is fine.
 */
export function renderElements(appRoot: string, wiki?: { id: string; pages: PageFile[] }): PageData {
  const docs = join(appRoot, "docs");
  const split = splitFrontmatter(readFileSync(join(docs, "elements.md"), "utf8"));
  const known = new Set(wiki?.pages.map((p) => p.path));
  const ctx: LinkContext = wiki
    ? {
        wikiId: wiki.id,
        pageDir: "",
        findPage: pageFinder(wiki.pages, ""),
        pageExists: (p) => known.has(p),
        fileExists: (rel) => existsSync(join(docs, rel)),
        files: (rel) => toolboxFile(wiki.id, rel),
      }
    : { wikiId: "_dev", pageDir: "", pageExists: () => true, fileExists: (rel) => existsSync(join(docs, rel)) };
  // In a wiki the special page has its own title and introduction, so the reference starts at its first section.
  const first = split.body.indexOf("\n## ");
  const r = renderMarkdown(wiki && first >= 0 ? split.body.slice(first) : split.body, ctx);
  return {
    path: "",
    title: "Elements",
    summary: "",
    tags: [],
    backlinks: [],
    related: [],
    questions: [],
    placed: { related: false, children: false, questions: [] },
    trail: [],
    children: [],
    prev: null,
    next: null,
    ...r,
    // The reference's own red links and examples aren't the wiki's problems.
    problems: [],
  };
}

// Page kits (ADR-0002): starting points for a kind of page, as plain Markdown files. A wiki's own `kits/<name>.md`
// come first; the template's (`wikis/_template/kits/`) fill in the rest, so wikis made before a kit existed get it too.
// `{{page.title}}` and `{{page.date}}` are filled in when a page is made, and the kit's `kit:` description is dropped.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { splitFrontmatter } from "./markdown/frontmatter.ts";
import type { Wiki } from "./registry.ts";
import { pagePathOf } from "./rename.ts";
import { templateDir } from "./template.ts";

export interface Kit {
  name: string;
  description: string;
  file: string;
  /** From the wiki itself, or the template's. */
  source: "wiki" | "template";
}

const kitsIn = (dir: string, source: Kit["source"]): Kit[] =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith(".md") && !f.startsWith("_") && !f.startsWith("."))
        .map((f) => {
          const file = join(dir, f);
          const kit = (splitFrontmatter(readFileSync(file, "utf8")).data as { kit?: unknown }).kit;
          return { name: basename(f, ".md"), description: typeof kit === "string" ? kit : "", file, source };
        })
    : [];

/** The kits a wiki can use: its own, then the template's that it doesn't override. */
export function listKits(wiki: Wiki, appRoot: string): Kit[] {
  const own = kitsIn(join(wiki.root, "kits"), "wiki");
  const names = new Set(own.map((k) => k.name));
  return [...own, ...kitsIn(join(templateDir(appRoot), "kits"), "template").filter((k) => !names.has(k.name))].sort(
    (a, b) => a.name.localeCompare(b.name),
  );
}

const humanize = (s: string) => s.replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
/** A value inside a YAML double-quoted string. */
const yamlEscape = (s: string) => JSON.stringify(s).slice(1, -1);

/** A kit's text for a page with this title: placeholders filled, the `kit:` line gone. */
export function fillKit(text: string, title: string, date: string): string {
  const source = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const fm = /^---\n[\s\S]*?\n---(?:\n|$)/.exec(source)?.[0] ?? "";
  const head = fm
    .replace(/^kit:.*\n/m, "")
    .replaceAll("{{page.title}}", yamlEscape(title))
    .replaceAll("{{page.date}}", date);
  const body = source.slice(fm.length).replaceAll("{{page.title}}", title).replaceAll("{{page.date}}", date);
  return head + body;
}

/**
 * Makes a new page at `path` from a kit, or a bare page with just a title. A folder that already exists at `path`, or
 * `section`, makes it the folder's `index.md`. Returns the file, from the wiki root.
 */
export function newPage(
  wiki: Wiki,
  appRoot: string,
  pathRaw: string,
  {
    kit,
    title,
    section = false,
    date = new Date().toISOString().slice(0, 10),
  }: {
    kit?: string;
    title?: string;
    section?: boolean;
    date?: string;
  } = {},
): string {
  const path = pagePathOf(pathRaw);
  if (!path) throw new Error("The home page already exists: it's pages/index.md.");
  const pages = join(wiki.root, "pages");
  const asSection = section || existsSync(join(pages, path));
  const rel = asSection ? `${path}/index.md` : `${path}.md`;
  if (existsSync(join(pages, rel)) || (!asSection && existsSync(join(pages, path, "index.md")))) {
    throw new Error(`pages/${rel} already exists.`);
  }
  const name = title ?? humanize(basename(path));
  let text = `---\ntitle: "${yamlEscape(name)}"\nsummary: ""\n---\n\n`;
  if (kit) {
    const found = listKits(wiki, appRoot).find((k) => k.name === kit);
    if (!found) {
      const names = listKits(wiki, appRoot).map((k) => k.name);
      throw new Error(`No kit "${kit}". Kits: ${names.join(", ") || "none"}.`);
    }
    text = fillKit(readFileSync(found.file, "utf8"), name, date);
  }
  const file = join(pages, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  return `pages/${rel}`;
}

// `pnpm shiori public` and `export` (ADR-0011): what the public wiki shows, and the public wiki as a static site.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { buildCorpus } from "../server/corpus.ts";
import { loadLayouts } from "../server/layouts.ts";
import { listPages, type PageFile, pageFinder } from "../server/pages.ts";
import { dataDir, slashes } from "../server/paths.ts";
import { buildEdition } from "../server/public/edition.ts";
import { writeEdition, zipEdition, zipName } from "../server/public/output.ts";
import { isPrivateFile, isPublicPage, publicSettings, unusedPatterns } from "../server/public/rules.ts";
import type { Wiki } from "../server/registry.ts";
import type { PublicReport } from "../shared/api.ts";

type Fail = (message: string) => never;

const editionOf = (w: Wiki) => {
  const pages = listPages(w);
  return buildEdition(w, pages, buildCorpus(w, pages));
};

/** What `pnpm shiori check` says about wiki.json's `public`. */
export function publicProblems(w: Wiki, pages: PageFile[]): string[] {
  const settings = w.manifest.public;
  if (!settings) return [];
  const out = unusedPatterns(
    settings.pages,
    pages.map((p) => p.path),
  ).map((p) => `wiki.json: public.pages: "${p}" names no page`);
  if (settings.front && !pageFinder(pages, "")(settings.front).page)
    out.push(`wiki.json: public.front: there's no page "${settings.front}"`);
  const pictures: [string, string | undefined][] = [
    ["banner", settings.banner],
    ["logo", settings.logo],
    ["frame.backdrop", settings.frame.backdrop.startsWith("/") ? settings.frame.backdrop : undefined],
  ];
  for (const [field, src] of pictures) {
    if (!src) continue;
    const rel = src.replace(/^\/+/, "");
    if (!existsSync(join(w.root, rel))) out.push(`wiki.json: public.${field}: missing file "${src}"`);
    else if (isPrivateFile(publicSettings(w), rel))
      out.push(`wiki.json: public.${field}: "${src}" is a private picture`);
  }
  // The front page's layout (ADR-0012) may only feature pages that are public.
  const find = pageFinder(pages, "");
  const front = settings.front ? find(settings.front).page?.path : undefined;
  for (const block of Object.values(loadLayouts(w).front?.blocks ?? {}))
    if (block.type === "pages")
      for (const ref of block.pages) {
        const path = find(ref).page?.path;
        const page = pages.find((p) => p.path === path);
        if (!page) out.push(`layouts/front.json: there's no page "${ref}"`);
        else if (!isPublicPage(settings, page) || page.path === front)
          out.push(`layouts/front.json: "${ref}" isn't a public page`);
      }
  return out;
}

const REMOVED: [keyof PublicReport["removed"], string][] = [
  ["private", "private blocks and words"],
  ["code", "code blocks"],
  ["questions", "questions and suggestions"],
  ["fields", "private fields, rows and columns"],
  ["pictures", "private or missing pictures"],
  ["links", "links to private pages, kept as text"],
  ["elements", "app-only blocks (live lists, designs, roadmaps, statuses)"],
];

export function showPublic(w: Wiki) {
  const { report } = editionOf(w);
  console.log(`${report.title}: the public wiki of ${w.id}`);
  if (!w.manifest.public) console.log('  wiki.json has no "public" yet; only pages with `public: true` go public.');
  console.log(
    `  front page: ${report.front ? `${report.front.title} (${report.front.path || "home"})` : "the wiki's name and its sections"}`,
  );
  const { layout } = report;
  console.log(
    `  layout: ${layout.frame.length ? layout.frame.join(", ") : "the standard frame"}; ${layout.front ? "its own front page (layouts/front.json)" : "the standard front page"}${layout.pages.length ? `; page layouts: ${layout.pages.join(", ")}` : ""}`,
  );
  console.log(`\n${report.pages.length} public page${report.pages.length === 1 ? "" : "s"}:`);
  for (const p of report.pages) console.log(`  ${p.path.padEnd(36)} ${p.title}`);
  console.log(
    `\n${report.privatePages} page${report.privatePages === 1 ? "" : "s"} stay private. ${report.pictures} picture${report.pictures === 1 ? "" : "s"} go public.`,
  );
  const left = REMOVED.filter(([k]) => report.removed[k]);
  if (left.length) {
    console.log("Left out of public pages:");
    for (const [k, what] of left) console.log(`  ${String(report.removed[k]).padStart(4)} ${what}`);
  }
  for (const p of report.problems) console.log(`  ! ${p}`);
}

export async function exportPublic(w: Wiki, opts: { out?: string; dir?: string }, fail: Fail) {
  const edition = editionOf(w);
  if (!edition.report.pages.length && !edition.report.front)
    fail(
      `No page of ${w.id} is public yet. List them in wiki.json's "public": { "pages": [...] }, or set \`public: true\`.`,
    );
  for (const p of edition.report.problems) console.log(`! ${p}`);
  if (opts.dir) {
    const dir = resolve(opts.dir);
    if (existsSync(dir) && readdirSync(dir).length) fail(`${slashes(dir)} isn't empty.`);
    const n = await writeEdition(w, edition, dir);
    console.log(
      `Wrote ${n} files of the public wiki to ${slashes(dir)}. Open index.html, or put the folder on any static host.`,
    );
    return;
  }
  const out = opts.out ? resolve(opts.out) : join(dataDir(w.root, "export"), zipName(w));
  mkdirSync(dirname(out), { recursive: true });
  const body = await zipEdition(w, edition);
  writeFileSync(out, body);
  const pages = edition.report.pages.length;
  console.log(
    `Exported ${pages} public page${pages === 1 ? "" : "s"} to ${slashes(out)} (${(body.length / 1024 / 1024).toFixed(1)} MB). Unzip it and open index.html.`,
  );
}

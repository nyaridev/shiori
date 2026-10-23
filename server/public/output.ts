// The public wiki's files (ADR-0011) leave in three ways: served one by one (the owner's preview and the public link),
// zipped for the export, or written to a folder (`pnpm shiori export --dir`). Each wiki's is built once per version of
// its pages and kept while they stay the same.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Context } from "hono";
import type { Corpus } from "../corpus.ts";
import { inside } from "../paths.ts";
import type { Wiki } from "../registry.ts";
import type { WikiData } from "../wikiData.ts";
import { buildEdition, type Edition, readEditionFile } from "./edition.ts";
import { type ZipEntry, zip } from "./zip.ts";

export function createEditions(data: WikiData) {
  const built = new WeakMap<Corpus, Edition>();
  return {
    /** The wiki's public edition, as its pages are now. */
    of(wiki: Wiki): Edition {
      const corpus = data.corpusOf(wiki);
      let edition = built.get(corpus);
      if (!edition) {
        edition = buildEdition(wiki, data.pagesOf(wiki), corpus);
        built.set(corpus, edition);
      }
      return edition;
    },
  };
}
export type Editions = ReturnType<typeof createEditions>;

/** A path under the site (still percent-encoded, as the URL has it) → the file's name in the edition. */
export function editionPath(encoded: string): string | null {
  let rel: string;
  try {
    rel = decodeURIComponent(encoded);
  } catch {
    return null;
  }
  if (rel === "" || rel.endsWith("/")) rel += "index.html";
  if (rel.includes("\0") || rel.split("/").some((p) => p === ".." || p === ".")) return null;
  return rel;
}

/** One file of the edition as an HTTP answer; anything not in it is the site's 404 page. */
export async function editionResponse(c: Context, wiki: Wiki, edition: Edition, encoded: string): Promise<Response> {
  const name = editionPath(encoded);
  const file = name === null ? undefined : edition.files.get(name);
  const page = file ? null : edition.files.get("404.html");
  const found = file ?? page;
  const body = found ? await readEditionFile(wiki, found) : null;
  if (!found || body === null) return c.text("Not found", 404);
  c.header("content-type", found.type);
  // Pages are asked for again each time; styles, scripts, fonts and pictures keep a few minutes.
  c.header("cache-control", file && /^_(site|media)\//.test(name ?? "") ? "private, max-age=300" : "private, no-cache");
  return c.body(typeof body === "string" ? body : new Uint8Array(body), file ? 200 : 404);
}

/** Every file of the edition, pictures made a few at a time. */
async function everyFile(wiki: Wiki, edition: Edition): Promise<ZipEntry[]> {
  const entries = [...edition.files];
  const out: ZipEntry[] = new Array(entries.length);
  let next = 0;
  const worker = async () => {
    while (next < entries.length) {
      const i = next++;
      const [name, file] = entries[i];
      out[i] = { name, body: (await readEditionFile(wiki, file)) ?? "" };
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return out;
}

/** The edition as a .zip: a folder named for the wiki with the site inside, so it unzips tidily. */
export async function zipEdition(wiki: Wiki, edition: Edition): Promise<Buffer> {
  const files = await everyFile(wiki, edition);
  return zip(files.map((f) => ({ name: `${wiki.id}/${f.name}`, body: f.body })));
}

/** The edition written into `dir` as plain files. */
export async function writeEdition(wiki: Wiki, edition: Edition, dir: string): Promise<number> {
  const files = await everyFile(wiki, edition);
  for (const f of files) {
    const full = inside(dir, f.name);
    if (!full) continue;
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, f.body);
  }
  return files.length;
}

export const zipName = (wiki: Wiki) => `${wiki.id}-public.zip`;

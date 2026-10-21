// A wiki's pictures, for the owner's app and the guest server alike (ADR-0004). Only pictures: never the database,
// JSON, the pages' Markdown, the agent docs, or videos and sounds. With `?w=` a picture comes resized as WebP, made
// once and cached in the wiki's `data/cache/`; the original stays as it is.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import type { Context } from "hono";
import sharp from "sharp";
import { dataDir, inside, slashes } from "./paths.ts";

const TYPES: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
};

/** A picture bigger than this isn't served, and `pnpm wiki check` reports it. */
export const MAX_PICTURE_BYTES = 15 * 1024 * 1024;
/** The widths the app asks for: strip thumbnails, gallery tiles, the infobox, the article, the viewer. */
export const WIDTHS = [160, 480, 960, 1600, 2400] as const;
/** Media a wiki may not carry: videos and sounds. Videos go on YouTube or Vimeo and into a page with `::embed`. */
const REFUSED = new Set([
  ".mp4",
  ".webm",
  ".mov",
  ".avi",
  ".mkv",
  ".m4v",
  ".mp3",
  ".wav",
  ".ogg",
  ".flac",
  ".m4a",
  ".aac",
]);

/** Pictures being converted right now, so two requests for the same one convert it once. */
const converting = new Map<string, Promise<Buffer>>();

function resize(full: string, width: number, animated: boolean): Promise<Buffer> {
  return sharp(full, { animated, limitInputPixels: 100_000_000 })
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 82, effort: 4 })
    .toBuffer();
}

/**
 * The picture at `encoded` (a URL path, still percent-encoded) inside `root`, or a 404. `?w=` (one of `WIDTHS`) asks
 * for it resized as WebP; SVGs always come as they are. `cache: false` converts without writing (the app's own
 * docs, which aren't a wiki).
 */
export async function serveFile(c: Context, root: string, encoded: string, { cache = true } = {}): Promise<Response> {
  let rel: string;
  try {
    rel = decodeURIComponent(encoded);
  } catch {
    return c.notFound();
  }
  const full = inside(root, rel);
  const ext = extname(rel).toLowerCase();
  const type = TYPES[ext];
  if (!full || !type || rel.split("/").some((p) => p.startsWith(".") || p === "data")) return c.notFound();
  if (!existsSync(full)) return c.notFound();
  const stat = statSync(full);
  if (!stat.isFile() || stat.size > MAX_PICTURE_BYTES) return c.notFound();

  const width = Number(c.req.query("w") ?? 0);
  if (width && !WIDTHS.includes(width as (typeof WIDTHS)[number])) return c.json({ error: "unknown width" }, 400);
  const resized = width > 0 && ext !== ".svg";
  // The ETag changes when the file does, so a browser asks again cheaply and gets a 304 until then.
  const etag = `"${createHash("sha1")
    .update(`${rel}|${stat.size}|${stat.mtimeMs}|${resized ? width : "original"}`)
    .digest("hex")
    .slice(0, 24)}"`;
  const headers = { "cache-control": "no-cache", etag };
  if (c.req.header("if-none-match")?.replace(/^W\//, "") === etag) return c.body(null, 304, headers);
  if (!resized) return c.body(readFileSync(full), 200, { ...headers, "content-type": type });

  const file = cache ? join(dataDir(root, "cache", "pictures"), `${etag.slice(1, -1)}.webp`) : null;
  if (file && existsSync(file)) return c.body(readFileSync(file), 200, { ...headers, "content-type": "image/webp" });
  let job = converting.get(etag);
  if (!job) {
    job = resize(full, width, ext === ".gif").finally(() => converting.delete(etag));
    converting.set(etag, job);
  }
  let out: Buffer;
  try {
    out = await job;
  } catch {
    // Not a picture sharp can read: send the original, as the page asked for a picture.
    return c.body(readFileSync(full), 200, { ...headers, "content-type": type });
  }
  if (file && !existsSync(file)) {
    writeFileSync(`${file}.tmp`, out);
    renameSync(`${file}.tmp`, file);
  }
  return c.body(new Uint8Array(out), 200, { ...headers, "content-type": "image/webp" });
}

/** What `pnpm wiki check` says about a wiki's media: videos and sounds it may not carry, pictures that are too big. */
export function mediaProblems(root: string): string[] {
  const problems: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = join(dir, entry.name);
      const rel = slashes(relative(root, full));
      if (entry.isDirectory()) {
        if (rel !== "data") walk(full);
        continue;
      }
      const ext = extname(entry.name).toLowerCase();
      if (REFUSED.has(ext)) {
        problems.push(`${rel}: only pictures belong in a wiki; put videos on YouTube or Vimeo and use ::embed`);
      } else if (TYPES[ext] && statSync(full).size > MAX_PICTURE_BYTES) {
        const mb = (statSync(full).size / 1024 / 1024).toFixed(1);
        problems.push(`${rel}: ${mb} MB is too big for a picture (at most ${MAX_PICTURE_BYTES / 1024 / 1024} MB)`);
      }
    }
  };
  walk(root);
  return problems;
}

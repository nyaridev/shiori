// A wiki's media files, for the owner's app and the guest server alike. Only media: never the database, JSON, the
// pages' Markdown or the agent docs.
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname } from "node:path";
import type { Context } from "hono";
import { inside } from "./paths.ts";

const TYPES: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff2": "font/woff2",
};

/** The file at `encoded` (a URL path, still percent-encoded) inside `root`, when it's media; otherwise a 404. */
export function serveFile(c: Context, root: string, encoded: string): Response | Promise<Response> {
  let rel: string;
  try {
    rel = decodeURIComponent(encoded);
  } catch {
    return c.notFound();
  }
  const full = inside(root, rel);
  const type = TYPES[extname(rel).toLowerCase()];
  if (!full || !type || rel.split("/").some((p) => p.startsWith(".") || p === "data")) return c.notFound();
  if (!existsSync(full) || !statSync(full).isFile()) return c.notFound();
  return c.body(readFileSync(full), 200, { "content-type": type, "cache-control": "no-cache" });
}

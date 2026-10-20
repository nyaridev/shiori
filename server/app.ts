// HTTP API. Read-only for pages and files; the only writes are comment threads in the wiki's own database.
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { type Context, Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import type { WikiDetail } from "../shared/api.ts";
import type { Live } from "./live.ts";
import { splitFrontmatter } from "./markdown/frontmatter.ts";
import { renderMarkdown } from "./markdown/render.ts";
import { buildNav, listPages, type PageFile, renderPage } from "./pages.ts";
import { inside } from "./paths.ts";
import { type Registry, toCard, type Wiki } from "./registry.ts";
import { addMessage, createThread, getThread, listThreads, setStatus } from "./threads.ts";

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

const quoteSchema = z.strictObject({ exact: z.string().min(1).max(4000), prefix: z.string(), suffix: z.string() });
const newThreadSchema = z.strictObject({ page: z.string(), quote: quoteSchema, body: z.string().trim().min(1) });
const messageSchema = z.strictObject({ body: z.string().trim().min(1) });
const statusSchema = z.strictObject({ status: z.enum(["open", "resolved", "wontfix"]) });

export interface AppOptions {
  registry: Registry;
  live: Live;
  /** Serve the built UI from this folder (start-web / the desktop app). */
  staticDir?: string;
}

export function buildApp({ registry, live, staticDir }: AppOptions) {
  const app = new Hono();
  const pageCache = new Map<string, PageFile[]>();
  live.subscribe((e) => {
    if (e.type !== "threads") pageCache.clear();
  });
  const pagesOf = (w: Wiki) => {
    let pages = pageCache.get(w.id);
    if (!pages) {
      pages = listPages(w);
      pageCache.set(w.id, pages);
    }
    return pages;
  };

  const wikiOr404 = (c: Context): Wiki | Response =>
    registry.get(c.req.param("id") ?? "") ?? c.json({ error: "no such wiki" }, 404);

  app.get("/api/wikis", (c) => c.json({ wikis: registry.all().map((w) => toCard(w, pagesOf(w).length)) }));

  app.get("/api/wikis/:id", (c) => {
    const w = wikiOr404(c);
    if (w instanceof Response) return w;
    const detail: WikiDetail = {
      ...toCard(w, pagesOf(w).length),
      theme: w.theme,
      nav: buildNav(pagesOf(w)),
      problems: w.problems,
    };
    return c.json(detail);
  });

  app.get("/api/wikis/:id/page", (c) => {
    const w = wikiOr404(c);
    if (w instanceof Response) return w;
    const page = renderPage(w, pagesOf(w), c.req.query("path") ?? "");
    return page ? c.json(page) : c.json({ error: "no such page" }, 404);
  });

  app.get("/api/wikis/:id/files/*", (c) => {
    const w = wikiOr404(c);
    if (w instanceof Response) return w;
    const rel = decodeURIComponent(c.req.path.slice(`/api/wikis/${w.id}/files/`.length));
    const full = inside(w.root, rel);
    const type = TYPES[extname(rel).toLowerCase()];
    // Only media; never the database, JSON or the agent docs.
    if (!full || !type || rel.split("/").some((p) => p.startsWith(".") || p === "data")) return c.notFound();
    if (!existsSync(full) || !statSync(full).isFile()) return c.notFound();
    return c.body(readFileSync(full), 200, { "content-type": type, "cache-control": "no-cache" });
  });

  app.get("/api/wikis/:id/threads", (c) => {
    const w = wikiOr404(c);
    if (w instanceof Response) return w;
    return c.json({ threads: listThreads(w.root, { page: c.req.query("page") }) });
  });

  app.post("/api/wikis/:id/threads", async (c) => {
    const w = wikiOr404(c);
    if (w instanceof Response) return w;
    const body = newThreadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "bad request" }, 400);
    return c.json(createThread(w.root, body.data.page, body.data.quote, body.data.body), 201);
  });

  app.post("/api/wikis/:id/threads/:tid/messages", async (c) => {
    const w = wikiOr404(c);
    if (w instanceof Response) return w;
    const body = messageSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "bad request" }, 400);
    const t = addMessage(w.root, Number(c.req.param("tid")), "user", body.data.body);
    return t ? c.json(t) : c.notFound();
  });

  app.patch("/api/wikis/:id/threads/:tid", async (c) => {
    const w = wikiOr404(c);
    if (w instanceof Response) return w;
    const body = statusSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "bad request" }, 400);
    const id = Number(c.req.param("tid"));
    if (!getThread(w.root, id)) return c.notFound();
    return c.json(setStatus(w.root, id, body.data.status));
  });

  /** The element reference (docs/elements.md), rendered for the /dev/ui page. */
  app.get("/api/dev/elements", (c) => {
    const split = splitFrontmatter(readFileSync(join(registry.appRoot, "docs", "elements.md"), "utf8"));
    const r = renderMarkdown(split.body, {
      wikiId: "_dev",
      pageDir: "",
      pageExists: () => true,
      fileExists: () => true,
    });
    return c.json({ path: "", title: "Elements", summary: "", ...r });
  });

  app.get("/api/events", (c) =>
    streamSSE(c, async (stream) => {
      const off = live.subscribe((e) => void stream.writeSSE({ data: JSON.stringify(e) }));
      stream.onAbort(() => {
        off();
      });
      while (!stream.aborted) {
        await stream.writeSSE({ event: "ping", data: "" });
        await stream.sleep(25_000);
      }
      off();
    }),
  );

  app.all("/api/*", (c) => c.json({ error: "not found" }, 404));

  if (staticDir) {
    app.use("/*", serveStatic({ root: staticDir }));
    app.get("*", (c) => c.html(readFileSync(join(staticDir, "index.html"), "utf8")));
  }
  return app;
}

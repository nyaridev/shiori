// The owner's HTTP API, on loopback only. Read-only for pages and files; the only writes are comments and answers in
// the wiki's own database. Share links (ADR-0003) are made here and served by the separate guest server.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { type Context, Hono, type MiddlewareHandler } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { addAnswer, listAnswers } from "./answers.ts";
import { serveFile } from "./files.ts";
import type { Live } from "./live.ts";
import { splitFrontmatter } from "./markdown/frontmatter.ts";
import { renderMarkdown } from "./markdown/render.ts";
import { type Registry, toCard, type Wiki } from "./registry.ts";
import { search } from "./search.ts";
import type { Shares } from "./sharing/shares.ts";
import { addMessage, createThread, getThread, listThreads, setStatus } from "./threads.ts";
import { answerProblem, createWikiData, type WikiData } from "./wikiData.ts";

// An empty `exact` is a comment on the whole page.
const quoteSchema = z.strictObject({ exact: z.string().max(4000), prefix: z.string(), suffix: z.string() });
const newAnswerSchema = z.strictObject({
  page: z.string(),
  question: z.string().min(1),
  choice: z.string().min(1).nullable().default(null),
  body: z.string().trim().default(""),
});
const newThreadSchema = z.strictObject({ page: z.string(), quote: quoteSchema, body: z.string().trim().min(1) });
const messageSchema = z.strictObject({ body: z.string().trim().min(1) });
const statusSchema = z.strictObject({ status: z.enum(["open", "resolved", "wontfix"]) });
const newShareSchema = z.strictObject({
  wiki: z.string(),
  kind: z.enum(["view", "comment"]),
  duration: z.enum(["1h", "24h", "7d", "session"]).default("24h"),
  label: z.string().trim().max(60).default(""),
});

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
const isLoopback = (url: string) => {
  try {
    return LOOPBACK.has(new URL(url).hostname);
  } catch {
    return false;
  }
};

/**
 * The owner's server answers only to loopback names, so a web page can't reach it through DNS rebinding, and takes
 * writes only from the app's own origins, so another site can't post to it (or make share links).
 */
export const localOnly: MiddlewareHandler = async (c, next) => {
  if (!isLoopback(c.req.url)) return c.json({ error: "not found" }, 404);
  const origin = c.req.header("origin");
  const reads = c.req.method === "GET" || c.req.method === "HEAD";
  if (!reads && origin && !isLoopback(origin) && origin !== "tauri://localhost") {
    return c.json({ error: "cross-site request" }, 403);
  }
  return next();
};

export interface AppOptions {
  registry: Registry;
  live: Live;
  /** Shared with the guest server, so both read one cache. */
  data?: WikiData;
  /** Share links. Only the built app shares (ADR-0003); without them `/api/shares` says so. */
  shares?: Shares;
  /** Serve the built UI from this folder (start-web / the desktop app). */
  staticDir?: string;
}

export function buildApp({ registry, live, data = createWikiData(live), shares, staticDir }: AppOptions) {
  const app = new Hono();
  const { pagesOf, corpusOf } = data;
  app.use("*", localOnly);

  const wikiOr404 = (c: Context): Wiki | Response =>
    registry.get(c.req.param("id") ?? "") ?? c.json({ error: "no such wiki" }, 404);

  app.get("/api/wikis", (c) => c.json({ wikis: registry.all().map((w) => toCard(w, pagesOf(w).length)) }));

  app.get("/api/wikis/:id", (c) => {
    const w = wikiOr404(c);
    if (w instanceof Response) return w;
    return c.json(data.detail(w));
  });

  app.get("/api/wikis/:id/page", (c) => {
    const w = wikiOr404(c);
    if (w instanceof Response) return w;
    const page = corpusOf(w).pages.get(c.req.query("path") ?? "");
    return page ? c.json(page) : c.json({ error: "no such page" }, 404);
  });

  app.get("/api/wikis/:id/pages", (c) => {
    const w = wikiOr404(c);
    if (w instanceof Response) return w;
    return c.json(data.index(w));
  });

  app.get("/api/wikis/:id/search", (c) => {
    const w = wikiOr404(c);
    if (w instanceof Response) return w;
    return c.json({ hits: search(corpusOf(w).search, c.req.query("q") ?? "") });
  });

  // A wiki's media. `_dev` is docs/, for the element examples on /dev/ui.
  app.get("/api/wikis/:id/files/*", (c) => {
    const w = c.req.param("id") === "_dev" ? { id: "_dev", root: join(registry.appRoot, "docs") } : wikiOr404(c);
    if (w instanceof Response) return w;
    return serveFile(c, w.root, c.req.path.slice(`/api/wikis/${w.id}/files/`.length));
  });

  app.get("/api/wikis/:id/answers", (c) => {
    const w = wikiOr404(c);
    if (w instanceof Response) return w;
    return c.json({ answers: listAnswers(w.root, { page: c.req.query("page") }) });
  });

  // Answers only go to a question the page asks, with one of its options when it has some.
  app.post("/api/wikis/:id/answers", async (c) => {
    const w = wikiOr404(c);
    if (w instanceof Response) return w;
    const body = newAnswerSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "bad request" }, 400);
    const { page, question, choice, body: note } = body.data;
    const problem = answerProblem(corpusOf(w).pages.get(page), { question, choice, body: note });
    if (problem) return c.json({ error: problem.error }, problem.status);
    return c.json(addAnswer(w.root, page, question, choice, note), 201);
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
      fileExists: (rel) => existsSync(join(registry.appRoot, "docs", rel)),
    });
    return c.json({
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
    });
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

  // Share links (ADR-0003). The Share dialog (phase 2) uses these; the guest server serves the links.
  const noSharing = (c: Context) =>
    c.json({ error: "Sharing needs the built app: start Shiori with start-web.bat or start-app.bat." }, 409);

  app.get("/api/shares", (c) => (shares ? c.json({ shares: shares.list().map(shares.info) }) : noSharing(c)));

  app.post("/api/shares", async (c) => {
    if (!shares) return noSharing(c);
    const body = newShareSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "bad request" }, 400);
    if (!registry.get(body.data.wiki)) return c.json({ error: "no such wiki" }, 404);
    try {
      return c.json(shares.info(shares.create(body.data)), 201);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 409);
    }
  });

  // Revoke one link, or every link at once ("Stop all sharing").
  app.delete("/api/shares/:sid", (c) => {
    if (!shares) return noSharing(c);
    return shares.revoke(c.req.param("sid")) ? c.body(null, 204) : c.json({ error: "no such link" }, 404);
  });
  app.delete("/api/shares", (c) => {
    if (!shares) return noSharing(c);
    shares.stopAll();
    return c.body(null, 204);
  });

  app.all("/api/*", (c) => c.json({ error: "not found" }, 404));

  if (staticDir) {
    app.use("/*", serveStatic({ root: staticDir }));
    app.get("*", (c) => c.html(readFileSync(join(staticDir, "index.html"), "utf8")));
  }
  return app;
}

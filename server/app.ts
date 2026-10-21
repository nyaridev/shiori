// The owner's HTTP API, on loopback only. Read-only for pages and files; the only writes are comments and answers in
// the wiki's own database. Share links (ADR-0003) are made here and served by the separate guest server.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { type Context, Hono, type MiddlewareHandler } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import type { LiveEvent, SharesState } from "../shared/api.ts";
import { addAnswer, listAnswers, setAnswerHidden } from "./answers.ts";
import { serveFile } from "./files.ts";
import type { Live } from "./live.ts";
import { type Registry, toCard, type Wiki } from "./registry.ts";
import { search } from "./search.ts";
import { cleanName } from "./sharing/guest.ts";
import type { Shares } from "./sharing/shares.ts";
import type { Tunnel } from "./sharing/tunnel.ts";
import { addMessage, createThread, getThread, listThreads, setHidden, setStatus } from "./threads.ts";
import { isToolboxFile, kitsOf, renderElements } from "./toolbox.ts";
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
const hiddenSchema = z.strictObject({ hidden: z.boolean() });
const newShareSchema = z.strictObject({
  wiki: z.string(),
  kind: z.enum(["view", "comment"]),
  duration: z.enum(["1h", "24h", "7d", "session"]).default("24h"),
  label: z.string().trim().max(60).default(""),
  /** How the owner signs for guests; the dialog sends the name it remembers. */
  host: z.string().max(200).optional(),
});
const hostSchema = z.strictObject({ name: z.string().max(200) });
const blockSchema = z.strictObject({ blocked: z.boolean() });

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
  if (!reads && origin && !isLoopback(origin)) {
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
  /** The tunnel that gives links a public address. */
  tunnel?: Pick<Tunnel, "status" | "start" | "onChange">;
  /** Serve the built UI from this folder (start-web). */
  staticDir?: string;
}

export function buildApp({ registry, live, data = createWikiData(live), shares, tunnel, staticDir }: AppOptions) {
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

  app.get("/api/wikis/:id/images", (c) => {
    const w = wikiOr404(c);
    if (w instanceof Response) return w;
    return c.json({ groups: corpusOf(w).images });
  });

  app.get("/api/wikis/:id/search", (c) => {
    const w = wikiOr404(c);
    if (w instanceof Response) return w;
    return c.json({ hits: search(corpusOf(w).search, c.req.query("q") ?? "") });
  });

  // A wiki's pictures. `_dev` is docs/, for the element examples on /dev/ui; it's the app's own folder, so nothing
  // is cached there.
  app.get("/api/wikis/:id/files/*", (c) => {
    const dev = c.req.param("id") === "_dev";
    const w = dev ? { id: "_dev", root: join(registry.appRoot, "docs") } : wikiOr404(c);
    if (w instanceof Response) return w;
    return serveFile(c, w.root, c.req.path.slice(`/api/wikis/${w.id}/files/`.length), { cache: !dev });
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

  // Moderation (ADR-0003): the owner hides a guest's message or answer from guests and the inbox, or shows it again.
  const hide = async (c: Context, apply: (root: string, id: number, hidden: boolean) => unknown) => {
    const w = wikiOr404(c);
    if (w instanceof Response) return w;
    const body = hiddenSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "bad request" }, 400);
    const result = apply(w.root, Number(c.req.param("mid")), body.data.hidden);
    if (result === null) return c.notFound();
    if (result === "not a guest's") return c.json({ error: "only guests' comments can be hidden" }, 400);
    return c.json(result);
  };
  app.patch("/api/wikis/:id/messages/:mid", (c) => hide(c, setHidden));
  app.patch("/api/wikis/:id/answers/:mid", (c) => hide(c, setAnswerHidden));

  /** The element reference (docs/elements.md), rendered for the /dev/ui page. */
  app.get("/api/dev/elements", (c) => c.json(renderElements(registry.appRoot)));

  // The toolbox (Special:Page kits, Special:Elements): what pages of this wiki can use.
  app.get("/api/wikis/:id/kits", (c) => {
    const w = wikiOr404(c);
    if (w instanceof Response) return w;
    return c.json({ kits: kitsOf(w, registry.appRoot) });
  });

  app.get("/api/wikis/:id/elements", (c) => {
    const w = wikiOr404(c);
    if (w instanceof Response) return w;
    return c.json(data.elementsOf(w, registry.appRoot));
  });

  app.get("/api/wikis/:id/toolbox/*", (c) => {
    const w = wikiOr404(c);
    if (w instanceof Response) return w;
    const rel = c.req.path.slice(`/api/wikis/${w.id}/toolbox/`.length);
    if (!isToolboxFile(rel)) return c.json({ error: "not found" }, 404);
    return serveFile(c, join(registry.appRoot, "docs"), rel, { cache: false });
  });

  app.get("/api/events", (c) =>
    streamSSE(c, async (stream) => {
      const send = (e: LiveEvent) => void stream.writeSSE({ data: JSON.stringify(e) });
      // Share links, their guests and activity, for the Share dialog: one event per quarter second at most.
      let pending: NodeJS.Timeout | null = null;
      const shared = () => {
        pending ??= setTimeout(() => {
          pending = null;
          send({ type: "shares" });
        }, 250);
      };
      const offs = [live.subscribe(send), shares?.onUpdate(shared), tunnel?.onChange(shared)];
      const off = () => {
        for (const o of offs) o?.();
        if (pending) clearTimeout(pending);
      };
      stream.onAbort(off);
      while (!stream.aborted) {
        await stream.writeSSE({ event: "ping", data: "" });
        await stream.sleep(25_000);
      }
      off();
    }),
  );

  // Share links (ADR-0003), for the Share dialog; the guest server serves the links.
  const noSharing = (c: Context) =>
    c.json({ error: "Sharing needs the built app: start Shiori with start-web.bat." }, 409);

  const state = (s: Shares): SharesState => ({
    shares: s.list().map(s.info),
    tunnel: tunnel?.status() ?? { state: "off", url: null },
    host: s.host(),
  });
  app.get("/api/shares", (c) => (shares ? c.json(state(shares)) : noSharing(c)));

  /** Sets how the owner signs for guests: a display name no guest on an active link already uses. */
  const setHost = (s: Shares, raw: string): string | null => {
    const name = cleanName(raw);
    if (!name) return "a name is 2 to 32 characters";
    const lower = name.toLowerCase();
    if (s.list().some((x) => [...x.guests.values()].some((g) => g.name.toLowerCase() === lower)))
      return "a guest already uses that name";
    s.setHost(name);
    return null;
  };
  app.put("/api/shares/host", async (c) => {
    if (!shares) return noSharing(c);
    const body = hostSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "bad request" }, 400);
    const problem = setHost(shares, body.data.name);
    return problem ? c.json({ error: problem }, problem.startsWith("a guest") ? 409 : 400) : c.json(state(shares));
  });

  app.post("/api/shares", async (c) => {
    if (!shares) return noSharing(c);
    const body = newShareSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "bad request" }, 400);
    const { host, ...link } = body.data;
    if (!registry.get(link.wiki)) return c.json({ error: "no such wiki" }, 404);
    // A remembered name that no longer fits keeps the current one; the dialog shows which is used.
    if (host !== undefined) setHost(shares, host);
    try {
      return c.json(shares.info(shares.create(link)), 201);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 409);
    }
  });

  // After installing cloudflared, or when the tunnel failed: try again.
  app.post("/api/shares/tunnel", (c) => {
    if (!shares) return noSharing(c);
    if (!shares.list().length) return c.json({ error: "No link is active." }, 409);
    tunnel?.start();
    return c.json(state(shares));
  });

  app.patch("/api/shares/:sid/guests/:gid", async (c) => {
    if (!shares) return noSharing(c);
    const body = blockSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "bad request" }, 400);
    return shares.block(c.req.param("sid"), c.req.param("gid"), body.data.blocked)
      ? c.json(state(shares))
      : c.json({ error: "no such guest" }, 404);
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

// The guest server (ADR-0003): a second, separate Hono app for people who open a share link. It's an allowlist, not
// a filter in front of the owner's server: a route that isn't written here doesn't exist for guests. Every link
// route checks the link first, then the client's limits, then who the guest is.
import { readFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { join } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { type Context, Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getSignedCookie, setSignedCookie } from "hono/cookie";
import { z } from "zod";
import type { Answer, Authored, GuestSession, PageData, Thread, WikiDetail } from "../../shared/api.ts";
import { addAnswer, listAnswers } from "../answers.ts";
import { serveFile } from "../files.ts";
import type { Registry, Wiki } from "../registry.ts";
import { search } from "../search.ts";
import {
  addMessage,
  createThread,
  getThread,
  listThreads,
  setStatus,
  startedBy,
  visible,
  visibleThreads,
} from "../threads.ts";
import { isToolboxFile, kitsOf } from "../toolbox.ts";
import { answerProblem, type WikiData } from "../wikiData.ts";
import { LIMITS } from "./limits.ts";
import { type Guest, newGuestId, type Share, type Shares, TOKEN } from "./shares.ts";

const COOKIE = "shiori_guest";

/** Embeds `::embed` may show (server/markdown/elements.ts). */
const FRAMES = ["https://www.youtube-nocookie.com", "https://player.vimeo.com", "https://www.figma.com"];
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // Radix and the theme set inline styles; styles can't run code.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  // Vite inlines the smallest font files as data: URLs.
  "font-src 'self' data:",
  "media-src 'self'",
  "connect-src 'self'",
  `frame-src ${FRAMES.join(" ")}`,
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join("; ");

const bytes = (s: string) => Buffer.byteLength(s, "utf8");
const text = (max: number) => z.string().max(max);
const body = (required: boolean) =>
  z
    .string()
    .trim()
    .refine((s) => bytes(s) <= LIMITS.comment, `at most ${LIMITS.comment} bytes`)
    .refine((s) => !required || s.length > 0, "empty");
const quoteSchema = z.strictObject({
  exact: z.string().max(LIMITS.quote),
  prefix: z.string().max(LIMITS.context),
  suffix: z.string().max(LIMITS.context),
});
const pagePath = text(300);
const newThreadSchema = z.strictObject({ page: pagePath, quote: quoteSchema, body: body(true) });
const messageSchema = z.strictObject({ body: body(true) });
// Guests resolve and reopen their own threads; "won't fix" is the owner's call.
const statusSchema = z.strictObject({ status: z.enum(["open", "resolved"]) });
const newAnswerSchema = z.strictObject({
  page: pagePath,
  question: text(100).min(1),
  choice: text(200).min(1).nullable().default(null),
  body: body(false).default(""),
});
const joinSchema = z.strictObject({ name: z.string().max(200) });

/** A display name: 2–32 characters after trimming, no control or invisible characters. */
export function cleanName(raw: string): string | null {
  const name = raw.normalize("NFC").trim().replace(/\s+/g, " ");
  const length = [...name].length;
  if (length < 2 || length > 32 || /[\p{C}]/u.test(name)) return null;
  return name;
}
/** Names a guest can't take, so nobody signs as the owner or an agent. The owner's chosen name is taken too. */
const RESERVED = new Set(["host", "owner", "agent", "you", "shiori", "admin"]);

type Env = { Variables: { share: Share; ip: string; guest: Guest | null } };

export interface GuestAppOptions {
  registry: Registry;
  data: WikiData;
  shares: Shares;
  /** The built UI (dist/). Without it, links serve only the API. */
  staticDir?: string;
  /** Signs the guest cookie. A fresh one each run. */
  secret: string;
}

export function buildGuestApp({ registry, data, shares, staticDir, secret }: GuestAppOptions) {
  const app = new Hono<Env>();
  const now = () => shares.now();

  app.use("*", async (c, next) => {
    await next();
    c.header("content-security-policy", CSP);
    c.header("referrer-policy", "no-referrer");
    c.header("x-content-type-options", "nosniff");
    c.header("x-frame-options", "DENY");
    c.header("cross-origin-opener-policy", "same-origin");
    c.header("cross-origin-resource-policy", "same-origin");
    // `private` keeps Cloudflare's edge from caching anything behind a link. Media set their own.
    if (!c.req.path.startsWith("/assets/") && !c.res.headers.has("cache-control")) {
      c.header("cache-control", "private, no-store");
    }
  });

  // The app's code and styles hold no wiki data, so they're served without a link.
  if (staticDir) {
    app.use("/assets/*", serveStatic({ root: staticDir }));
    app.get("/favicon.svg", serveStatic({ root: staticDir }));
  }

  // ── The link ──────────────────────────────────────────────────────────────────────────────────────────────────
  /** A 429. Five of them in ten minutes block the guest and their address for the rest of the link's life. */
  const tooMany = (c: Context<Env>, wait: number, key: string) => {
    const share = c.get("share");
    const guest = c.get("guest");
    const ip = c.get("ip");
    const t = now();
    if (share.limits.strike(`ip:${ip}`, t) || (guest && share.limits.strike(`guest:${guest.id}`, t))) {
      share.blockedIps.add(ip);
      if (guest) guest.blocked = true;
      shares.log(share, guest?.name ?? ip, "blocked for going over the limits");
    } else shares.log(share, guest?.name ?? ip, `went over the ${key} limit`);
    c.header("retry-after", String(Math.max(1, Math.ceil(wait / 1000))));
    return c.json({ error: "too many requests, slow down" }, 429);
  };

  /** The built app's page. It holds no wiki data: the app asks the API for everything. */
  const shell = () => (staticDir ? readFileSync(join(staticDir, "index.html"), "utf8") : null);
  /**
   * A link that can't be opened. The API answers JSON; a page (a guest opening or reloading the link) gets the bare
   * app with the same status, so the gate can say why from its own `/api/session` call.
   */
  const refuse = (c: Context<Env>, status: 403 | 404 | 410, error: string) => {
    const token = c.req.param("token") ?? "";
    const page = c.req.method === "GET" && TOKEN.test(token) && !c.req.path.startsWith(`/s/${token}/api/`);
    const html = page ? shell() : null;
    return html === null ? c.json({ error }, status) : c.html(html, status);
  };

  const link: MiddlewareHandler<Env> = async (c, next) => {
    const token = c.req.param("token") ?? "";
    const found = TOKEN.test(token) ? shares.find(token) : null;
    if (!found) return refuse(c, 404, "not found");
    if ("gone" in found) return refuse(c, 410, "this link has expired or was turned off");
    const { share } = found;
    // cloudflared is the only client of this loopback server, and it sets the visitor's address.
    const incoming = (c.env as { incoming?: IncomingMessage } | undefined)?.incoming;
    const ip = c.req.header("cf-connecting-ip") ?? incoming?.socket.remoteAddress ?? "local";
    c.set("share", share);
    c.set("ip", ip);
    c.set("guest", null);
    if (share.blockedIps.has(ip)) return refuse(c, 403, "blocked");
    const id = await getSignedCookie(c, secret, COOKIE);
    const guest = id ? (share.guests.get(id) ?? null) : null;
    if (guest?.blocked) return refuse(c, 403, "blocked");
    c.set("guest", guest);
    const wait = share.limits.read(ip, now());
    if (wait) return tooMany(c, wait, "request");
    if (guest) guest.lastSeen = now();
    return next();
  };
  app.use("/s/:token", link);
  app.use("/s/:token/*", link);
  app.get("/s/:token", (c) => c.redirect(`/s/${c.get("share").token}/`, 301));

  /** Cross-site requests can't write: the browser's Origin must be this host. */
  const sameOrigin: MiddlewareHandler = async (c, next) => {
    const origin = c.req.header("origin");
    let ok = false;
    try {
      ok = !!origin && new URL(origin).host === new URL(c.req.url).host;
    } catch {}
    return ok ? next() : c.json({ error: "cross-site request" }, 403);
  };
  const small = bodyLimit({ maxSize: LIMITS.request, onError: (c) => c.json({ error: "request too large" }, 413) });

  const session = (c: Context<Env>): GuestSession => {
    const share = c.get("share");
    const guest = c.get("guest");
    const w = registry.get(share.wiki);
    return {
      wiki: { id: share.wiki, title: w?.manifest.title ?? share.wiki },
      kind: share.kind,
      expiresAt: share.expiresAt === null ? null : new Date(share.expiresAt).toISOString(),
      guest: guest ? { name: guest.name } : null,
      host: shares.host(),
    };
  };

  app.get("/s/:token/api/session", (c) => c.json(session(c)));

  // Joining: pick a display name, get a signed cookie scoped to this link.
  app.post("/s/:token/api/session", sameOrigin, small, async (c) => {
    const share = c.get("share");
    const parsed = joinSchema.safeParse(await c.req.json().catch(() => null));
    const name = parsed.success ? cleanName(parsed.data.name) : null;
    if (!name) return c.json({ error: "a name is 2 to 32 characters" }, 400);
    const current = c.get("guest");
    const taken = [...share.guests.values()].some(
      (g) => g.id !== current?.id && g.name.toLowerCase() === name.toLowerCase(),
    );
    const reserved = RESERVED.has(name.toLowerCase()) || name.toLowerCase() === shares.host().toLowerCase();
    if (taken || reserved) return c.json({ error: "that name is taken" }, 409);
    if (current) {
      shares.log(share, current.name, `is now ${name}`);
      current.name = name;
      return c.json(session(c));
    }
    if (share.guests.size >= LIMITS.guests) return c.json({ error: "this link is full" }, 403);
    const wait = share.limits.join(c.get("ip"), now());
    if (wait) return tooMany(c, wait, "join");
    const t = now();
    const guest: Guest = {
      id: newGuestId(),
      name,
      ip: c.get("ip"),
      joinedAt: t,
      lastSeen: t,
      writes: 0,
      blocked: false,
    };
    share.guests.set(guest.id, guest);
    shares.log(share, name, "joined");
    await setSignedCookie(c, COOKIE, guest.id, secret, {
      path: `/s/${share.token}/`,
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
      ...(share.expiresAt === null ? {} : { expires: new Date(share.expiresAt) }),
    });
    c.set("guest", guest);
    return c.json(session(c), 201);
  });

  // ── The wiki, for guests who joined ──────────────────────────────────────────────────────────────────────────
  type WikiEnv = { Variables: Env["Variables"] & { wiki: Wiki; me: Guest } };
  /** The link's own wiki, for a guest who has a name; any other wiki id doesn't exist. */
  const wikiOnly: MiddlewareHandler<WikiEnv> = async (c, next) => {
    const share = c.get("share");
    const wiki = c.req.param("id") === share.wiki ? registry.get(share.wiki) : undefined;
    if (!wiki) return c.json({ error: "not found" }, 404);
    const guest = c.get("guest");
    if (!guest) return c.json({ error: "pick a name first" }, 401);
    c.set("wiki", wiki);
    c.set("me", guest);
    return next();
  };
  /** Writes need a comment link, this site's Origin, a small body and room under the guest's limits. */
  const writes: MiddlewareHandler<WikiEnv> = async (c, next) => {
    if (c.get("share").kind !== "comment") return c.json({ error: "this link is view-only" }, 403);
    const me = c.get("me");
    const wait = c.get("share").limits.write(me.id, now());
    if (wait) return tooMany(c as unknown as Context<Env>, wait, "comment");
    me.writes++;
    return next();
  };
  // `wikiOnly` has already run for every wiki route.
  const write = [sameOrigin, small, writes] as const;

  /** What guests see of who wrote something: never guest ids; the owner signs with the name they picked. */
  const authored = <T extends Authored>(x: T, me: Guest): T => {
    const { guestId, hidden: _, ...rest } = x;
    return { ...rest, name: x.author === "user" ? shares.host() : x.name, mine: !!guestId && guestId === me.id } as T;
  };
  /** Callers pass threads through `visible` first: what the owner hid never reaches guests. */
  const threadFor = (t: Thread, me: Guest): Thread => ({ ...t, messages: t.messages.map((m) => authored(m, me)) });
  const answerFor = (a: Answer, me: Guest): Answer => authored(a, me);

  const api = new Hono<WikiEnv>();
  api.use("/wikis/:id", wikiOnly);
  api.use("/wikis/:id/*", wikiOnly);

  api.get("/wikis/:id", (c) => {
    const detail: WikiDetail = { ...data.detail(c.get("wiki")), problems: [] };
    return c.json(detail);
  });

  api.get("/wikis/:id/page", (c) => {
    const page = data.corpusOf(c.get("wiki")).pages.get(c.req.query("path") ?? "");
    if (!page) return c.json({ error: "no such page" }, 404);
    const forGuest: PageData = { ...page, problems: [] };
    return c.json(forGuest);
  });

  api.get("/wikis/:id/pages", (c) => c.json(data.index(c.get("wiki"))));

  api.get("/wikis/:id/images", (c) => c.json({ groups: data.corpusOf(c.get("wiki")).images }));

  api.get("/wikis/:id/search", (c) =>
    c.json({ hits: search(data.corpusOf(c.get("wiki")).search, (c.req.query("q") ?? "").slice(0, 200)) }),
  );

  api.get("/wikis/:id/files/*", async (c) => {
    const w = c.get("wiki");
    const res = await serveFile(c, w.root, c.req.path.slice(c.req.path.indexOf("/files/") + "/files/".length));
    if (res.status === 200 || res.status === 304) res.headers.set("cache-control", "private, no-cache");
    return res;
  });

  // The toolbox, read-only: the wiki's kits (never their files) and the element reference with its pictures.
  api.get("/wikis/:id/kits", (c) => c.json({ kits: kitsOf(c.get("wiki"), registry.appRoot) }));

  api.get("/wikis/:id/elements", (c) => c.json(data.elementsOf(c.get("wiki"), registry.appRoot)));

  api.get("/wikis/:id/toolbox/*", async (c) => {
    const rel = c.req.path.slice(c.req.path.indexOf("/toolbox/") + "/toolbox/".length);
    if (!isToolboxFile(rel)) return c.json({ error: "not found" }, 404);
    const res = await serveFile(c, join(registry.appRoot, "docs"), rel, { cache: false });
    if (res.status === 200 || res.status === 304) res.headers.set("cache-control", "private, no-cache");
    return res;
  });

  // Live updates for guests: the tunnel can't carry server-sent events, so the request itself waits (long polling).
  // With `wait` (seconds, at most 25) and the ETag the guest has, the answer comes when the wiki changes, or as an
  // empty 304 when the time is up. Either way the guest asks again at once.
  // Live updates for guests: the tunnel can't carry server-sent events, so the request itself waits (long polling).
  // With `wait` (seconds, at most 25) and the ETag the guest has, the answer comes when the wiki changes, or as an
  // empty 304 when the time is up. Either way the guest asks again at once.
  api.get("/wikis/:id/changes", async (c) => {
    const w = c.get("wiki");
    const tag = () => {
      const v = data.version(w);
      return `"${v.pages}.${v.threads}"`;
    };
    // Cloudflare may weaken the ETag on the way.
    const known = c.req.header("if-none-match")?.replace(/^W\//, "");
    const wait = Math.min(Math.max(Number(c.req.query("wait")) || 0, 0), LIMITS.longPoll);
    if (known === tag() && wait > 0) await data.waitForChange(w, wait * 1000, c.req.raw.signal);
    const etag = tag();
    if (known === etag) return c.body(null, 304, { etag });
    c.header("etag", etag);
    return c.json(data.version(w));
  });

  api.get("/wikis/:id/threads", (c) => {
    const me = c.get("me");
    const threads = visibleThreads(listThreads(c.get("wiki").root, { page: c.req.query("page") }));
    return c.json({ threads: threads.map((t) => threadFor(t, me)) });
  });

  api.get("/wikis/:id/answers", (c) => {
    const me = c.get("me");
    return c.json({
      answers: listAnswers(c.get("wiki").root, { page: c.req.query("page") })
        .filter((a) => !a.hidden)
        .map((a) => answerFor(a, me)),
    });
  });

  const me = (c: Context<WikiEnv>) => ({ guest: c.get("me").id, name: c.get("me").name });
  /** A thread as guests may see it; a hidden one doesn't exist for them. */
  const shown = (w: Wiki, id: number) => {
    const t = getThread(w.root, id);
    return t && visible(t);
  };
  const json = async (c: Context<WikiEnv>) => c.req.json().catch(() => null);

  api.post("/wikis/:id/threads", ...write, async (c) => {
    const w = c.get("wiki");
    const parsed = newThreadSchema.safeParse(await json(c));
    if (!parsed.success) return c.json({ error: "bad request" }, 400);
    const { page, quote, body: text } = parsed.data;
    if (!data.corpusOf(w).pages.has(page)) return c.json({ error: "no such page" }, 404);
    const t = createThread(w.root, page, quote, text, me(c));
    shares.log(c.get("share"), c.get("me").name, `commented on ${page || "the home page"}`);
    return c.json(threadFor(t, c.get("me")), 201);
  });

  api.post("/wikis/:id/threads/:tid/messages", ...write, async (c) => {
    const w = c.get("wiki");
    const parsed = messageSchema.safeParse(await json(c));
    if (!parsed.success) return c.json({ error: "bad request" }, 400);
    const id = Number(c.req.param("tid"));
    const t = shown(w, id);
    if (!t) return c.json({ error: "no such thread" }, 404);
    if (t.status !== "open") return c.json({ error: "this thread is closed" }, 409);
    addMessage(w.root, id, me(c), parsed.data.body);
    shares.log(c.get("share"), c.get("me").name, `replied to #${id}`);
    return c.json(threadFor(shown(w, id) as Thread, c.get("me")));
  });

  api.patch("/wikis/:id/threads/:tid", ...write, async (c) => {
    const w = c.get("wiki");
    const parsed = statusSchema.safeParse(await json(c));
    if (!parsed.success) return c.json({ error: "bad request" }, 400);
    const id = Number(c.req.param("tid"));
    const t = shown(w, id);
    if (!t) return c.json({ error: "no such thread" }, 404);
    if (startedBy(t) !== c.get("me").id) return c.json({ error: "only the person who started it can do that" }, 403);
    setStatus(w.root, id, parsed.data.status);
    shares.log(c.get("share"), c.get("me").name, `${parsed.data.status === "open" ? "reopened" : "resolved"} #${id}`);
    return c.json(threadFor(shown(w, id) as Thread, c.get("me")));
  });

  api.post("/wikis/:id/answers", ...write, async (c) => {
    const w = c.get("wiki");
    const parsed = newAnswerSchema.safeParse(await json(c));
    if (!parsed.success) return c.json({ error: "bad request" }, 400);
    const { page, question, choice, body: note } = parsed.data;
    const problem = answerProblem(data.corpusOf(w).pages.get(page), { question, choice, body: note });
    if (problem) return c.json({ error: problem.error }, problem.status);
    const a = addAnswer(w.root, page, question, choice, note, me(c));
    shares.log(c.get("share"), c.get("me").name, `answered ${question} on ${page || "the home page"}`);
    return c.json(answerFor(a, c.get("me")), 201);
  });

  api.all("*", (c) => c.json({ error: "not found" }, 404));
  app.route("/s/:token/api", api as unknown as Hono<Env>);

  // Any other path under a link is the app, which routes itself.
  app.get("/s/:token/*", (c) => {
    const html = shell();
    return html === null ? c.notFound() : c.html(html);
  });
  app.all("*", (c) => c.json({ error: "not found" }, 404));
  return app;
}

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
import {
  type Answer,
  type Authored,
  type GuestSession,
  type Message,
  type PageData,
  REACTIONS,
  type Thread,
  type WikiDetail,
} from "../../shared/api.ts";
import { addAnswer, listAnswers } from "../answers.ts";
import { ATTACHMENT_LIMITS, ATTACHMENT_NAME, attachmentsDir, hasAttachment, saveAttachment } from "../attachments.ts";
import { designRoutes } from "../designRoutes.ts";
import { PICTURE_MIME } from "../designs.ts";
import { serveFile } from "../files.ts";
import { historyOf, versionOf } from "../history.ts";
import { createEditions, type Editions } from "../public/output.ts";
import { listQuestions, questionQueryFrom, questionsWaiting } from "../questionList.ts";
import type { Registry, Wiki } from "../registry.ts";
import { filterFrom, notesOf, search, searchNotes } from "../search.ts";
import {
  addMessage,
  createThread,
  editMessage,
  getThread,
  listThreads,
  messageAuthor,
  react,
  removeThread,
  setStatus,
  startedBy,
  threadOfMessage,
  visible,
  visibleThreads,
} from "../threads.ts";
import { answerPick, type WikiData } from "../wikiData.ts";
import { boardRoutes } from "./boards.ts";
import type { GuestKit, TargetEnv } from "./kit.ts";
import { LIMITS } from "./limits.ts";
import { type Presence, placeOf, presenceFor, withTitles } from "./presence.ts";
import { mountPublicSite } from "./public.ts";
import { type Guest, newGuestId, type Share, type Shares, TOKEN } from "./shares.ts";
import { sheetRoutes } from "./sheets.ts";

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
const images = z.array(z.string().regex(ATTACHMENT_NAME)).max(ATTACHMENT_LIMITS.perMessage).default([]);
const newThreadSchema = z.strictObject({ page: pagePath, quote: quoteSchema, body: body(true), images });
const messageSchema = z.strictObject({ body: body(true) });
// Guests resolve and reopen their own threads; "won't fix" is the owner's call.
const statusSchema = z.strictObject({ status: z.enum(["open", "resolved"]) });
const newAnswerSchema = z.strictObject({
  page: pagePath,
  question: text(100).min(1),
  choice: text(200).min(1).nullable().default(null),
  choices: z.array(text(200).min(1)).max(50).optional(),
  body: body(false).default(""),
});
const reactionSchema = z.strictObject({ emoji: z.enum(REACTIONS), on: z.boolean() });
const joinSchema = z.strictObject({ name: z.string().max(200) });
const hereSchema = z.strictObject({ page: pagePath.nullable() });

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
  /** Who is on each wiki (ADR-0005), shared with the owner's server. */
  presence?: Presence;
  /** The wikis' public editions (ADR-0011), shared with the owner's server. */
  editions?: Editions;
}

export function buildGuestApp({
  registry,
  data,
  shares,
  staticDir,
  secret,
  presence = presenceFor(shares),
  editions = createEditions(data),
}: GuestAppOptions) {
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
    // A public link (ADR-0011) opens only its static site, under /p/.
    if (share.kind === "public") return refuse(c, 404, "not found");
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
      ...(share.target ? { target: share.target } : {}),
      ...(share.kind === "sheet" ? { edit: share.edit } : {}),
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
      presence.renamed(`guest:${current.id}`);
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
  /**
   * The link's own wiki, for a guest who has a name; any other wiki id doesn't exist. Board and sheet links
   * (ADR-0010) have no wiki at all: for them, none exists.
   */
  const wikiOnly: MiddlewareHandler<WikiEnv> = async (c, next) => {
    const share = c.get("share");
    const reads = share.kind === "view" || share.kind === "comment";
    const wiki = reads && c.req.param("id") === share.wiki ? registry.get(share.wiki) : undefined;
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
  /** Reactions as guests see them: names, never guest ids, and which are this guest's own. */
  const reactionsFor = (m: Message, me: Guest): Message =>
    m.reactions
      ? {
          ...m,
          reactions: m.reactions.map((r) => ({
            emoji: r.emoji,
            by: r.by.map(({ guestId, ...who }) => ({
              ...who,
              name: who.author === "user" ? shares.host() : who.name,
              mine: !!guestId && guestId === me.id,
            })),
          })),
        }
      : m;
  /** Callers pass threads through `visible` first: what the owner hid never reaches guests. */
  const threadFor = (t: Thread, me: Guest): Thread => ({
    ...t,
    messages: t.messages.map((m) => reactionsFor(authored(m, me), me)),
  });
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

  // A page's history (ADR-0008), read-only, for every link: its commits and the page as it was. Only versions from
  // the page's own history open, and nothing says where the repo is (no remote, no paths in it).
  api.get("/wikis/:id/history", async (c) => {
    const history = await historyOf(c.get("wiki"), data, c.req.query("path") ?? "");
    return history ? c.json(history) : c.json({ error: "no such page" }, 404);
  });

  api.get("/wikis/:id/history/:version", async (c) => {
    const version = await versionOf(c.get("wiki"), data, c.req.query("path") ?? "", c.req.param("version"));
    return version ? c.json(version) : c.json({ error: "no such version" }, 404);
  });

  // Like the owner's search; comments and answers only as guests see them (nothing the owner hid).
  api.get("/wikis/:id/search", (c) => {
    const w = c.get("wiki");
    const q = (c.req.query("q") ?? "").slice(0, 200);
    const { pages, search: docs } = data.corpusOf(w);
    const isOpen = (p: string, q: string) => pages.get(p)?.questions.find((x) => x.id === q)?.status === "open";
    const answers = listAnswers(w.root).filter((a) => !a.hidden);
    const notes = notesOf(visibleThreads(listThreads(w.root)), answers, isOpen);
    return c.json({
      hits: search(
        docs,
        q,
        20,
        filterFrom((k) => c.req.query(k)),
      ),
      notes: searchNotes(notes, q, (p) => pages.get(p)),
    });
  });

  api.get("/wikis/:id/files/*", async (c) => {
    const w = c.get("wiki");
    const rel = c.req.path.slice(c.req.path.indexOf("/files/") + "/files/".length);
    // Designs' files go through the designs routes, which keep what the owner hid from guests.
    if (/^designs(\/|%2f|$)/i.test(rel)) return c.json({ error: "not found" }, 404);
    const res = await serveFile(c, w.root, rel);
    if (res.status === 200 || res.status === 304) res.headers.set("cache-control", "private, no-cache");
    return res;
  });

  // Live updates for guests: the tunnel can't carry server-sent events, so the request itself waits (long polling).
  // With `wait` (seconds, at most 25) and the ETag the guest has, the answer comes when the wiki changes, or as an
  // empty 304 when the time is up. Either way the guest asks again at once.
  // The version covers pages, comments and who is here: the host, and this link's guests (ADR-0005).
  api.get("/wikis/:id/changes", async (c) => {
    const w = c.get("wiki");
    const share = c.get("share");
    const version = () => ({ ...data.version(w), presence: presence.version(w.id, share.id) });
    const tag = () => {
      const v = version();
      return `"${v.pages}.${v.threads}.${v.designs}.${v.presence}"`;
    };
    // Cloudflare may weaken the ETag on the way.
    const known = c.req.header("if-none-match")?.replace(/^W\//, "");
    const wait = Math.min(Math.max(Number(c.req.query("wait")) || 0, 0), LIMITS.longPoll);
    if (known === tag() && wait > 0) {
      // Wake on the wiki changing, on someone this guest can see moving, or on the guest leaving.
      const wake = new AbortController();
      const stop = () => wake.abort();
      c.req.raw.signal.addEventListener("abort", stop);
      const off = presence.onChange((wiki, link) => {
        if (wiki === w.id && (link === null || link === share.id)) stop();
      });
      await data.waitForChange(w, wait * 1000, wake.signal);
      off();
      c.req.raw.signal.removeEventListener("abort", stop);
    }
    const etag = tag();
    if (known === etag) return c.body(null, 304, { etag });
    c.header("etag", etag);
    return c.json(version());
  });

  // Presence (ADR-0005): a guest says which page they're on and sees the host and their own link's guests. View
  // links report too: reading is being here. Over the presence limit a report is dropped with a 429 that counts no
  // strike; the read limit on every request still guards the address.
  const here = (c: Context<WikiEnv>) => ({ key: `guest:${c.get("me").id}`, share: c.get("share").id });
  const people = (c: Context<WikiEnv>) => {
    const w = c.get("wiki");
    const { key, share } = here(c);
    return withTitles(presence.list(w.id, { role: "guest", share, key }), (p) => data.corpusOf(w).pages.get(p)?.title);
  };
  const reporting: MiddlewareHandler<WikiEnv> = async (c, next) => {
    const wait = c.get("share").limits.presence(c.get("me").id, now());
    if (!wait) return next();
    c.header("retry-after", String(Math.max(1, Math.ceil(wait / 1000))));
    return c.json({ error: "too many requests, slow down" }, 429);
  };

  api.get("/wikis/:id/presence", (c) => c.json({ people: people(c) }));

  api.put("/wikis/:id/presence", sameOrigin, small, reporting, async (c) => {
    const w = c.get("wiki");
    const parsed = hereSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "bad request" }, 400);
    const page = placeOf(parsed.data.page, (p) => data.corpusOf(w).pages.has(p));
    const { key, share } = here(c);
    presence.report({ key, wiki: w.id, role: "guest", share, guest: c.get("me").id, page });
    return c.json({ people: people(c) });
  });

  api.delete("/wikis/:id/presence", sameOrigin, reporting, (c) => {
    presence.leave(here(c).key);
    return c.body(null, 204);
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

  // Questions across the wiki (ADR-0009), as on the owner's server: this guest's own answers are "mine", and nothing
  // the owner hid is there.
  api.get("/wikis/:id/questions", (c) => {
    const w = c.get("wiki");
    const me = c.get("me");
    const list = listQuestions(
      data.corpusOf(w),
      w.root,
      questionQueryFrom((k) => c.req.query(k)),
      { guest: me.id },
    );
    return c.json({
      ...list,
      items: list.items.map(({ mine, answerList, ...item }) => ({
        ...item,
        ...(mine ? { mine: answerFor(mine, me) } : {}),
        ...(answerList ? { answerList: answerList.map((a) => answerFor(a, me)) } : {}),
      })),
    });
  });

  api.get("/wikis/:id/questions/waiting", (c) =>
    c.json(questionsWaiting(data.corpusOf(c.get("wiki")), c.get("wiki").root, { guest: c.get("me").id })),
  );

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
    const { page, quote, body: text, images: files } = parsed.data;
    if (!data.corpusOf(w).pages.has(page)) return c.json({ error: "no such page" }, 404);
    if (!files.every((f) => hasAttachment(w.root, f))) return c.json({ error: "no such picture" }, 400);
    const t = createThread(w.root, page, quote, text, me(c), files);
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

  // A guest removes a thread they started (their change request), and only theirs.
  api.delete("/wikis/:id/threads/:tid", ...write, (c) => {
    const w = c.get("wiki");
    const id = Number(c.req.param("tid"));
    const t = shown(w, id);
    if (!t) return c.json({ error: "no such thread" }, 404);
    if (startedBy(t) !== c.get("me").id) return c.json({ error: "only the person who started it can do that" }, 403);
    removeThread(w.root, id);
    shares.log(c.get("share"), c.get("me").name, `removed #${id}`);
    return c.body(null, 204);
  });

  // Pictures for a guest's comment: a comment link, this site's Origin, the picture limit, and the guest's daily
  // budget for pictures (shared with designs). They're named in the thread after.
  const pictureBody = bodyLimit({
    maxSize: ATTACHMENT_LIMITS.bytes,
    onError: (c) => c.json({ error: "the picture is too big" }, 413),
  });
  api.post("/wikis/:id/attachments", sameOrigin, pictureBody, async (c) => {
    const share = c.get("share");
    if (share.kind !== "comment") return c.json({ error: "this link is view-only" }, 403);
    const type = c.req.header("content-type") ?? "";
    if (!PICTURE_MIME.includes(type)) return c.json({ error: "add a PNG, JPEG, WebP or GIF picture" }, 415);
    const bytes = Buffer.from(await c.req.arrayBuffer());
    if (!share.limits.designBytes(c.get("me").id, bytes.length, now())) {
      c.header("retry-after", "3600");
      return c.json({ error: "that's all the pictures for today" }, 429);
    }
    const saved = saveAttachment(c.get("wiki").root, type, bytes);
    return typeof saved === "string" ? c.json({ error: saved }, 400) : c.json(saved, 201);
  });

  // A picture only when a message the guest can see carries it.
  api.get("/wikis/:id/attachments/:file", async (c) => {
    const w = c.get("wiki");
    const file = c.req.param("file");
    const seen = visibleThreads(listThreads(w.root)).some((t) => t.messages.some((m) => m.images?.includes(file)));
    if (!ATTACHMENT_NAME.test(file) || !seen) return c.json({ error: "not found" }, 404);
    const res = await serveFile(c, attachmentsDir(w.root), file, { cache: false });
    if (res.status === 200 || res.status === 304) res.headers.set("cache-control", "private, no-cache");
    return res;
  });

  // A guest edits one of their own messages, on a thread they can see that's still open (ADR-0010).
  api.patch("/wikis/:id/messages/:mid", ...write, async (c) => {
    const w = c.get("wiki");
    const parsed = messageSchema.safeParse(await json(c));
    if (!parsed.success) return c.json({ error: "bad request" }, 400);
    const mid = Number(c.req.param("mid"));
    const who = messageAuthor(w.root, mid);
    const t = who ? shown(w, who.thread) : null;
    if (!who || !t?.messages.some((m) => m.id === mid)) return c.json({ error: "no such message" }, 404);
    if (who.author !== "guest" || who.guestId !== c.get("me").id)
      return c.json({ error: "you can only edit what you wrote" }, 403);
    if (t.status !== "open") return c.json({ error: "this thread is closed" }, 409);
    editMessage(w.root, mid, parsed.data.body);
    shares.log(c.get("share"), c.get("me").name, `edited a message on #${t.id}`);
    return c.json(threadFor(shown(w, t.id) as Thread, c.get("me")));
  });

  // Reactions on a message the guest can see; hidden messages and threads don't exist for them.
  api.post("/wikis/:id/messages/:mid/reactions", ...write, async (c) => {
    const w = c.get("wiki");
    const parsed = reactionSchema.safeParse(await json(c));
    if (!parsed.success) return c.json({ error: "bad request" }, 400);
    const mid = Number(c.req.param("mid"));
    const tid = threadOfMessage(w.root, mid);
    const t = tid === null ? null : shown(w, tid);
    if (!t?.messages.some((m) => m.id === mid)) return c.json({ error: "no such message" }, 404);
    react(w.root, mid, parsed.data.emoji, me(c), parsed.data.on);
    if (parsed.data.on) shares.log(c.get("share"), c.get("me").name, `reacted ${parsed.data.emoji} on #${t.id}`);
    return c.json(threadFor(shown(w, t.id) as Thread, c.get("me")));
  });

  api.post("/wikis/:id/answers", ...write, async (c) => {
    const w = c.get("wiki");
    const parsed = newAnswerSchema.safeParse(await json(c));
    if (!parsed.success) return c.json({ error: "bad request" }, 400);
    const { page, question, choice, choices, body: note } = parsed.data;
    const checked = answerPick(data.corpusOf(w).pages.get(page), { question, choice, choices, body: note });
    if ("error" in checked) return c.json({ error: checked.error }, checked.status);
    const a = addAnswer(w.root, page, question, checked.pick, note, me(c));
    shares.log(c.get("share"), c.get("me").name, `answered ${question} on ${page || "the home page"}`);
    return c.json(answerFor(a, c.get("me")), 201);
  });

  // Designs (ADR-0006): every guest sees them; on a comment link a guest makes their own and changes only those.
  // Writes need this site's Origin and room under the guest's limits; going over the save rate just waits, while
  // making designs and adding pictures count like comments.
  api.use("/wikis/:id/designs/*", async (c, next) => (c.req.method === "GET" ? next() : sameOrigin(c, next)));
  api.route(
    "/wikis/:id/designs",
    designRoutes({
      wikiOf: (c) => (c as unknown as Context<WikiEnv>).get("wiki"),
      viewerOf: (c) => {
        const ctx = c as unknown as Context<WikiEnv>;
        const me = ctx.get("me");
        return { kind: "guest", id: me.id, name: me.name, canWrite: ctx.get("share").kind === "comment" };
      },
      hostName: () => shares.host(),
      limit: (c, kind, bytes) => {
        const ctx = c as unknown as Context<Env>;
        const share = ctx.get("share");
        const me = ctx.get("guest") as Guest;
        const t = now();
        if (kind === "save") {
          const wait = share.limits.designSave(me.id, t);
          if (wait) {
            ctx.header("retry-after", String(Math.max(1, Math.ceil(wait / 1000))));
            return ctx.json({ error: "too many requests, slow down" }, 429);
          }
        } else {
          const wait = (kind === "create" && share.limits.designCreate(me.id, t)) || share.limits.write(me.id, t);
          if (wait) return tooMany(ctx, wait, kind === "create" ? "design" : "picture");
          me.writes++;
        }
        if (bytes && !share.limits.designBytes(me.id, bytes, t)) {
          ctx.header("retry-after", "3600");
          return ctx.json({ error: "that's all the drawing and pictures for today" }, 429);
        }
        return null;
      },
      log: (c, what) => {
        const ctx = c as unknown as Context<Env>;
        shares.log(ctx.get("share"), (ctx.get("guest") as Guest).name, what);
      },
    }) as unknown as Hono<WikiEnv>,
  );

  api.all("*", (c) => c.json({ error: "not found" }, 404));

  // Board and sheet links (ADR-0010), each an allowlist of its own. Mounted before the wiki's API so they're found.
  const kit: GuestKit = {
    registry,
    data,
    shares,
    now,
    sameOrigin,
    small,
    tooMany,
    waitForChange: async (c: Context<TargetEnv>, tag: () => string) => {
      const known = c.req.header("if-none-match")?.replace(/^W\//, "");
      const wait = Math.min(Math.max(Number(c.req.query("wait")) || 0, 0), LIMITS.longPoll);
      if (known === tag() && wait > 0) {
        const wake = new AbortController();
        const stop = () => wake.abort();
        c.req.raw.signal.addEventListener("abort", stop);
        await data.waitForChange(c.get("wiki"), wait * 1000, wake.signal);
        c.req.raw.signal.removeEventListener("abort", stop);
      }
      const etag = tag();
      if (known === etag) return c.body(null, 304, { etag });
      c.header("etag", etag);
      return c.json({ version: etag });
    },
  };
  app.route("/s/:token/api/board", boardRoutes(kit) as unknown as Hono<Env>);
  app.route("/s/:token/api/sheet", sheetRoutes(kit) as unknown as Hono<Env>);
  app.route("/s/:token/api", api as unknown as Hono<Env>);

  // Public links (ADR-0011): the public edition's files, and nothing else.
  mountPublicSite(app, { registry, shares, editions, now });

  // Any other path under a link is the app, which routes itself.
  app.get("/s/:token/*", (c) => {
    const html = shell();
    return html === null ? c.notFound() : c.html(html);
  });
  app.all("*", (c) => c.json({ error: "not found" }, 404));
  return app;
}

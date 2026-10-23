// A public link (ADR-0011): readers get the wiki's public edition, the same static files the export zips, and
// nothing else. No name, no cookie, no API: every path under the link is a file of the edition or its 404 page, so
// pages that aren't public, comments and the app itself can't be reached through it.
import type { IncomingMessage } from "node:http";
import type { Context, Hono } from "hono";
import { type Editions, editionResponse } from "../public/output.ts";
import type { Registry } from "../registry.ts";
import { type Shares, TOKEN } from "./shares.ts";

const page = (title: string, text: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head><body style="font:16px system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;color:#e9e7e2;background:#0f1012"><h1 style="font-size:1.4rem">${title}</h1><p>${text}</p></body></html>`;

export function mountPublicSite(
  // biome-ignore lint/suspicious/noExplicitAny: the guest app's own variables don't matter to these routes.
  app: Hono<any>,
  { registry, shares, editions, now }: { registry: Registry; shares: Shares; editions: Editions; now: () => number },
) {
  const site = async (c: Context) => {
    const token = c.req.param("token") ?? "";
    const found = TOKEN.test(token) ? shares.find(token) : null;
    if (!found || ("share" in found && found.share.kind !== "public"))
      return c.html(page("Not found", "There's nothing at this address."), 404);
    if ("gone" in found)
      return c.html(page("This link has ended", "It expired or the owner turned it off. Ask them for a new one."), 410);
    const { share } = found;
    // cloudflared is the only client of this loopback server, and it sets the visitor's address.
    const incoming = (c.env as { incoming?: IncomingMessage } | undefined)?.incoming;
    const ip = c.req.header("cf-connecting-ip") ?? incoming?.socket.remoteAddress ?? "local";
    if (share.blockedIps.has(ip)) return c.html(page("Blocked", "This address can't open the wiki."), 403);
    const wait = share.limits.read(ip, now());
    if (wait) {
      if (share.limits.strike(`ip:${ip}`, now())) {
        share.blockedIps.add(ip);
        shares.log(share, ip, "blocked for going over the limits");
      }
      c.header("retry-after", String(Math.max(1, Math.ceil(wait / 1000))));
      return c.text("Too many requests, slow down.", 429);
    }
    const wiki = registry.get(share.wiki);
    if (!wiki) return c.html(page("Not found", "This wiki isn't here any more."), 404);
    const rest = c.req.path.slice(`/p/${token}/`.length);
    const res = await editionResponse(c, wiki, editions.of(wiki), rest);
    // An unguessable link isn't meant for search engines, whoever shares it.
    res.headers.set("x-robots-tag", "noindex, nofollow");
    if (res.status === 200 && res.headers.get("content-type")?.startsWith("text/html")) shares.viewed(share);
    return res;
  };
  app.get("/p/:token", (c) => c.redirect(`/p/${c.req.param("token")}/`, 301));
  app.get("/p/:token/*", site);
}

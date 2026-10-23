// What the guest server lends to the route files of its other link kinds (boards.ts, sheets.ts, ADR-0010): the
// link's context, its checks, and how to answer someone who goes over a limit.
import type { Context, MiddlewareHandler } from "hono";
import type { Registry, Wiki } from "../registry.ts";
import type { WikiData } from "../wikiData.ts";
import type { Guest, Share, Shares } from "./shares.ts";

export type Env = { Variables: { share: Share; ip: string; guest: Guest | null } };
/** A route behind the link check whose guest has a name, on the link's own wiki. */
export type TargetEnv = { Variables: Env["Variables"] & { wiki: Wiki; me: Guest } };

export interface GuestKit {
  registry: Registry;
  data: WikiData;
  shares: Shares;
  now: () => number;
  /** Writes must come from this site. */
  sameOrigin: MiddlewareHandler;
  /** The request size limit for JSON bodies. */
  small: MiddlewareHandler;
  /** A 429 that counts a strike against the guest and their address. */
  tooMany: (c: Context<Env>, wait: number, key: string) => Response;
  /** Long polling: waits until the wiki changes (or the time is up, or the guest leaves). */
  waitForChange: (c: Context<TargetEnv>, tag: () => string) => Promise<Response>;
}

/**
 * Only links of `kind` reach these routes: any other link gets 404, as if they didn't exist. Then the guest must have
 * picked a name, and the link's wiki must still be there.
 */
export function only(kind: Share["kind"], kit: GuestKit): MiddlewareHandler<TargetEnv> {
  return async (c, next) => {
    const share = c.get("share");
    if (share.kind !== kind || !share.target) return c.json({ error: "not found" }, 404);
    const wiki = kit.registry.get(share.wiki);
    if (!wiki) return c.json({ error: "not found" }, 404);
    const guest = c.get("guest");
    if (!guest) return c.json({ error: "pick a name first" }, 401);
    c.set("wiki", wiki);
    c.set("me", guest);
    return next();
  };
}

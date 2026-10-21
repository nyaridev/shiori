// Who is on a wiki right now (ADR-0005): the host (each open tab) and guests who came through a share link, with the
// page each one is on. Held only in memory, like the links: an entry lives while its tab keeps reporting, and goes
// when the tab says goodbye, stops reporting for `ttl`, or its guest or link ends.
//
// The host sees everyone on the wiki; a guest sees the host and the guests of their own link. Versions let guests'
// long polls (and the owner's server-sent events) wake only for changes they can see: the host's moves bump the
// wiki's host version, a guest's moves bump their link's version. A heartbeat on the same page changes nothing.
import { randomBytes } from "node:crypto";
import type { Person } from "../../shared/api.ts";
import { DEFAULT_HOST, type Shares } from "./shares.ts";

export interface Seen {
  /** `host:<tab>` or `guest:<guest id>`. */
  key: string;
  wiki: string;
  role: "host" | "guest";
  /** What others see as the person's id: never a guest's own id. */
  publicId: string;
  /** The share link a guest came through. */
  share: string | null;
  /** The guest's id, to find their current name. */
  guest: string | null;
  page: string | null;
  lastSeen: number;
  /** When they last changed page, so the host's busiest tab says where the host is. */
  movedAt: number;
}

/** Who's asking: the owner, or a guest of one link. */
export type Viewer = { role: "host" } | { role: "guest"; share: string; key: string };

export interface PresenceOptions {
  now?: () => number;
  /** How long an entry lives without a report. Tabs report every 15 seconds. */
  ttl?: number;
  /** The host's display name for guests. */
  hostName: () => string;
  /** A guest's current name, or null once they're blocked or their link ended. */
  guestName: (share: string, guest: string) => string | null;
  /** Random public ids. */
  newId: () => string;
}

/** Host tabs remembered at most; the oldest goes first. */
const HOST_TABS = 50;
export const PRESENCE_TTL = 40_000;

export function createPresence({ now = Date.now, ttl = PRESENCE_TTL, hostName, guestName, newId }: PresenceOptions) {
  const people = new Map<string, Seen>();
  const hostVersions = new Map<string, number>();
  const linkVersions = new Map<string, number>();
  const listeners = new Set<(wiki: string, share: string | null) => void>();
  let lastHostName = hostName();

  const bump = (e: Pick<Seen, "wiki" | "share">) => {
    if (e.share === null) hostVersions.set(e.wiki, (hostVersions.get(e.wiki) ?? 0) + 1);
    else linkVersions.set(e.share, (linkVersions.get(e.share) ?? 0) + 1);
    for (const l of listeners) l(e.wiki, e.share);
  };

  const stillHere = (e: Seen, t: number) =>
    t - e.lastSeen < ttl && (e.role === "host" || guestName(e.share as string, e.guest as string) !== null);

  /** Drops entries that timed out or whose guest or link ended. Call it on a timer and when links change. */
  const prune = () => {
    const t = now();
    for (const e of [...people.values()]) {
      if (stillHere(e, t)) continue;
      people.delete(e.key);
      bump(e);
    }
    const name = hostName();
    if (name !== lastHostName) {
      lastHostName = name;
      for (const wiki of new Set([...people.values()].filter((e) => e.role === "host").map((e) => e.wiki)))
        bump({ wiki, share: null });
    }
  };

  return {
    /** A tab says where it is. Only a new person, a move or a new page counts as a change. */
    report(input: {
      key: string;
      wiki: string;
      role: Seen["role"];
      share?: string | null;
      guest?: string | null;
      page: string | null;
    }) {
      const t = now();
      const old = people.get(input.key);
      if (old && old.wiki === input.wiki && old.page === input.page) {
        old.lastSeen = t;
        return;
      }
      if (old && old.wiki !== input.wiki) bump(old);
      const e: Seen = {
        key: input.key,
        wiki: input.wiki,
        role: input.role,
        publicId: old?.publicId ?? (input.role === "host" ? "host" : newId()),
        share: input.share ?? null,
        guest: input.guest ?? null,
        page: input.page,
        lastSeen: t,
        movedAt: t,
      };
      people.set(e.key, e);
      if (e.role === "host") {
        const tabs = [...people.values()].filter((x) => x.role === "host");
        for (const x of tabs.slice(0, Math.max(0, tabs.length - HOST_TABS))) people.delete(x.key);
      }
      bump(e);
    },

    /** A tab closed. */
    leave(key: string) {
      const e = people.get(key);
      if (!e) return;
      people.delete(key);
      bump(e);
    },

    /** A guest changed their name: their link sees it at once. */
    renamed(key: string) {
      const e = people.get(key);
      if (e) bump(e);
    },

    prune,

    /** The people on a wiki as `viewer` may see them, the host first. */
    list(wiki: string, viewer: Viewer): Person[] {
      const t = now();
      const here = [...people.values()].filter((e) => e.wiki === wiki && stillHere(e, t));
      const iso = (ms: number) => new Date(ms).toISOString();
      const out: Person[] = [];
      const host = here.filter((e) => e.role === "host").sort((a, b) => b.movedAt - a.movedAt)[0];
      if (host) {
        const lastSeen = Math.max(...here.filter((e) => e.role === "host").map((e) => e.lastSeen));
        out.push({
          id: host.publicId,
          name: hostName(),
          role: "host",
          page: host.page,
          lastSeen: iso(lastSeen),
          ...(viewer.role === "host" ? { me: true } : {}),
        });
      }
      for (const e of here) {
        if (e.role !== "guest") continue;
        if (viewer.role === "guest" && e.share !== viewer.share) continue;
        out.push({
          id: e.publicId,
          name: guestName(e.share as string, e.guest as string) as string,
          role: "guest",
          page: e.page,
          lastSeen: iso(e.lastSeen),
          ...(viewer.role === "guest" && e.key === viewer.key ? { me: true } : {}),
        });
      }
      return out;
    },

    /** Changes a viewer can see on a wiki: the host's, and their own link's for a guest. */
    version(wiki: string, share: string | null = null): string {
      const host = hostVersions.get(wiki) ?? 0;
      return share === null ? String(host) : `${host}-${linkVersions.get(share) ?? 0}`;
    },

    /** Called with the wiki and, for a guest's change, their link (null for the host's). */
    onChange(l: (wiki: string, share: string | null) => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}
export type Presence = ReturnType<typeof createPresence>;

/**
 * Presence wired to the share links: the host's chosen name, guests' names, and nobody who was blocked or whose link
 * ended.
 */
export function presenceFor(shares: Shares | undefined, now?: () => number): Presence {
  const presence = createPresence({
    now,
    hostName: () => shares?.host() ?? DEFAULT_HOST,
    guestName: (share, guest) => {
      const g = shares
        ?.list()
        .find((s) => s.id === share)
        ?.guests.get(guest);
      return g && !g.blocked ? g.name : null;
    },
    newId: () => randomBytes(9).toString("base64url"),
  });
  // A link that ends or a guest who's blocked leaves at once.
  shares?.onUpdate(() => presence.prune());
  return presence;
}

/** A special page (`_/recent`, `_/categories/<tag>`). */
const SPECIAL = /^_(\/[a-z-]{1,32}(\/[^\p{C}]{1,200})?)?$/u;

/** Where someone says they are: a page of the wiki or a special page, else null (a page that doesn't exist). */
export function placeOf(raw: unknown, exists: (path: string) => boolean): string | null {
  if (typeof raw !== "string" || raw.length > 300) return null;
  return exists(raw) || SPECIAL.test(raw) ? raw : null;
}

/** People with the titles of the pages they're on. */
export function withTitles(people: Person[], titleOf: (path: string) => string | undefined): Person[] {
  return people.map((p) => {
    const title = p.page === null ? undefined : titleOf(p.page);
    return title === undefined ? p : { ...p, title };
  });
}

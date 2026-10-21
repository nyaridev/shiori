// Share links (ADR-0003), held only in memory: restarting Shiori ends every link, by design. A link gives guests one
// wiki, to view or to view and comment, until it expires or the owner revokes it.
import { randomBytes } from "node:crypto";
import type { ShareActivity, ShareDuration, ShareInfo, ShareKind } from "../../shared/api.ts";
import { createLinkLimits, LIMITS, type LinkLimits } from "./limits.ts";

const HOUR = 3_600_000;
export const DURATIONS: Record<ShareDuration, number | null> = {
  "1h": HOUR,
  "24h": 24 * HOUR,
  "7d": 7 * 24 * HOUR,
  session: null,
};
/** The owner's dialog shows this much recent activity per link. */
const ACTIVITY = 500;
/** Ended links answer 410 instead of 404 while the guest server runs; only the latest are remembered. */
const ENDED = 200;
/** How the owner signs for guests until they pick a name in the Share dialog. */
export const DEFAULT_HOST = "Host";

export interface Guest {
  id: string;
  name: string;
  ip: string;
  joinedAt: number;
  lastSeen: number;
  writes: number;
  blocked: boolean;
}

export interface Share {
  /** For the owner's app; the token is the secret. */
  id: string;
  token: string;
  wiki: string;
  kind: ShareKind;
  label: string;
  createdAt: number;
  expiresAt: number | null;
  guests: Map<string, Guest>;
  blockedIps: Set<string>;
  activity: ShareActivity[];
  limits: LinkLimits;
}

export type Lookup = { share: Share } | { gone: true } | null;

const random = (bytes: number) => randomBytes(bytes).toString("base64url");
/** A link token: 32 random bytes, base64url. */
export const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function createShares({
  now = Date.now,
  origin = () => "",
}: {
  now?: () => number;
  origin?: () => string;
} = {}) {
  const active = new Map<string, Share>();
  let host = DEFAULT_HOST;
  const ended = new Set<string>();
  const listeners = new Set<() => void>();
  /** Anything the Share dialog shows changed: links, guests, activity, the host's name. */
  const updates = new Set<() => void>();
  const updated = () => {
    for (const l of updates) l();
  };
  const changed = () => {
    for (const l of listeners) l();
    updated();
  };

  const end = (share: Share) => {
    active.delete(share.token);
    ended.add(share.token);
    if (ended.size > ENDED) ended.delete(ended.values().next().value as string);
  };

  /** Ends expired links; true when any ended. */
  const sweep = () => {
    const t = now();
    let any = false;
    for (const share of [...active.values()]) {
      if (share.expiresAt !== null && share.expiresAt <= t) {
        end(share);
        any = true;
      } else share.limits.prune(t);
    }
    if (any) changed();
    return any;
  };

  const iso = (ms: number) => new Date(ms).toISOString();

  const log = (share: Share, who: string, what: string) => {
    share.activity.push({ at: iso(now()), who, what });
    if (share.activity.length > ACTIVITY) share.activity.splice(0, share.activity.length - ACTIVITY);
    updated();
  };

  return {
    create({
      wiki,
      kind,
      duration = "24h",
      label = "",
    }: {
      wiki: string;
      kind: ShareKind;
      duration?: ShareDuration;
      label?: string;
    }): Share {
      sweep();
      if (active.size >= LIMITS.links) throw new Error(`At most ${LIMITS.links} links can be active at a time.`);
      const at = now();
      const ms = DURATIONS[duration];
      const share: Share = {
        id: random(6),
        token: random(32),
        wiki,
        kind,
        label,
        createdAt: at,
        expiresAt: ms === null ? null : at + ms,
        guests: new Map(),
        blockedIps: new Set(),
        activity: [],
        limits: createLinkLimits(),
      };
      active.set(share.token, share);
      changed();
      return share;
    },

    /** The link for a token: live, ended (expired or revoked), or never seen. */
    find(token: string): Lookup {
      const share = active.get(token);
      if (share && (share.expiresAt === null || share.expiresAt > now())) return { share };
      if (share) {
        end(share);
        changed();
      }
      return ended.has(token) ? { gone: true } : null;
    },

    list: () => {
      sweep();
      return [...active.values()];
    },

    revoke(id: string): boolean {
      const share = [...active.values()].find((s) => s.id === id);
      if (!share) return false;
      end(share);
      changed();
      return true;
    },

    /** Revokes every link. */
    stopAll() {
      if (!active.size) return;
      for (const share of [...active.values()]) end(share);
      changed();
    },

    sweep,

    /** Called whenever links start or end. */
    onChange(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },

    /** Called whenever anything the Share dialog shows changes, so it updates live. */
    onUpdate(l: () => void) {
      updates.add(l);
      return () => updates.delete(l);
    },

    /** Blocks a guest and the address they joined from, or lets them back in. False when there's no such guest. */
    block(shareId: string, guestId: string, blocked: boolean): boolean {
      const share = [...active.values()].find((s) => s.id === shareId);
      const guest = share?.guests.get(guestId);
      if (!share || !guest) return false;
      guest.blocked = blocked;
      if (blocked) share.blockedIps.add(guest.ip);
      else share.blockedIps.delete(guest.ip);
      log(share, guest.name, blocked ? "was blocked by the host" : "was let back in by the host");
      return true;
    },

    /** How the owner's messages are signed for guests. */
    host: () => host,
    setHost(name: string) {
      host = name;
      updated();
    },

    log,

    info(share: Share): ShareInfo {
      const path = `/s/${share.token}/`;
      return {
        id: share.id,
        wiki: share.wiki,
        kind: share.kind,
        label: share.label,
        createdAt: iso(share.createdAt),
        expiresAt: share.expiresAt === null ? null : iso(share.expiresAt),
        path,
        url: `${origin()}${path}`,
        guests: [...share.guests.values()].map((g) => ({
          id: g.id,
          name: g.name,
          joinedAt: iso(g.joinedAt),
          lastSeen: iso(g.lastSeen),
          writes: g.writes,
          blocked: g.blocked,
        })),
        blockedIps: share.blockedIps.size,
        activity: share.activity.slice(-50),
      };
    },

    now,
  };
}
export type Shares = ReturnType<typeof createShares>;

/** A new guest id, kept in the guest's signed cookie. */
export const newGuestId = () => random(16);

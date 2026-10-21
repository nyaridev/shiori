// For tests only: both servers (ADR-0003) over two throwaway wikis, a clock the test moves, and guests' browsers.
// `sharingFixture()`, called at the top of a spec, builds it all fresh before each test and removes it after.
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach } from "vitest";
import type { LiveEvent } from "../../shared/api.ts";
import { buildApp } from "../app.ts";
import { createLive } from "../live.ts";
import { APP_ROOT } from "../paths.ts";
import { createRegistry } from "../registry.ts";
import { closeAll } from "../threads.ts";
import { createWikiData } from "../wikiData.ts";
import { buildGuestApp } from "./guest.ts";
import { type Presence, presenceFor } from "./presence.ts";
import { createShares, type Share, type Shares } from "./shares.ts";

export const HOST = "http://share.test";
export const OWNER = "http://localhost:4400";
/** The built app's page, as the guest server serves it. */
export const SHELL = '<!doctype html><div id="root"></div><script type="module" src="/assets/index.js"></script>';

export interface Sharing {
  /** The app folder: `wikis/alpha`, `wikis/beta`, the template's kits, `docs/`. */
  app: string;
  clock: number;
  shares: Shares;
  presence: Presence;
  guestApp: ReturnType<typeof buildGuestApp>;
  ownerApp: ReturnType<typeof buildApp>;
  /** Live events the owner's server sent, as its file watcher or presence would. */
  emit: (e: LiveEvent) => void;
  /** A guest's browser on a link. */
  browser: (share: Share, ip?: string) => Browser;
  /** A request to the owner's server, from the app's own origin. */
  owner: (path: string, init?: { method?: string; body?: unknown }) => Promise<Response>;
}

function wiki(app: string, id: string) {
  const root = join(app, "wikis", id);
  mkdirSync(join(root, "pages"), { recursive: true });
  writeFileSync(join(root, "wiki.json"), JSON.stringify({ schema: 1, id, title: id.toUpperCase() }));
  writeFileSync(join(root, "cover.svg"), "<svg/>");
  writeFileSync(join(root, "pages", "index.md"), "Home of the wiki.");
  writeFileSync(join(root, "pages", "plan.md"), "---\ntitle: Plan\n---\nThe plan.");
}

export function sharingFixture(): Sharing {
  const s = {} as Sharing;
  beforeEach(() => {
    const app = mkdtempSync(join(tmpdir(), "shiori-fixture-"));
    cpSync(join(APP_ROOT, "wikis", "_template", "kits"), join(app, "wikis", "_template", "kits"), { recursive: true });
    cpSync(join(APP_ROOT, "docs", "elements.md"), join(app, "docs", "elements.md"));
    cpSync(join(APP_ROOT, "docs", "assets"), join(app, "docs", "assets"), { recursive: true });
    writeFileSync(join(app, "docs", "notes.png"), "not for guests");
    wiki(app, "alpha");
    wiki(app, "beta");
    const registry = createRegistry(app);
    const listeners = new Set<(e: LiveEvent) => void>();
    const live = {
      ...createLive(registry),
      subscribe: (l: (e: LiveEvent) => void) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
    };
    const data = createWikiData(live);
    const now = () => s.clock;
    const shares = createShares({ now, origin: () => HOST });
    const presence = presenceFor(shares, now);
    const dist = join(app, "dist");
    mkdirSync(dist);
    writeFileSync(join(dist, "index.html"), SHELL);
    Object.assign(s, {
      app,
      clock: Date.parse("2026-10-21T12:00:00Z"),
      shares,
      presence,
      guestApp: buildGuestApp({ registry, data, shares, presence, staticDir: dist, secret: "test-secret" }),
      ownerApp: buildApp({ registry, live, data, shares, presence }),
      emit: (e: LiveEvent) => {
        for (const l of listeners) l(e);
      },
      browser: (share: Share, ip?: string) => browser(s, share, ip),
      owner: (path: string, init: { method?: string; body?: unknown } = {}) =>
        s.ownerApp.request(`${OWNER}${path}`, {
          method: init.method ?? "GET",
          headers: init.body === undefined ? {} : { "content-type": "application/json", origin: OWNER },
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
        }),
    });
  });
  afterEach(() => {
    closeAll();
    rmSync(s.app, { recursive: true, force: true });
  });
  return s;
}

export interface Browser {
  get: (path: string, headers?: Record<string, string>) => Promise<Response>;
  send: (method: string, path: string, body?: unknown, headers?: Record<string, string>) => Promise<Response>;
  join: (name: string) => Promise<Response>;
  readonly cookie: string;
}

/** A guest's browser: keeps the cookie, sends this site's Origin on writes, comes from one address. */
function browser(s: Sharing, share: Share, ip = "203.0.113.7"): Browser {
  let cookie = "";
  const base = `/s/${share.token}`;
  const send = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await s.guestApp.request(`${HOST}${base}${path}`, {
      method,
      headers: {
        "cf-connecting-ip": ip,
        ...(cookie ? { cookie } : {}),
        ...(method === "GET" ? {} : { origin: HOST }),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return res;
  };
  return {
    get: (path, headers) => send("GET", path, undefined, headers),
    send,
    join: (name) => send("POST", "/api/session", { name }),
    get cookie() {
      return cookie;
    },
  };
}

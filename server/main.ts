// Starts the Shiori server. `--static` also serves the built UI from dist/ (start-web.bat) and can
// share wikis: the guest server (ADR-0003) listens on its own port while at least one share link is active, and
// cloudflared's Quick Tunnel gives it a public address.
// `--dev` shows only the template, filled in as a preview (pnpm dev), and can't share.
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";
import { type ServerType, serve } from "@hono/node-server";
import { buildApp } from "./app.ts";
import { purgeExpired } from "./boards.ts";
import { createLive } from "./live.ts";
import { APP_ROOT } from "./paths.ts";
import { createEditions } from "./public/output.ts";
import { createRegistry } from "./registry.ts";
import { buildGuestApp } from "./sharing/guest.ts";
import { presenceFor } from "./sharing/presence.ts";
import { createShares } from "./sharing/shares.ts";
import { createTunnel } from "./sharing/tunnel.ts";
import { checkpointAll, closeAll } from "./threads.ts";
import { createWikiData } from "./wikiData.ts";

const { values } = parseArgs({
  options: {
    port: { type: "string", default: "4400" },
    "guest-port": { type: "string", default: "4420" },
    static: { type: "boolean", default: false },
    dev: { type: "boolean", default: false },
  },
});
const port = Number(values.port);
const guestPort = Number(values["guest-port"]);
const staticDir = join(APP_ROOT, "dist");
if (values.static && !existsSync(join(staticDir, "index.html"))) {
  console.error("dist/ is missing. Run `pnpm build` first.");
  process.exit(1);
}
const servedDir = values.static ? relative(process.cwd(), staticDir) : undefined;

const registry = createRegistry(APP_ROOT, { dev: values.dev });
const live = createLive(registry);
live.start();

// The boards' trash (ADR-0014): boards there for 30 days are deleted for good when Shiori starts, and each day while
// it runs. Only wikis that already have a database: a new one isn't made just to look.
const emptyTrash = () => {
  for (const w of registry.all()) {
    if (!existsSync(join(w.root, "data", "wiki.db"))) continue;
    try {
      const gone = purgeExpired(w.root);
      if (gone.length) console.log(`  ${w.id}: deleted ${gone.join(", ")} from the trash (30 days)`);
    } catch (e) {
      console.warn(`  ${w.id}: couldn't empty the boards' trash: ${(e as Error).message}`);
    }
  }
};
emptyTrash();
setInterval(emptyTrash, 24 * 60 * 60 * 1000).unref();
// `data/` is committed with the wiki (ADR-0014): write what waits in each database's WAL into `wiki.db` every
// half minute, so a commit always holds every change.
setInterval(() => checkpointAll(), 30_000).unref();
const data = createWikiData(live);
const tunnel = createTunnel({ port: guestPort, log: (line) => console.log(line) });
// Until the tunnel is up, links point at the guest server itself and work on this PC only.
const shares = values.static
  ? createShares({ origin: () => tunnel.url() ?? `http://127.0.0.1:${guestPort}` })
  : undefined;
// Who is on each wiki (ADR-0005), for both servers. Tabs that stop reporting leave after a while.
const presence = presenceFor(shares);
setInterval(() => presence.prune(), 10_000).unref();
// The wikis' public editions (ADR-0011): built once per version of their pages, for the preview, the export and links.
const editions = createEditions(data);
const app = buildApp({ registry, live, data, shares, tunnel, presence, staticDir: servedDir, editions });

const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () => {
  const n = registry.all().length;
  const what = values.dev ? "dev: the template only" : `${n} wiki${n === 1 ? "" : "s"}`;
  console.log(`Shiori server on http://localhost:${port} (${what})`);
  for (const b of registry.broken()) console.warn(`  skipped ${b.root}: ${b.problems.join("; ")}`);
});

// The guest server runs only while a link is active, and only on loopback: the tunnel is its one client.
let guestServer: ServerType | null = null;
let sweeper: NodeJS.Timeout | null = null;
if (shares) {
  const guestApp = buildGuestApp({
    registry,
    data,
    shares,
    staticDir: servedDir,
    secret: randomBytes(32).toString("base64url"),
    presence,
    editions,
  });
  shares.onChange(() => {
    const active = shares.list().length > 0;
    if (active && !guestServer) {
      guestServer = serve({ fetch: guestApp.fetch, port: guestPort, hostname: "127.0.0.1" }, () =>
        console.log(`Sharing: guest server on http://127.0.0.1:${guestPort}`),
      );
      sweeper = setInterval(() => shares.sweep(), 30_000);
    }
    if (active) tunnel.start();
    else if (guestServer) {
      tunnel.stop();
      guestServer.close();
      if ("closeAllConnections" in guestServer) guestServer.closeAllConnections();
      guestServer = null;
      if (sweeper) clearInterval(sweeper);
      console.log("Sharing stopped.");
    }
  });
}

// cloudflared stops with Shiori, however the server ends.
process.on("exit", () => tunnel.stop());
const shutdown = () => {
  shares?.stopAll();
  tunnel.stop();
  live.stop();
  closeAll();
  server.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

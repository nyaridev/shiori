// Starts the Shiori server. `--static` also serves the built UI from dist/ (start-web.bat, the desktop app) and can
// share wikis: the guest server (ADR-0003) listens on its own port while at least one share link is active, and
// cloudflared's Quick Tunnel gives it a public address.
// `--dev` shows only the template, filled in as a preview (pnpm dev), and can't share.
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";
import { type ServerType, serve } from "@hono/node-server";
import { buildApp } from "./app.ts";
import { createLive } from "./live.ts";
import { APP_ROOT } from "./paths.ts";
import { createRegistry } from "./registry.ts";
import { buildGuestApp } from "./sharing/guest.ts";
import { createShares } from "./sharing/shares.ts";
import { createTunnel } from "./sharing/tunnel.ts";
import { closeAll } from "./threads.ts";
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
const data = createWikiData(live);
const tunnel = createTunnel({ port: guestPort, log: (line) => console.log(line) });
// Until the tunnel is up, links point at the guest server itself and work on this PC only.
const shares = values.static
  ? createShares({ origin: () => tunnel.url() ?? `http://127.0.0.1:${guestPort}` })
  : undefined;
const app = buildApp({ registry, live, data, shares, tunnel, staticDir: servedDir });

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

// cloudflared stops with Shiori. The desktop app, which can't let Node clean up, ends the whole process tree.
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

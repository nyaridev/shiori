// Starts the Shiori server. `--static` also serves the built UI from dist/ (start-web.bat, the desktop app);
// `--dev` shows only the template, filled in as a preview (pnpm dev).
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";
import { serve } from "@hono/node-server";
import { buildApp } from "./app.ts";
import { createLive } from "./live.ts";
import { APP_ROOT } from "./paths.ts";
import { createRegistry } from "./registry.ts";
import { closeAll } from "./threads.ts";

const { values } = parseArgs({
  options: {
    port: { type: "string", default: "4400" },
    static: { type: "boolean", default: false },
    dev: { type: "boolean", default: false },
  },
});
const port = Number(values.port);
const staticDir = join(APP_ROOT, "dist");
if (values.static && !existsSync(join(staticDir, "index.html"))) {
  console.error("dist/ is missing. Run `pnpm build` first.");
  process.exit(1);
}

const registry = createRegistry(APP_ROOT, { dev: values.dev });
const live = createLive(registry);
live.start();
const app = buildApp({ registry, live, staticDir: values.static ? relative(process.cwd(), staticDir) : undefined });

const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () => {
  const n = registry.all().length;
  const what = values.dev ? "dev: the template only" : `${n} wiki${n === 1 ? "" : "s"}`;
  console.log(`Shiori server on http://localhost:${port} (${what})`);
  for (const b of registry.broken()) console.warn(`  skipped ${b.root}: ${b.problems.join("; ")}`);
});

const shutdown = () => {
  live.stop();
  closeAll();
  server.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

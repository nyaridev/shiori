// The Cloudflare Quick Tunnel (ADR-0003): `cloudflared` gives the guest server a public https address while at least
// one share link is active. Shiori starts it with the first link, reads the address from its log, checks that the
// address reaches the guest server, and stops it with the last link or when Shiori exits.
import { type ChildProcess, spawn } from "node:child_process";
import { Resolver } from "node:dns/promises";
import { existsSync } from "node:fs";
import { request } from "node:https";
import type { LookupFunction } from "node:net";
import { delimiter, join } from "node:path";
import { createInterface } from "node:readline";
import type { TunnelStatus } from "../../shared/api.ts";

export const INSTALL = "winget install Cloudflare.cloudflared";
const ADDRESS = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;
/** cloudflared logs this once Cloudflare's edge can reach it. */
const CONNECTED = /Registered tunnel connection/i;

/** The `cloudflared` binary: on PATH, or where winget installs it (a Shiori started before the install has the old PATH). */
export function findCloudflared(env: NodeJS.ProcessEnv = process.env, platform = process.platform): string | null {
  const exe = platform === "win32" ? "cloudflared.exe" : "cloudflared";
  const dirs = (env.PATH ?? env.Path ?? "").split(delimiter).filter(Boolean);
  if (platform === "win32") {
    for (const v of ["ProgramFiles(x86)", "ProgramFiles"]) if (env[v]) dirs.push(join(env[v], "cloudflared"));
  }
  for (const dir of dirs) {
    const file = join(dir, exe);
    if (existsSync(file)) return file;
  }
  return null;
}

/**
 * True when the address reaches this guest server: its 404 for `/` carries the guest server's CSP, which a
 * Cloudflare error page doesn't. The name is looked up through Cloudflare's DNS, so this PC's own DNS cache never
 * stores "no such name" for an address that's a few seconds too new.
 */
export function reaches(url: string, timeout = 5000): Promise<boolean> {
  const resolver = new Resolver({ timeout: 2000, tries: 2 });
  resolver.setServers(["1.1.1.1", "1.0.0.1"]);
  const lookup: LookupFunction = (host, options, done) => {
    resolver.resolve4(host).then(
      (addresses) =>
        options.all
          ? done(
              null,
              addresses.map((address) => ({ address, family: 4 })),
            )
          : done(null, addresses[0] ?? "", 4),
      (error: NodeJS.ErrnoException) => done(error, "", 4),
    );
  };
  return new Promise((resolve) => {
    const req = request(`${url}/`, { timeout, lookup }, (res) => {
      res.resume();
      const csp = String(res.headers["content-security-policy"] ?? "");
      resolve(res.statusCode === 404 && csp.includes("frame-ancestors 'none'"));
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => req.destroy());
    req.end();
  });
}

export interface TunnelOptions {
  /** The guest server's port on 127.0.0.1. */
  port: number;
  find?: () => string | null;
  run?: (bin: string, args: string[]) => ChildProcess;
  check?: (url: string) => Promise<boolean>;
  /** How long cloudflared has to give an address that answers. */
  timeout?: number;
  /** Between health checks while the new address isn't answering yet. */
  retryEvery?: number;
  /** Health checks start this long after the address shows, if cloudflared hasn't said it's connected by then. */
  settle?: number;
  log?: (line: string) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** cloudflared's last log line, without its timestamp and level, for the owner's dialog. */
const reason = (line: string) =>
  line
    .replace(/^\S+Z\s+(INF|WRN|ERR|DBG)\s+/, "")
    .trim()
    .slice(0, 200);

export function createTunnel({
  port,
  find = () => findCloudflared(),
  run = (bin, args) => spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true }),
  check = reaches,
  timeout = 60_000,
  retryEvery = 2000,
  settle = 5000,
  log = () => {},
}: TunnelOptions) {
  let status: TunnelStatus = { state: "off", url: null };
  /** The running cloudflared and its timers; each start gets a new one, so a stopped run's callbacks do nothing. */
  let current: { proc: ChildProcess; timers: NodeJS.Timeout[] } | null = null;
  const listeners = new Set<() => void>();
  const set = (next: TunnelStatus) => {
    status = next;
    for (const l of listeners) l();
  };

  const end = () => {
    if (!current) return;
    for (const t of current.timers) clearTimeout(t);
    const { proc } = current;
    current = null;
    if (proc.exitCode === null && !proc.killed) proc.kill();
  };

  const start = () => {
    if (current) return;
    const bin = find();
    if (!bin) {
      set({ state: "missing", url: null, install: INSTALL });
      return;
    }
    let proc: ChildProcess;
    try {
      proc = run(bin, ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${port}`]);
    } catch (error) {
      set({ state: "failed", url: null, error: `cloudflared didn't start: ${(error as Error).message}` });
      return;
    }
    const me = { proc, timers: [] as NodeJS.Timeout[] };
    current = me;
    const mine = () => current === me;
    const fail = (error: string) => {
      if (!mine()) return;
      end();
      log(`Sharing: the tunnel failed: ${error}`);
      set({ state: "failed", url: null, error });
    };
    set({ state: "starting", url: null });

    let url: string | null = null;
    let last = "";
    let probing = false;
    const probe = async () => {
      if (probing || !url) return;
      probing = true;
      while (mine() && status.state === "starting") {
        if (await check(url)) {
          if (!mine()) return;
          for (const t of me.timers) clearTimeout(t);
          log(`Sharing: links are public on ${url}`);
          set({ state: "up", url });
          return;
        }
        await sleep(retryEvery);
      }
    };
    const onLine = (line: string) => {
      if (line.trim()) last = line;
      if (!url) {
        const found = ADDRESS.exec(line);
        if (found) {
          url = found[0];
          me.timers.push(setTimeout(() => void probe(), settle));
        }
      }
      if (url && CONNECTED.test(line)) void probe();
    };
    for (const stream of [proc.stdout, proc.stderr]) if (stream) createInterface({ input: stream }).on("line", onLine);
    me.timers.push(
      setTimeout(
        () => fail(url ? `${url} didn't answer.` : `cloudflared gave no address: ${reason(last) || "no output"}`),
        timeout,
      ),
    );
    proc.on("error", (error) => fail(`cloudflared didn't start: ${error.message}`));
    proc.on("exit", (code) => {
      if (!mine()) return;
      const why = reason(last);
      fail(`cloudflared stopped${code === null ? "" : ` (exit code ${code})`}${why ? `: ${why}` : "."}`);
    });
  };

  return {
    /** Starts cloudflared unless it's running; after `missing` or `failed`, this tries again. */
    start,
    /** Stops cloudflared: the last link ended, or Shiori is closing. */
    stop() {
      const was = current;
      end();
      if (was || status.state !== "off") set({ state: "off", url: null });
    },
    status: () => status,
    /** The public address while the tunnel is up. */
    url: () => (status.state === "up" ? status.url : null),
    onChange(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}
export type Tunnel = ReturnType<typeof createTunnel>;

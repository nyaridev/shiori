import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTunnel, findCloudflared, INSTALL, type TunnelOptions } from "./tunnel.ts";

/** A cloudflared that prints what the test tells it to. */
function fakeProcess() {
  const proc = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    exitCode: null as number | null,
    killed: false,
    kill() {
      proc.killed = true;
      return true;
    },
  });
  return {
    proc,
    say: (line: string) => proc.stderr.write(`2026-10-21T12:00:00Z INF ${line}\n`),
    exit: (code: number) => {
      proc.exitCode = code;
      proc.emit("exit", code);
    },
  };
}

const ADDRESS = "https://quiet-river-1234.trycloudflare.com";

function setup(options: Partial<TunnelOptions> = {}) {
  const runs: { bin: string; args: string[]; fake: ReturnType<typeof fakeProcess> }[] = [];
  const checks: string[] = [];
  let answers = true;
  const tunnel = createTunnel({
    port: 4420,
    find: () => "C:/cloudflared/cloudflared.exe",
    run: (bin, args) => {
      const fake = fakeProcess();
      runs.push({ bin, args, fake });
      return fake.proc as unknown as ChildProcess;
    },
    check: async (url) => {
      checks.push(url);
      return answers;
    },
    retryEvery: 5,
    settle: 10_000,
    timeout: 400,
    ...options,
  });
  return {
    tunnel,
    runs,
    checks,
    latest: () => runs[runs.length - 1].fake,
    answer: (yes: boolean) => {
      answers = yes;
    },
  };
}

describe("the tunnel", () => {
  it("says how to install cloudflared when it's missing", () => {
    const { tunnel, runs } = setup({ find: () => null });
    tunnel.start();
    expect(tunnel.status()).toEqual({ state: "missing", url: null, install: INSTALL });
    expect(runs).toHaveLength(0);
  });

  it("starts once, reads the address, and is up when the address answers", async () => {
    const { tunnel, runs, latest, checks } = setup();
    const seen: string[] = [];
    tunnel.onChange(() => seen.push(tunnel.status().state));
    tunnel.start();
    tunnel.start();
    expect(runs).toHaveLength(1);
    expect(runs[0].args).toEqual(["tunnel", "--no-autoupdate", "--url", "http://127.0.0.1:4420"]);
    expect(tunnel.status().state).toBe("starting");
    latest().say("Requesting new quick Tunnel on trycloudflare.com...");
    latest().say(`|  ${ADDRESS}                                         |`);
    expect(tunnel.url()).toBeNull();
    latest().say("Registered tunnel connection connIndex=0 location=fra08 protocol=quic");
    await vi.waitFor(() => expect(tunnel.status()).toEqual({ state: "up", url: ADDRESS }));
    expect(tunnel.url()).toBe(ADDRESS);
    expect(checks).toEqual([ADDRESS]);
    expect(seen).toEqual(["starting", "up"]);
  });

  it("checks again until the new address answers", async () => {
    const { tunnel, latest, checks, answer } = setup();
    answer(false);
    tunnel.start();
    latest().say(ADDRESS);
    latest().say("Registered tunnel connection connIndex=0");
    await vi.waitFor(() => expect(checks.length).toBeGreaterThan(2));
    expect(tunnel.status().state).toBe("starting");
    answer(true);
    await vi.waitFor(() => expect(tunnel.status().state).toBe("up"));
  });

  it("checks the address even when cloudflared never says it's connected", async () => {
    const { tunnel, latest } = setup({ settle: 20 });
    tunnel.start();
    latest().say(ADDRESS);
    await vi.waitFor(() => expect(tunnel.status().state).toBe("up"));
  });

  it("fails when no address answers in time, and stops cloudflared", async () => {
    const { tunnel, latest, answer } = setup({ timeout: 60 });
    answer(false);
    tunnel.start();
    latest().say(ADDRESS);
    latest().say("Registered tunnel connection connIndex=0");
    await vi.waitFor(() => expect(tunnel.status().state).toBe("failed"));
    expect(tunnel.status().error).toBe(`${ADDRESS} didn't answer.`);
    expect(latest().proc.killed).toBe(true);
  });

  it("fails with cloudflared's last words when it stops, and tries again on the next start", async () => {
    const { tunnel, runs, latest } = setup();
    tunnel.start();
    latest().say("ERR failed to request quick Tunnel: 429 Too Many Requests");
    await new Promise((r) => setTimeout(r, 20));
    latest().exit(1);
    expect(tunnel.status()).toEqual({
      state: "failed",
      url: null,
      error: "cloudflared stopped (exit code 1): ERR failed to request quick Tunnel: 429 Too Many Requests",
    });
    tunnel.start();
    expect(runs).toHaveLength(2);
    expect(tunnel.status().state).toBe("starting");
  });

  it("stops with the last link, and ignores what the old process says after", async () => {
    const { tunnel, latest } = setup({ settle: 5 });
    tunnel.start();
    const old = latest();
    tunnel.stop();
    expect(old.proc.killed).toBe(true);
    expect(tunnel.status()).toEqual({ state: "off", url: null });
    old.say(ADDRESS);
    old.exit(1);
    await new Promise((r) => setTimeout(r, 30));
    expect(tunnel.status()).toEqual({ state: "off", url: null });
  });
});

describe("findCloudflared", () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("looks on PATH, then where winget installs it", () => {
    dir = mkdtempSync(join(tmpdir(), "shiori-cloudflared-"));
    const onPath = join(dir, "bin");
    const programs = join(dir, "Program Files (x86)");
    mkdirSync(onPath);
    mkdirSync(join(programs, "cloudflared"), { recursive: true });
    const env = { PATH: [join(dir, "nothing"), onPath].join(delimiter), "ProgramFiles(x86)": programs };
    expect(findCloudflared(env, "win32")).toBeNull();
    writeFileSync(join(programs, "cloudflared", "cloudflared.exe"), "");
    expect(findCloudflared(env, "win32")).toBe(join(programs, "cloudflared", "cloudflared.exe"));
    writeFileSync(join(onPath, "cloudflared.exe"), "");
    expect(findCloudflared(env, "win32")).toBe(join(onPath, "cloudflared.exe"));
    writeFileSync(join(onPath, "cloudflared"), "");
    expect(findCloudflared({ PATH: onPath }, "linux")).toBe(join(onPath, "cloudflared"));
  });
});

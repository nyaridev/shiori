import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_PICTURE_BYTES, mediaProblems, serveFile } from "./files.ts";
import { DATA_GITIGNORE } from "./paths.ts";

let root: string;
let app: Hono;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "shiori-files-"));
  mkdirSync(join(root, "assets"));
  const png = await sharp({ create: { width: 1200, height: 600, channels: 3, background: "#c84" } })
    .png()
    .toBuffer();
  writeFileSync(join(root, "assets", "wide.png"), png);
  writeFileSync(join(root, "assets", "logo.svg"), "<svg xmlns='http://www.w3.org/2000/svg'/>");
  app = new Hono();
  app.get("/files/*", (c) => serveFile(c, root, c.req.path.slice("/files/".length)));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const get = (path: string, headers?: Record<string, string>) =>
  app.request(`http://localhost/files/${path}`, { headers });

describe("pictures", () => {
  it("come as they are, or resized as WebP and cached in data/", async () => {
    const original = await get("assets/wide.png");
    expect(original.headers.get("content-type")).toBe("image/png");

    const small = await get("assets/wide.png?w=480");
    expect(small.headers.get("content-type")).toBe("image/webp");
    const meta = await sharp(Buffer.from(await small.arrayBuffer())).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 480, 240]);
    const cached = readdirSync(join(root, "data", "cache", "pictures"));
    expect(cached).toHaveLength(1);
    // Resized copies are made again, so they stay out of git though data/ is committed (ADR-0014).
    expect(readFileSync(join(root, "data", ".gitignore"), "utf8")).toBe(DATA_GITIGNORE);
    expect(DATA_GITIGNORE).toContain("cache/");

    // Never made bigger than the original; SVGs never rasterized.
    const big = await get("assets/wide.png?w=2400");
    expect((await sharp(Buffer.from(await big.arrayBuffer())).metadata()).width).toBe(1200);
    expect((await get("assets/logo.svg?w=160")).headers.get("content-type")).toBe("image/svg+xml");
  });

  it("answer 304 to a browser that has this version, and refuse odd widths", async () => {
    const first = await get("assets/wide.png?w=160");
    const etag = first.headers.get("etag") ?? "";
    expect((await get("assets/wide.png?w=160", { "if-none-match": etag })).status).toBe(304);
    expect((await get("assets/wide.png?w=161")).status).toBe(400);
  });

  it("are pictures only, never the database or a video", async () => {
    writeFileSync(join(root, "assets", "clip.mp4"), "mp4");
    mkdirSync(join(root, "data"), { recursive: true });
    writeFileSync(join(root, "data", "x.png"), "png");
    for (const path of ["assets/clip.mp4", "data/x.png", "wiki.json", "..%2Fsecret.png"]) {
      expect((await get(path)).status, path).toBe(404);
    }
  });
});

describe("mediaProblems", () => {
  it("reports videos, sounds and pictures that are too big, but not what's in data/", () => {
    writeFileSync(join(root, "assets", "clip.mp4"), "mp4");
    writeFileSync(join(root, "assets", "theme.mp3"), "mp3");
    writeFileSync(join(root, "assets", "huge.png"), Buffer.alloc(MAX_PICTURE_BYTES + 1));
    mkdirSync(join(root, "data"), { recursive: true });
    writeFileSync(join(root, "data", "old.mp4"), "mp4");
    const problems = mediaProblems(root).sort();
    expect(problems).toHaveLength(3);
    expect(problems[0]).toMatch(/^assets\/clip.mp4: only pictures/);
    expect(problems[1]).toMatch(/^assets\/huge.png: 15.0 MB is too big/);
    expect(problems[2]).toMatch(/^assets\/theme.mp3: only pictures/);
    expect(existsSync(join(root, "data", "old.mp4"))).toBe(true);
  });
});

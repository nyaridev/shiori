import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

/** The app repo: wikis/, wikis.local.json, dist/, docs/. */
export const APP_ROOT = resolve(import.meta.dirname, "..");

/** `rel` inside `root`, or null when it escapes it. */
export function inside(root: string, rel: string): string | null {
  const full = resolve(root, rel);
  const r = relative(root, full);
  return r === "" || r.startsWith("..") || isAbsolute(r) ? null : full;
}

export function readJson(file: string): { value: unknown; error: string | null } {
  if (!existsSync(file)) return { value: undefined, error: "missing" };
  try {
    return { value: JSON.parse(readFileSync(file, "utf8").replace(/^﻿/, "")), error: null };
  } catch (e) {
    return { value: undefined, error: (e as Error).message };
  }
}

/**
 * A wiki's `data/` folder, the only place the app writes at runtime (the comment database, cached pictures). Made
 * with a `.gitignore` of `*`, so nothing in it is committed by accident in a wiki that has its own git.
 */
export function dataDir(root: string, ...sub: string[]): string {
  const data = join(root, "data");
  if (!existsSync(data)) {
    mkdirSync(data, { recursive: true });
    writeFileSync(join(data, ".gitignore"), "*\n");
  }
  const dir = join(data, ...sub);
  if (sub.length) mkdirSync(dir, { recursive: true });
  return dir;
}

/** Forward slashes, as the workspace writes paths in files. */
export const slashes = (p: string) => p.replaceAll("\\", "/");

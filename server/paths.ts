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
 * `data/.gitignore` (ADR-0014): `data/` is committed with the wiki, but for what belongs to one PC or is made again:
 * its sync id, the database's write-ahead files, resized pictures and exports.
 */
export const DATA_GITIGNORE = `# Shiori (ADR-0014): data/ is committed with the wiki, except this PC's own files.
machine.json
wiki.db-wal
wiki.db-shm
*.tmp
cache/
export/
`;

/** What Shiori used to write before ADR-0014: everything ignored. Rewritten to `DATA_GITIGNORE` once seen. */
const OLD_DATA_GITIGNORE = "*\n";

const checked = new Set<string>();

/** Writes `data/.gitignore` when it's missing or still the old "ignore everything"; a hand-made one is left alone. */
export function ensureDataGitignore(data: string) {
  if (checked.has(data)) return;
  checked.add(data);
  const file = join(data, ".gitignore");
  const current = existsSync(file) ? readFileSync(file, "utf8").replace(/\r\n/g, "\n") : null;
  if (current === null || current.trim() === OLD_DATA_GITIGNORE.trim()) writeFileSync(file, DATA_GITIGNORE);
}

/**
 * A wiki's `data/` folder, the only place the app writes at runtime (the database, pictures people add, cached
 * pictures). Committed with the wiki, except the files `DATA_GITIGNORE` names.
 */
export function dataDir(root: string, ...sub: string[]): string {
  const data = join(root, "data");
  if (!existsSync(data)) mkdirSync(data, { recursive: true });
  ensureDataGitignore(data);
  const dir = join(data, ...sub);
  if (sub.length) mkdirSync(dir, { recursive: true });
  return dir;
}

/** Forward slashes, as the workspace writes paths in files. */
export const slashes = (p: string) => p.replaceAll("\\", "/");

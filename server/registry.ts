// Finds wikis: every folder in the app's `wikis/` (except `_template` and other `_`/`.` folders), plus the folders
// listed in `wikis.local.json`. A folder is a wiki when it has a valid `wiki.json`.
import { existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { WikiCard } from "../shared/api.ts";
import { issues, type Manifest, manifestSchema } from "../shared/schema.ts";
import { DEFAULT_THEME, type Theme, themeAccent, themeSchema } from "../shared/theme.ts";
import { fileUrl } from "./markdown/links.ts";
import { readJson, slashes } from "./paths.ts";
import { buildPreview, previewDir, templateDir } from "./template.ts";

export interface Wiki {
  id: string;
  root: string;
  source: "local" | "linked";
  manifest: Manifest;
  theme: Theme;
  /** Problems with wiki.json, theme.json or the cover. Page problems come from `pages.ts`. */
  problems: string[];
}

/** A folder that should be a wiki but isn't readable as one. */
export interface Broken {
  root: string;
  source: "local" | "linked";
  problems: string[];
}

export interface Discovery {
  wikis: Wiki[];
  broken: Broken[];
}

export const LINKS_FILE = "wikis.local.json";

export function loadWiki(root: string, source: Wiki["source"]): Wiki | Broken {
  const m = readJson(join(root, "wiki.json"));
  if (m.error) return { root, source, problems: [`wiki.json: ${m.error}`] };
  const manifest = manifestSchema.safeParse(m.value);
  if (!manifest.success) return { root, source, problems: issues(manifest.error).map((i) => `wiki.json: ${i}`) };

  const problems: string[] = [];
  let theme = DEFAULT_THEME;
  const t = readJson(join(root, "theme.json"));
  if (t.error && t.error !== "missing") problems.push(`theme.json: ${t.error}`);
  if (!t.error) {
    const parsed = themeSchema.safeParse(t.value);
    if (parsed.success) theme = parsed.data;
    else problems.push(...issues(parsed.error).map((i) => `theme.json: ${i}`));
  }
  if (!existsSync(join(root, manifest.data.cover))) problems.push(`cover "${manifest.data.cover}" is missing`);
  if (!existsSync(join(root, "pages"))) problems.push("pages/ folder is missing");
  return { id: manifest.data.id, root, source, manifest: manifest.data, theme, problems };
}

export function readLinks(appRoot: string): string[] {
  const { value, error } = readJson(join(appRoot, LINKS_FILE));
  if (error) return [];
  const linked = (value as { linked?: unknown })?.linked;
  return Array.isArray(linked) ? linked.filter((p): p is string => typeof p === "string") : [];
}

export function writeLinks(appRoot: string, linked: string[]) {
  const body = { linked: [...new Set(linked.map((p) => slashes(resolve(p))))] };
  writeFileSync(join(appRoot, LINKS_FILE), `${JSON.stringify(body, null, 2)}\n`);
}

export function discover(appRoot: string): Discovery {
  const roots: { root: string; source: Wiki["source"] }[] = [];
  const local = join(appRoot, "wikis");
  if (existsSync(local)) {
    for (const name of readdirSync(local).sort()) {
      const root = join(local, name);
      if (/^[_.]/.test(name) || !statSync(root).isDirectory()) continue;
      roots.push({ root, source: "local" });
    }
  }
  for (const p of readLinks(appRoot)) roots.push({ root: resolve(appRoot, p), source: "linked" });

  const wikis: Wiki[] = [];
  const broken: Broken[] = [];
  for (const { root, source } of roots) {
    if (!existsSync(root)) {
      broken.push({ root, source, problems: ["folder not found"] });
      continue;
    }
    const w = loadWiki(root, source);
    if (!("id" in w)) broken.push(w);
    else if (wikis.some((x) => x.id === w.id)) broken.push({ root, source, problems: [`duplicate id "${w.id}"`] });
    else wikis.push(w);
  }
  wikis.sort((a, b) => a.manifest.order - b.manifest.order || a.manifest.title.localeCompare(b.manifest.title));
  return { wikis, broken };
}

export function toCard(wiki: Wiki, pages: number): WikiCard {
  let version = 0;
  try {
    version = Math.round(statSync(join(wiki.root, wiki.manifest.cover)).mtimeMs);
  } catch {}
  return {
    id: wiki.id,
    title: wiki.manifest.title,
    tagline: wiki.manifest.tagline,
    coverUrl: `${fileUrl(wiki.id, wiki.manifest.cover)}?v=${version}`,
    accent: themeAccent(wiki.theme),
    source: wiki.source,
    pages,
  };
}

/** What a changed file means: which wiki it belongs to and what part of it. */
export interface Change {
  wiki: string | null;
  /** `meta`: wiki.json, theme.json, the cover or a new folder. `data`: the comment database. */
  area: "pages" | "meta" | "data" | "designs" | "ignore";
}

function areaOf(wiki: Wiki, rel: string[]): Change["area"] {
  if (rel[0] === "data") return "data";
  if (rel[0] === "designs") return "designs";
  if (rel[0] === "wiki.json" || rel[0] === "theme.json" || rel[0] === wiki.manifest.cover) return "meta";
  return "pages";
}

const within = (root: string, file: string) => {
  const rel = relative(root, file);
  return rel.startsWith("..") || isAbsolute(rel) ? null : rel.split(sep);
};

/**
 * Cached discovery; `live.ts` invalidates it when files change.
 * Dev mode (`pnpm dev`) shows only the template, filled in as a preview outside the app folder.
 */
export function createRegistry(appRoot: string, { dev = false, preview = previewDir() } = {}) {
  let cache: Discovery | null = null;
  if (dev) buildPreview(appRoot, preview);
  const current = () => {
    if (!cache) {
      if (dev) {
        const w = loadWiki(preview, "local");
        cache = "id" in w ? { wikis: [w], broken: [] } : { wikis: [], broken: [w] };
      } else cache = discover(appRoot);
    }
    return cache;
  };
  return {
    appRoot,
    dev,
    all: () => current().wikis,
    broken: () => current().broken,
    get: (id: string) => current().wikis.find((w) => w.id === id),
    invalidate: () => {
      cache = null;
      if (dev) buildPreview(appRoot, preview);
    },
    /** Folders to watch, recursively. */
    watchDirs: (): string[] =>
      dev
        ? [templateDir(appRoot), join(preview, "data")]
        : [join(appRoot, "wikis"), ...readLinks(appRoot).map((p) => resolve(appRoot, p))],
    classify: (file: string): Change => {
      if (dev) {
        const id = current().wikis[0]?.id ?? null;
        if (within(join(preview, "data"), file)) return { wiki: id, area: "data" };
        const rel = within(templateDir(appRoot), file);
        if (!rel || rel[0] === "data") return { wiki: null, area: "ignore" };
        const w = current().wikis[0];
        return { wiki: id, area: w ? areaOf(w, rel) : "meta" };
      }
      for (const w of current().wikis) {
        const rel = within(w.root, file);
        if (rel) return { wiki: w.id, area: areaOf(w, rel) };
      }
      return { wiki: null, area: "meta" };
    },
  };
}
export type Registry = ReturnType<typeof createRegistry>;

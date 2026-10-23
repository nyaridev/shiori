// What the public wiki (ADR-0011) may show: which pages go public, which pictures and fields never do. Everything is
// private until wiki.json's `public` or a page's own `public: true` says otherwise.
import { DEFAULT_PUBLIC, type PublicSettings } from "../../shared/schema.ts";
import type { PageFile } from "../pages.ts";
import type { Wiki } from "../registry.ts";

export const publicSettings = (wiki: Wiki): PublicSettings => wiki.manifest.public ?? DEFAULT_PUBLIC;

const segmentRe = (pattern: string) =>
  new RegExp(
    `^${pattern
      .split("*")
      .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
      .join("[^/]*")}$`,
    "i",
  );

function matchSegments(pattern: string[], path: string[]): boolean {
  if (!pattern.length) return !path.length;
  const [head, ...rest] = pattern;
  if (head === "**") return matchSegments(rest, path) || (path.length > 0 && matchSegments(pattern, path.slice(1)));
  return path.length > 0 && segmentRe(head).test(path[0]) && matchSegments(rest, path.slice(1));
}

const segments = (s: string) =>
  s
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean);

/** `*` is any name in one folder, `**` any number of folders (none too): `mobs/**` is `mobs` and all under it. */
export function globMatch(pattern: string, path: string): boolean {
  return matchSegments(segments(pattern), segments(path));
}

/** Patterns in `public.pages` that name no page, for `pnpm shiori check`. */
export function unusedPatterns(patterns: string[], paths: string[]): string[] {
  return patterns.filter((p) => !paths.some((path) => path && globMatch(p, path)));
}

/**
 * A page goes public when its frontmatter says `public: true`, or wiki.json's `public.pages` lists it and its own
 * frontmatter doesn't say `public: false`. The home page and panel pages (dashboards, the roadmap) never do: the
 * public wiki has its own front page.
 */
export function isPublicPage(settings: PublicSettings, page: PageFile): boolean {
  if (page.path === "" || page.panel || page.public === false) return false;
  return page.public === true || settings.pages.some((p) => globMatch(p, page.path));
}

/**
 * A picture never leaves when it's in a folder named `private` or `_private`, has `.private.` in its name, or
 * `public.privateFiles` lists it. `rel` is from the wiki root.
 */
export function isPrivateFile(settings: PublicSettings, rel: string): boolean {
  const parts = segments(rel);
  const name = parts[parts.length - 1] ?? "";
  if (parts.some((p) => /^_?private$/i.test(p)) || /\.private\./i.test(name)) return true;
  return settings.privateFiles.some((p) => globMatch(p, rel));
}

/** Field labels compared loosely: case, spaces and dashes don't matter. */
export const fieldKey = (label: string) => label.toLowerCase().replace(/[\s_-]+/g, "");

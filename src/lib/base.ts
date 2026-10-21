// Guest mode (ADR-0003): opened through a share link, the app lives under `/s/<token>/` on the guest server, and so
// do its API and the wiki's media. The owner's app has no base.
const link = typeof location === "undefined" ? null : /^\/s\/[A-Za-z0-9_-]{43}(?=\/|$)/.exec(location.pathname);

/** `/s/<token>` for a guest, "" for the owner. */
export const BASE = link ? link[0] : "";
export const isGuest = BASE !== "";

/** A URL the server made (`/api/…`), under the link for a guest. */
export const withBase = <T extends string | undefined>(url: T): T =>
  (url?.startsWith("/api/") ? `${BASE}${url}` : url) as T;

/** The widths the server makes WebP copies at (server/files.ts, ADR-0004). */
export type PictureWidth = 160 | 480 | 960 | 1600 | 2400;

/**
 * A wiki picture at about `width` pixels wide: the server's smaller WebP copy instead of the original. SVGs and
 * pictures from elsewhere stay as they are.
 */
export function picture<T extends string | undefined>(src: T, width: PictureWidth): T {
  if (!src?.startsWith("/api/") || /\.svg(\?|$)/i.test(src)) return withBase(src);
  return withBase(`${src}${src.includes("?") ? "&" : "?"}w=${width}`) as T;
}

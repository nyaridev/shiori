// Guest mode (ADR-0003): opened through a share link, the app lives under `/s/<token>/` on the guest server, and so
// do its API and the wiki's media. The owner's app has no base.
const link = typeof location === "undefined" ? null : /^\/s\/[A-Za-z0-9_-]{43}(?=\/|$)/.exec(location.pathname);

/** `/s/<token>` for a guest, "" for the owner. */
export const BASE = link ? link[0] : "";
export const isGuest = BASE !== "";

/** A URL the server made (`/api/…`), under the link for a guest. */
export const withBase = <T extends string | undefined>(url: T): T =>
  (url?.startsWith("/api/") ? `${BASE}${url}` : url) as T;

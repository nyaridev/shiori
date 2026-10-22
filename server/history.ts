// A page's history (ADR-0008), for both servers: its commits, and one version with what it changed, what changed
// since, and the page as it was. Only the page's own commits can be opened, so a version id never reaches another file.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PageHistory, PageVersionDetail } from "../shared/api.ts";
import { diffFiles } from "../shared/diff.ts";
import { before, fileAt, pageHistory, publicHistory, VERSION_ID } from "./git.ts";
import { renderPage } from "./pages.ts";
import type { Wiki } from "./registry.ts";
import type { WikiData } from "./wikiData.ts";

/** The page's history, or null when the wiki has no such page. */
export async function historyOf(w: Wiki, data: WikiData, path: string): Promise<PageHistory | null> {
  const file = data.pagesOf(w).find((p) => p.path === path)?.file;
  return file ? publicHistory(await pageHistory(w.root, file)) : null;
}

/**
 * One version of a page: `working` (the file as it is, against its last commit) or a commit's full hash from the
 * page's own history. Null when there's no such page or version.
 */
export async function versionOf(w: Wiki, data: WikiData, path: string, id: string): Promise<PageVersionDetail | null> {
  if (!VERSION_ID.test(id)) return null;
  const pages = data.pagesOf(w);
  const file = pages.find((p) => p.path === path)?.file;
  if (!file) return null;
  const history = await pageHistory(w.root, file);
  let now: string;
  try {
    now = readFileSync(join(w.root, file), "utf8");
  } catch {
    return null;
  }

  if (id === "working") {
    if (!history.uncommitted) return null;
    const last = history.versions[0];
    const committed = last ? await fileAt(w.root, last) : "";
    const page = data.corpusOf(w).pages.get(path);
    if (!page) return null;
    return { version: null, changes: diffFiles(committed, now), sinceThen: null, page: { ...page, problems: [] } };
  }

  const at = history.versions.findIndex((v) => v.hash === id);
  if (at < 0) return null;
  const { path: _, ...version } = history.versions[at];
  const [then, previous] = await Promise.all([fileAt(w.root, history.versions[at]), before(w.root, history, at)]);
  const rendered = renderPage(w, pages, path, undefined, then);
  if (!rendered) return null;
  return {
    version,
    changes: diffFiles(previous, then),
    sinceThen: diffFiles(then, now),
    page: { ...rendered, updatedAt: version.date, problems: [] },
  };
}

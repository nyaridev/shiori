// What the owner's app and the guest server (ADR-0003) both read about a wiki: its pages, its rendered corpus, its
// detail and index. Cached in memory and dropped when files change; every change also bumps a version, which guests
// poll instead of server-sent events.
import type { PageData, PageLink, WikiDetail, WikiIndex } from "../shared/api.ts";
import { answerCounts } from "./answers.ts";
import { buildCorpus, type Corpus } from "./corpus.ts";
import type { Live } from "./live.ts";
import { buildNav, listPages, type PageFile, pageFinder } from "./pages.ts";
import { toCard, type Wiki } from "./registry.ts";
import { renderElements } from "./toolbox.ts";

export function createWikiData(live: Live) {
  const pageCache = new Map<string, PageFile[]>();
  const corpusCache = new Map<string, Corpus>();
  const elementsCache = new Map<string, PageData>();
  let pagesVersion = 0;
  const threadsVersion = new Map<string, number>();
  /** Guests' requests waiting for their wiki to change (long polling). */
  const waiting = new Set<{ wiki: string; done: () => void }>();
  live.subscribe((e) => {
    if (e.type === "shares") return;
    if (e.type === "threads") threadsVersion.set(e.wiki, (threadsVersion.get(e.wiki) ?? 0) + 1);
    else {
      pagesVersion++;
      pageCache.clear();
      corpusCache.clear();
      elementsCache.clear();
    }
    for (const w of waiting) if (e.type !== "threads" || w.wiki === e.wiki) w.done();
  });

  const pagesOf = (w: Wiki) => {
    let pages = pageCache.get(w.id);
    if (!pages) {
      pages = listPages(w);
      pageCache.set(w.id, pages);
    }
    return pages;
  };
  /** Every page of the wiki rendered once, with backlinks, the page index and the search index. */
  const corpusOf = (w: Wiki) => {
    let corpus = corpusCache.get(w.id);
    if (!corpus) {
      corpus = buildCorpus(w, pagesOf(w));
      corpusCache.set(w.id, corpus);
    }
    return corpus;
  };

  return {
    pagesOf,
    corpusOf,
    /** The element reference, linked to this wiki's pages (the toolbox). */
    elementsOf: (w: Wiki, appRoot: string) => {
      let page = elementsCache.get(w.id);
      if (!page) {
        page = renderElements(appRoot, { id: w.id, pages: pagesOf(w) });
        elementsCache.set(w.id, page);
      }
      return page;
    },
    detail: (w: Wiki): WikiDetail => {
      const pages = pagesOf(w);
      const find = pageFinder(pages, "");
      const byPath = new Map(pages.map((p) => [p.path, p]));
      const pinned = w.manifest.pinned.flatMap((name): PageLink[] => {
        const p = byPath.get(find(name).page?.path ?? "\0");
        return p?.path ? [{ path: p.path, title: p.title, icon: p.icon, summary: p.summary, isPage: true }] : [];
      });
      return { ...toCard(w, pages.length), theme: w.theme, nav: buildNav(pages), pinned, problems: w.problems };
    },
    index: (w: Wiki): WikiIndex => {
      const corpus = corpusOf(w);
      const counts = answerCounts(w.root);
      const questions = [...corpus.pages.values()].flatMap((p) =>
        p.questions.map((q) => ({
          ...q,
          page: { path: p.path, title: p.title, icon: p.icon, isPage: true },
          answers: counts.get(`${p.path}#${q.id}`) ?? 0,
        })),
      );
      return { pages: corpus.index, wanted: corpus.wanted, questions, tasks: corpus.tasks };
    },
    /** Changes since the server started: `pages` for any page or wiki file, `threads` for one wiki's comments. */
    version: (w: Wiki) => ({ pages: pagesVersion, threads: threadsVersion.get(w.id) ?? 0 }),
    /** Resolves when the wiki changes, after `ms`, or when `signal` aborts, whichever comes first. */
    waitForChange: (w: Wiki, ms: number, signal?: AbortSignal) =>
      new Promise<void>((resolve) => {
        const entry = {
          wiki: w.id,
          done: () => {
            waiting.delete(entry);
            clearTimeout(timer);
            signal?.removeEventListener("abort", entry.done);
            resolve();
          },
        };
        const timer = setTimeout(entry.done, ms);
        signal?.addEventListener("abort", entry.done);
        waiting.add(entry);
      }),
  };
}
export type WikiData = ReturnType<typeof createWikiData>;

/**
 * Why an answer can't be taken, or null when it can: answers only go to a question the page asks, while it's open,
 * with one of its options when it has some.
 */
export function answerProblem(
  page: PageData | undefined,
  input: { question: string; choice: string | null; body: string },
): { error: string; status: 400 | 404 | 409 } | null {
  const q = page?.questions.find((x) => x.id === input.question);
  if (!q) return { error: "no such question", status: 404 };
  if (q.status !== "open") return { error: "this question is already decided", status: 409 };
  if (input.choice !== null && !q.options.includes(input.choice))
    return { error: "not one of the options", status: 400 };
  if (input.choice === null && !input.body) return { error: "pick an option or write an answer", status: 400 };
  return null;
}

// What the owner's app and the guest server (ADR-0003) both read about a wiki: its pages, its rendered corpus, its
// detail and index. Cached in memory and dropped when files change; every change also bumps a version, which guests
// poll instead of server-sent events.
import type { PageData, WikiDetail, WikiIndex } from "../shared/api.ts";
import { answerCounts } from "./answers.ts";
import { buildCorpus, type Corpus } from "./corpus.ts";
import type { Live } from "./live.ts";
import { buildNav, listPages, type PageFile } from "./pages.ts";
import { toCard, type Wiki } from "./registry.ts";

export function createWikiData(live: Live) {
  const pageCache = new Map<string, PageFile[]>();
  const corpusCache = new Map<string, Corpus>();
  let pagesVersion = 0;
  const threadsVersion = new Map<string, number>();
  live.subscribe((e) => {
    if (e.type === "threads") {
      threadsVersion.set(e.wiki, (threadsVersion.get(e.wiki) ?? 0) + 1);
      return;
    }
    pagesVersion++;
    pageCache.clear();
    corpusCache.clear();
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
    detail: (w: Wiki): WikiDetail => ({
      ...toCard(w, pagesOf(w).length),
      theme: w.theme,
      nav: buildNav(pagesOf(w)),
      problems: w.problems,
    }),
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

// What's waiting for this viewer on each page, for the sidebar's dots: open questions and suggestions they haven't
// answered yet. A view-only guest can't answer, so nothing waits for them.
import { useMemo } from "react";
import { canComment, useGuest } from "../../guest/GuestContext.ts";
import { api } from "../../lib/api.ts";
import { useLive } from "../../lib/live.ts";
import { useResource } from "../../lib/useResource.ts";
import { useWikiIndex } from "../WikiIndexContext.ts";

export interface Waiting {
  questions: number;
  suggestions: number;
}

const NONE = new Map<string, Waiting>();

/** Per page path, how many open questions and suggestions this viewer hasn't answered. Pages with none are left out. */
export function usePending(wikiId: string): Map<string, Waiting> {
  const guest = useGuest();
  const index = useWikiIndex();
  const answers = useResource(`answers:${wikiId}`, () => api.answers(wikiId));
  const { reload } = answers;
  useLive((e) => {
    if (e.type === "threads" && e.wiki === wikiId) reload();
  });
  return useMemo(() => {
    if (!index || !answers.data || !canComment(guest)) return NONE;
    const mine = new Set(
      answers.data.filter((a) => (guest ? a.mine : a.author === "user")).map((a) => `${a.page}#${a.question}`),
    );
    const out = new Map<string, Waiting>();
    for (const q of index.index.questions) {
      if (q.status !== "open" || mine.has(`${q.page.path}#${q.id}`)) continue;
      const w = out.get(q.page.path) ?? { questions: 0, suggestions: 0 };
      if (q.kind === "suggestion") w.suggestions++;
      else w.questions++;
      out.set(q.page.path, w);
    }
    return out;
  }, [index, answers.data, guest]);
}

/** Two counts added up: a folded group shows what waits anywhere inside it. */
export const addUp = (list: (Waiting | undefined)[]): Waiting | undefined => {
  const sum = { questions: 0, suggestions: 0 };
  for (const w of list) {
    sum.questions += w?.questions ?? 0;
    sum.suggestions += w?.suggestions ?? 0;
  }
  return sum.questions || sum.suggestions ? sum : undefined;
};

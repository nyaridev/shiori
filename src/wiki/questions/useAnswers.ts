import { useCallback } from "react";
import type { Answer } from "../../../shared/api.ts";
import { api } from "../../lib/api.ts";
import { useLive } from "../../lib/live.ts";
import { useResource } from "../../lib/useResource.ts";

const NONE: Answer[] = [];

/** A page's answers, kept fresh when someone else answers (the wiki's data changed). */
export function useAnswers(wikiId: string, page: string) {
  const res = useResource(`answers:${wikiId}:${page}`, () => api.answers(wikiId, page));
  const { reload } = res;
  useLive((e) => {
    if (e.type === "threads" && e.wiki === wikiId) reload();
  });
  const answer = useCallback(
    async (question: string, choice: string | null, body: string) => {
      await api.answer(wikiId, page, question, choice, body);
      reload();
    },
    [wikiId, page, reload],
  );
  return { answers: res.data ?? NONE, answer };
}

import { useRef } from "react";
import type { QuestionPage, QuestionQuery, QuestionsWaiting } from "../../../shared/api.ts";
import { api } from "../../lib/api.ts";
import { useLive } from "../../lib/live.ts";
import { useResource } from "../../lib/useResource.ts";

/**
 * One page of the wiki's questions (ADR-0009), kept fresh when someone answers or a page changes. While the next page
 * loads, the last one stays on screen. `since` isn't part of what's cached: the list keeps it for the whole visit.
 */
export function useQuestions(wikiId: string, query: QuestionQuery | null, since?: string) {
  const sinceRef = useRef(since);
  sinceRef.current = since;
  const key = query && `questions:${wikiId}:${JSON.stringify(query)}`;
  const res = useResource<QuestionPage>(
    key,
    () => api.questions(wikiId, { ...(query as QuestionQuery), since: sinceRef.current }),
    { keep: true },
  );
  const { reload } = res;
  useLive((e) => {
    if ((e.type === "threads" || e.type === "pages") && e.wiki === wikiId) reload();
  });
  return res;
}

/** What waits for this viewer on each page, for the sidebar's dots. */
export function useWaiting(wikiId: string, enabled: boolean) {
  const res = useResource<QuestionsWaiting>(enabled ? `waiting:${wikiId}` : null, () => api.questionsWaiting(wikiId));
  const { reload } = res;
  useLive((e) => {
    if ((e.type === "threads" || e.type === "pages") && e.wiki === wikiId) reload();
  });
  return res.data;
}

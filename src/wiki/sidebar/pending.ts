// What's waiting for this viewer on each page, for the sidebar's dots: open questions and suggestions they haven't
// answered yet. A view-only guest can't answer, so nothing waits for them.
import { useMemo } from "react";
import { canComment, useGuest } from "../../guest/GuestContext.ts";
import { useWaiting } from "../questions/useQuestions.ts";

export interface Waiting {
  questions: number;
  suggestions: number;
}

const NONE = new Map<string, Waiting>();

/**
 * Per page path, how many open questions and suggestions this viewer hasn't answered. Pages with none are left out.
 * The server counts them (ADR-0009), so the app never loads every answer in the wiki.
 */
export function usePending(wikiId: string): Map<string, Waiting> {
  const guest = useGuest();
  const waiting = useWaiting(wikiId, canComment(guest));
  return useMemo(() => (waiting ? new Map(Object.entries(waiting.pages)) : NONE), [waiting]);
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

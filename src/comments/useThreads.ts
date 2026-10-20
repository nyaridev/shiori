import { useCallback } from "react";
import type { Thread, ThreadStatus } from "../../shared/api.ts";
import type { Quote } from "../../shared/quote.ts";
import { api } from "../lib/api.ts";
import { useLive } from "../lib/live.ts";
import { useResource } from "../lib/useResource.ts";

const NONE: Thread[] = [];

/** A page's comment threads, kept fresh when the CLI (or another tab) changes them. */
export function useThreads(wikiId: string, page: string) {
  const res = useResource(`${wikiId}:${page}`, () => api.threads(wikiId, page));
  const { reload } = res;
  useLive((e) => {
    if (e.type === "threads" && e.wiki === wikiId) reload();
  });

  const create = useCallback(
    async (quote: Quote, body: string) => {
      const t = await api.createThread(wikiId, page, quote, body);
      reload();
      return t;
    },
    [wikiId, page, reload],
  );
  const reply = useCallback(
    async (id: number, body: string) => {
      await api.reply(wikiId, id, body);
      reload();
    },
    [wikiId, reload],
  );
  const setStatus = useCallback(
    async (id: number, status: ThreadStatus) => {
      await api.setStatus(wikiId, id, status);
      reload();
    },
    [wikiId, reload],
  );

  return { threads: res.data ?? NONE, create, reply, setStatus };
}
export type Threads = ReturnType<typeof useThreads>;

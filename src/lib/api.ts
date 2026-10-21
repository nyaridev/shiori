import type {
  Answer,
  GuestSession,
  PageData,
  SearchHit,
  Thread,
  ThreadStatus,
  WikiCard,
  WikiDetail,
  WikiIndex,
} from "../../shared/api.ts";
import type { Quote } from "../../shared/quote.ts";
import { withBase } from "./base.ts";

/** A failed request, with its HTTP status (a guest's link answers 410 once it ends). */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(`${status} ${message}`);
    this.status = status;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(withBase(url), {
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  });
  if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => null))?.error ?? res.statusText);
  return res.json() as Promise<T>;
}

const enc = encodeURIComponent;

export const api = {
  wikis: () => request<{ wikis: WikiCard[] }>("/api/wikis").then((r) => r.wikis),
  wiki: (id: string) => request<WikiDetail>(`/api/wikis/${enc(id)}`),
  page: (id: string, path: string) => request<PageData>(`/api/wikis/${enc(id)}/page?path=${enc(path)}`),
  index: (id: string) => request<WikiIndex>(`/api/wikis/${enc(id)}/pages`),
  search: (id: string, q: string, signal?: AbortSignal) =>
    request<{ hits: SearchHit[] }>(`/api/wikis/${enc(id)}/search?q=${enc(q)}`, { signal }).then((r) => r.hits),
  answers: (id: string, page: string) =>
    request<{ answers: Answer[] }>(`/api/wikis/${enc(id)}/answers?page=${enc(page)}`).then((r) => r.answers),
  answer: (id: string, page: string, question: string, choice: string | null, body: string) =>
    request<Answer>(`/api/wikis/${enc(id)}/answers`, {
      method: "POST",
      body: JSON.stringify({ page, question, choice, body }),
    }),
  elements: () => request<PageData>("/api/dev/elements"),
  threads: (id: string, page?: string) =>
    request<{ threads: Thread[] }>(
      `/api/wikis/${enc(id)}/threads${page === undefined ? "" : `?page=${enc(page)}`}`,
    ).then((r) => r.threads),
  createThread: (id: string, page: string, quote: Quote, body: string) =>
    request<Thread>(`/api/wikis/${enc(id)}/threads`, { method: "POST", body: JSON.stringify({ page, quote, body }) }),
  reply: (id: string, thread: number, body: string) =>
    request<Thread>(`/api/wikis/${enc(id)}/threads/${thread}/messages`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),
  setStatus: (id: string, thread: number, status: ThreadStatus) =>
    request<Thread>(`/api/wikis/${enc(id)}/threads/${thread}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  /** Guests only: the share link they came through, and their name once they picked one. */
  session: () => request<GuestSession>("/api/session"),
  join: (name: string) => request<GuestSession>("/api/session", { method: "POST", body: JSON.stringify({ name }) }),
};

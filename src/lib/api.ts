import type { PageData, Thread, ThreadStatus, WikiCard, WikiDetail } from "../../shared/api.ts";
import type { Quote } from "../../shared/quote.ts";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.json().catch(() => null))?.error ?? res.statusText}`);
  return res.json() as Promise<T>;
}

const enc = encodeURIComponent;

export const api = {
  wikis: () => request<{ wikis: WikiCard[] }>("/api/wikis").then((r) => r.wikis),
  wiki: (id: string) => request<WikiDetail>(`/api/wikis/${enc(id)}`),
  page: (id: string, path: string) => request<PageData>(`/api/wikis/${enc(id)}/page?path=${enc(path)}`),
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
};

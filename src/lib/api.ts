import type {
  Answer,
  GuestSession,
  ImageGroup,
  PageData,
  SearchHit,
  ShareDuration,
  ShareInfo,
  ShareKind,
  SharesState,
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
  /** The server's own words, without the status. */
  detail: string;
  constructor(status: number, message: string) {
    super(`${status} ${message}`);
    this.status = status;
    this.detail = message;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(withBase(url), {
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  });
  if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => null))?.error ?? res.statusText);
  return (res.status === 204 ? undefined : res.json()) as Promise<T>;
}

const enc = encodeURIComponent;

export const api = {
  wikis: () => request<{ wikis: WikiCard[] }>("/api/wikis").then((r) => r.wikis),
  wiki: (id: string) => request<WikiDetail>(`/api/wikis/${enc(id)}`),
  page: (id: string, path: string) => request<PageData>(`/api/wikis/${enc(id)}/page?path=${enc(path)}`),
  index: (id: string) => request<WikiIndex>(`/api/wikis/${enc(id)}/pages`),
  images: (id: string) => request<{ groups: ImageGroup[] }>(`/api/wikis/${enc(id)}/images`).then((r) => r.groups),
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
  /** The owner hides a guest's message or answer from guests and the inbox (ADR-0003), or shows it again. */
  hideMessage: (id: string, message: number, hidden: boolean) =>
    request<Thread>(`/api/wikis/${enc(id)}/messages/${message}`, { method: "PATCH", body: JSON.stringify({ hidden }) }),
  hideAnswer: (id: string, answer: number, hidden: boolean) =>
    request<Answer>(`/api/wikis/${enc(id)}/answers/${answer}`, { method: "PATCH", body: JSON.stringify({ hidden }) }),
  /** Share links (ADR-0003), for the owner's Share dialog. */
  shares: () => request<SharesState>("/api/shares"),
  share: (link: { wiki: string; kind: ShareKind; duration: ShareDuration; label: string; host?: string }) =>
    request<ShareInfo>("/api/shares", { method: "POST", body: JSON.stringify(link) }),
  revokeShare: (id: string) => request<void>(`/api/shares/${enc(id)}`, { method: "DELETE" }),
  stopSharing: () => request<void>("/api/shares", { method: "DELETE" }),
  setHost: (name: string) =>
    request<SharesState>("/api/shares/host", { method: "PUT", body: JSON.stringify({ name }) }),
  retryTunnel: () => request<SharesState>("/api/shares/tunnel", { method: "POST" }),
  blockGuest: (share: string, guest: string, blocked: boolean) =>
    request<SharesState>(`/api/shares/${enc(share)}/guests/${enc(guest)}`, {
      method: "PATCH",
      body: JSON.stringify({ blocked }),
    }),
  /** Guests only: the share link they came through, and their name once they picked one. */
  session: () => request<GuestSession>("/api/session"),
  join: (name: string) => request<GuestSession>("/api/session", { method: "POST", body: JSON.stringify({ name }) }),
};

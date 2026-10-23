import type {
  Answer,
  DesignInfo,
  GitInfo,
  GuestSession,
  ImageGroup,
  KitInfo,
  NoteHit,
  PageData,
  PageHistory,
  PageVersionDetail,
  Person,
  QuestionPage,
  QuestionQuery,
  QuestionsWaiting,
  ReactionEmoji,
  SearchFilter,
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
import { isGuest, withBase } from "./base.ts";

/** A failed request, with its HTTP status (a guest's link answers 410 once it ends). */
export class ApiError extends Error {
  status: number;
  /** The server's own words, without the status. */
  detail: string;
  /** The whole answer, when it says more than its error (a sheet's conflict carries the cell as it is now). */
  data: unknown;
  constructor(status: number, message: string, data: unknown = null) {
    super(`${status} ${message}`);
    this.status = status;
    this.detail = message;
    this.data = data;
  }
}

export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(withBase(url), {
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, data?.error ?? res.statusText, data);
  }
  return (res.status === 204 ? undefined : res.json()) as Promise<T>;
}

/** A drawing or a picture, sent as it is with its own type. */
export async function upload<T>(url: string, method: string, body: Blob): Promise<T> {
  const res = await fetch(withBase(url), { method, body, headers: { "content-type": body.type } });
  if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => null))?.error ?? res.statusText);
  return res.json() as Promise<T>;
}

const enc = encodeURIComponent;

export const api = {
  wikis: () => request<{ wikis: WikiCard[] }>("/api/wikis").then((r) => r.wikis),
  wiki: (id: string) => request<WikiDetail>(`/api/wikis/${enc(id)}`),
  page: (id: string, path: string) => request<PageData>(`/api/wikis/${enc(id)}/page?path=${enc(path)}`),
  index: (id: string) => request<WikiIndex>(`/api/wikis/${enc(id)}/pages`),
  images: (id: string) => request<{ groups: ImageGroup[] }>(`/api/wikis/${enc(id)}/images`).then((r) => r.groups),
  /** Where the wiki is kept in git (ADR-0008); the owner only. */
  git: (id: string) => request<GitInfo>(`/api/wikis/${enc(id)}/git`),
  /** A page's commits, and one version of it (`working` for what isn't committed yet). */
  history: (id: string, path: string) => request<PageHistory>(`/api/wikis/${enc(id)}/history?path=${enc(path)}`),
  version: (id: string, path: string, version: string) =>
    request<PageVersionDetail>(`/api/wikis/${enc(id)}/history/${enc(version)}?path=${enc(path)}`),
  /** Pages that match (narrowed by the filter), and the comments and answers that do. */
  search: (id: string, q: string, filter: SearchFilter, signal?: AbortSignal) => {
    const params = new URLSearchParams({ q });
    for (const [k, v] of Object.entries(filter)) if (v) params.set(k, v);
    return request<{ hits: SearchHit[]; notes: NoteHit[] }>(`/api/wikis/${enc(id)}/search?${params}`, { signal });
  },
  /** One page of the wiki's questions and suggestions (ADR-0009). */
  questions: (id: string, query: QuestionQuery, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query))
      if (v !== undefined && v !== "" && v !== false) params.set(k, v === true ? "1" : String(v));
    return request<QuestionPage>(`/api/wikis/${enc(id)}/questions?${params}`, { signal });
  },
  /** Per page, the open questions and suggestions this viewer hasn't answered. */
  questionsWaiting: (id: string) => request<QuestionsWaiting>(`/api/wikis/${enc(id)}/questions/waiting`),
  /** A page's answers, or (without a page) every answer in the wiki. */
  answers: (id: string, page?: string) =>
    request<{ answers: Answer[] }>(
      `/api/wikis/${enc(id)}/answers${page === undefined ? "" : `?page=${enc(page)}`}`,
    ).then((r) => r.answers),
  answer: (id: string, page: string, question: string, choice: string | null, body: string) =>
    request<Answer>(`/api/wikis/${enc(id)}/answers`, {
      method: "POST",
      body: JSON.stringify({ page, question, choice, body }),
    }),
  elements: () => request<PageData>("/api/dev/elements"),
  /** The toolbox: the kits a wiki can use, and the element reference linked to its pages. */
  kits: (id: string) => request<{ kits: KitInfo[] }>(`/api/wikis/${enc(id)}/kits`).then((r) => r.kits),
  wikiElements: (id: string) => request<PageData>(`/api/wikis/${enc(id)}/elements`),
  threads: (id: string, page?: string) =>
    request<{ threads: Thread[] }>(
      `/api/wikis/${enc(id)}/threads${page === undefined ? "" : `?page=${enc(page)}`}`,
    ).then((r) => r.threads),
  createThread: (id: string, page: string, quote: Quote, body: string, images: string[] = []) =>
    request<Thread>(`/api/wikis/${enc(id)}/threads`, {
      method: "POST",
      body: JSON.stringify({ page, quote, body, images }),
    }),
  /** Uploads a picture for a comment; name the file it answers in the new thread. */
  attach: (id: string, picture: Blob) => upload<{ file: string }>(`/api/wikis/${enc(id)}/attachments`, "POST", picture),
  /** A comment's picture, smaller when `w` is given. */
  attachmentUrl: (id: string, file: string, w?: number) =>
    withBase(`/api/wikis/${enc(id)}/attachments/${enc(file)}${w ? `?w=${w}` : ""}`),
  reply: (id: string, thread: number, body: string) =>
    request<Thread>(`/api/wikis/${enc(id)}/threads/${thread}/messages`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),
  /** Removes a thread: the host any, a guest their own. */
  removeThread: (id: string, thread: number) =>
    request<void>(`/api/wikis/${enc(id)}/threads/${thread}`, { method: "DELETE" }),
  setStatus: (id: string, thread: number, status: ThreadStatus) =>
    request<Thread>(`/api/wikis/${enc(id)}/threads/${thread}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  /** The owner hides a guest's message or answer from guests and the inbox (ADR-0003), or shows it again. */
  hideMessage: (id: string, message: number, hidden: boolean) =>
    request<Thread>(`/api/wikis/${enc(id)}/messages/${message}`, { method: "PATCH", body: JSON.stringify({ hidden }) }),
  /** Changes the text of one of this viewer's own messages (ADR-0010). */
  editMessage: (id: string, message: number, body: string) =>
    request<Thread>(`/api/wikis/${enc(id)}/messages/${message}`, { method: "PATCH", body: JSON.stringify({ body }) }),
  /** Adds this viewer's reaction to a message, or takes it back. */
  react: (id: string, message: number, emoji: ReactionEmoji, on: boolean) =>
    request<Thread>(`/api/wikis/${enc(id)}/messages/${message}/reactions`, {
      method: "POST",
      body: JSON.stringify({ emoji, on }),
    }),
  hideAnswer: (id: string, answer: number, hidden: boolean) =>
    request<Answer>(`/api/wikis/${enc(id)}/answers/${answer}`, { method: "PATCH", body: JSON.stringify({ hidden }) }),
  /** Share links (ADR-0003), for the owner's Share dialog. */
  shares: () => request<SharesState>("/api/shares"),
  share: (link: {
    wiki: string;
    kind: ShareKind;
    duration: ShareDuration;
    label: string;
    host?: string;
    /** A board's uid or a sheet's name, for board and sheet links (ADR-0010). */
    target?: string;
    edit?: boolean;
  }) => request<ShareInfo>("/api/shares", { method: "POST", body: JSON.stringify(link) }),
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
  /** Who is on the wiki (ADR-0005): the owner sees everyone, a guest the host and their own link's guests. */
  people: (id: string) => request<{ people: Person[] }>(`/api/wikis/${enc(id)}/presence`).then((r) => r.people),
  /** Says which page this tab is on; answers who is here. The owner's tabs name themselves, a guest is their cookie. */
  here: (id: string, tab: string, page: string | null) =>
    request<{ people: Person[] }>(`/api/wikis/${enc(id)}/presence`, {
      method: "PUT",
      body: JSON.stringify(isGuest ? { page } : { tab, page }),
    }).then((r) => r.people),
  /** This tab is leaving the wiki. `keepalive`, so it still goes out while the page closes. */
  leave: (id: string, tab: string) =>
    fetch(withBase(`/api/wikis/${enc(id)}/presence${isGuest ? "" : `/${enc(tab)}`}`), {
      method: "DELETE",
      keepalive: true,
    }).catch(() => undefined),
  /** Designs (ADR-0006): a collection's, one, and the changes a person may make. */
  designs: (id: string, collection: string) =>
    request<{ designs: DesignInfo[] }>(`/api/wikis/${enc(id)}/designs/${enc(collection)}`).then((r) => r.designs),
  design: (id: string, collection: string, design: string) =>
    request<DesignInfo>(`/api/wikis/${enc(id)}/designs/${enc(collection)}/${enc(design)}`),
  newDesign: (id: string, collection: string, name: string) =>
    request<DesignInfo>(`/api/wikis/${enc(id)}/designs/${enc(collection)}`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  changeDesign: (
    id: string,
    collection: string,
    design: string,
    patch: { name?: string; description?: string; status?: "draft" | "ready" },
  ) =>
    request<DesignInfo>(`/api/wikis/${enc(id)}/designs/${enc(collection)}/${enc(design)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  hideDesign: (id: string, collection: string, design: string, hidden: boolean) =>
    request<DesignInfo>(`/api/wikis/${enc(id)}/designs/${enc(collection)}/${enc(design)}/hidden`, {
      method: "PATCH",
      body: JSON.stringify({ hidden }),
    }),
  removeDesign: (id: string, collection: string, design: string) =>
    request<void>(`/api/wikis/${enc(id)}/designs/${enc(collection)}/${enc(design)}`, { method: "DELETE" }),
  saveBoard: (id: string, collection: string, design: string, png: Blob) =>
    upload<DesignInfo>(`/api/wikis/${enc(id)}/designs/${enc(collection)}/${enc(design)}/board`, "PUT", png),
  addPicture: (id: string, collection: string, design: string, file: Blob, caption: string) =>
    upload<DesignInfo>(
      `/api/wikis/${enc(id)}/designs/${enc(collection)}/${enc(design)}/pictures?caption=${enc(caption)}`,
      "POST",
      file,
    ),
  removePicture: (id: string, collection: string, design: string, file: string) =>
    request<DesignInfo>(`/api/wikis/${enc(id)}/designs/${enc(collection)}/${enc(design)}/pictures/${enc(file)}`, {
      method: "DELETE",
    }),
  /** Guests only: the share link they came through, and their name once they picked one. */
  session: () => request<GuestSession>("/api/session"),
  join: (name: string) => request<GuestSession>("/api/session", { method: "POST", body: JSON.stringify({ name }) }),
};

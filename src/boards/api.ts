// Test boards' API (ADR-0010): the owner's routes under the wiki, and a tester's under their board link.
import type { Board, BoardView, Report, ReportKind, ReportStatus } from "../../shared/api.ts";
import { request, upload } from "../lib/api.ts";
import { withBase } from "../lib/base.ts";

const enc = encodeURIComponent;
const at = (wikiId: string) => `/api/wikis/${enc(wikiId)}/boards`;

export interface NewReport {
  kind: ReportKind;
  title: string;
  body: string;
  images: string[];
}

/** The owner's. */
export const boardsApi = {
  list: (wikiId: string) => request<{ boards: Board[] }>(at(wikiId)).then((r) => r.boards),
  create: (wikiId: string, name: string, visibility: Board["visibility"]) =>
    request<Board>(at(wikiId), { method: "POST", body: JSON.stringify({ name, visibility }) }),
  change: (
    wikiId: string,
    uid: string,
    change: { name?: string; visibility?: Board["visibility"]; closed?: boolean },
  ) => request<Board>(`${at(wikiId)}/${enc(uid)}`, { method: "PATCH", body: JSON.stringify(change) }),
  reports: (wikiId: string, uid: string) =>
    request<{ board: Board; reports: Report[] }>(`${at(wikiId)}/${enc(uid)}/reports`),
  triage: (
    wikiId: string,
    uid: string,
    id: number,
    change: { status?: ReportStatus; note?: string; hidden?: boolean },
  ) => request<Report>(`${at(wikiId)}/${enc(uid)}/reports/${id}`, { method: "PATCH", body: JSON.stringify(change) }),
  remove: (wikiId: string, uid: string, id: number) =>
    request<void>(`${at(wikiId)}/${enc(uid)}/reports/${id}`, { method: "DELETE" }),
  /** A report's picture, as the owner's server serves comments' pictures. */
  pictureUrl: (wikiId: string) => (file: string, w?: number) =>
    `/api/wikis/${enc(wikiId)}/attachments/${enc(file)}${w ? `?w=${w}` : ""}`,
};

/** A tester's, on a board link. */
export const testerApi = {
  view: () => request<BoardView>("/api/board"),
  create: (report: NewReport) =>
    request<Report>("/api/board/reports", { method: "POST", body: JSON.stringify(report) }),
  edit: (id: number, change: Partial<Omit<NewReport, "images">>) =>
    request<Report>(`/api/board/reports/${id}`, { method: "PATCH", body: JSON.stringify(change) }),
  remove: (id: number) => request<void>(`/api/board/reports/${id}`, { method: "DELETE" }),
  attach: (picture: Blob) => upload<{ file: string }>("/api/board/attachments", "POST", picture),
  pictureUrl: (file: string, w?: number) => withBase(`/api/board/attachments/${enc(file)}${w ? `?w=${w}` : ""}`),
};

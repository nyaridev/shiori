// Data sheets' API (ADR-0010): the owner's routes under the wiki, and a guest's under their sheet link.

import type { Cell, SheetCell, SheetEdit, SheetView } from "../../shared/sheet.ts";
import type { Theme } from "../../shared/theme.ts";
import { request } from "../lib/api.ts";

const enc = encodeURIComponent;
const at = (wikiId: string, name: string) => `/api/wikis/${enc(wikiId)}/sheets/${enc(name)}`;

export interface SheetSummary {
  name: string;
  title: string;
  rows: number;
  /** What's wrong with its file, when it can't be read. */
  problems?: string[];
}

/** A change to one cell, from the version it started on; null puts it back to its default. */
export interface CellChange {
  row: string;
  column: string;
  value: Cell;
  base: number;
}

/** Sets one cell somewhere: the owner's server or a guest's link. */
export type SetCell = (change: CellChange) => Promise<SheetCell>;

export const sheetsApi = {
  list: (wikiId: string) =>
    request<{ sheets: SheetSummary[] }>(`/api/wikis/${enc(wikiId)}/sheets`).then((r) => r.sheets),
  view: (wikiId: string, name: string) => request<{ sheet: SheetView }>(at(wikiId, name)).then((r) => r.sheet),
  history: (wikiId: string, name: string) =>
    request<{ edits: SheetEdit[] }>(`${at(wikiId, name)}/history`).then((r) => r.edits),
  set: (wikiId: string, name: string) => (change: CellChange) =>
    request<{ cell: SheetCell }>(`${at(wikiId, name)}/cells`, { method: "PUT", body: JSON.stringify(change) }).then(
      (r) => r.cell,
    ),
  undo: (wikiId: string, name: string, edit: number) =>
    request<{ cell: SheetCell }>(`${at(wikiId, name)}/history/${edit}/undo`, { method: "POST" }),
  revertGuest: (wikiId: string, name: string, guest: string) =>
    request<{ reverted: number }>(`${at(wikiId, name)}/revert`, { method: "POST", body: JSON.stringify({ guest }) }),
};

/** A guest's, on a sheet link. */
export const guestSheetApi = {
  view: () => request<{ sheet: SheetView; wiki: { title: string; theme: Theme } }>("/api/sheet"),
  history: () => request<{ edits: SheetEdit[] }>("/api/sheet/history").then((r) => r.edits),
  set: (change: CellChange) =>
    request<{ cell: SheetCell }>("/api/sheet/cells", { method: "PUT", body: JSON.stringify(change) }).then(
      (r) => r.cell,
    ),
};

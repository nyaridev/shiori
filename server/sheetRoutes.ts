// The owner's routes for data sheets (ADR-0010), under `/api/wikis/:id/sheets`: read every sheet, change values,
// read the history, undo one change or everything a guest did. Guests reach one sheet only through a sheet link
// (server/sharing/sheets.ts).
import { type Context, Hono } from "hono";
import { z } from "zod";
import type { Wiki } from "./registry.ts";
import {
  loadSheet,
  readSheet,
  revertGuest,
  type SetResult,
  setCell,
  sheetHistory,
  sheetNames,
  sheetView,
  undoEdit,
} from "./sheets.ts";

const OWNER = { kind: "owner" } as const;
const cellSchema = z.strictObject({
  row: z.string().max(64),
  column: z.string().max(64),
  value: z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]),
  base: z.number().int().min(0),
});
const revertSchema = z.strictObject({ guest: z.string().min(1).max(64) });

export function ownerSheetRoutes(wikiOf: (c: Context) => Wiki | Response) {
  const app = new Hono();
  const body = async (c: Context) => c.req.json().catch(() => null);
  const answer = (c: Context, done: SetResult) => {
    if ("error" in done) return c.json({ error: done.error }, done.status);
    if ("conflict" in done) return c.json({ error: "someone changed it just now", cell: done.conflict }, 409);
    return c.json({ cell: done.cell });
  };

  // Every sheet, with its title or what's wrong with its file.
  app.get("/", (c) => {
    const w = wikiOf(c);
    if (w instanceof Response) return w;
    const sheets = sheetNames(w.root).map((name) => {
      const s = loadSheet(w.root, name);
      return s && "file" in s
        ? { name, title: s.file.title, rows: s.rows.size }
        : { name, title: name, rows: 0, problems: s?.problems ?? [] };
    });
    return c.json({ sheets });
  });

  app.get("/:name", (c) => {
    const w = wikiOf(c);
    if (w instanceof Response) return w;
    const s = loadSheet(w.root, c.req.param("name"));
    if (!s) return c.json({ error: "no such sheet" }, 404);
    if ("problems" in s) return c.json({ error: "this sheet's file has problems", problems: s.problems }, 422);
    return c.json({ sheet: sheetView(w.root, s, OWNER) });
  });

  app.get("/:name/history", (c) => {
    const w = wikiOf(c);
    if (w instanceof Response) return w;
    const s = readSheet(w.root, c.req.param("name"));
    return s ? c.json({ edits: sheetHistory(w.root, s.name, OWNER, 500) }) : c.json({ error: "no such sheet" }, 404);
  });

  app.put("/:name/cells", async (c) => {
    const w = wikiOf(c);
    if (w instanceof Response) return w;
    const parsed = cellSchema.safeParse(await body(c));
    if (!parsed.success) return c.json({ error: "bad request" }, 400);
    const s = readSheet(w.root, c.req.param("name"));
    if (!s) return c.json({ error: "no such sheet" }, 404);
    return answer(c, setCell(w.root, s, parsed.data, "user", OWNER));
  });

  app.post("/:name/history/:eid/undo", (c) => {
    const w = wikiOf(c);
    if (w instanceof Response) return w;
    const s = readSheet(w.root, c.req.param("name"));
    if (!s) return c.json({ error: "no such sheet" }, 404);
    return answer(c, undoEdit(w.root, s, Number(c.req.param("eid")), "user"));
  });

  app.post("/:name/revert", async (c) => {
    const w = wikiOf(c);
    if (w instanceof Response) return w;
    const parsed = revertSchema.safeParse(await body(c));
    if (!parsed.success) return c.json({ error: "bad request" }, 400);
    const s = readSheet(w.root, c.req.param("name"));
    if (!s) return c.json({ error: "no such sheet" }, 404);
    return c.json({ reverted: revertGuest(w.root, s, parsed.data.guest, "user") });
  });

  return app;
}

// The owner's routes for test boards (ADR-0010), under `/api/wikis/:id/boards`: make boards, read every report, and
// say where each one stands; move a board to the trash and back, or delete one from the trash for good (ADR-0014).
// Testers reach boards only through a board link (server/sharing/boards.ts).
import { type Context, Hono } from "hono";
import { z } from "zod";
import { REPORT_STATUSES } from "../shared/api.ts";
import {
  createBoard,
  getBoard,
  getReport,
  listBoards,
  listReports,
  purgeBoard,
  removeReport,
  triageReport,
  updateBoard,
} from "./boards.ts";
import type { Wiki } from "./registry.ts";

export const boardName = z.string().trim().min(1).max(60);
const visibility = z.enum(["global", "private"]);
const newBoardSchema = z.strictObject({ name: boardName, visibility: visibility.default("global") });
const boardChangeSchema = z.strictObject({
  name: boardName.optional(),
  visibility: visibility.optional(),
  closed: z.boolean().optional(),
  trashed: z.boolean().optional(),
});
const triageSchema = z.strictObject({
  status: z.enum(REPORT_STATUSES as [string, ...string[]]).optional(),
  note: z.string().trim().max(2000).optional(),
  hidden: z.boolean().optional(),
});

export function ownerBoardRoutes(wikiOf: (c: Context) => Wiki | Response) {
  const app = new Hono();
  const body = async (c: Context) => c.req.json().catch(() => null);

  app.get("/", (c) => {
    const w = wikiOf(c);
    return w instanceof Response ? w : c.json({ boards: listBoards(w.root) });
  });

  app.post("/", async (c) => {
    const w = wikiOf(c);
    if (w instanceof Response) return w;
    const parsed = newBoardSchema.safeParse(await body(c));
    if (!parsed.success) return c.json({ error: "a board needs a name of 1 to 60 characters" }, 400);
    return c.json(createBoard(w.root, parsed.data.name, parsed.data.visibility), 201);
  });

  app.patch("/:bid", async (c) => {
    const w = wikiOf(c);
    if (w instanceof Response) return w;
    const parsed = boardChangeSchema.safeParse(await body(c));
    if (!parsed.success) return c.json({ error: "bad request" }, 400);
    const board = updateBoard(w.root, c.req.param("bid"), parsed.data);
    return board ? c.json(board) : c.json({ error: "no such board" }, 404);
  });

  // Deleting for good: only a board already in the trash, so one click on an open board can't lose its reports.
  app.delete("/:bid", (c) => {
    const w = wikiOf(c);
    if (w instanceof Response) return w;
    const board = getBoard(w.root, c.req.param("bid"));
    if (!board) return c.json({ error: "no such board" }, 404);
    if (!board.trashedAt) return c.json({ error: "Move the board to the trash first." }, 409);
    return c.json(purgeBoard(w.root, board.uid));
  });

  app.get("/:bid/reports", (c) => {
    const w = wikiOf(c);
    if (w instanceof Response) return w;
    const board = getBoard(w.root, c.req.param("bid"));
    if (!board) return c.json({ error: "no such board" }, 404);
    return c.json({ board, reports: listReports(w.root, board.uid) });
  });

  /** A report of this board, or a 404 response. */
  const reportOf = (c: Context, w: Wiki) => {
    const r = getReport(w.root, Number(c.req.param("rid")));
    return r && !r.removedAt && r.board === c.req.param("bid") ? r : null;
  };

  app.patch("/:bid/reports/:rid", async (c) => {
    const w = wikiOf(c);
    if (w instanceof Response) return w;
    const parsed = triageSchema.safeParse(await body(c));
    if (!parsed.success) return c.json({ error: "bad request" }, 400);
    const r = reportOf(c, w);
    if (!r) return c.json({ error: "no such report" }, 404);
    return c.json(triageReport(w.root, r.id, parsed.data as Parameters<typeof triageReport>[2]));
  });

  app.delete("/:bid/reports/:rid", (c) => {
    const w = wikiOf(c);
    if (w instanceof Response) return w;
    const r = reportOf(c, w);
    if (!r) return c.json({ error: "no such report" }, 404);
    removeReport(w.root, r.id);
    return c.body(null, 204);
  });

  return app;
}

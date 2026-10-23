// A data sheet's link (ADR-0010): guests see one sheet and nothing of the wiki, and change its editable cells when
// the link allows it. The server judges every value against the sheet's own file (sheets.ts, shared/sheet.ts); the
// app's checks are only a convenience. Every route here answers 404 to any other kind of link.
import { type Context, Hono } from "hono";
import { z } from "zod";
import { readSheet, type SheetViewer, setCell, sheetHistory, sheetView } from "../sheets.ts";
import { type Env, type GuestKit, only, type TargetEnv } from "./kit.ts";

const cellSchema = z.strictObject({
  row: z.string().max(64),
  column: z.string().max(64),
  /** Checked against the column by the server; null puts the cell back to its default. */
  value: z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]),
  /** The cell's version this change started from. */
  base: z.number().int().min(0),
});

export function sheetRoutes(kit: GuestKit) {
  const app = new Hono<TargetEnv>();
  app.use("*", only("sheet", kit));

  const sheetOf = (c: Context<TargetEnv>) => readSheet(c.get("wiki").root, c.get("share").target?.id ?? "");
  const viewer = (c: Context<TargetEnv>): SheetViewer => ({
    kind: "guest",
    id: c.get("me").id,
    canEdit: c.get("share").edit,
    host: kit.shares.host(),
  });

  app.get("/", (c) => {
    const sheet = sheetOf(c);
    // The agent may have broken or removed the file since the link was made.
    if (!sheet) return c.json({ error: "this sheet can't be opened right now" }, 404);
    const w = c.get("wiki");
    return c.json({
      sheet: sheetView(w.root, sheet, viewer(c)),
      wiki: { title: w.manifest.title, theme: w.theme },
    });
  });

  app.get("/history", (c) => {
    const sheet = sheetOf(c);
    if (!sheet) return c.json({ error: "not found" }, 404);
    return c.json({ edits: sheetHistory(c.get("wiki").root, sheet.name, viewer(c), 200) });
  });

  // Live updates: the sheet changes with the database (people's edits) and with the files (the agent's).
  app.get("/changes", (c) => {
    const w = c.get("wiki");
    return kit.waitForChange(c, () => {
      const v = kit.data.version(w);
      return `"${v.pages}.${v.threads}"`;
    });
  });

  app.put("/cells", kit.sameOrigin, kit.small, async (c) => {
    const share = c.get("share");
    const me = c.get("me");
    if (!share.edit) return c.json({ error: "this link is view-only" }, 403);
    // Every try counts, bad ones too, so guessing values runs into the limit.
    const wait = share.limits.sheetEdit(me.id, kit.now());
    if (wait) return kit.tooMany(c as unknown as Context<Env>, wait, "sheet edit");
    const parsed = cellSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "bad request" }, 400);
    const sheet = sheetOf(c);
    if (!sheet) return c.json({ error: "not found" }, 404);
    const done = setCell(c.get("wiki").root, sheet, parsed.data, { guest: me.id, name: me.name }, viewer(c));
    if ("error" in done) return c.json({ error: done.error }, done.status);
    if ("conflict" in done) return c.json({ error: "someone changed it just now", cell: done.conflict }, 409);
    me.writes++;
    kit.shares.log(share, me.name, `set ${parsed.data.row} ${parsed.data.column}`);
    return c.json({ cell: done.cell });
  });

  app.all("*", (c) => c.json({ error: "not found" }, 404));
  return app;
}

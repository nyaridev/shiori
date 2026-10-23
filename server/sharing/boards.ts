// A test board's link (ADR-0010): testers see the board and nothing of the wiki. They write reports with pictures,
// change and remove their own, and see everyone's on a global board or only theirs on a private one. Every route
// here answers 404 to any other kind of link, and the wiki's routes answer 404 to this one.
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { type BoardView, REPORT_KINDS, REPORT_LIMITS, type Report } from "../../shared/api.ts";
import { ATTACHMENT_LIMITS, ATTACHMENT_NAME, attachmentsDir, hasAttachment, saveAttachment } from "../attachments.ts";
import { createReport, editReport, getBoard, getReport, removeReport, reportsForTester } from "../boards.ts";
import { PICTURE_MIME } from "../designs.ts";
import { serveFile } from "../files.ts";
import { type Env, type GuestKit, only, type TargetEnv } from "./kit.ts";
import { LIMITS } from "./limits.ts";

const bytes = (s: string) => Buffer.byteLength(s, "utf8");
const kind = z.enum(REPORT_KINDS as [string, ...string[]]);
const title = z.string().trim().min(1).max(REPORT_LIMITS.title);
const details = z
  .string()
  .trim()
  .refine((s) => bytes(s) <= LIMITS.comment, `at most ${LIMITS.comment} bytes`);
const newReportSchema = z.strictObject({
  kind,
  title,
  body: details.default(""),
  images: z.array(z.string().regex(ATTACHMENT_NAME)).max(REPORT_LIMITS.pictures).default([]),
});
const reportChangeSchema = z
  .strictObject({ kind: kind.optional(), title: title.optional(), body: details.optional() })
  .refine((x) => x.kind !== undefined || x.title !== undefined || x.body !== undefined, "nothing to change");

export function boardRoutes(kit: GuestKit) {
  const app = new Hono<TargetEnv>();
  app.use("*", only("board", kit));
  const { shares, now } = kit;

  const boardOf = (c: Context<TargetEnv>) => getBoard(c.get("wiki").root, c.get("share").target?.id ?? "");
  /** A report as testers see it: never guest ids or the hidden flag; theirs marked `mine`. */
  const forTester = (r: Report, c: Context<TargetEnv>): Report => {
    const { guestId, hidden: _, ...rest } = r;
    return { ...rest, mine: !!guestId && guestId === c.get("me").id };
  };
  /** The reports this tester may see. */
  const seen = (c: Context<TargetEnv>) => {
    const board = boardOf(c);
    return board ? reportsForTester(c.get("wiki").root, board, c.get("me").id) : [];
  };
  /** One of this tester's own reports on this board, or the response that says why not. */
  const own = (c: Context<TargetEnv>) => {
    const r = getReport(c.get("wiki").root, Number(c.req.param("rid")));
    const visible = r && seen(c).some((x) => x.id === r.id);
    if (!r || !visible) return c.json({ error: "no such report" }, 404);
    if (r.author !== "guest" || r.guestId !== c.get("me").id)
      return c.json({ error: "you can only change what you wrote" }, 403);
    return r;
  };
  /** A report, a change or a removal: this site's Origin, a small body, room under the guest's write limits. */
  const writes = async (c: Context<TargetEnv>, next: () => Promise<void>) => {
    const me = c.get("me");
    const wait = c.get("share").limits.write(me.id, now());
    if (wait) return kit.tooMany(c as unknown as Context<Env>, wait, "report");
    me.writes++;
    await next();
  };
  const write = [kit.sameOrigin, kit.small, writes] as const;
  const json = (c: Context<TargetEnv>) => c.req.json().catch(() => null);

  app.get("/", (c) => {
    const board = boardOf(c);
    if (!board) return c.json({ error: "not found" }, 404);
    const w = c.get("wiki");
    const view: BoardView = {
      board: { name: board.name, visibility: board.visibility, closedAt: board.closedAt },
      wiki: { title: w.manifest.title, theme: w.theme },
      reports: seen(c).map((r) => forTester(r, c)),
    };
    return c.json(view);
  });

  // Live updates, by long polling as for wikis: the board changes when the wiki's database does.
  app.get("/changes", (c) => {
    const w = c.get("wiki");
    return kit.waitForChange(c, () => `"${kit.data.version(w).threads}"`);
  });

  app.post("/reports", ...write, async (c) => {
    const board = boardOf(c);
    if (!board) return c.json({ error: "not found" }, 404);
    if (board.closedAt) return c.json({ error: "this board is closed" }, 409);
    const parsed = newReportSchema.safeParse(await json(c));
    if (!parsed.success) return c.json({ error: "bad request" }, 400);
    const w = c.get("wiki");
    if (!parsed.data.images.every((f) => hasAttachment(w.root, f))) return c.json({ error: "no such picture" }, 400);
    const me = c.get("me");
    const r = createReport(w.root, board.uid, parsed.data as Parameters<typeof createReport>[2], {
      guest: me.id,
      name: me.name,
    });
    shares.log(c.get("share"), me.name, `reported "${r.title}"`);
    return c.json(forTester(r, c), 201);
  });

  app.patch("/reports/:rid", ...write, async (c) => {
    const parsed = reportChangeSchema.safeParse(await json(c));
    if (!parsed.success) return c.json({ error: "bad request" }, 400);
    const r = own(c);
    if (r instanceof Response) return r;
    const after = editReport(c.get("wiki").root, r.id, parsed.data as Parameters<typeof editReport>[2]);
    shares.log(c.get("share"), c.get("me").name, `changed report #${r.id}`);
    return c.json(forTester(after as Report, c));
  });

  app.delete("/reports/:rid", ...write, (c) => {
    const r = own(c);
    if (r instanceof Response) return r;
    removeReport(c.get("wiki").root, r.id);
    shares.log(c.get("share"), c.get("me").name, `removed report #${r.id}`);
    return c.body(null, 204);
  });

  // Pictures and GIFs for a report, as for comments (ADR-0007): checked bytes, the guest's daily budget, then named
  // in the report. Uploads don't take write tokens, so a report with four pictures fits the write rate.
  const pictureBody = bodyLimit({
    maxSize: ATTACHMENT_LIMITS.bytes,
    onError: (c) => c.json({ error: "the picture is too big" }, 413),
  });
  app.post("/attachments", kit.sameOrigin, pictureBody, async (c) => {
    const board = boardOf(c);
    if (!board || board.closedAt) return c.json({ error: "this board is closed" }, 409);
    const type = c.req.header("content-type") ?? "";
    if (!PICTURE_MIME.includes(type)) return c.json({ error: "add a PNG, JPEG, WebP or GIF picture" }, 415);
    const data = Buffer.from(await c.req.arrayBuffer());
    if (!c.get("share").limits.designBytes(c.get("me").id, data.length, now())) {
      c.header("retry-after", "3600");
      return c.json({ error: "that's all the pictures for today" }, 429);
    }
    const saved = saveAttachment(c.get("wiki").root, type, data);
    return typeof saved === "string" ? c.json({ error: saved }, 400) : c.json(saved, 201);
  });

  // A picture only when a report this tester can see carries it.
  app.get("/attachments/:file", async (c) => {
    const file = c.req.param("file");
    if (!ATTACHMENT_NAME.test(file) || !seen(c).some((r) => r.images?.includes(file)))
      return c.json({ error: "not found" }, 404);
    const res = await serveFile(c, attachmentsDir(c.get("wiki").root), file, { cache: false });
    if (res.status === 200 || res.status === 304) res.headers.set("cache-control", "private, no-cache");
    return res;
  });

  app.all("*", (c) => c.json({ error: "not found" }, 404));
  return app;
}

// The designs API (ADR-0006), mounted by both servers under `/wikis/:id/designs`. Who may do what comes from the
// viewer: the owner may change every design; a guest on a comment link may make designs and change only their own;
// everyone sees all of them, except that guests never see what the owner hid. The guest server adds its link checks,
// limits and Origin check before these routes run (server/sharing/guest.ts).
import { type Context, Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { DesignInfo } from "../shared/api.ts";
import {
  type Author,
  addPicture,
  createDesign,
  DESIGN_LIMITS,
  type Design,
  designFile,
  getDesign,
  ID,
  listDesigns,
  PICTURE_MIME,
  removeDesign,
  removePicture,
  saveBoard,
  updateDesign,
} from "./designs.ts";
import { serveFile } from "./files.ts";
import type { Wiki } from "./registry.ts";

/** Who is asking. A guest who `canWrite` came through a comment link. */
export type DesignViewer = { kind: "owner" } | { kind: "guest"; id: string; name: string; canWrite: boolean };

export interface DesignRouteOptions {
  wikiOf: (c: Context) => Wiki;
  viewerOf: (c: Context) => DesignViewer;
  /** How the owner signs for guests. */
  hostName: () => string;
  /**
   * Guests' limits, before a write: answers a refusal (a 429) or null. `bytes` is what a drawing or picture adds.
   * The owner has none.
   */
  limit?: (c: Context, kind: "save" | "create" | "upload", bytes: number) => Response | null;
  /** Tells the owner's Share dialog what a guest did. */
  log?: (c: Context, what: string) => void;
}

const nameSchema = z.string().trim().min(1).max(DESIGN_LIMITS.name);
const newSchema = z.strictObject({ name: nameSchema });
const patchSchema = z.strictObject({
  name: nameSchema.optional(),
  description: z.string().max(DESIGN_LIMITS.description).optional(),
  // "done" is the agent's, through the CLI.
  status: z.enum(["draft", "ready"]).optional(),
});
const hiddenSchema = z.strictObject({ hidden: z.boolean() });

const json = (max: number) => bodyLimit({ maxSize: max, onError: (c) => c.json({ error: "request too large" }, 413) });
const board = bodyLimit({
  maxSize: DESIGN_LIMITS.board,
  onError: (c) => c.json({ error: "the drawing is too big" }, 413),
});
const picture = bodyLimit({
  maxSize: DESIGN_LIMITS.picture,
  onError: (c) => c.json({ error: "the picture is too big" }, 413),
});

export function designRoutes({ wikiOf, viewerOf, hostName, limit, log }: DesignRouteOptions) {
  const api = new Hono();

  const editable = (d: Design, v: DesignViewer) =>
    v.kind === "owner" || (v.canWrite && d.author.kind === "guest" && d.author.guestId === v.id);

  const info = (w: Wiki, d: Design, v: DesignViewer): DesignInfo => {
    const base = `/api/wikis/${w.id}/designs/${d.collection}/${d.id}/files`;
    return {
      id: d.id,
      collection: d.collection,
      name: d.name,
      description: d.description,
      status: d.status,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      author: { kind: d.author.kind, name: d.author.kind === "owner" ? hostName() : d.author.name },
      board: d.board ? `${base}/board.png?v=${encodeURIComponent(d.board)}` : null,
      images: d.images.map((i) => ({ file: i.file, caption: i.caption, url: `${base}/${encodeURIComponent(i.file)}` })),
      page: d.page,
      note: d.note,
      editable: editable(d, v),
      mine: v.kind === "owner" ? d.author.kind === "owner" : d.author.guestId === v.id,
      ...(v.kind === "owner" ? { hidden: d.hidden } : {}),
    };
  };

  /** The collection exists in wiki.json. */
  const collectionOk: MiddlewareHandler = async (c, next) => {
    const collection = c.req.param("collection") ?? "";
    if (!ID.test(collection) || !wikiOf(c).manifest.collections[collection])
      return c.json({ error: "no such collection" }, 404);
    return next();
  };

  /** The design, as this viewer may see it; a hidden one doesn't exist for guests. */
  const seen = (c: Context): Design | null => {
    const d = getDesign(wikiOf(c), c.req.param("collection") ?? "", c.req.param("did") ?? "");
    return d && (viewerOf(c).kind === "owner" || !d.hidden) ? d : null;
  };

  /** The design, when this viewer may change it; else the refusal. */
  const mine = (c: Context): Design | Response => {
    const d = seen(c);
    if (!d) return c.json({ error: "no such design" }, 404);
    const v = viewerOf(c);
    if (v.kind === "guest" && !v.canWrite) return c.json({ error: "this link is view-only" }, 403);
    if (!editable(d, v)) return c.json({ error: "only the person who made it can change it" }, 403);
    return d;
  };

  api.use("/:collection", collectionOk);
  api.use("/:collection/*", collectionOk);

  api.get("/:collection", (c) => {
    const v = viewerOf(c);
    const w = wikiOf(c);
    const list = listDesigns(w, c.req.param("collection")).filter((d) => v.kind === "owner" || !d.hidden);
    return c.json({ designs: list.map((d) => info(w, d, v)) });
  });

  api.post("/:collection", json(4096), async (c) => {
    const v = viewerOf(c);
    if (v.kind === "guest" && !v.canWrite) return c.json({ error: "this link is view-only" }, 403);
    const body = newSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: `a name is 1 to ${DESIGN_LIMITS.name} characters` }, 400);
    const refused = limit?.(c, "create", 0);
    if (refused) return refused;
    const author: Author =
      v.kind === "owner" ? { kind: "owner", name: "" } : { kind: "guest", name: v.name, guestId: v.id };
    const d = createDesign(wikiOf(c), c.req.param("collection"), body.data.name, author);
    log?.(c, `made the design "${d.name}"`);
    return c.json(info(wikiOf(c), d, v), 201);
  });

  api.get("/:collection/:did", (c) => {
    const d = seen(c);
    return d ? c.json(info(wikiOf(c), d, viewerOf(c))) : c.json({ error: "no such design" }, 404);
  });

  api.patch("/:collection/:did", json(64 * 1024), async (c) => {
    const d = mine(c);
    if (d instanceof Response) return d;
    const body = patchSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "bad request" }, 400);
    const refused = limit?.(c, "save", 0);
    if (refused) return refused;
    const next = updateDesign(wikiOf(c), d, body.data);
    if (body.data.status && body.data.status !== d.status)
      log?.(c, body.data.status === "ready" ? `marked "${d.name}" ready` : `took "${d.name}" back to draft`);
    return c.json(info(wikiOf(c), next, viewerOf(c)));
  });

  api.put("/:collection/:did/board", board, async (c) => {
    const d = mine(c);
    if (d instanceof Response) return d;
    if (c.req.header("content-type") !== "image/png") return c.json({ error: "the drawing must be a PNG" }, 415);
    const png = Buffer.from(await c.req.arrayBuffer());
    const refused = limit?.(c, "save", png.length);
    if (refused) return refused;
    const next = saveBoard(wikiOf(c), d, png);
    if (typeof next === "string") return c.json({ error: next }, 400);
    return c.json(info(wikiOf(c), next, viewerOf(c)));
  });

  api.post("/:collection/:did/pictures", picture, async (c) => {
    const d = mine(c);
    if (d instanceof Response) return d;
    const type = c.req.header("content-type") ?? "";
    if (!PICTURE_MIME.includes(type)) return c.json({ error: "add a PNG, JPEG, WebP or GIF picture" }, 415);
    const data = Buffer.from(await c.req.arrayBuffer());
    const refused = limit?.(c, "upload", data.length);
    if (refused) return refused;
    const next = addPicture(wikiOf(c), d, type, data, (c.req.query("caption") ?? "").trim());
    if (typeof next === "string") return c.json({ error: next }, 400);
    log?.(c, `added a picture to "${d.name}"`);
    return c.json(info(wikiOf(c), next, viewerOf(c)), 201);
  });

  api.delete("/:collection/:did/pictures/:file", (c) => {
    const d = mine(c);
    if (d instanceof Response) return d;
    const next = removePicture(wikiOf(c), d, c.req.param("file"));
    return next ? c.json(info(wikiOf(c), next, viewerOf(c))) : c.json({ error: "no such picture" }, 404);
  });

  api.delete("/:collection/:did", (c) => {
    const d = mine(c);
    if (d instanceof Response) return d;
    removeDesign(wikiOf(c), d);
    log?.(c, `removed the design "${d.name}"`);
    return c.body(null, 204);
  });

  // Moderation: the owner hides a guest's design from guests, or shows it again.
  api.patch("/:collection/:did/hidden", json(1024), async (c) => {
    if (viewerOf(c).kind !== "owner") return c.json({ error: "not found" }, 404);
    const d = seen(c);
    if (!d) return c.json({ error: "no such design" }, 404);
    if (d.author.kind !== "guest") return c.json({ error: "only guests' designs can be hidden" }, 400);
    const body = hiddenSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "bad request" }, 400);
    return c.json(info(wikiOf(c), updateDesign(wikiOf(c), d, { hidden: body.data.hidden }), viewerOf(c)));
  });

  // The drawing and the pictures; only through here, so hidden ones stay hidden.
  api.get("/:collection/:did/files/:file", async (c) => {
    const d = seen(c);
    const rel = d && designFile(d, c.req.param("file"));
    if (!rel) return c.json({ error: "not found" }, 404);
    return serveFile(c, wikiOf(c).root, rel.split("/").map(encodeURIComponent).join("/"));
  });

  return api;
}

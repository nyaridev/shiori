// Designs (ADR-0006): what people make in the app for a wiki's collection — a drawing, a description and reference
// pictures — kept as plain files the agent can open: `<wiki>/designs/<collection>/<id>/design.json`, `board.png` and
// the pictures. This folder and the wiki's `data/` are the only places the app writes. Nothing is deleted: removing
// a design or a picture moves it into `designs/_removed/`.
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { slug } from "./markdown/wikilinks.ts";
import type { Wiki } from "./registry.ts";

export const DESIGN_LIMITS = {
  /** Bytes of a drawing (PNG) and of a reference picture. */
  board: 4 * 1024 * 1024,
  picture: 6 * 1024 * 1024,
  /** Pixels on each side of a drawing. */
  boardSide: 4000,
  pictures: 12,
  name: 80,
  description: 8000,
  caption: 200,
} as const;

const PICTURE_TYPES: Record<string, { ext: string; magic: (b: Buffer) => boolean }> = {
  "image/png": { ext: "png", magic: (b) => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  "image/jpeg": { ext: "jpg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/webp": {
    ext: "webp",
    magic: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
  },
  "image/gif": { ext: "gif", magic: (b) => b.subarray(0, 4).toString("latin1") === "GIF8" },
};
/** The picture types people may add. Never SVG: it can carry scripts. */
export const PICTURE_MIME = Object.keys(PICTURE_TYPES);

/** The file extension for a picture people add, when its type is allowed and its bytes really are that type. */
export function pictureExt(type: string, data: Buffer): string | null {
  const kind = PICTURE_TYPES[type];
  return kind?.magic(data) ? kind.ext : null;
}

const authorSchema = z.strictObject({
  kind: z.enum(["owner", "guest"]),
  name: z.string(),
  /** A guest's id on their link, so they can keep editing it while the link lasts. */
  guestId: z.string().optional(),
});
const imageSchema = z.strictObject({ file: z.string(), caption: z.string(), addedAt: z.string() });
export const designSchema = z.strictObject({
  id: z.string(),
  collection: z.string(),
  name: z.string(),
  description: z.string(),
  status: z.enum(["draft", "ready", "done"]),
  author: authorSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  /** When the drawing was last saved; null until someone draws. */
  board: z.string().nullable(),
  images: z.array(imageSchema),
  /** Set by the agent: the page the design became, and what it did. */
  page: z.string().nullable(),
  note: z.string(),
  /** The owner hid a guest's design from guests. */
  hidden: z.boolean(),
});
export type Design = z.infer<typeof designSchema>;
export type Author = z.infer<typeof authorSchema>;

export const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const nowIso = () => new Date().toISOString();

const collectionDir = (wiki: Wiki, collection: string) => join(wiki.root, "designs", collection);
const designDir = (wiki: Wiki, collection: string, id: string) => join(collectionDir(wiki, collection), id);

/** Writes through a temporary file, so a reader never sees half a file. */
function writeAtomic(file: string, data: string | Buffer) {
  const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, file);
}

function save(wiki: Wiki, d: Design) {
  writeAtomic(join(designDir(wiki, d.collection, d.id), "design.json"), `${JSON.stringify(d, null, 2)}\n`);
}

export function getDesign(wiki: Wiki, collection: string, id: string): Design | null {
  if (!ID.test(collection) || !ID.test(id)) return null;
  const file = join(designDir(wiki, collection, id), "design.json");
  if (!existsSync(file)) return null;
  try {
    const parsed = designSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** A collection's designs, newest first. */
export function listDesigns(wiki: Wiki, collection: string): Design[] {
  const dir = collectionDir(wiki, collection);
  if (!ID.test(collection) || !existsSync(dir)) return [];
  return readdirSync(dir)
    .map((id) => getDesign(wiki, collection, id))
    .filter((d): d is Design => d !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createDesign(wiki: Wiki, collection: string, name: string, author: Author): Design {
  const base = slug(name).slice(0, 40) || "design";
  let id = "";
  do id = `${base}-${randomBytes(3).toString("hex").slice(0, 4)}`;
  while (existsSync(designDir(wiki, collection, id)));
  mkdirSync(designDir(wiki, collection, id), { recursive: true });
  const at = nowIso();
  const design: Design = {
    id,
    collection,
    name,
    description: "",
    status: "draft",
    author,
    createdAt: at,
    updatedAt: at,
    board: null,
    images: [],
    page: null,
    note: "",
    hidden: false,
  };
  save(wiki, design);
  return design;
}

export function updateDesign(
  wiki: Wiki,
  d: Design,
  patch: Partial<Pick<Design, "name" | "description" | "status" | "hidden" | "page" | "note">>,
): Design {
  const next = { ...d, ...patch, updatedAt: nowIso() };
  save(wiki, next);
  return next;
}

/** The size of a PNG from its header, or null when it isn't one. */
function pngSize(b: Buffer): { width: number; height: number } | null {
  if (!PICTURE_TYPES["image/png"].magic(b) || b.length < 24 || b.subarray(12, 16).toString("latin1") !== "IHDR")
    return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

/** Saves the drawing. Answers why not when the PNG isn't one, or is too big. */
export function saveBoard(wiki: Wiki, d: Design, png: Buffer): Design | string {
  if (png.length > DESIGN_LIMITS.board) return "the drawing is too big";
  const size = pngSize(png);
  if (!size) return "the drawing must be a PNG";
  if (!size.width || !size.height || size.width > DESIGN_LIMITS.boardSide || size.height > DESIGN_LIMITS.boardSide)
    return `the drawing is at most ${DESIGN_LIMITS.boardSide} pixels on each side`;
  writeAtomic(join(designDir(wiki, d.collection, d.id), "board.png"), png);
  const at = nowIso();
  const next = { ...d, board: at, updatedAt: at };
  save(wiki, next);
  return next;
}

/** Adds a reference picture. Answers why not when it isn't an allowed picture, is too big, or there are too many. */
export function addPicture(wiki: Wiki, d: Design, type: string, data: Buffer, caption: string): Design | string {
  const ext = pictureExt(type, data);
  if (!ext) return "add a PNG, JPEG, WebP or GIF picture";
  if (data.length > DESIGN_LIMITS.picture) return "the picture is too big";
  if (d.images.length >= DESIGN_LIMITS.pictures) return `at most ${DESIGN_LIMITS.pictures} pictures`;
  const taken = new Set(d.images.map((i) => i.file));
  let n = d.images.length + 1;
  while (taken.has(`ref-${n}.${ext}`) || existsSync(join(designDir(wiki, d.collection, d.id), `ref-${n}.${ext}`))) n++;
  const file = `ref-${n}.${ext}`;
  writeAtomic(join(designDir(wiki, d.collection, d.id), file), data);
  const next = {
    ...d,
    images: [...d.images, { file, caption: caption.slice(0, DESIGN_LIMITS.caption), addedAt: nowIso() }],
    updatedAt: nowIso(),
  };
  save(wiki, next);
  return next;
}

/** Where removed things go: `designs/_removed/<when>-<collection>-<id>[-<file>]`. */
function removedPath(wiki: Wiki, ...parts: string[]) {
  const dir = join(wiki.root, "designs", "_removed");
  mkdirSync(dir, { recursive: true });
  return join(dir, [nowIso().replace(/[:.]/g, "-"), ...parts].join("-"));
}

export function removePicture(wiki: Wiki, d: Design, file: string): Design | null {
  if (!d.images.some((i) => i.file === file)) return null;
  const from = join(designDir(wiki, d.collection, d.id), file);
  if (existsSync(from)) renameSync(from, removedPath(wiki, d.collection, d.id, file));
  const next = { ...d, images: d.images.filter((i) => i.file !== file), updatedAt: nowIso() };
  save(wiki, next);
  return next;
}

export function removeDesign(wiki: Wiki, d: Design) {
  renameSync(designDir(wiki, d.collection, d.id), removedPath(wiki, d.collection, d.id));
}

/** A file of a design, from the wiki root, for the files route: its drawing or one of its pictures. */
export function designFile(d: Design, file: string): string | null {
  if (file === "board.png" ? !d.board : !d.images.some((i) => i.file === file)) return null;
  return `designs/${d.collection}/${d.id}/${file}`;
}

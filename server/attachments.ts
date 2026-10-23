// Pictures attached to comments: a screenshot with a change request, say. They're kept in the wiki's
// `data/attachments/` (committed with the wiki, like the comments: ADR-0014), named by a fresh uid so nothing can be overwritten or
// guessed into another folder. Only PNG, JPEG, WebP and GIF whose bytes match their type; never SVG.
import { existsSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pictureExt } from "./designs.ts";
import { newUid } from "./ids.ts";
import { dataDir } from "./paths.ts";

export const ATTACHMENT_LIMITS = {
  /** Bytes of one picture. */
  bytes: 6 * 1024 * 1024,
  /** Pictures on one message. */
  perMessage: 4,
} as const;

/** An attachment's file name: a uid and a picture extension, nothing else. */
export const ATTACHMENT_NAME = /^[0-9A-Z]{26}\.(png|jpg|webp|gif)$/;

export const attachmentsDir = (root: string) => dataDir(root, "attachments");

/** Saves a picture; answers its file name, or why not. */
export function saveAttachment(root: string, type: string, data: Buffer): { file: string } | string {
  const ext = pictureExt(type, data);
  if (!ext) return "add a PNG, JPEG, WebP or GIF picture";
  if (data.length > ATTACHMENT_LIMITS.bytes) return "the picture is too big";
  const file = `${newUid()}.${ext}`;
  const full = join(attachmentsDir(root), file);
  writeFileSync(`${full}.tmp`, data);
  renameSync(`${full}.tmp`, full);
  return { file };
}

/** Whether `file` is an attachment this wiki has. */
export const hasAttachment = (root: string, file: string) =>
  ATTACHMENT_NAME.test(file) && existsSync(join(attachmentsDir(root), file));

// File formats of a wiki folder. Agents write these files; the server and `pnpm wiki check` validate them.
import { z } from "zod";

export const WIKI_SCHEMA = 1;

export const wikiIdSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, "use lowercase letters, digits and dashes (kebab-case)");

/** `wiki.json` at the wiki root. */
export const manifestSchema = z.strictObject({
  schema: z.literal(WIKI_SCHEMA),
  id: wikiIdSchema,
  title: z.string().min(1),
  tagline: z.string().default(""),
  /** Card art, relative to the wiki root. Tall (1:4) SVG or image. */
  cover: z.string().default("cover.svg"),
  /** Position in the deck; lower comes first, then by title. */
  order: z.number().default(0),
});
export type Manifest = z.infer<typeof manifestSchema>;

/** Frontmatter of a page in `pages/`. */
export const frontmatterSchema = z.looseObject({
  title: z.string().min(1).optional(),
  summary: z.string().optional(),
  /** Position in the sidebar among siblings; lower comes first, then by title. */
  order: z.number().optional(),
  /** Hidden pages render but stay out of the sidebar. */
  hidden: z.boolean().optional(),
});
export type Frontmatter = z.infer<typeof frontmatterSchema>;

/** Readable one-line messages for a failed parse. */
export function issues(error: z.ZodError): string[] {
  return error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message));
}

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

/** Where a page's subject stands. Any project fits: a game feature, a product launch, a video series. */
export const PAGE_STATUSES = ["idea", "planned", "active", "paused", "done", "archived"] as const;
export type PageStatus = (typeof PAGE_STATUSES)[number];

/** Frontmatter of a page in `pages/`. */
export const frontmatterSchema = z.looseObject({
  title: z.string().min(1).optional(),
  summary: z.string().optional(),
  /** Position in the sidebar among siblings; lower comes first, then by title. */
  order: z.number().optional(),
  /** Hidden pages render but stay out of the sidebar. */
  hidden: z.boolean().optional(),
  /** One emoji, shown before the title in the page head, the sidebar and section cards. */
  icon: z.string().min(1).max(16).optional(),
  status: z.enum(PAGE_STATUSES).optional(),
  tags: z.array(z.string().min(1)).optional(),
  /** What kind of page this is, in the project's own words: "Feature", "Product", "Video", "Guide". */
  type: z.string().min(1).optional(),
  /** The infobox beside the article: a picture from `assets/`, its caption, and rows of label → value. */
  image: z.string().min(1).optional(),
  caption: z.string().optional(),
  infobox: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]))
    .optional(),
  /** A wide picture from `assets/` behind the page head. */
  banner: z.string().min(1).optional(),
  /** `false` hides "On this page" (for short pages). */
  toc: z.boolean().optional(),
  /**
   * Open decisions on this page. People answer them in the app (picking an option, adding a note); the agent writes
   * the decision back as `status: resolved` and `answer`.
   */
  questions: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/i, "use letters, digits and dashes, as q1"),
        text: z.string().min(1),
        options: z.array(z.union([z.string(), z.number()]).transform(String)).optional(),
        status: z.enum(["open", "resolved"]).default("open"),
        answer: z.string().optional(),
      }),
    )
    .optional(),
  /** Pages this one relates to, as wikilink names, with an optional kind: "depends on", "competitor of". */
  related: z
    .array(z.union([z.string().min(1), z.object({ to: z.string().min(1), kind: z.string().min(1).optional() })]))
    .optional(),
});
export type Frontmatter = z.infer<typeof frontmatterSchema>;

/** Readable one-line messages for a failed parse. */
export function issues(error: z.ZodError): string[] {
  return error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message));
}

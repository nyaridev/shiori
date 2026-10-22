// File formats of a wiki folder. Agents write these files; the server and `pnpm wiki check` validate them.
import { z } from "zod";

/** A day, written `2026-11-15` (YAML may read it as a date). */
const day = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "write a day as 2026-11-15"),
  z.date().transform((d) => d.toISOString().slice(0, 10)),
]);

/** A question or a suggestion on a page: the same shape, answered the same way. */
const decisionSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/i, "use letters, digits and dashes, as q1"),
  text: z.string().min(1),
  options: z.array(z.union([z.string(), z.number()]).transform(String)).optional(),
  status: z.enum(["open", "resolved"]).default("open"),
  answer: z.string().optional(),
  /** When it should be decided by. */
  due: day.optional(),
  /** When the agent decided it, for the decisions timeline. */
  decided: day.optional(),
});

/**
 * A wiki's `settings.json`: how many open questions and suggestions a page may have at once. Each wiki picks its
 * own; without the file, both are 6.
 */
export const settingsSchema = z.strictObject({
  maxQuestions: z.number().int().min(0).max(50).default(6),
  maxSuggestions: z.number().int().min(0).max(50).default(6),
});
export type Settings = z.infer<typeof settingsSchema>;
export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({});

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
  /** The project's icon in the wiki header: a name from Shiori's icon set. Without one the header shows the cover. */
  icon: z
    .string()
    .regex(/^[a-z][a-z0-9-]{0,39}$/, "name an icon from Shiori's icon set (Toolbox → Icons)")
    .optional(),
  /** Card art, relative to the wiki root. Tall (1:4) SVG or image. */
  cover: z.string().default("cover.svg"),
  /** Position in the deck; lower comes first, then by title. */
  order: z.number().default(0),
  /** Pages pinned at the top of the sidebar under Home, by wikilink name. Ones that don't exist are skipped. */
  pinned: z.array(z.string().min(1)).max(8).default(["Roadmap"]),
  /**
   * Collections people add designs to in the app (ADR-0006): a drawing, a description and pictures each, which agents
   * turn into pages. Keyed by id, as `designs/<id>/` and a layout's `designs` block name them.
   */
  collections: z
    .record(
      z.string().regex(/^[a-z][a-z0-9-]{0,23}$/, "name a collection in lowercase letters, digits and dashes"),
      z.strictObject({
        /** The collection's name: "Mobs". */
        title: z.string().min(1).max(60),
        /** One of them: "Mob". */
        item: z.string().min(1).max(40),
      }),
    )
    .default({}),
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
  /**
   * Shown before the title in the page head, the sidebar and on cards: a name from Shiori's icon set (`compass`), a
   * picture drawn for this wiki (`/assets/icons/sword.svg`), or one emoji.
   */
  icon: z
    .string()
    .min(1)
    .max(200)
    .refine(
      (v) => [...v].length <= 16 || /^[a-z][a-z0-9-]{0,39}$/.test(v) || /\.(svg|png|webp|gif|avif|jpe?g)$/i.test(v),
      "an icon's name, a picture file, or one emoji",
    )
    .optional(),
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
   * Open decisions on this page: questions about what the page describes now. People answer them in the app (picking
   * an option, adding a note); the agent writes the decision back as `status: resolved`, `answer` and `decided`.
   */
  questions: z.array(decisionSchema).optional(),
  /**
   * The agent's suggestions for this page, written while reviewing it: something new to add or a way to improve
   * what's there. People answer them like questions; they show in green, below the questions.
   */
  suggestions: z.array(decisionSchema).optional(),
  /** A layout from the wiki's `layouts/` that arranges this page (ADR-0006). */
  layout: z.string().min(1).optional(),
  /** The design this page was made from, as `<collection>/<id>`; a layout's `design` block shows it. */
  design: z
    .string()
    .regex(/^[a-z][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/, "write it as <collection>/<id>")
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

/** Every frontmatter field a page can set, as the toolbox's Page fields lists them. */
export const FRONTMATTER_FIELDS: { key: keyof Frontmatter; what: string; example: string }[] = [
  { key: "title", what: "The page's name; the file name when it's missing.", example: 'title: "Combat"' },
  {
    key: "summary",
    what: "One line under the title, on section cards and in link previews.",
    example: 'summary: "How fights work"',
  },
  {
    key: "icon",
    what: "Before the title, in the sidebar and on cards: a name from Shiori's icon set (Toolbox → Icons), else a picture drawn for this wiki in assets/icons/.",
    example: "icon: compass",
  },
  { key: "order", what: "Position in the sidebar among its siblings; lower comes first.", example: "order: 2" },
  { key: "hidden", what: "Renders the page but keeps it out of the sidebar.", example: "hidden: true" },
  {
    key: "status",
    what: "Where its subject stands: idea, planned, active, paused, done or archived.",
    example: "status: active",
  },
  { key: "tags", what: "Categories; each tag gets its own page under Categories.", example: "tags: [combat, systems]" },
  { key: "type", what: "What kind of page it is, in the project's own words.", example: 'type: "Feature"' },
  { key: "image", what: "The infobox picture, from assets/.", example: 'image: "/assets/rat.png"' },
  { key: "caption", what: "The caption under the infobox picture.", example: 'caption: "The first sketch"' },
  {
    key: "infobox",
    what: "Rows of label → value in a fact box beside the article. Values are inline Markdown.",
    example: 'infobox:\n  Owner: "Sam"\n  Stock: \':progress{value="12" max="50"}\'',
  },
  { key: "banner", what: "A wide picture from assets/ behind the page head.", example: 'banner: "/assets/wide.png"' },
  { key: "toc", what: "false hides “On this page” (for short pages).", example: "toc: false" },
  {
    key: "questions",
    what: "Open decisions, with an optional due date. People answer them on the page; the agent writes back status: resolved, answer and the day it decided.",
    example:
      'questions:\n  - id: q1\n    text: "Steam or itch.io first?"\n    options: [Steam, itch.io]\n    due: 2026-11-15\n  - id: q2\n    text: "Weekly or monthly updates?"\n    status: resolved\n    answer: "Weekly, on Fridays"\n    decided: 2026-10-20',
  },
  {
    key: "suggestions",
    what: "The agent's ideas for the page, written while reviewing it: what to add or improve. Same fields as questions; they show in green, below the questions.",
    example: 'suggestions:\n  - id: s1\n    text: "Add a weekly leaderboard?"\n    options: [Yes, Later, No]',
  },
  {
    key: "layout",
    what: "A layout from the wiki's layouts/ folder that arranges the page's parts into a grid (Toolbox → Page kits shows which kits use one).",
    example: "layout: mob",
  },
  {
    key: "design",
    what: "The design this page was made from, as collection/id; the layout's design block shows its drawing.",
    example: "design: mobs/carrot-k3f9",
  },
  {
    key: "related",
    what: "Pages this one relates to, by wikilink name, with an optional kind.",
    example: 'related:\n  - Goals\n  - to: Audience & market\n    kind: "Competitor of"',
  },
];

// Page layouts (ADR-0006): a wiki's `layouts/<name>.json` places Shiori's built-in blocks into a grid of named areas,
// and a page uses one with `layout: <name>`. Like a theme, a layout is data: it picks blocks and areas, never CSS,
// HTML or scripts. A new block is a Shiori change; a new layout is only files in the wiki.
import { z } from "zod";

const name = z.string().regex(/^[a-z][a-z0-9-]{0,23}$/, "use lowercase letters, digits and dashes");
const count = z.number().int().min(1).max(50).optional();

/** Every block can have a title shown above it. */
const title = { title: z.string().min(1).max(60).optional() };

/** The blocks a layout can place. Each reads the page it's on, or the whole wiki. */
export const blockSchema = z.discriminatedUnion("type", [
  /** The page's Markdown, without the `##` sections other areas show. */
  z.strictObject({ type: z.literal("body"), ...title }),
  /** One `##` section of the page's Markdown, by its heading. */
  z.strictObject({ type: z.literal("section"), ...title, heading: z.string().min(1).max(100) }),
  /** The fact box from the page's frontmatter (`image`, `infobox`). */
  z.strictObject({ type: z.literal("infobox"), ...title }),
  /** The page's pictures, as a gallery. */
  z.strictObject({ type: z.literal("gallery"), ...title }),
  /** The page's questions (`questions:`). */
  z.strictObject({ type: z.literal("questions"), ...title }),
  /** The agent's suggestions for the page (`suggestions:`), in green. */
  z.strictObject({ type: z.literal("suggestions"), ...title }),
  /** The pages from `related:`. */
  z.strictObject({ type: z.literal("related"), ...title }),
  /** The pages under this one. */
  z.strictObject({ type: z.literal("children"), ...title, style: z.enum(["cards", "list"]).default("cards") }),
  /** The page's contents. */
  z.strictObject({ type: z.literal("toc"), ...title }),
  /** The design this page was made from (`design: <collection>/<id>`): its drawing, description and pictures. */
  z.strictObject({ type: z.literal("design"), ...title }),
  /** A collection's designs as a gallery, with the button that makes a new one. */
  z.strictObject({ type: z.literal("designs"), ...title, collection: name }),
  // The whole wiki, as on the home page.
  z.strictObject({ type: z.literal("recent-changes"), ...title, count }),
  z.strictObject({ type: z.literal("open-questions"), ...title, count }),
  z.strictObject({ type: z.literal("open-tasks"), ...title, count }),
  z.strictObject({ type: z.literal("discussions"), ...title, count }),
  z.strictObject({ type: z.literal("directory"), ...title }),
]);
export type Block = z.infer<typeof blockSchema>;
export const BLOCK_TYPES = blockSchema.options.map((o) => o.shape.type.value);

export const layoutSchema = z
  .strictObject({
    /** What the layout is for, in the toolbox: "Mob", "Item". */
    title: z.string().min(1).max(60).optional(),
    /** Rows of area names; the same name in neighbouring cells makes one wider or taller area. */
    areas: z.array(z.array(name).min(1).max(4)).min(1).max(16),
    /** What each area shows. */
    blocks: z.record(name, blockSchema),
  })
  .superRefine((layout, ctx) => {
    const columns = layout.areas[0].length;
    if (layout.areas.some((row) => row.length !== columns))
      ctx.addIssue({ code: "custom", path: ["areas"], message: `every row needs ${columns} areas, like the first` });
    const used = new Set(layout.areas.flat());
    for (const area of used) {
      if (!layout.blocks[area]) ctx.addIssue({ code: "custom", path: ["blocks"], message: `"${area}" has no block` });
      // An area's cells must make a rectangle, or the grid can't place it.
      const cells = layout.areas.flatMap((row, r) => row.map((a, c) => (a === area ? [r, c] : null))).filter(Boolean);
      const rows = cells.map((x) => (x as number[])[0]);
      const cols = cells.map((x) => (x as number[])[1]);
      const height = Math.max(...rows) - Math.min(...rows) + 1;
      const width = Math.max(...cols) - Math.min(...cols) + 1;
      if (height * width !== cells.length)
        ctx.addIssue({ code: "custom", path: ["areas"], message: `"${area}" isn't a rectangle` });
    }
    for (const area of Object.keys(layout.blocks))
      if (!used.has(area))
        ctx.addIssue({ code: "custom", path: ["blocks", area], message: `"${area}" isn't in any row of areas` });
  });
export type Layout = z.infer<typeof layoutSchema>;

/** A column that holds only fact boxes keeps the infobox's width on every page; the others share the rest. */
export const INFOBOX_WIDTH = "300px";

/**
 * The CSS grid for a layout: its areas (names are checked, so this is safe), and its columns. Fact boxes (`infobox`)
 * are as wide in a layout as beside a plain page's article, so a column of them is fixed and the others share what's
 * left.
 */
export function gridOf(layout: Layout): { areas: string; columns: string } {
  const width = layout.areas[0].length;
  // Rows where an area spans several columns (a full-width block) don't decide a column's width.
  const own = (row: string[], c: number) => row.filter((a) => a === row[c]).length === 1;
  const columns = Array.from({ length: width }, (_, c) => {
    const decided = layout.areas.filter((row) => own(row, c));
    return decided.length && decided.every((row) => layout.blocks[row[c]]?.type === "infobox")
      ? INFOBOX_WIDTH
      : "minmax(0, 1fr)";
  });
  return {
    areas: layout.areas.map((row) => `"${row.join(" ")}"`).join(" "),
    columns: columns.join(" "),
  };
}

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

/** Rows of area names, and a block for each name: checked so the grid can place every area. */
function gridSchema<B extends z.ZodType<{ type: string }>>(block: B) {
  return z.strictObject({
    /** What the layout is for, in the toolbox: "Mob", "Item". */
    title: z.string().min(1).max(60).optional(),
    /** Rows of area names; the same name in neighbouring cells makes one wider or taller area. */
    areas: z.array(z.array(name).min(1).max(4)).min(1).max(16),
    /** What each area shows. */
    blocks: z.record(name, block),
  });
}

/**
 * The problems with a grid of areas: rows of different lengths, areas without a part (a block, a field) or not a
 * rectangle, and parts in no area. `key` names the record of parts in the file, `what` one part.
 */
export function checkAreas(
  areas: string[][],
  parts: Record<string, unknown>,
  ctx: z.RefinementCtx,
  { key = "blocks", what = "block" } = {},
) {
  const columns = areas[0].length;
  if (areas.some((row) => row.length !== columns))
    ctx.addIssue({ code: "custom", path: ["areas"], message: `every row needs ${columns} areas, like the first` });
  const used = new Set(areas.flat());
  for (const area of used) {
    if (!parts[area]) ctx.addIssue({ code: "custom", path: [key], message: `"${area}" has no ${what}` });
    // An area's cells must make a rectangle, or the grid can't place it.
    if (!bounds(areas, area).rectangle)
      ctx.addIssue({ code: "custom", path: ["areas"], message: `"${area}" isn't a rectangle` });
  }
  for (const area of Object.keys(parts))
    if (!used.has(area))
      ctx.addIssue({ code: "custom", path: [key, area], message: `"${area}" isn't in any row of areas` });
}

const checkGrid = (layout: { areas: string[][]; blocks: Record<string, unknown> }, ctx: z.RefinementCtx) =>
  checkAreas(layout.areas, layout.blocks, ctx);

export const layoutSchema = gridSchema(blockSchema)
  .extend({
    /** Drawn on the public wiki too (ADR-0012), with only its public blocks; without it, pages show plainly there. */
    public: z.boolean().optional(),
  })
  .superRefine(checkGrid);
export type Layout = z.infer<typeof layoutSchema>;

/** The page layout's blocks the public wiki draws (ADR-0012). The others are left out and their areas close up. */
export const PUBLIC_PAGE_BLOCKS = new Set<Block["type"]>([
  "body",
  "section",
  "infobox",
  "gallery",
  "related",
  "children",
  "toc",
]);

/**
 * The public wiki's front page (ADR-0012): `layouts/front.json`. Only these blocks, each drawn from public pages.
 */
export const frontBlockSchema = z.discriminatedUnion("type", [
  /** The public wiki's name and tagline. */
  z.strictObject({ type: z.literal("title"), ...title }),
  /** `public.banner`, across the page. */
  z.strictObject({ type: z.literal("banner"), ...title }),
  /** The front page's text (`public.front`), without the `##` sections other areas show. */
  z.strictObject({ type: z.literal("intro"), ...title }),
  /** One `##` section of the front page's text, by its heading. */
  z.strictObject({ type: z.literal("section"), ...title, heading: z.string().min(1).max(100) }),
  /** A card per top section ("Where to start"). */
  z.strictObject({
    type: z.literal("start"),
    ...title,
    style: z.enum(["cards", "list"]).default("cards"),
    columns: z.number().int().min(2).max(6).optional(),
  }),
  /** Chosen public pages, as cards. */
  z.strictObject({
    type: z.literal("pages"),
    ...title,
    pages: z.array(z.string().min(1).max(200)).min(1).max(12),
    style: z.enum(["cards", "list"]).default("cards"),
    columns: z.number().int().min(2).max(6).optional(),
  }),
  /** The public pages changed last. */
  z.strictObject({ type: z.literal("recent"), ...title, count: z.number().int().min(1).max(20).default(5) }),
  /** A large search box. */
  z.strictObject({ type: z.literal("search"), ...title }),
  /** How many public pages each top section has. */
  z.strictObject({ type: z.literal("stats"), ...title }),
]);
export type FrontBlock = z.infer<typeof frontBlockSchema>;

export const frontLayoutSchema = gridSchema(frontBlockSchema).superRefine(checkGrid);
export type FrontLayout = z.infer<typeof frontLayoutSchema>;

/** Where an area is in the rows: its first and last row and column, and whether its cells fill that rectangle. */
function bounds(areas: string[][], area: string) {
  const cells = areas.flatMap((row, r) => row.flatMap((a, c) => (a === area ? [[r, c]] : [])));
  const rows = cells.map(([r]) => r);
  const cols = cells.map(([, c]) => c);
  const [r0, r1, c0, c1] = [Math.min(...rows), Math.max(...rows), Math.min(...cols), Math.max(...cols)];
  return { r0, r1, c0, c1, rectangle: (r1 - r0 + 1) * (c1 - c0 + 1) === cells.length };
}

/**
 * The rows without some areas (blocks the public wiki doesn't draw, or that have nothing to show): each neighbour
 * grows over the space when it can stay a rectangle, then empty rows and columns go. A space nothing can fill stays
 * empty (`.`). Null when no area is left.
 */
export function closeUp(areas: string[][], keep: (area: string) => boolean): string[][] | null {
  let grid = areas.map((row) => row.map((a) => (keep(a) ? a : ".")));
  const free = (r: number, c0: number, c1: number) =>
    r >= 0 && r < grid.length && grid[r].slice(c0, c1 + 1).every((a) => a === ".");
  const freeColumn = (c: number, r0: number, r1: number) =>
    c >= 0 && c < grid[0].length && grid.slice(r0, r1 + 1).every((row) => row[c] === ".");
  for (let grew = true; grew; ) {
    grew = false;
    for (const area of new Set(grid.flat().filter((a) => a !== "."))) {
      const { r0, r1, c0, c1 } = bounds(grid, area);
      const fill = (cells: [number, number][]) => {
        for (const [r, c] of cells) grid[r][c] = area;
        grew = true;
      };
      const span = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
      if (free(r0 - 1, c0, c1)) fill(span(c0, c1).map((c) => [r0 - 1, c]));
      else if (free(r1 + 1, c0, c1)) fill(span(c0, c1).map((c) => [r1 + 1, c]));
      else if (freeColumn(c0 - 1, r0, r1)) fill(span(r0, r1).map((r) => [r, c0 - 1]));
      else if (freeColumn(c1 + 1, r0, r1)) fill(span(r0, r1).map((r) => [r, c1 + 1]));
    }
  }
  // Rows and columns with nothing left go, and one the same as the one before adds nothing but a gap.
  const sameRow = (a: string[], b: string[]) => a.every((x, i) => x === b[i]);
  grid = grid.filter((row, r) => row.some((a) => a !== ".") && !(r > 0 && sameRow(row, grid[r - 1])));
  if (!grid.length) return null;
  const column = (c: number) => grid.map((row) => row[c]);
  const columns = grid[0]
    .map((_, c) => c)
    .filter((c) => column(c).some((a) => a !== ".") && !(c > 0 && sameRow(column(c), column(c - 1))));
  return grid.map((row) => columns.map((c) => row[c]));
}

/** A column that holds only fact boxes keeps the infobox's width on every page; the others share the rest. */
export const INFOBOX_WIDTH = "300px";

/**
 * The CSS grid for a layout: its areas (names are checked, so this is safe), and its columns. Fact boxes (`infobox`)
 * are as wide in a layout as beside a plain page's article, so a column of them is fixed and the others share what's
 * left.
 */
export function gridOf(layout: { areas: string[][]; blocks: Record<string, { type: string }> }): {
  areas: string;
  columns: string;
} {
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

# ADR-0006: Page layouts and designs, made inside a wiki

**Status:** Accepted
**Date:** 2026-10-21
**Deciders:** Nari (owner), Claude (implementer)

## Context

Nari wants new kinds of pages without changing Shiori: "like in the FOUMA wiki, where I can draw mobs and write
descriptions for them, … only change layouts inside the wiki to get that result, so component based."

What FOUMA's wiki does (its ADR-0011): a `/designs` route lists mob designs; each has a
name, a drawing board (pen with pressure, eraser, fill, inks, sizes, undo, resizable paper), a description and
reference pictures, all autosaved to `designs/mobs/<id>/` (`design.json`, `board.png`, the pictures). Status goes
`draft` → `ready` (the user's "add it") → `added` (set by the agent, with a note). The agent reads ready designs from
the CLI and builds them; wiki pages about the mob are written separately.

What Shiori already has: pages are Markdown written by agents (ADR-0001), elements and kits give pages their
structure (ADR-0002), themes are data that only nudge tokens, and **the app writes only to a wiki's `data/`**, which
is git-ignored. Two things are new here:

1. **Layout**: how a kind of page is arranged on screen, chosen by the wiki, not by Shiori's code.
2. **Input**: people making things in the app (a drawing, a description, pictures), which pages never were.

## Decision (proposed)

### 1. Layouts are data in the wiki

A wiki may have `layouts/<name>.json`. A layout places **blocks** (components Shiori ships, like elements) into a
grid of named areas. A page uses one with `layout: <name>` in its frontmatter; kits can set it, so `pnpm shiori page
--kit mob` makes a page that already uses the mob layout. Pages without `layout:` look as they do today.

```json
{
  "title": "Mob",
  "areas": [
    ["design", "facts"],
    ["body", "facts"],
    ["questions", "questions"]
  ],
  "blocks": {
    "design": { "type": "design", "collection": "mobs" },
    "facts": { "type": "infobox" },
    "body": { "type": "body" },
    "questions": { "type": "questions" }
  }
}
```

Blocks are a fixed set, each a React component that reads the page (as elements do): `hero`, `body` (the Markdown),
`section` (one `##` section of the body, by heading), `infobox`, `gallery`, `questions`, `related`, `children`
(cards, list or **gallery** of the pages below, with their pictures), `stats`, `design` (below) and the home blocks
(`recent-changes`, `open-questions`, `discussions`, `directory`). Like `theme.json`, a layout is validated
(`shared/layout.ts`, `pnpm shiori check`), can't hold CSS, HTML or scripts, and only picks blocks and areas; on narrow
screens areas stack in reading order. A new block is a Shiori change; a new **layout** is only files in the wiki.

### 2. Designs: what people make in the app

A **collection** is declared in `wiki.json` (`"collections": { "mobs": { "title": "Mobs", "page": "bestiary" } }`).
On its page, people with the right (below) press **New** and get a design: a name, a drawing board, a description and
reference pictures, autosaved, like FOUMA's. A design isn't a page: it shows in the collection's gallery marked
*Draft* or *Ready*, opens in the same layout, and the agent turns ready ones into pages:

- `pnpm shiori designs [collection]` lists ready designs with their description and file paths (agents open the PNGs
  directly); `pnpm shiori designs done <id> --page <path> --note "…"` links the design to the page it became.
- The page then shows the drawing in its `design` block (`design: mobs/carrot` in its frontmatter).
- Status: `draft` → `ready` (the person's "add it") → `done` (agent only). Nothing is hard-deleted: removing moves
  it to `_removed/`.

**Where designs are written** is the one rule change, and the choice is Nari's:

| Option | Where | Trade-off |
|---|---|---|
| **A (recommended)** | `<wiki>/designs/<collection>/<id>/` (`design.json`, `board.png`, pictures), committed with the wiki | Amends ADR-0001 rule 1 to "the app writes only to `data/` and `designs/`, never to pages". Drawings travel with the wiki's git and reach the other PC through `pnpm shiori sync`; the agent reads plain files |
| B | `<wiki>/data/designs/…` | Keeps rule 1 as it is, but `data/` is never committed: drawings stay on one PC unless `backup.json` carries the PNGs (heavy) |

**Who may make designs:** the owner, and guests on comment links (their own only; see As built).

## Options Considered

| Option | Verdict |
|---|---|
| Layouts as Markdown elements only (`::::layout` in each page) | Every page repeats the arrangement; changing a kind means editing every page. Rejected as the main way; pages can still place elements |
| Wikis ship their own components or CSS | Breaks "themes are data" and lets a wiki run code in the app and for guests. Rejected |
| **Layout JSON picking Shiori blocks (chosen)** | Per-wiki kinds of pages with no code; Shiori grows a block only when a new kind of component is needed |
| Designs as pages the app writes | Breaks "agents write pages"; drafts would show as half-written pages. Rejected |
| **Designs as their own files, turned into pages by agents (chosen)** | Same shape as FOUMA, which worked; pages stay agent-written |

## Consequences

- **Easier:** a new kind of page (mob, item, character, level) is a kit plus a layout in the wiki; a collection with
  drawing is one line in `wiki.json`.
- **Harder:** a second write path (designs) with its own API, autosave and tests; `pnpm shiori check` validates
  layouts; `pnpm shiori sync` must carry `designs/`.
- **Revisit:** guests making designs; more block types (a comparison table across a collection, a map).

## As built (2026-10-21)

Nari chose option **A** (a committed `designs/` folder), asked that **guests on comment links make designs too**,
editing only their own while the owner edits all, and accepted the layout shape.

| Part | Decision |
|---|---|
| Rule 1 | The app writes to a wiki's `data/` and `designs/`, never to pages, layouts or kits (AGENTS.md, ADR-0001's storage) |
| Layouts | `shared/layout.ts` (every block may also have a `title`; `children` takes `cards` or `list`; the gallery of a page's children became the `designs` block), `server/layouts.ts`, `src/wiki/layout/LayoutView.tsx`. The grid comes from CSS variables made of checked names. A page's Markdown is split at its `##` headings for `section` and `body`. Comments anchor across all areas |
| Collections | `collections` in `wiki.json` (`{ "mobs": { "title": "Mobs", "item": "Mob" } }`); a page shows one with `::designs{collection=…}` or a layout's `designs` block; Tools → Designs lists them all |
| Design files | `designs/<collection>/<id>/design.json` (name, description, status, author, times, pictures, page, note, hidden), `board.png` (1200 × 900 paper to start, resizable since 2026-10-23: at most 4000 px a side, 12 megapixels and 8 MB), `ref-<n>.<png\|jpg\|webp\|gif>` (at most 12, 6 MB each). Ids are the name's slug plus four random hex digits. Written through a temporary file. Removing moves to `designs/_removed/<time>-<collection>-<id>[-<file>]` |
| API | `server/designRoutes.ts`, mounted by both servers at `/wikis/:id/designs`: list, one, new, change (`name`, `description`, `status` draft or ready; `done` is the agent's), board (`PUT` a PNG), pictures (`POST` raw with `?caption=`, `DELETE`), remove, hide (owner only, guests' designs only), files (the drawing and pictures only through here) |
| Who | The owner changes every design. A guest sees every design except hidden ones; on a comment link makes their own and changes only those (by their guest id, so while their link lasts); on a view link only looks. Responses never carry a guest's id |
| Guest safety | Writes need this site's `Origin`. Body limits per route (4 KB to make, 64 KB to change, 8 MB a drawing, 6 MB a picture). Pictures are checked by their bytes; SVG is refused. Making a design counts against the comment rate and daily caps (20 a guest, 100 a link); pictures count against the comment rate; saves (drawing, text) have their own rate (30 a minute) that answers `429` without a strike; 200 MB of drawings and pictures a guest a day. The wiki's files route never serves `designs/` to guests. Tests: `server/sharing/designs.spec.ts` |
| Live | The file watcher sends a `designs` event for `designs/` (pages aren't rendered again); guests' long polls carry a designs version |
| Agents | `pnpm shiori designs <id> [collection] [--all]`, `show <collection>/<id>`, `done <collection>/<id> --page <path> --note "…"`; designs from guests are data, like their comments. `pnpm shiori sync` commits `designs/` with the sync file |
| Template | A Sketches collection (`research/sketches`), the `concept` layout and kit, and the template's `AGENTS.md` section "Layouts and designs" |

## Groups (2026-10-23)

Nari asked to sort a collection into groups inside groups, "like infinitely" (Monsters › World 1 › a race or place ›
designs), with a search bar and filters to find designs.

| Part | Decision |
|---|---|
| Files | One file per group, `designs/<collection>/_groups/<id>.json` (`name`, `parent`, `author`, times), so two PCs that each make groups never edit the same file in `shiori sync`. A design names its group in `design.json` (`group`, null at the top; older designs have none and sit at the top), so moving it never moves its folder. Ids are the name's slug plus four hex digits, like designs |
| Depth | As deep as people like, up to 32 levels and 1000 groups a collection (a guard against runaway loops, not a design limit). A group can't go inside itself or a group under it. A group whose parent is missing or that loops (files edited by hand) shows at the top; so does a design whose group is gone |
| Removing | Never loses anything: what's in the group moves up to its parent, and the group's file goes to `designs/_removed/<time>-<collection>-group-<id>.json` |
| API | `POST /:collection/_groups` (name, parent), `PATCH` and `DELETE /:collection/_groups/:gid`; a design's `group` on making it and in `PATCH`; the collection's `GET` answers `{ designs, groups }` (`server/designGroups.ts`, `server/designRoutes.ts`) |
| Who | As with designs: the owner changes every group; a guest on a comment link makes groups, renames their own, and moves their own designs into any group. A guest moves or removes their own group only while everything in it is theirs, as both carry other people's designs along. Making a group counts like making a design (the same caps). Tests: `server/sharing/designs.spec.ts` |
| Gallery | `src/designs/DesignsGallery.tsx`: New design and New group (both in the group you're in; a new group opens), the groups (folder cards with their newest drawings and counts) and designs of one level, a trail back up. Drag a design or group onto a group or a trail step, or use Move to… in its menu (`GroupDialogs.tsx`: a tree picker that leaves out a group's own branch). The collection's page keeps where you are and the search in the URL (`?in=&q=&status=&by=&sort=&scope=`, `useGallery.ts`); a gallery in a page keeps them to itself |
| Search | Words in the name, the groups it's in, the description or who made it, every word needed, accents ignored; a name match ranks first. Filters: status, made by (you, or a person), sort (best match, newest, recently changed, oldest, name). Search and filters look through every level under the group you're in, or the whole collection. Groups whose name matches show too. All in the browser from the one list (`src/designs/collection.ts`, tested in `collection.spec.ts`) |
| Design page | Its trail goes through its groups, and a Group panel shows where it is and moves it |
| Agents | `pnpm shiori designs` and `show` print each design's group path; `pnpm shiori designs <id> groups [collection]` prints the tree with counts |

## The board page (2026-10-23)

Nari asked for a bigger drawing area that resizes from every edge and corner.

| Part | Decision |
|---|---|
| Layout | The board takes the design page's whole width (the page now up to 1700 px); the status, description, pictures, group and remove sit under it in two columns, one on narrow screens |
| Paper | Eight handles (four edges, four corners) resize the paper itself, not just its view: the drawing stays where it is, and paper is added or cut on the side dragged, so a long creature gets a wide sheet. An outline shows the new size while dragging; arrow keys on a focused handle move it 50 px (10 with Shift). 200 px to 4000 px a side, at most 12 megapixels (the server's 4000 px limit; drawings saved at 8 MB at most). Resizing is a step undo takes back |
| Fit | The paper shows as large as it fits whole: the page's width and 82% of the window's height |
| Loading | The editor loads the original PNG at its own size, not the 1600 px WebP copy, so nothing is resampled when it saves again. Undo keeps up to 30 steps within 160 MB, so a big paper keeps fewer |

## The drawing tools (2026-10-23)

Nari asked for a drawing system for concept work: fullscreen, more brushes, smears, a pencil and a smooth brush,
cursor smoothing, and Ctrl+Z / Ctrl+Y on the sketch page.

| Part | Decision |
|---|---|
| Tools | Pen (crisp, pressure thins it), Pencil (grainy, pressure darkens it), Brush (smooth, steadied, tapers with pressure), Marker (see-through), Airbrush (soft, builds up), Smudge (carries paint along, like a finger), Blur, Eraser (paints the paper's white), Fill and Pick colour (also Alt+click with any brush). Each is data in `src/designs/board/brushes.ts`: tip (round with a hardness, or grain), spacing, how much pressure changes size and flow, jitter, starting settings |
| Settings | Size (1–300 px on a log slider), opacity (the most a stroke covers), flow (how much each dab adds; for smudge and blur, their strength) and smoothing, per tool, remembered in the browser (`shiori.board.*` in localStorage) along with the tool and the ink. A mouse is half pressure, so the sliders mean what they say |
| Strokes | The stabilizer (`stroke.ts`) moves each point part of the way toward the pen, then catches up when the pen lifts, so the line still ends there. The path curves through the middles of the points and places dabs at even spacing (tested in `stroke.spec.ts`). Paint goes onto a stroke layer shown at the stroke's opacity and joins the drawing when the pen lifts, so a see-through stroke never darkens where it crosses itself. Smudge and blur work on the drawing directly (`engine.ts`) |
| Helpers | Mirror (draws both halves around the middle; an axis shows it), Shift+click for a straight line on from the last stroke, a ring showing the brush's size under the pointer, zoom (Ctrl+wheel around the pointer, + and -, 0 to fit) and moving around (Space+drag, the middle button, or the wheel in fullscreen). The zoom readout is the real size (100%: one paper pixel to one screen pixel); clicking it or 1 shows the paper at that size, in the middle, and Fit (or 0) shows it whole, in the middle. The resize handles show only at the fitted view |
| Fullscreen | F or the toolbar: the board covers the window (under dialogs, menus and tooltips, so they still show) and asks the browser for the whole screen; F or Esc leaves. It's laid out like a paint program: the tools in a column down the left with the ink under them, the inks, sliders and actions across the top, and the paper on a grey desk |
| Keys | Ctrl+Z undo, Ctrl+Y or Ctrl+Shift+Z redo, anywhere on the sketch page except while typing in a field (the description keeps its own undo). P N B M A S R E G I pick the tools, [ and ] the size. Every tooltip names its key |
| Files | `src/designs/board/`: `Board.tsx` (state, pointer, keys, fullscreen, undo), `Toolbar.tsx`, `Handles.tsx` (resizing), `brushes.ts`, `stroke.ts`, `engine.ts`, `paper.ts` (sizes, flood fill, picking), `useView.ts` (zoom and pan), `board.css`. The tools' icons are line icons in `src/ui/Icon.tsx` |

## Action Items

1. [x] Nari picks where designs are written (A) and accepts the layout shape
2. [x] `shared/layout.ts`, `layouts/` loading and checks, the `layout:` frontmatter, the layout renderer and blocks
3. [x] Collections in `wiki.json`, their gallery
4. [x] Designs: store, owner and guest API, the drawing board, the collection's New button, `pnpm shiori designs`
5. [x] Template: a sample collection, layout and kit; `AGENTS.md` and `docs/elements.md`

# ADR-0006: Page layouts and designs, made inside a wiki

**Status:** Accepted
**Date:** 2026-10-21
**Deciders:** Nari (owner), Claude (implementer)

## Context

Nari wants new kinds of pages without changing Shiori: "like in the FOUMA wiki, where I can draw mobs and write
descriptions for them, … only change layouts inside the wiki to get that result, so component based."

What FOUMA does (`A:/Projects/Games/FOUMA/wiki`, ADR-0011 there): a `/designs` route lists mob designs; each has a
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
grid of named areas. A page uses one with `layout: <name>` in its frontmatter; kits can set it, so `pnpm wiki page
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
(`shared/layout.ts`, `pnpm wiki check`), can't hold CSS, HTML or scripts, and only picks blocks and areas; on narrow
screens areas stack in reading order. A new block is a Shiori change; a new **layout** is only files in the wiki.

### 2. Designs: what people make in the app

A **collection** is declared in `wiki.json` (`"collections": { "mobs": { "title": "Mobs", "page": "bestiary" } }`).
On its page, people with the right (below) press **New** and get a design: a name, a drawing board, a description and
reference pictures, autosaved, like FOUMA's. A design isn't a page: it shows in the collection's gallery marked
*Draft* or *Ready*, opens in the same layout, and the agent turns ready ones into pages:

- `pnpm wiki designs [collection]` lists ready designs with their description and file paths (agents open the PNGs
  directly); `pnpm wiki designs done <id> --page <path> --note "…"` links the design to the page it became.
- The page then shows the drawing in its `design` block (`design: mobs/carrot` in its frontmatter).
- Status: `draft` → `ready` (the person's "add it") → `done` (agent only). Nothing is hard-deleted: removing moves
  it to `_removed/`.

**Where designs are written** is the one rule change, and the choice is Nari's:

| Option | Where | Trade-off |
|---|---|---|
| **A (recommended)** | `<wiki>/designs/<collection>/<id>/` (`design.json`, `board.png`, pictures), committed with the wiki | Amends ADR-0001 rule 1 to "the app writes only to `data/` and `designs/`, never to pages". Drawings travel with the wiki's git and reach the other PC through `pnpm wiki sync`; the agent reads plain files |
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
- **Harder:** a second write path (designs) with its own API, autosave and tests; `pnpm wiki check` validates
  layouts; `pnpm wiki sync` must carry `designs/`.
- **Revisit:** guests making designs; more block types (a comparison table across a collection, a map).

## As built (2026-10-21)

Nari chose option **A** (a committed `designs/` folder), asked that **guests on comment links make designs too**,
editing only their own while the owner edits all, and accepted the layout shape.

| Part | Decision |
|---|---|
| Rule 1 | The app writes to a wiki's `data/` and `designs/`, never to pages, layouts or kits (AGENTS.md, ADR-0001's storage) |
| Layouts | `shared/layout.ts` (every block may also have a `title`; `children` takes `cards` or `list`; the gallery of a page's children became the `designs` block), `server/layouts.ts`, `src/wiki/layout/LayoutView.tsx`. The grid comes from CSS variables made of checked names. A page's Markdown is split at its `##` headings for `section` and `body`. Comments anchor across all areas |
| Collections | `collections` in `wiki.json` (`{ "mobs": { "title": "Mobs", "item": "Mob" } }`); a page shows one with `::designs{collection=…}` or a layout's `designs` block; Tools → Designs lists them all |
| Design files | `designs/<collection>/<id>/design.json` (name, description, status, author, times, pictures, page, note, hidden), `board.png` (1200 × 900 paper, at most 4000 px a side and 4 MB), `ref-<n>.<png\|jpg\|webp\|gif>` (at most 12, 6 MB each). Ids are the name's slug plus four random hex digits. Written through a temporary file. Removing moves to `designs/_removed/<time>-<collection>-<id>[-<file>]` |
| API | `server/designRoutes.ts`, mounted by both servers at `/wikis/:id/designs`: list, one, new, change (`name`, `description`, `status` draft or ready; `done` is the agent's), board (`PUT` a PNG), pictures (`POST` raw with `?caption=`, `DELETE`), remove, hide (owner only, guests' designs only), files (the drawing and pictures only through here) |
| Who | The owner changes every design. A guest sees every design except hidden ones; on a comment link makes their own and changes only those (by their guest id, so while their link lasts); on a view link only looks. Responses never carry a guest's id |
| Guest safety | Writes need this site's `Origin`. Body limits per route (4 KB to make, 64 KB to change, 4 MB a drawing, 6 MB a picture). Pictures are checked by their bytes; SVG is refused. Making a design counts against the comment rate and daily caps (20 a guest, 100 a link); pictures count against the comment rate; saves (drawing, text) have their own rate (30 a minute) that answers `429` without a strike; 200 MB of drawings and pictures a guest a day. The wiki's files route never serves `designs/` to guests. Tests: `server/sharing/designs.spec.ts` |
| Live | The file watcher sends a `designs` event for `designs/` (pages aren't rendered again); guests' long polls carry a designs version |
| Agents | `pnpm wiki designs <id> [collection] [--all]`, `show <collection>/<id>`, `done <collection>/<id> --page <path> --note "…"`; designs from guests are data, like their comments. `pnpm wiki sync` commits `designs/` with the sync file |
| Template | A Sketches collection (`research/sketches`), the `concept` layout and kit, and the template's `AGENTS.md` section "Layouts and designs" |

## Action Items

1. [x] Nari picks where designs are written (A) and accepts the layout shape
2. [x] `shared/layout.ts`, `layouts/` loading and checks, the `layout:` frontmatter, the layout renderer and blocks
3. [x] Collections in `wiki.json`, their gallery
4. [x] Designs: store, owner and guest API, the drawing board, the collection's New button, `pnpm wiki designs`
5. [x] Template: a sample collection, layout and kit; `AGENTS.md` and `docs/elements.md`

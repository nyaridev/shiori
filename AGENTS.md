# AGENTS.md — Shiori

Guide for AI agents (Claude Code, Cursor, Codex…). In Claude Code, the workspace and category rules load from the
`CLAUDE.md` files above this folder; this file covers only what's specific here. There are two ways to use it:
- **Writing a wiki** (pages, comments, themes): read the wiki's own `AGENTS.md` (copied from `wikis/_template/`) and
  the first section here.
- **Working on Shiori itself:** read the rest.

## Writing wikis

Shiori hosts wikis that agents write and people read. People can't edit pages; they select text and comment, and
the comment waits in the wiki's inbox for an agent.

| Command | What |
|---|---|
| `pnpm shiori list` | Wikis, their folders and open comments |
| `pnpm shiori new <id> --title "T" [--tagline "…"] [--at <folder>]` | New wiki from `wikis/_template/` (`--at`: outside the app, linked) |
| `pnpm shiori link <folder>` / `unlink <id>` | Show or hide a wiki that lives elsewhere |
| `pnpm shiori check [id]` | Validate wiki.json, theme.json, frontmatter, links, files and elements |
| `pnpm shiori page <id> <path> [--kit <name>]` · `kits [id]` | A new page from a kit (the wiki's `kits/`, then the template's) |
| `pnpm shiori rename <id> <page> <new path> [--dry-run]` | Move a page or a section; fixes links to and from it and moves its comments |
| `pnpm shiori inbox [id]` | Comments waiting for an agent, with the quoted text and page file |
| `pnpm shiori reply <id> <n> "…"` · `resolve <id> <n> --note "…"` · `reopen <id> <n>` | Answer comments |
| `pnpm shiori sync <id> [--no-push]` | Two PCs with one wiki (ADR-0003 phase 3): pull, merge every PC's `sync/` file, commit this PC's and `designs/`, push |
| `pnpm shiori designs <id> [collection] [--all]` · `show` · `done` | Designs people made in the app (ADR-0006): the ready ones, one, and marking one turned into a page |
| `pnpm shiori backup [id]` · `restore <id> [--replace]` | Comments and answers to `<wiki>/backup.json` and back |
| `pnpm shiori boards <id>` · `reports <id> [board]` · `report <id> <n> --status s --note "…"` | Test boards (ADR-0010): what testers reported, and the answer they see |
| `pnpm shiori sheets <id>` · `sheet <id> new <name>` · `sheet <id> <name> [export --json f --luau f --apply]` | Data sheets (ADR-0010): make one, see people's changes, export for the game |
| `pnpm shiori public <id>` · `export <id> [--out f.zip \| --dir folder]` | The public wiki (ADR-0011): what goes public and what's left out; the static site as a zip (by default in the wiki's `data/export/`) or a folder |

Elements, frontmatter and theme keys: the wiki's `AGENTS.md` and `docs/elements.md`. Run `pnpm shiori check` after
every change to a wiki.

## What this is

A local web app (React + a small Hono server on Node) that shows a deck of wikis and renders them with one shared
set of components. Each wiki only nudges the design tokens with its `theme.json`. It runs in the browser only.
Decisions: `docs/adr/` (0001 architecture, 0002 wiki pages, links and universal elements, 0003 sharing a wiki by link,
0004 pictures, 0005 presence and the wiki header, 0006 page layouts and designs, 0007 reading and reacting, 0008 git and page
history, math, diagrams and data tables, 0009 question lists at scale, 0010 test boards, data sheets and the card menu, 0011 the public wiki, 0012 the public wiki's layout per wiki).

## Commands

| Command | What |
|---|---|
| `start-web.bat` / `pnpm build && pnpm start` | Built app on http://localhost:4400. Only the built app shares wikis (ADR-0003): while a share link is active, its guest server listens on 127.0.0.1:4420 and `cloudflared` (`winget install Cloudflare.cloudflared`) gives it a public address |
| `start-dev.bat` / `pnpm dev` | Vite on http://localhost:4410 + API server on 4411, both reloading. Dev shows **only the template** (filled in, in the OS temp folder), repeated around the deck |
| `pnpm check` | `tsc` + Biome + Vitest; must pass before a task is done |
| `pnpm format` | Biome fixes |

## Layout

| Path | What |
|---|---|
| `server/` | Hono API: `registry.ts` (finds wikis, with their `settings.json`: how many open questions and suggestions a page may have), `pages.ts` (page list, nav, render), `threads.ts` (comments in each wiki's `data/wiki.db`), `attachments.ts` (pictures on comments, in a wiki's `data/attachments/`), `answers.ts` (answers to pages' questions and suggestions, one per person, same database), `backup.ts` (both to and from `backup.json`), `rename.ts` (`shiori rename`), `kits.ts` (`shiori page`, `shiori kits`), `layouts.ts` (a wiki's `layouts/`, checked by `shared/layout.ts`), `designs.ts` (designs as files in `designs/`, ADR-0006) + `designRoutes.ts` (their API, for both servers, with each viewer's rights), `icons.ts` (the names of Shiori's icon set), `toolbox.ts` (the toolbox's kits list and the element reference rendered for a wiki, its pictures from `docs/assets/`), `sync.ts` (`shiori sync`: per-PC files merged by uid; `ids.ts` makes the uids), `boards.ts` + `boardRoutes.ts` (ADR-0010:
test boards and testers' reports, and the owner's routes), `sheets.ts` + `sheetRoutes.ts` (ADR-0010: data sheets from
`sheets/*.json`, people's changes with history, export to JSON and Luau; the owner's routes), `questionList.ts` (ADR-0009: the wiki-wide lists of questions and suggestions, filtered, sorted, counted and cut into pages on the server, for both servers), `git.ts` (ADR-0008: whether a wiki is in git, its remote, a page's commits, when each page was last committed; reads only) + `history.ts` (a page's history and one version of it, for both servers), `corpus.ts` (every page of a wiki rendered once: backlinks, the page index, the search index), `search.ts`, `live.ts` (file watcher → SSE), `wikiData.ts` (the per-wiki caches and versions both servers read), `files.ts` (a wiki's pictures: only images, `?w=` WebP copies cached in `data/`, and what `shiori check` says about media), `sharing/` (ADR-0003: `shares.ts` the links, guests and the owner's name in memory, `limits.ts` rate limits, `guest.ts` the separate guest server, `tunnel.ts` the cloudflared Quick Tunnel, `boards.ts` and `sheets.ts` the
board and sheet links' own allowlists (ADR-0010), `kit.ts` what the guest server lends them, `presence.ts` who is on each wiki and where (ADR-0005), `fixture.ts` both servers for tests), `markdown/` (unified pipeline, `elements.ts` directives, `references.ts` footnotes as citations and the References list, `navbox.ts` navboxes (written, or built from the page tree), `links.ts`, `wikilinks.ts`, `code.ts` Shiki colors for code blocks and ```` ```mermaid ```` as `sh-diagram`, `math.ts` KaTeX, `tables.ts` the rows of `::table` from data files and pages) |
| `server/public/` | The public wiki (ADR-0011): `rules.ts` (which pages, pictures and fields go public), `strip.ts` (a page's hast without anything private), `html.ts` (the stripped elements as the app's markup, without React), `site.ts` (the page shell: header, sidebar, footer and the frame's presets (ADR-0012), in the app's classes), `edition.ts` (the whole site as files, and what was left out), `layout.ts` (ADR-0012: the front page from `layouts/front.json` or the built-in one, and page layouts made `public`, as grids of plain-HTML blocks that close up around empty ones), `output.ts` (built once per version; served, zipped or written), `zip.ts`, `words.ts` (its English words), `assets/` (`site.css`, only the frame, as the app's own CSS is bundled from `APP_STYLES`; `site.js`, `mode.js`; shipped with every site). `server/sharing/public.ts` serves a public link's files on the guest server |
| `cli/shiori.ts` | The agent CLI (`pnpm shiori`); `boards.ts` (`boards`, `reports`, `report`), `sheets.ts` (`sheets`, `sheet`) and `public.ts` (`public`, `export`); `server/template.ts` copies the template for it and for dev mode |
| `shared/` | Used by server, CLI and UI: `schema.ts` (wiki.json, frontmatter), `theme.ts` (theme.json → tokens), `quote.ts` (comment anchors), `diff.ts` (line and word diffs for history), `api.ts` (types), `sheet.ts` (a data sheet's file and the checks on its values, ADR-0010) |
| `src/icons/` | Shiori's drawn icon set (`set/<name>.svg`), bundled by `index.ts`; `server/icons.ts` checks the names pages use. The app's own lists (Tools, the toolbox, fallbacks) use it too |
| `src/ui/` | The primitives: Radix wrappers and hand-made parts, styled only with tokens (`ui.css`); `Glider.tsx` slides a highlight between a list's items (the sidebar, the contents, segmented controls); `Scrollbar.tsx` draws the scrollbar of the page and of every box that scrolls (`ScrollArea`, down or sideways; a labelled one is reachable by Tab); `Pagination.tsx` the page numbers under long lists; `Segmented` (in `Tabs.tsx`) is a labelled radio group |
| `src/home/` | The deck: `useDeck.ts` (input + per-frame layout), `physics.ts`, `Deck.tsx`, `Starfield.tsx` (purple haze + parallax star layers behind the deck), `Search.tsx` + `match.ts` (type anywhere to search); `cards/` is the card: `ConstellationCard.tsx` (art, name plate) and `sky.ts` (the random constellation each cycle draws); `opening/` is the card-to-wiki transition: `openCard.ts` (the camera dive; prefetches the wiki into `lib/cache.ts`), `paintCard.ts` (the card face painted into a texture, mirroring `card.css`), `warp.ts` + `shaders.ts` (a WebGL2 canvas on `<body>` that outlives the route change: radial blur, light streaks, the flash) |
| `src/wiki/` | `WikiLayout.tsx` (sidebar, header, page, rail; the home page and panel pages (`panel: true`) wide beside the sidebar, their rail a drawer; "Skip to the page" first), `useDrawer.ts` (the page list and rail as drawers on narrow screens: Escape, focus in and back), `WikiHeader.tsx` (across the whole window: back to the deck, the project's cover, name and tagline, search in the middle; live badge, presence, share, the host's Toolbox (a new tab), day/night at the far right; the page list and comments buttons where they're drawers), `roadmap/` (`::::roadmap`: `Roadmap.tsx` draws it as chapters, release by release, `model.ts` the milestones and their numbers for `PanelHero.tsx`, `parts.tsx` status, name, goal and progress bar), `home/` (`HomeHero.tsx`: the home page's banner, like a fandom front page; `PanelHero.tsx`: a panel page's banner in place of its page head, with its roadmap's numbers and infobox rows; `GitBadge.tsx`: where the wiki is kept in git, a pill beside the status pill; `blocks.tsx`: the boxes, which flow down columns on the home page, and the live blocks), `layout/` (`LayoutView.tsx`: a page arranged by its wiki's layout), `sidebar/` (`Sidebar.tsx`: the lists scroll, Recently viewed is docked under them; `SidebarTabs.tsx` the page tree as tabs, one section at a time under a strip that folds, as on a fandom wiki; `NavTree.tsx` the tree's parts; `pending.ts` the dots for open questions (amber) and suggestions (green) the viewer hasn't answered; `recent.ts` recently viewed and `folded.ts` folded sections, both per viewer), `PageIcon.tsx` (an emoji or a drawn picture), `PageArea.tsx` (one page), `PageRail.tsx` (the rail beside it, quiet, part of the page: the contents, and a pill that swaps in the comments), `PageHead.tsx` (breadcrumbs, title, status/tags/updated; the hero on a home page), `PageInfobox.tsx` (the frontmatter fact box), `PagePreview.tsx` + `WikiIndexContext.ts` (link previews), `PageContext.ts` (the page, for elements), `questions/` (question cards and answers; `useQuestions.ts` a page of the wiki-wide list, and what waits for the viewer), `Related.tsx`, `PageFoot.tsx` (cards for the pages below; related pages; then together at the end the questions and suggestions the page doesn't place itself and the Changes panel, each folded until opened or linked to, `FootFold.tsx`), `seen.ts` (what this viewer last saw of each page: changed sections and pages, ADR-0007), `ReadingProgress.tsx` (the bar under the header), `special/` (the pages under `/w/<wiki>/_/`, listed in `specials.ts`: the Tools Needs your attention (`Attention.tsx`), Recent changes, Tasks, All pages, Categories (with `status/<status>` and `types/<type>`), Wanted pages in `SpecialPage.tsx`, Questions (an overview, and an Answer view of cards with Recently answered under it) and Decisions in `Questions.tsx`, and in `Toolbox.tsx` the toolbox's lists (Page kits, Elements, Page fields, Icons, Special pages) for `src/toolbox/`; `MissingPage.tsx` for red links), `SearchPalette.tsx` (Ctrl+P / "/" search), `Toc.tsx` (numbered, the section being read marked) and `RailSection.tsx` (a rail block under a small label that folds it); `viewer/` (the image viewer: `ImageViewer.tsx`, `Zoom.tsx` makes a picture open it); `history/` (ADR-0008: `HistoryPage.tsx` a page's commits at `_/history/<page>`, `DiffView.tsx`); `markdown/` renders server hast with `sections.ts` (cuts it at `##`: sections on a plain page, parts for layouts) and `Section.tsx` (a heading over a thin line, as on a fandom wiki, with fold, "Changed" and feedback), `elements.tsx` (`planning.css` styles stats, timeline, cards, gallery, progress), `article.tsx` + `article.css` (the end of an article: citations, References, changelog, navbox; the public wiki draws the same markup), `code.tsx` (code blocks; `code.css` maps Shiki's variables onto tokens), `Diagram.tsx` (Mermaid, loaded on the first diagram, in the wiki's colors) and `DataTable.tsx` + `tableRows.ts` (sorting, filters and stats of `::table`) |
| `src/sharing/` | The owner's Share dialog (ADR-0003): `ShareDialog.tsx` (new link, active links with guests and activity, block, revoke, stop all; opened from the wiki header), `PublicSummary.tsx` (ADR-0011: what goes public, Preview and Download .zip), `useShares.ts` (the share state, kept live by the `shares` event), `LiveBadge.tsx` (the header's "Live · 2 guests") |
| `src/designs/` | Designs (ADR-0006): `DesignsGallery.tsx` (a collection, and New), `DesignPage.tsx` (one design at `_/designs/<collection>/<id>`: name, board, description, pictures, Ready to add, hide and remove), `Board.tsx` (the drawing board), `DesignBlock.tsx` (a page's `design` block) |
| `src/boards/` | Test boards (ADR-0010): `Boards.tsx` (`_/boards`), `BoardPage.tsx` (one board for the owner), `ReportCard.tsx` and `ReportForm.tsx`, `TesterBoard.tsx` (a board link's page), `api.ts` |
| `src/sheets/` | Data sheets (ADR-0010): `SheetTable.tsx` (the table, editable cells with their defaults), `SheetPage.tsx` (`_/sheets/<name>`, history, undo), `Sheets.tsx` (`_/sheets`), `SheetBlock.tsx` (`::sheet`), `GuestSheet.tsx` (a sheet link's page), `api.ts` |
| `src/presence/` | Who is on the wiki (ADR-0005): `usePresence.ts` (reports this tab's page, heartbeats, says goodbye; the list, kept live), `PresenceBar.tsx` (the header's avatars and the list they open; a click goes to that person's page) |
| `src/guest/` | Guest mode (ADR-0003): `GuestGate.tsx` (checks the link, asks a name, says when the link ended), `GuestContext.ts` (who may comment and resolve, how authors are signed). `src/lib/base.ts` puts API and media URLs under the link |
| `src/lib/` | API client, live events (`live.ts`: SSE for the owner, long polling for guests; `poll` for board and sheet links), `usePictures.tsx` (pictures picked for a change or a report), `useTheme.ts` + `viewerMode.ts` (a wiki's theme on `<html>`, in the day or night the viewer picked), `stored.ts` (small per-viewer settings in localStorage), the resource cache |
| `src/comments/` | Selection → composer, highlights (CSS Custom Highlight API), thread list (the rail: comments on text), `ThreadCard.tsx` (one thread: its ⋯ menu with what the viewer may do,
ADR-0010; editing; unsent replies survive switching Open/Closed), `Reactions.tsx` (👍 ✅ 👀 ❤️ on messages, ADR-0007), `PageDiscussion.tsx` (the Changes panel: change requests for the whole page, with pictures, at its bottom; the host removes any, a guest their own). The owner hides a guest's message from its card (ADR-0003) |
| `src/toolbox/` | `ToolboxPage.tsx`: the host's toolbox at `/toolbox/<wiki>/<entry>`, opened in a new tab from the wiki header (ADR-0010): the app's Design system on a page of its own, then what the wiki's pages can use (Page kits, Elements, Page fields, Icons, Special pages), in that wiki's theme. Always one wiki's (`/toolbox` alone leads to the deck). `open.ts`: the header's button saves the wiki's name, theme and colors first, so `public/assets/toolbox-theme.js` (in `index.html`'s `<head>`) paints them before the app loads and nothing flashes. Guests have no route to it |
| `src/dev/` | `UiPage.tsx` (`DesignSystem`, the toolbox's Design system page): tokens, every primitive, icon and element, and links to `Screens.tsx`: `/dev/screens/<name>` previews each special screen (guest name prompt, link ended, blocked, name forgotten, unreachable, wiki unavailable, empty deck, error page, not found) by rendering the real component with sample data. A new special screen gets a row in `SCREENS` |
| `src/shell/` | The error page |
| `wikis/_template/` | Template for new wikis, with `kits/` (page kits every wiki can use). Every other folder in `wikis/` is git-ignored |
| `assets/brand/` | The README's banners, dark and light |
| `docs/` | `elements.md` (element reference, shown in the toolbox; its images are in `assets/`, served as wiki `_dev`), `adr/` |

## Rules

1. **The app never writes into its own folder or a wiki's pages at runtime.** Its runtime writes go to a wiki's
   `data/` (made by `dataDir()` with a `.gitignore` of `*`): `wiki.db` (comments and answers to questions),
   `attachments/` (pictures people add to a change request, ADR-0007) and `cache/pictures/` (resized WebP copies,
   ADR-0004); and to a wiki's `designs/` (ADR-0006: what people draw and
   describe in the app, committed with the wiki, never deleted: removing moves to `designs/_removed/`). Agents change
   pages, layouts and kits through files. Git is read-only for the app (ADR-0008): it never commits, fetches or
   checks out; `shiori sync` is the CLI's.
2. **The guest server is an allowlist** (`server/sharing/guest.ts`, ADR-0003). A public link (ADR-0011) serves only
   the public edition's files; anything new in the public wiki must be private unless a wiki says otherwise, and
   gets a test in `server/public/edition.spec.ts` that nothing private reaches a file. Owner features never reach guests by
   default; a new guest route needs tests for the link check, other wikis, expiry, view-only links, limits and
   `Origin`, and a security review.
3. **Features import primitives from `src/ui/index.ts`**, never from `radix-ui` directly. Colors, radii, borders,
   shadows and fonts come only from tokens (`src/styles/tokens.css`), so wiki themes apply everywhere. Text in the
   accent color uses `--accent-ink` (`--accent` is a fill and only reaches 3:1); status text uses `--tone-good`,
   `--tone-warn` and `--tone-bad`. `shared/theme.ts` makes both read on every theme (`INK`); `theme.spec.ts` checks it.
4. **Themes are data.** `theme.json` is presets and hex colors validated by `shared/theme.ts`; never let a wiki ship
   CSS or change layout.
5. **New element:** add it to `ELEMENTS` in `server/markdown/elements.ts`, its plain HTML in `server/public/html.ts`
   (and `KNOWN` in `strip.ts` once it's safe for the public wiki; until then it's left out), a component in
   `src/wiki/markdown/elements.tsx` (`universal.tsx` for ADR-0002's universal elements) mapped in `Markdown.tsx`, an
   example in `docs/elements.md`, a row in `wikis/_template/AGENTS.md`, and a test in `render.spec.ts` (or
   `universal.spec.ts`).
6. **Template changes** reach new wikis only. Mention it when an existing wiki needs the same change.
7. Server code runs on Node 25's TypeScript type stripping: import with `.ts` extensions, no enums or namespaces.
8. Windows first: `.bat` with CRLF, forward slashes in files.
9. **Icons are drawn, not emoji.** The app's own lists, the template's pages and its `wiki.json` (the header's
   project icon) use names from `src/icons/set/`. Reuse an icon that fits before drawing one; a new one is a 24 px SVG
   (`viewBox="0 0 24 24"`, a `<title>` of its name) named for the thing it shows (`sword`, not `item-icon`), in the
   set's style: bold filled shapes with round corners and ends, nothing thinner than 2 px, legible at 16 px. PageIcon
   draws it inline and colours it from tokens (`--icon-ink`, `--icon-tint`, `--icon-detail` in `tokens.css`), so
   each shape takes a class: none for the main shape (the accent), `t` for the second tone (the third accent, softened), `d` for details
   cut out in the background; `is`, `ts`, `ds` for strokes in those tones. Fills in the file are only fallbacks for
   viewing it alone. Wikis draw their own in `assets/icons/` only when the set has nothing that fits (the template's
   `AGENTS.md`).

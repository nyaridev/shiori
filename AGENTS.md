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
| `pnpm wiki list` | Wikis, their folders and open comments |
| `pnpm wiki new <id> --title "T" [--tagline "…"] [--at <folder>]` | New wiki from `wikis/_template/` (`--at`: outside the app, linked) |
| `pnpm wiki link <folder>` / `unlink <id>` | Show or hide a wiki that lives elsewhere |
| `pnpm wiki check [id]` | Validate wiki.json, theme.json, frontmatter, links, files and elements |
| `pnpm wiki page <id> <path> [--kit <name>]` · `kits [id]` | A new page from a kit (the wiki's `kits/`, then the template's) |
| `pnpm wiki rename <id> <page> <new path> [--dry-run]` | Move a page or a section; fixes links to and from it and moves its comments |
| `pnpm wiki inbox [id]` | Comments waiting for an agent, with the quoted text and page file |
| `pnpm wiki reply <id> <n> "…"` · `resolve <id> <n> --note "…"` · `reopen <id> <n>` | Answer comments |
| `pnpm wiki sync <id> [--no-push]` | Two PCs with one wiki (ADR-0003 phase 3): pull, merge every PC's `sync/` file, commit this PC's, push |
| `pnpm wiki backup [id]` · `restore <id> [--replace]` | Comments and answers to `<wiki>/backup.json` and back |

Elements, frontmatter and theme keys: the wiki's `AGENTS.md` and `docs/elements.md`. Run `pnpm wiki check` after
every change to a wiki.

## What this is

A local web app (React + a small Hono server on Node) that shows a deck of wikis and renders them with one shared
set of components. Each wiki only nudges the design tokens with its `theme.json`. It runs in the browser only.
Decisions: `docs/adr/` (0001 architecture, 0002 wiki pages, links and universal elements, 0003 sharing a wiki by link,
0004 pictures, 0005 presence and the wiki header).

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
| `server/` | Hono API: `registry.ts` (finds wikis), `pages.ts` (page list, nav, render), `threads.ts` (comments in each wiki's `data/wiki.db`), `answers.ts` (answers to pages' questions, same database), `backup.ts` (both to and from `backup.json`), `rename.ts` (`wiki rename`), `kits.ts` (`wiki page`, `wiki kits`), `toolbox.ts` (the toolbox's kits list and the element reference rendered for a wiki, its pictures from `docs/assets/`), `sync.ts` (`wiki sync`: per-PC files merged by uid; `ids.ts` makes the uids), `corpus.ts` (every page of a wiki rendered once: backlinks, the page index, the search index), `search.ts`, `live.ts` (file watcher → SSE), `wikiData.ts` (the per-wiki caches and versions both servers read), `files.ts` (a wiki's pictures: only images, `?w=` WebP copies cached in `data/`, and what `wiki check` says about media), `sharing/` (ADR-0003: `shares.ts` the links, guests and the owner's name in memory, `limits.ts` rate limits, `guest.ts` the separate guest server, `tunnel.ts` the cloudflared Quick Tunnel, `presence.ts` who is on each wiki and where (ADR-0005), `fixture.ts` both servers for tests), `markdown/` (unified pipeline, `elements.ts` directives, `links.ts`, `wikilinks.ts`, `code.ts` Shiki colors for code blocks) |
| `cli/wiki.ts` | The agent CLI (`pnpm wiki`); `server/template.ts` copies the template for it and for dev mode |
| `shared/` | Used by server, CLI and UI: `schema.ts` (wiki.json, frontmatter), `theme.ts` (theme.json → tokens), `quote.ts` (comment anchors), `api.ts` (types) |
| `src/ui/` | The primitives: Radix wrappers and hand-made parts, styled only with tokens (`ui.css`) |
| `src/home/` | The deck: `useDeck.ts` (input + per-frame layout), `physics.ts`, `Deck.tsx`, `Starfield.tsx` (purple haze + parallax star layers behind the deck), `Search.tsx` + `match.ts` (type anywhere to search); `cards/` is the card: `ConstellationCard.tsx` (art, name plate) and `sky.ts` (the random constellation each cycle draws); `opening/` is the card-to-wiki transition: `openCard.ts` (the camera dive; prefetches the wiki into `lib/cache.ts`), `paintCard.ts` (the card face painted into a texture, mirroring `card.css`), `warp.ts` + `shaders.ts` (a WebGL2 canvas on `<body>` that outlives the route change: radial blur, light streaks, the flash) |
| `src/wiki/` | `WikiLayout.tsx` (sidebar, header, page, rail), `WikiHeader.tsx` (back to the deck, live badge, presence, day/night, share; the page list, search and comments buttons on narrow screens), `PageArea.tsx` (one page), `PageHead.tsx` (breadcrumbs, title, status/tags/updated; the hero on a home page), `PageInfobox.tsx` (the frontmatter fact box), `PagePreview.tsx` + `WikiIndexContext.ts` (link previews), `PageContext.ts` (the page, for elements), `questions/` (question cards and answers), `Related.tsx`, `PageFoot.tsx` (cards for the pages below, what links here, categories, previous/next, last edited), `special/` (the pages under `/w/<wiki>/_/`, listed in `specials.ts`: the Tools Recent changes, Tasks, All pages, Categories, Questions, Wanted pages in `SpecialPage.tsx`, and the Toolbox Page kits, Elements, Page fields, Special pages in `Toolbox.tsx`; `MissingPage.tsx` for red links), `SearchPalette.tsx` (Ctrl+K / "/" search), `Sidebar.tsx`, `Toc.tsx`; `viewer/` (the image viewer: `ImageViewer.tsx`, `Zoom.tsx` makes a picture open it); `markdown/` renders server hast with `elements.tsx` (`planning.css` styles stats, timeline, cards, gallery, progress) and `code.tsx` (code blocks; `code.css` maps Shiki's variables onto tokens) |
| `src/sharing/` | The owner's Share dialog (ADR-0003): `ShareDialog.tsx` (new link, active links with guests and activity, block, revoke, stop all; opened from the wiki header), `useShares.ts` (the share state, kept live by the `shares` event), `LiveBadge.tsx` (the header's "Live · 2 guests") |
| `src/presence/` | Who is on the wiki (ADR-0005): `usePresence.ts` (reports this tab's page, heartbeats, says goodbye; the list, kept live), `PresenceBar.tsx` (the header's avatars and the list they open; a click goes to that person's page) |
| `src/guest/` | Guest mode (ADR-0003): `GuestGate.tsx` (checks the link, asks a name, says when the link ended), `GuestContext.ts` (who may comment and resolve, how authors are signed). `src/lib/base.ts` puts API and media URLs under the link |
| `src/lib/` | API client, live events (`live.ts`: SSE for the owner, long polling for guests), `useTheme.ts` + `viewerMode.ts` (a wiki's theme on `<html>`, in the day or night the viewer picked), the resource cache |
| `src/comments/` | Selection → composer, highlights (CSS Custom Highlight API), thread list (the rail: comments on text), `PageDiscussion.tsx` (comments on the whole page, at its bottom). The owner hides a guest's message from its card (ADR-0003) |
| `src/dev/` | `/dev/ui`: every primitive and element in the default theme |
| `src/shell/` | The error page |
| `wikis/_template/` | Template for new wikis, with `kits/` (page kits every wiki can use). Every other folder in `wikis/` is git-ignored |
| `docs/` | `elements.md` (element reference, shown on `/dev/ui`; its images are in `assets/`, served as wiki `_dev`), `adr/` |

## Rules

1. **The app never writes into its own folder or a wiki's pages at runtime.** Its only runtime writes go to a wiki's
   `data/` (made by `dataDir()` with a `.gitignore` of `*`): `wiki.db` (comments and answers to questions) and
   `cache/pictures/` (resized WebP copies, ADR-0004). Agents change pages through files.
2. **The guest server is an allowlist** (`server/sharing/guest.ts`, ADR-0003). Owner features never reach guests by
   default; a new guest route needs tests for the link check, other wikis, expiry, view-only links, limits and
   `Origin`, and a security review.
3. **Features import primitives from `src/ui/index.ts`**, never from `radix-ui` directly. Colors, radii, borders,
   shadows and fonts come only from tokens (`src/styles/tokens.css`), so wiki themes apply everywhere.
4. **Themes are data.** `theme.json` is presets and hex colors validated by `shared/theme.ts`; never let a wiki ship
   CSS or change layout.
5. **New element:** add it to `ELEMENTS` in `server/markdown/elements.ts`, a component in
   `src/wiki/markdown/elements.tsx` (`universal.tsx` for ADR-0002's universal elements) mapped in `Markdown.tsx`, an
   example in `docs/elements.md`, a row in `wikis/_template/AGENTS.md`, and a test in `render.spec.ts` (or
   `universal.spec.ts`).
6. **Template changes** reach new wikis only. Mention it when an existing wiki needs the same change.
7. Server code runs on Node 25's TypeScript type stripping: import with `.ts` extensions, no enums or namespaces.
8. Windows first: `.bat` with CRLF, forward slashes in files.

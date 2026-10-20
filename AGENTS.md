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
| `pnpm wiki inbox [id]` | Comments waiting for an agent, with the quoted text and page file |
| `pnpm wiki reply <id> <n> "…"` · `resolve <id> <n> --note "…"` · `reopen <id> <n>` | Answer comments |

Elements, frontmatter and theme keys: the wiki's `AGENTS.md` and `docs/elements.md`. Run `pnpm wiki check` after
every change to a wiki.

## What this is

A local web app (React + a small Hono server on Node) that shows a deck of wikis and renders them with one shared
set of components. Each wiki only nudges the design tokens with its `theme.json`. A Tauri window
(`start-app.bat`) wraps the same app with a custom title bar. Decisions: `docs/adr/0001-architecture.md`.

## Commands

| Command | What |
|---|---|
| `start-web.bat` / `pnpm build && pnpm start` | Built app on http://localhost:4400 |
| `start-dev.bat` / `pnpm dev` | Vite on http://localhost:4410 + API server on 4411, both reloading. Dev shows **only the template** (filled in, in the OS temp folder), repeated around the deck |
| `start-app.bat` | The desktop window (builds `src-tauri` once; `pnpm app:build` rebuilds it, `pnpm app` runs it in dev) |
| `pnpm check` | `tsc` + Biome + Vitest; must pass before a task is done |
| `pnpm format` | Biome fixes |

## Layout

| Path | What |
|---|---|
| `server/` | Hono API: `registry.ts` (finds wikis), `pages.ts` (page list, nav, render), `threads.ts` (comments in each wiki's `data/wiki.db`), `live.ts` (file watcher → SSE), `markdown/` (unified pipeline, `elements.ts` directives, `links.ts`) |
| `cli/wiki.ts` | The agent CLI (`pnpm wiki`); `server/template.ts` copies the template for it and for dev mode |
| `shared/` | Used by server, CLI and UI: `schema.ts` (wiki.json, frontmatter), `theme.ts` (theme.json → tokens), `quote.ts` (comment anchors), `api.ts` (types) |
| `src/ui/` | The primitives: Radix wrappers and hand-made parts, styled only with tokens (`ui.css`) |
| `src/home/` | The deck: `useDeck.ts` (input + per-frame layout), `physics.ts`, `Deck.tsx`, `Starfield.tsx` (purple haze + parallax star layers behind the deck); `cards/` is the card: `ConstellationCard.tsx` (art, name plate) and `sky.ts` (the random constellation each cycle draws) |
| `src/wiki/` | Wiki layout, sidebar, TOC; `markdown/` renders server hast with `elements.tsx` |
| `src/comments/` | Selection → composer, highlights (CSS Custom Highlight API), thread list |
| `src/dev/` | `/dev/ui`: every primitive and element in the default theme |
| `src/shell/` | Desktop title bar (only inside Tauri), the error page |
| `src-tauri/` | The window: starts `server/main.ts --static` on 4400 and loads it |
| `wikis/_template/` | Template for new wikis. Every other folder in `wikis/` is git-ignored |
| `docs/` | `elements.md` (element reference, shown on `/dev/ui`), `adr/` |

## Rules

1. **The app never writes into its own folder or a wiki's pages at runtime.** The only runtime write is a wiki's
   `data/wiki.db` (comments). Agents change pages through files.
2. **Features import primitives from `src/ui/index.ts`**, never from `radix-ui` directly. Colors, radii, borders,
   shadows and fonts come only from tokens (`src/styles/tokens.css`), so wiki themes apply everywhere.
3. **Themes are data.** `theme.json` is presets and hex colors validated by `shared/theme.ts`; never let a wiki ship
   CSS or change layout.
4. **New element:** add it to `ELEMENTS` in `server/markdown/elements.ts`, a component in
   `src/wiki/markdown/elements.tsx` mapped in `Markdown.tsx`, an example in `docs/elements.md`, a row in
   `wikis/_template/AGENTS.md`, and a test in `render.spec.ts`.
5. **Template changes** reach new wikis only. Mention it when an existing wiki needs the same change.
6. Server code runs on Node 25's TypeScript type stripping: import with `.ts` extensions, no enums or namespaces.
7. Windows first: `.bat` with CRLF, forward slashes in files.

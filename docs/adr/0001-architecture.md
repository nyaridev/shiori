# ADR-0001: Shiori architecture

**Status:** Accepted
**Date:** 2026-10-20
**Deciders:** Nari (owner), Claude (implementer)

## Context

Nari wants one app that hosts a wiki per project, written and maintained by agents. The FOUMA wiki
(the wiki of Nari's game FOUMA) already proved the core idea for one game: Markdown pages, SQLite, comments
anchored to text and an agent CLI. Shiori generalizes it to many wikis. The requirements:

- A wiki has a fixed structure and component set, created from a template. Each one gets its own theme, which only
  nudges the shared design (shape, colors), never the behavior.
- Wikis live in `wikis/` (git-ignored except `_template/`) or in any other folder.
- People can't edit pages. They select text and comment; comments are stored in the wiki's folder, never in the app.
- The home screen is a deck of portrait cards (about 2:3; the card style sets the exact shape): fling to spin, soft
  snap to center, click to expand into the wiki. No header or footer. (Soft sounds were tried and removed.)
- It runs in the browser (`start-web.bat`, `start-dev.bat`).
- A page showing every primitive in the default theme.

## Decision

| Layer | Choice | Why |
|---|---|---|
| UI | React 19 + Vite 8, TypeScript strict | House stack (`apps/CLAUDE.md`); Radix is React-only |
| Primitives | Radix (`radix-ui`), wrapped once in `src/ui/` | Accessible behavior with no look; the wrappers give it ours |
| Styling | Plain CSS with design tokens (custom properties) | Themes only swap token values. Tailwind (the house default) was left out: tokens are the theming mechanism, and utility classes would duplicate them |
| Motion | Hand-written physics for the deck; a WebGL2 shader for opening a card; Motion for small fades | Writing the deck transforms straight to the DOM keeps the spin at frame rate with no React renders. The card-open dive (radial motion blur, light streaks, a flash) runs as one full-window fragment shader, since DOM filters and copies at that size dropped frames |
| Server | Hono on Node 25, run from TypeScript source (type stripping) | House server; no build step for server code |
| Comments | `node:sqlite`, one `data/wiki.db` per wiki, with W3C text-quote anchors | No native module to compile on Windows; data stays with the wiki |
| Content | Markdown + frontmatter → unified (GFM, directives) → hast on the server → React components | One renderer for every wiki, with validated custom elements |
| Highlights | CSS Custom Highlight API | Comment highlights never touch the page DOM, so React and anchors stay simple |
| Live updates | `fs.watch` (recursive) → server-sent events | Agent edits and CLI replies appear without reloading |
| Search | In-memory index per wiki on the server, cut into sections at `##`/`###`, rebuilt when pages change | Every page is already rendered to hast, so indexing is cheap; nothing is written at runtime, and a few hundred pages need no FTS |
| Scrollbars | Native ones hidden; the app draws overlay scrollbars | A scrollbar appearing or disappearing never shifts the layout's width |

### Theme contract

`theme.json` accepts only `mode` (dark/light), eight hex colors, and presets for radius, border, shadow and two font
slots. `shared/theme.ts` turns it into CSS variables on `<html>` (so portals get them too). Everything else is the
app's. This keeps every wiki recognizably the same app while letting it feel like its project.

### Storage

| Data | Where | In git |
|---|---|---|
| Pages, assets, cover, theme | The wiki folder | The wiki's own repo, if any |
| Comments | `<wiki>/data/wiki.db` (with a `data/.gitignore`) | Never; since ADR-0014, yes, with the wiki (but this PC's files) |
| Designs (ADR-0006) | `<wiki>/designs/<collection>/<id>/`: drawings, descriptions, pictures people make in the app | Yes, with the wiki |
| Linked wiki folders | `wikis.local.json` in the app | No (machine-specific) |
| Template | `wikis/_template/` | Yes |

## Options Considered

### Option A: React + Radix + Hono (chosen)
| Dimension | Assessment |
|---|---|
| Complexity | Medium: a client and a small server, both TypeScript |
| Cost | Free, local only |
| Scalability | Hundreds of pages per wiki and dozens of wikis with no index needed yet |
| Familiarity | House stack |

**Pros:** Radix as requested, matches every other app here, one language end to end.
**Cons:** More wiring than SvelteKit for server routes; the FOUMA wiki code can't be reused as-is (it's Svelte).

### Option B: Fork the FOUMA wiki (SvelteKit + Bits UI)
| Dimension | Assessment |
|---|---|
| Complexity | Low to start, high to generalize: FOUMA's game-specific sync, batches and roadmap are woven in |
| Familiarity | Proven on this machine |

**Pros:** Comments, anchors and a CLI already work.
**Cons:** Not Radix, not the house stack, and stripping the game-sync features is as much work as starting clean.
The ideas (text-quote anchors, CLI inbox loop, directive elements) were carried over instead.

### Option C: A static site generator (Astro, VitePress) per wiki
**Pros:** Great Markdown tooling.
**Cons:** Comments, live reload of agent edits, the deck and per-wiki themes all fight a build-per-site model.

## Consequences

- Easier: adding a wiki is a template copy; restyling one is a small JSON file; agents work with plain files and
  one CLI.
- Harder: themes can't do anything outside the contract. That's on purpose, and the contract can grow with new
  presets.
- Revisit: search may move to SQLite FTS if a wiki grows past a few thousand pages. (Code highlighting and JSON
  backups of comments, once listed here, are done: action items 3 and 4.)
- Pages carry planning metadata (`icon`, `status`, `tags`) and the app adds breadcrumbs, section cards and
  previous/next around them, so wikis can plan any project, not only games. Planning elements: stats, timeline, cards,
  gallery, progress.
- Sharing wikis publicly with other people (hosting, accounts, comments from many people) changes the local-only
  model above and needs its own ADR first: ADR-0003 (temporary share links through a tunnel, data stays on the
  host).

## Action Items

1. [x] Server, CLI, template, deck, wiki view, comments, `/dev/ui`.
2. [x] Search across a wiki's pages (Ctrl+P / "/" palette, jumps to the matching heading).
3. [x] Comment backups to JSON (`pnpm shiori backup` / `restore`, `<wiki>/backup.json`; answers included).
4. [x] Code highlighting (Shiki) in code blocks: on the server, once per render, with a theme of CSS variables
   (`--code-token-*`) mapped onto each wiki's tokens, so code follows the wiki's theme.

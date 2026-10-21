# ADR-0002: Wiki-website pages, links and universal elements

**Status:** Accepted
**Date:** 2026-10-21
**Deciders:** Nari (owner), Claude (implementer)

## Context

Shiori wikis now plan any kind of project: games, apps, a Shopify shop, a YouTube channel, research. Pages still read
like documents, not like a wiki website: there's no fact box beside the article, no way to see what links to a page,
no categories, no recent changes, and links are plain Markdown links that need exact paths.

The FOUMA wiki (`A:/Projects/Games/FOUMA/wiki`, ADR-0002, -0004, -0005 and -0007 there) has most of this, but built
for one game: fixed page types (item, boss, enemy…), game-only elements (drops, recipes, boss phases, item chips) and
a sync with the game's code. Shiori needs the same wiki feel with nothing tied to one domain.

Constraints from ADR-0001 still hold:

- Agents write pages as plain files; the app only writes comments (`data/wiki.db`) at runtime.
- One renderer and one set of components for every wiki. Themes are data and never change the layout.
- New elements follow ADR-0001's checklist: server element, component, `docs/elements.md`, template `AGENTS.md`, test.

## Decision

Adopt FOUMA's wiki features in three stages, each made domain-neutral: **page layout** first, then **links**, then
**elements**. Anything domain-specific becomes a free-text label or a generic element instead of a fixed type.

### 1. Page layout

The page keeps three columns (sidebar, article, rail with contents and comments). Around the article:

| Part | Decision |
|---|---|
| Infobox | Built from frontmatter: `image`, `caption`, and `infobox` (a map of label → value). It floats right at the top of the article, as on Wikipedia and Fandom, so the rail stays for contents and comments. Values are inline Markdown, so they can hold links, badges and progress bars. A page without these fields has no infobox |
| Page type | `type` is a free-text label ("Feature", "Product", "Video", "Guide"), shown in the infobox header and the page meta. No fixed list and no per-type layout: that would bind Shiori to one domain |
| Banner | `banner` (an image in `assets/`) turns any page head into a hero, like the home page's |
| Page setup | `toc: false` hides the contents for short pages. Other switches wait until a page needs them |
| What links here | Every page lists the pages that link to it, at the bottom |
| Categories | Tags are categories: a bar at the end of the article links each one to its category page |
| Last edited | A footer line: when the page file last changed, and its path (for the agent) |
| Special pages | Wiki-wide pages live under `/w/<wiki>/_/`, like Wikipedia's `Special:` (page files can't start with `_`, so they never clash): Recent changes, All pages, Categories, one Category, and later Wanted pages, Tasks, Questions |
| Home | Keeps its hero and adds "Recently updated" |
| Width | The article column is wide (`--page-width`, 1180px), like a wiki: it shares the row with the floating infobox, galleries and tables |
| Image viewer | Every picture (the infobox's, gallery tiles, images in the text) opens a full-window viewer: arrows and ← → step through pictures, and a strip below shows every picture in the wiki in reading order, grouped by page and labelled with its sections. It opens on your page, so its neighbours in the sidebar sit beside it, and stepping past a page's first or last picture carries on into the next page or section. The corpus collects the pictures (`/api/wikis/<id>/images`) |

**Corpus.** The server renders every page of a wiki once into an in-memory corpus, rebuilt when a page changes.
Pages, search, backlinks and the special pages all read from it, so they can never disagree. Nothing is written.

### 2. Links

| Part | Decision |
|---|---|
| Wikilinks | `[[Page]]`, `[[folder/page\|label]]`, `[[Page#Section\|label]]` (in tables, escape the bar: `\|`). The target is found by path from the root, then from the page's folder, then by file name, then by title, ignoring case and accents. Two pages that both match is a problem `pnpm wiki check` reports |
| Red links | A wikilink to a page that doesn't exist yet stays a link, styled as missing. It's a page worth writing, not an error; Special:Wanted pages lists them. A plain Markdown link to nowhere is still a problem |
| Hover previews | Pointing at any link to a page shows its icon, title, status, summary, first lines and image. They're read from the corpus's page index, which the client loads once per wiki |
| Heading links | Each `##`/`###` gets a link icon on hover that copies a link to it |

### 3. Universal elements

FOUMA's elements, made domain-neutral, plus a few that planning across domains keeps needing:

| Element | Use cases | Replaces in FOUMA |
|---|---|---|
| `::question{id}` with `questions:` in frontmatter | Any open decision: a mechanic, a price, a video title. Answered on the page (stored in `wiki.db`); unplaced questions collect in a panel and on Special:Questions | `::question`, `::suggestion` |
| `::related` with `related: [{to, kind}]` in frontmatter | Typed links with free-text kinds: "depends on", "part of", "competitor of", "inspired by" | `::relations` (game kinds) |
| `::children{layout=cards\|list}` | A list of the pages below, placed anywhere | `::children` |
| `::toc` | Contents inside the article, for long pages | `::toc` |
| `:status[active]` | An inline status pill, same values as `status` | `:status` (game statuses) |
| `:page[target]` | An inline chip for another page with its icon: a product, a character, a video, a person | `:item[]` |
| `:::steps` | Numbered how-tos: a setup guide, a recipe, an upload checklist, a workflow | `:::recipe`, `:::phases` |
| `:::compare` | Options side by side with pros and cons, for decisions | (new) |
| `:::quote{by source}` | A quote with who said it and where, for interviews and research | (new) |
| `::embed{url}` | A video or design from an allow-listed host (YouTube, Vimeo, Figma), for inspiration and references | (new) |

Not carried over: `:::drops` (a GFM table does it), `:stat[]{kind}` (`stats` and badges cover numbers), `:icon[]`
(emoji `icon` frontmatter covers it), game sync, game status, and the mob designer.

## Options Considered

### Option A: Universal layout and elements, free-text type (chosen)

| Dimension | Assessment |
|---|---|
| Complexity | Medium: a corpus, a handful of components, about ten elements |
| Cost | Free, local |
| Scalability | The corpus renders every page on change; fine to a few thousand pages |
| Familiarity | Same stack and element pipeline as ADR-0001 |

**Pros:** One layout fits every project. Agents learn one vocabulary. Every wiki gains every improvement.
**Cons:** No per-domain fields with validation (an item's rarity, a video's length): they're free-form infobox rows.

### Option B: Port FOUMA's typed model

Fixed page types with a schema and layout each.

| Dimension | Assessment |
|---|---|
| Complexity | High: a type system per domain, layouts per type |
| Familiarity | Proven in FOUMA |

**Pros:** Strong validation, rich per-type pages.
**Cons:** FOUMA's types are a game's. A shop or a channel would need their own sets, and every new domain means code.

### Option C: Each wiki defines its own types and fields

A `types.json` per wiki with fields, infobox rows and templates.

| Dimension | Assessment |
|---|---|
| Complexity | High: a schema language, validation, and UI driven by data |

**Pros:** Validated, domain-specific pages without code changes.
**Cons:** Heavy to build and for agents to keep consistent. It can come later as starter kits on top of Option A.

### Sub-decisions

- **Infobox placement.** Floating in the article, chosen over FOUMA's side column, because Shiori's rail already holds
  contents and comments, and floating is what readers know from Wikipedia and Fandom. On narrow screens it sits above
  the text.
- **Backlinks and index.** An in-memory corpus, chosen over SQLite tables (FOUMA): pages are files and the app
  shouldn't write anything derived from them.

## Trade-off Analysis

Option A gives up per-domain validation for reach: every project type gets the full wiki layout today, and a typo in
an infobox label costs nothing worse than an odd label. Option C remains open as a later layer (kits that pre-fill
`type`, `infobox` keys and templates), so choosing A doesn't block it.

## Consequences

- Easier: any page can look like a wiki article with a few frontmatter lines. Agents link with `[[Title]]` and
  never need exact paths. Readers move between pages through backlinks, categories and previews.
- Harder: the server renders the whole wiki on every change. If that gets slow, render only the changed page and
  re-derive the links.
- Revisit: per-domain kits (Option C) once a few real wikis show which fields repeat.

## Action Items

**Page layout**

1. [x] Frontmatter `type`, `image`, `caption`, `infobox`, `banner`, `toc`
2. [x] Corpus: every page rendered once; pages, search and backlinks read from it; `/api/wikis/:id/pages` index
3. [x] Infobox floating beside the article
4. [x] Banner hero on any page
5. [x] What links here, categories bar, last-edited footer
6. [x] Special pages: Recent changes, All pages, Categories, Category; sidebar Tools links
7. [x] Home: Recently updated

**Links**

8. [x] Wikilinks with resolution by path, file name and title
9. [x] Red links and Special:Wanted pages
10. [x] Hover previews
11. [x] Heading link icons

**Elements**

12. [x] `::question` (with answers in `wiki.db`), panel and Special:Questions
13. [x] `::related`, `::children`, `::toc`
14. [x] `:status[]`, `:page[]`
15. [x] `:::steps`, `:::compare`, `:::quote`, `::embed`

**Later**

16. [x] Page-level comments and a Discussion panel; Special:Tasks
17. [ ] CLI: `wiki new <kit> <page>`, `wiki rename` (`wiki backup` / `restore` done, ADR-0001)
18. [x] Wide article column; the image viewer with the wiki's pictures in reading order

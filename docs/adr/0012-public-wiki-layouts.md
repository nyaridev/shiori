# ADR-0012: The public wiki's layout, per wiki

**Status:** Accepted
**Date:** 2026-10-23
**Deciders:** Nari (owner), Claude (implementer)

## Context

The public wiki (ADR-0011) has one layout for every wiki: a header, the sidebar card on the left, the page as a 50rem
card, a footer bar, and a front page of name, banner, text and "Where to start" cards. Each wiki already changes its
**look** (`theme.json`: colors, three accents, corners, borders, shadows, fonts) and its **content** (`public` in
`wiki.json`: pages, front page, banner, logo, words). It can't change the **layout**.

Nari wants that to be editable per wiki, when a wiki wants it: a game's wiki for players may want a wider page, no
sidebar, a different front page (featured pages first, a big search, recent pages) or its mob pages arranged like the
app's mob layout. Wikis that say nothing keep today's layout.

What holds Shiori together and must keep holding:

- **Themes and layouts are data** (AGENTS.md rules 4 and 5, ADR-0006): presets, hex colors and a fixed set of blocks,
  never CSS, HTML or scripts from a wiki.
- **Nothing private leaves** (ADR-0011): the edition strips pages before any file is made; whatever a layout places
  must come from the stripped pages, never around them.
- **The public link is served by the guest server** (ADR-0003): an allowlist, a strict CSP, no API.
- **Agents write wikis through files** (ADR-0001): the app never writes a wiki's layouts at runtime.

## Decision

Extend ADR-0006's model to the public wiki. A wiki may describe its public layout in three layers, all optional, all
data, all checked by `pnpm shiori check`. Without them, the site is built exactly as today.

### 1. The frame: presets in `wiki.json` → `public.frame`

```json
"public": {
  "frame": {
    "width": "wide",
    "sidebar": "right",
    "backdrop": "/assets/night-sky.png",
    "cards": { "picture": "cover", "shape": "tall" },
    "footer": "Fan-made guide · not affiliated with Roblox"
  }
}
```

| Key | Values (default first) | What it changes |
|---|---|---|
| `width` | `standard` (50rem) · `narrow` (42rem) · `wide` (64rem) · `full` | The page card's width; the header follows it |
| `sidebar` | `left` · `right` · `none` | Where the sections card sits; with `none` it's the menu drawer phones already use, on every screen |
| `backdrop` | `slate` · `page` · `tint` · a picture path | Behind the cards: the slate of today, the theme's background, the accent washed in, or a public picture (it obeys `privateFiles`) |
| `cards.picture` | `contain` · `cover` | Section cards' pictures fit inside, or crop to fill |
| `cards.shape` | `square` · `wide` · `tall` | Their pictures' shape |
| `footer` | plain text, at most 200 characters | Shown in the footer bar beside the wiki's name; no HTML, no links |

Each value maps to classes and custom properties in `site.css`. A new preset is a Shiori change; choosing one is a
line in the wiki.

### 2. The front page: `layouts/front.json`

A layout with ADR-0006's shape (rows of named areas, a block in each), drawing the public front page. Only
**public blocks** can be placed:

| Block | Shows |
|---|---|
| `title` | The public name and tagline |
| `banner` | `public.banner`, across the card |
| `intro` | The front page's text (`public.front`), as it's drawn today |
| `section` | One `##` section of that text, by heading, so it can sit in its own area |
| `start` | A card per top section ("Where to start"): `style` `cards` · `list`, `columns` 2–6 |
| `pages` | Chosen public pages as cards (`pages: ["world/creatures/moss-fox"]`): a "Featured" box |
| `recent` | The public pages changed last, by their git date (`count`) |
| `search` | A large search box, the header's search in the page |
| `stats` | How many public pages each top section has |

```json
{
  "title": "Front page",
  "areas": [
    ["title", "title"],
    ["banner", "banner"],
    ["intro", "featured"],
    ["start", "start"]
  ],
  "blocks": {
    "title": { "type": "title" },
    "banner": { "type": "banner" },
    "intro": { "type": "intro" },
    "featured": { "type": "pages", "title": "This week", "pages": ["world/creatures/moss-fox"] },
    "start": { "type": "start", "columns": 4 }
  }
}
```

Areas stack in reading order on narrow screens, as in the app.

### 3. Page layouts on the public wiki: opt-in per layout

A page layout from ADR-0006 (`layouts/mob.json`) is drawn on the public wiki only when it says `"public": true`. Its
public-safe blocks are drawn (`body`, `section`, `infobox`, `gallery`, `related`, `children`, `toc`); app-only blocks
(`questions`, `suggestions`, `design`, `designs` and the home blocks) are left out and their areas close up. Layouts
without `public: true` keep drawing their pages as plain pages, as ADR-0011 does today, so existing public sites don't
change.

### Where it's built, and what keeps it safe

| Part | Decision |
|---|---|
| Schemas | `shared/layout.ts` gains the front page's block set and `public` on layouts; `shared/schema.ts` gains `public.frame`. Strict objects: unknown keys fail, as in `theme.json` |
| Drawing | `server/public/layout.ts` (new): areas into a CSS grid and each block as plain HTML from `html.ts`, like ADR-0011's elements. No React |
| Private things | Blocks read only the **stripped** pages and the set of public pages. `pages`, `recent`, `stats` and `start` skip anything private; `section` of a heading that was private is empty and its area closes; a picture backdrop goes through the same file rules as any picture |
| Checks | `pnpm shiori check`: a `pages` entry that isn't public, a `section` heading the front page lacks, a picture that's private or missing, a `front.json` with no `intro`, `title` or `start` (a front page that says nothing) |
| Seeing it | `pnpm shiori public <id>` and the Share dialog's summary name the frame and layouts in use; Preview shows them |
| Tests | `edition.spec.ts`: a featured private page, a private section, a private backdrop picture and app-only blocks never reach a file. `layout.spec.ts`: the public block set and its errors |

## Options Considered

### Option A: presets only (`public.frame`)

| Dimension | Assessment |
|---|---|
| Complexity | Low |
| Safety | High: values pick classes, nothing else |
| Freedom | Low: the frame changes, the front page and pages don't |

**Pros:** small, quick, can't leak or break. **Cons:** "a different front page" and "mob pages like in the app" stay
out of reach.

### Option B: layouts as data, three layers (chosen)

| Dimension | Assessment |
|---|---|
| Complexity | Medium: a block set and a grid in `server/public/`, reusing ADR-0006's schema and its rules |
| Safety | High: blocks read stripped pages only; no CSS or HTML from the wiki |
| Freedom | Medium–high: any arrangement of the blocks Shiori ships; a new block is a Shiori change |
| Familiarity | High: agents already write `layouts/*.json` and `theme.json` |

**Pros:** one idea across the app and the site; agents can write it; old wikis untouched. **Cons:** a block that
doesn't exist yet needs Shiori work; the blocks are drawn a third time (React in the app, HTML in the edition, already
the case for elements).

### Option C: a wiki's own CSS and HTML templates

| Dimension | Assessment |
|---|---|
| Complexity | Medium to build, high to keep: every change to the app's classes can break a wiki's CSS |
| Safety | Low: templates need a template language and escaping; CSS can pull outside resources or paint fake controls on the public link; private data is a template away |
| Freedom | Total |

**Pros:** anything goes. **Cons:** breaks rules 4 and 5, and the public link would serve what an agent wrote without
the owner seeing it. Rejected.

### Option D: export the data, build the site elsewhere

`pnpm shiori export <id> --json`: the stripped pages, their fields and pictures as JSON, for any static site
generator. **Pros:** total freedom without Shiori serving it, and no private data (it's the same edition). **Cons:**
a second project to keep; not "the wiki, edited". Not now; a good later addition for a wiki that outgrows the blocks.

## Trade-off Analysis

The real choice is between freedom and the two promises of ADR-0011: the site looks like the wiki, and nothing
private leaves. Option C buys the most freedom and gives up both. Option A keeps both and gives up most of what was
asked. Option B keeps both by making freedom a list of blocks and presets that grows: each one is reviewed once, in
Shiori, and then any wiki can arrange it. That's the same trade ADR-0006 made for the app, and it has held up there.

## Consequences

- **Easier:** a wiki changes its public site with a few lines of JSON, written by its agent; Preview shows it at once.
- **Harder:** each public block and preset is Shiori code with tests; `edition.spec.ts` grows a case per block that
  reads pages.
- **Revisit:** a visual editor for layouts in the app (it would write `layouts/`, which ADR-0001 rule 1 forbids at
  runtime today); Option D when a wiki needs more than the blocks.

## As built (2026-10-23)

- **Frame:** `frameSchema` in `shared/schema.ts`. `site.ts` puts the presets on `<body>` as `data-width`,
  `data-sidebar`, `data-backdrop`, `data-cards` and `data-card-shape` (preset names only); `site.css` reads them.
  `--pw-max` moved from `:root` to `body.pw`, so a width preset on the body reaches it. A picture backdrop is a
  `--pw-backdrop-image` rule at the end of the stylesheet, its file name percent-encoded; one that's missing or
  private falls back to the slate and is reported.
- **Front page:** `frontLayoutSchema` and `frontBlockSchema` in `shared/layout.ts`. `server/layouts.ts` reads
  `layouts/front.json` with that schema, only from the wiki itself (never the template's, so no wiki's front page
  changes unless it asks), and keeps it out of the page layouts; a page with `layout: front` is told why. The
  built-in front page is the same layout (`DEFAULT_FRONT` in `server/public/layout.ts`), so there's one way to draw it.
  `recent` uses each page's last commit date; it needed one more word, `recent` ("Recently updated").
- **Page layouts:** `public: true` on a layout. `PUBLIC_PAGE_BLOCKS` lists the blocks drawn; `closeUp()` lets the
  neighbours of a left-out or empty area grow over it while they stay rectangles, then drops empty and repeated rows
  and columns. The grid uses the app's `layout.css` (now in `APP_STYLES`) and the same inline `--areas` and
  `--columns` as the app; area names are checked, and the public link's CSP allows inline styles.
- **No example in the template's `layouts/`:** the template's layouts reach every wiki, so a `front.json` there
  would change every public site. The example is in the template's `AGENTS.md` instead.
- **Owner:** `pnpm shiori public` prints the layout in use; the Share dialog's summary says "Its own layout: …";
  `pnpm shiori check` reports a missing or private backdrop and a `pages` block naming a page that isn't public.
- **Tests:** `layout.spec.ts` (the block sets, closing up), `edition.spec.ts` (presets on the body and the footer as
  text, public and private backdrops, a front page that tries to feature, list and count private pages and a private
  section, a public page layout without its app-only blocks, a layout that isn't public).

## Action Items

1. [x] `public.frame` in `shared/schema.ts`; presets as attributes read by `site.css`; the shell in `site.ts`
2. [x] The front page's block set and `public` on layouts in `shared/layout.ts`, with `layout.spec.ts`
3. [x] `server/public/layout.ts`: the grid and the public blocks; the front page drawn from `layouts/front.json`
4. [x] Page layouts with `public: true` drawn on the public wiki, app-only blocks left out
5. [x] `shiori check` and `shiori public`; the Share dialog's summary names what's in use
6. [x] `edition.spec.ts` cases for every block that reads pages; docs in the template's `AGENTS.md`

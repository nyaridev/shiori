# ADR-0011: The public wiki: a read-only edition, exported or shared by link

**Status:** Accepted
**Date:** 2026-10-23
**Deciders:** Nari (owner), Claude (implementer)

## Context

A Shiori wiki is where a project is planned: roadmaps, questions, research, game code, unreleased content. For a game,
part of it is also what players want to read: the mobs with their health, damage and drops, the items, the places,
the story. Nari wants that part as a wiki of its own:

- **exported** as a `.zip` that is a static website, to put anywhere;
- or **always there** through a link, while Shiori runs, through the same Cloudflare tunnel as ADR-0003;
- **read only**: no comments, no questions, nothing that writes;
- **laid out as a reader's wiki** (a fandom wiki: header with search, a sidebar of sections, the page as a card, an
  infobox beside the text), not the app's planning layout, and without the home page or the roadmap;
- **sensitive things never leave**: whole pages, parts of pages, infobox fields, table columns and pictures can be
  marked private, and code snippets used in the game stay home.

## Decision

Build a **public edition**: the wiki rendered as plain static HTML files, one per public page, from the pages as the
app already renders them, with everything private taken out on the server before any file is made. The export zips
those files; the public link serves the very same files. No React app, no API, no comments reach readers.

### What goes public

**Everything is private unless a wiki says otherwise.**

| Where | Says |
|---|---|
| `wiki.json` `public.pages` | Page paths that go public, with `*` (one name) and `**` (any depth): `["mobs/**", "items/**"]` |
| A page's `public: true` / `public: false` | In, or out whatever `pages` says |
| Always out | The home page and panel pages (`panel: true`: the roadmap, dashboards). The public wiki has its own front page |
| `public.front` | A page whose text opens the front page; the front page adds a card for each section ("Where to start") |
| `:::private[note]` … `:::`, `:private[…]` | A block or words the app shows (dashed, "Not in the public wiki") and the public wiki leaves out |
| `public.privateFields`, a page's `private:` | Labels never shown: infobox rows, table columns (and rows whose first cell is one), stats, sheet columns |
| `public.privateFiles`, `private/` folders, `*.private.*` names | Pictures that never leave |
| `public.code` | Code blocks are left out unless it's `true`; diagrams and math stay |
| Always out of pages | Questions, suggestions, the live blocks (recent changes, open questions and tasks, discussions, directory), designs, roadmaps, page statuses, any element the public renderer doesn't know |
| Links | To a public page: a link in the site. To any other page (or a red link): plain text, so the sentence still reads. Cards and table rows that point to one are dropped |

Headings whose whole section was private go too. The owner sees what was left out (`GET /api/wikis/:id/public`,
`pnpm shiori public <id>`): the public pages, how many stay private, and counts of private blocks, code, questions,
fields, pictures and links taken out. `pnpm shiori check` reports `public` settings that name nothing.

### The site

| Part | Decision |
|---|---|
| Files | `index.html` (front), `<path>.html` per page (a section's page beside its folder: `mobs.html`, `mobs/lats.html`), `404.html`, `_site/` (stylesheet, scripts, fonts, the search index, the tab icon), `_media/` (pictures), `.nojekyll`. Every URL is relative, so the site works from a folder (`file://`), a zip, any static host and the link |
| Look | The app's own look in a reader's layout. The stylesheet bundles the app's CSS (`APP_STYLES` in `edition.ts`: tokens, base, primitives, header, sidebar, page, prose and the elements' sheets), the wiki's `theme.json` in both day and night and its fonts from the app's packages; `site.css` adds only the frame. The pages use the app's markup and classes (the page head, infobox, `##` sections that fold, section cards, the nav tree, data tables, code blocks), so a change to the app's look reaches the public wiki. The frame: a header with the wiki's logo or icon, name and tagline, search and the reader's switches; a sidebar of cards, each with a header that folds it (remembered per reader; the one holding the open page stays open): home and loose pages first, then a card per top section (a site that's one folder, `world/**`, starts at that folder's sections); the page as a card with its banner on top and infobox floating right |
| Caching | `_site/` and `_media/` are cached for five minutes; the stylesheet and scripts carry a hash of the site's own files after their URLs (`style.css?v=…`), so a new version is never read with an old stylesheet |
| Elements | Each one the public wiki keeps becomes plain HTML (`server/public/html.ts`): callouts, infoboxes, tabs, columns, details, spoilers, badges, stats, timelines, cards, icons, galleries, progress, related and children, contents, steps, compare, quotes, embeds, boxes, data tables, data sheets (the values in the file), diagrams (Mermaid, shipped only when used) and math (KaTeX's CSS, only when used) |
| Script | `_site/site.js`, small and dependency-free: search over `_site/search.js` (loaded on first use; titles and public text only), the page's scrollbar (the app's, drawn over the page so pages never shift), the menu on phones, day and night, spoilers (each, or all from the header), tabs, sections that fold, data tables that sort and filter as the app's, a picture viewer, diagrams. Every page reads the same without it |
| Pictures | Only public ones that a public page uses. SVGs as they are; others as WebP at most 1600 px wide, which also drops the camera's metadata |
| Words | English by default; `public.lang` and `public.words` say them in the wiki's language |
| Spoilers | New element `:spoiler[…]` / `:::spoiler[Title]`, in the app and the public wiki alike |

### Export, preview and the public link

| Part | Decision |
|---|---|
| Built | `server/public/edition.ts` from the wiki's rendered corpus, kept per corpus (so once per version of the pages), shared by both servers. Pictures are made when they're asked for |
| Preview | `GET /api/wikis/:id/public/site/…` on the owner's server: the same files, in the app's browser. Works in dev too |
| Export | `GET /api/wikis/:id/public.zip` (the Share dialog's Download .zip) and `pnpm shiori export <id> [--out f.zip \| --dir folder]` (by default into the wiki's `data/export/`). The zip holds one folder named for the wiki |
| Link | A new share kind, `public`, made in the Share dialog ("Public wiki"; it lasts until Shiori closes by default). Its URL is `/p/<token>/` on the guest server. The route serves only the edition's files and its 404 page: no name, no cookie, no API; a public token opens nothing under `/s/`, and other links' tokens open nothing under `/p/`. Same limits per address, CSP and headers as ADR-0003, plus `X-Robots-Tag: noindex`. The owner sees how many pages readers opened |

## Options Considered

### Option A: static HTML rendered on the server (chosen)

**Pros:** One build serves the zip, the preview and the link. Nothing private can reach a reader because no file
holds it, and no API exists to ask. Works without JavaScript, from `file://`, on any host; small and fast.
**Cons:** The elements are drawn twice: React in the app, HTML here. A new element needs both (AGENTS.md rule 5), and
one that isn't added yet is simply left out of the public wiki, which is the safe side.

### Option B: the app in a read-only guest mode

**Pros:** Every element for free. **Cons:** Ships the whole app and needs an API that knows what's private, route by
route; the export would need a server, or a second bundle reading JSON (which `file://` can't fetch). Private
data would only be a filter away from leaking. Rejected.

### Option C: React rendered to HTML at build time

**Pros:** Reuses the components. **Cons:** The components lean on the app's contexts, Radix and its hooks; they'd
need a separate server-side bundle, and the output still wouldn't be interactive without hydration. Rejected.

## Consequences

- **Easier:** a game's wiki for players is one setting away; it looks like the wiki, and it's safe by default.
- **Harder:** each element has a public form to keep up; `edition.spec.ts` checks that nothing private reaches a
  file, and a new private thing needs a case there.
- **Not done:** several languages at once (one wiki is one language; a second language would be a second wiki or a
  later decision); a named tunnel for a stable public address (ADR-0003's "Revisit"); layouts (ADR-0006) are drawn as
  plain pages in the public wiki (ADR-0012 lets a wiki change that, and its frame and front page).

## Action Items

1. [x] `public` in wiki.json, `public`/`private` in frontmatter; `:::private` and `:spoiler` elements
2. [x] The edition: what goes public, stripping, the static elements, the page shell, search, assets
3. [x] Preview and zip on the owner's server; `pnpm shiori public` and `export`; `check`
4. [x] Public links on the guest server, with tests
5. [x] The Share dialog: "Public wiki", what goes public, Preview, Download .zip, views

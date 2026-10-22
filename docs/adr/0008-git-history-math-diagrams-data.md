# ADR-0008: Git and page history, math, diagrams and data tables

**Status:** Accepted
**Date:** 2026-10-22
**Deciders:** Nari (owner), Claude (implementer)

## Context

Agents write a wiki's pages as files, and most wikis live in git, but the app showed none of that: nothing said
whether a wiki was committed or where its repo is, and a page's past was only reachable from a terminal. Pages also
couldn't hold a formula, a diagram, or a table people could sort and filter, which game wikis (mobs, items, loot) and
research or client wikis (prices, survey numbers) keep asking for.

What still holds: the app never writes a wiki's pages (ADR-0001), the guest server is an allowlist (ADR-0003), and
themes are data, so everything new takes its colors from the tokens.

## Decision

**Git, read only, on the owner's PC** (`server/git.ts`). A wiki "is in git" when its folder is inside a repo that
doesn't ignore it (a wiki in Shiori's own `wikis/` sits in the app's repo but is ignored there, so it isn't). Shiori
only reads: `rev-parse`, `remote`, `status`, `log --follow`, `cat-file`, with `GIT_OPTIONAL_LOCKS=0` so a read never
takes the index lock and never wakes the file watcher. It never commits, fetches or checks out; `wiki sync` stays the
CLI's. A change in a wiki's `.git` is its own live event (`git`), so a commit refreshes histories without rendering
the pages again.

**The badge** (`src/wiki/home/GitBadge.tsx`, `GET /api/wikis/:id/git`). The home page's bar shows the repo's name and
opens the wiki's folder on its host (GitHub, GitLab, Bitbucket, Codeberg/Gitea links), with how many files aren't
committed; a repo without a web remote says "Git · branch"; a folder outside git says "Not in git". Owner only:
guests never learn where the repo is.

**Page history** (`server/history.ts`, `src/wiki/history/`, `/w/<wiki>/_/history/<page>`, linked from "Updated …").
The page's commits come from `git log --follow` (so a rename doesn't cut its history), newest first, 200 at most; a
version is opened by its full hash, and only hashes from the page's own log open, so a URL can never read another
file of the repo. For a version the server sends what it changed (against the version before it in the page's log),
what changed since (against the file on disk), and the page as it was, rendered with today's wiki (`renderPage` with
the old text); the diff is ours (`shared/diff.ts`, Myers on lines, words marked inside changed lines), so the same
code compares a commit, the working copy and "since then". Uncommitted changes show as a first entry. The old page is
read-only (`PageInfo.readOnly`): no answers, comments or section feedback that would land on today's page.

Guests get history too, read-only, on view and comment links (`/s/<token>/api/wikis/:id/history…`): the same
handlers, behind the link check, the wiki check and the read limit. They see subjects, authors' names and dates,
never e-mail addresses, remotes or paths in the repo.

**Math** (`server/markdown/math.ts`). remark-math with `singleDollarTextMath: false`: `$$…$$` inside a sentence or
on lines of its own, and ```` ```math ```` fences; a lone `$` stays a dollar sign, because wikis talk about prices.
KaTeX typesets on the server into HTML and MathML, so the browser only loads KaTeX's stylesheet and fonts. A formula
KaTeX can't read is a page problem and renders as its error. Search reads a formula's TeX (`data-tex`).

**Diagrams** (`code.ts` → `sh-diagram`, `src/wiki/markdown/Diagram.tsx`). A ```` ```mermaid ```` fence is drawn by
Mermaid in the browser (it needs a DOM), loaded only when a page has a diagram, with `securityLevel: "strict"`. Its
theme comes from the tokens: each one is resolved by painting a pixel, since tokens are often `color-mix()`, which
Mermaid can't read. It draws again when the theme or day/night changes. `wiki check` can't parse Mermaid, so a broken
diagram shows its error on the page only.

**Data tables** (`server/markdown/tables.ts`, `src/wiki/markdown/DataTable.tsx`). `::table{src}` reads a CSV, TSV or
JSON file from the wiki (`tables/` by convention, never `data/`), `::table{pages}` makes a row per page from each
page's own facts (infobox rows and frontmatter keys Shiori doesn't use), and `:::table` wraps a Markdown table. The
server always emits an ordinary table, so search, comments and `wiki check` see the rows; the app sorts (numbers as
people write them: `1,200`, `40%`, `$9.99`, `2.5k`), filters (`hp>20`, `biome:forest`) and adds a foot of stats over
the rows shown. It reorders the table's own rendered rows, so links and elements in cells keep working. Rows are read
when the page renders, so editing a data file or a page's fields updates every table that uses it.

## Options Considered

- **History from the file watcher** (snapshots in `data/`): works without git, but duplicates what git already
  keeps, breaks Rule 1's spirit (a second copy of the pages), and differs between PCs. Rejected: history is git's.
- **`git diff` output instead of our own diff**: one less piece of code, but renames, the working copy and "since
  then" each need a different invocation, and its output needs parsing anyway. Our diff takes two texts.
- **Math with `$…$`**: the GitHub habit, but "$5 and $10" would become math on every price list. `$$` inline costs
  one more character.
- **Diagrams rendered on the server**: Mermaid needs a browser (Puppeteer); too heavy for a local app.
- **A data-table element that ships JSON to the client**: simpler sorting, but the cells would lose Markdown
  (links, badges), search and comments. Reordering the rendered rows keeps all of it.

## Consequences

- Wikis that aren't in git get a "Not in git" badge and an empty History that says why.
- Every page's "Updated …" is now a link to its history. Its time is the page's last commit when the file has nothing
  uncommitted (or the file's time, if that's earlier), so a clone or a pull doesn't make every page look changed;
  otherwise it's the file's. One `git log` and one `git status` a wiki, each time its pages are rendered.
- Mermaid adds about 1.5 MB to the build, all in chunks loaded on the first diagram.
- Sorting or filtering a data table moves its rows, so a comment's highlight inside one can drift until the page
  renders again.
- Template changes (math, a diagram, tables, `tables/`) reach new wikis only; existing wikis can copy them.

## Action Items

- [x] Git badge, history routes on both servers with tests, history page
- [x] Math, diagrams, data tables, with `docs/elements.md` examples and the template's `AGENTS.md`
- [x] "Updated" from the last commit instead of the file's time, for wikis cloned to a second PC

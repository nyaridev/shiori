# ADR-0010: Test boards, data sheets, and one menu on every card

**Status:** Accepted
**Date:** 2026-10-23
**Deciders:** Nari (owner), Claude (implementer)

## Context

A wiki describes a game, but the people who help with a game aren't only readers. Nari wants two new kinds of share
link and a tidier comment card:

- **Testers** play the game and report bugs and changes. They need a small page to write reports, with pictures and
  GIFs, and no wiki content at all. Some boards are open (testers see everyone's reports), some private (each tester
  sees only their own, so ten people can be asked separately).
- **Data editors** tune numbers: the health and attack of every mob, say. An agent prepares the table; Nari shares
  only that table, and the people who join may change values if the link allows it. Changes are saved on the host
  and checked there, because a link is public and some visitors will try to break it.
- **The comment card** shows its actions (reply, resolve, remove) as a row under the open card. They move into one
  "⋯" menu in the card's top right corner, with **edit** added, and each person may only change what they wrote.

ADR-0001's rule still holds: the app writes only into a wiki's `data/` (and `designs/`), never into its pages or
files. ADR-0003's still holds too: the guest server is an allowlist, and every guest route gets tests and a review.

## Decision

### 1. One menu on every card

Every comment card, in the rail and in the Changes panel, has a **⋯ button** in its top right corner. It lists what
this viewer may do and nothing else:

| Item | Who |
|---|---|
| Reply | Anyone who may comment, on an open thread. Opens the reply box (it's no longer always shown) |
| Edit | The author of the first message: the owner their own, a guest their own. Never the agent's words, never someone else's |
| Resolve / Reopen | The owner on any thread; a guest on the threads they started |
| Hide from guests / Show again | The owner, on a thread a guest started |
| Remove | The owner on any thread; a guest on the threads they started (rail comments too now, not only changes) |

Replies get a smaller ⋯ on the message itself: Edit for its author, Hide for the owner on a guest's reply. The owner
never rewrites guests' words; they hide or remove them.

**Editing** keeps the message's place and marks it `edited`. Migration 9 adds `edited_at` to `messages`; an edit moves
`updated_at`, so sync and backups carry the new text (newer wins, as for hidden flags and reactions).

| Route | Server | What |
|---|---|---|
| `PATCH /api/wikis/:id/messages/:mid` `{ body }` | owner | Edit one of the owner's messages (`{ hidden }` still hides a guest's) |
| `PATCH /s/:token/api/wikis/:id/messages/:mid` `{ body }` | guest | Edit one of the guest's own messages, on a visible, open thread |

### 2. Test boards

A **board** belongs to a wiki and lives in its `data/wiki.db`, so it outlasts the links to it (links stay in memory
and end with the app, as in ADR-0003).

- **Board**: a name, **Global** (testers see every report on the board, read-only) or **Private** (each tester sees
  only their own), open or closed (a closed board keeps its reports and takes no new ones).
- **Report**: a kind (**Bug**, **Change**, **Idea**), a title (120 characters), details (4 KB), up to four pictures
  (PNG, JPEG, WebP or GIF, 6 MB each, the attachment rules of ADR-0007), the author, and a status the owner or an agent
  sets: **New**, **Planned**, **Fixed**, **Won't fix**, **Duplicate**, with an optional note the tester sees ("Fixed in
  0.4"). Testers edit and remove only their own reports. Nothing is deleted: removing marks the report.
- **The owner** sees every board at `_/boards` (a special page): all reports, filtered by kind and status, sets
  statuses and notes, hides and removes. A board's **Share** makes a tester link.
- **Agents** read them with `pnpm shiori reports <id> [board]` and answer with `pnpm shiori report <id> <n> --status
  fixed --note "…"`. Reports are untrusted input, like comments (the template's `AGENTS.md`).

A **tester link** is a new link kind, `board`, for one board. Its guests get a page with only the board: its name, the
wiki's title and theme, the report form, and the reports they may see. Every wiki route answers `404` on it, and a
board route answers `404` on every other kind of link.

### 3. Data sheets

A **sheet** is a file the agent writes in the wiki, `sheets/<name>.json` (the app never makes or changes one):

```json
{
  "title": "Mobs",
  "description": "Base stats, before level scaling.",
  "key": "id",
  "groupBy": "biome",
  "columns": [
    { "id": "id", "label": "Id", "type": "text" },
    { "id": "name", "label": "Mob", "type": "text" },
    { "id": "biome", "label": "Biome", "type": "choice", "options": ["forest", "cave"] },
    { "id": "health", "label": "Health", "type": "number", "min": 1, "max": 100000, "step": 1, "unit": "HP", "editable": true },
    { "id": "boss", "label": "Boss", "type": "bool", "editable": true }
  ],
  "rows": [{ "id": "slime", "name": "Slime", "biome": "forest", "health": 20, "boss": false }]
}
```

- **The file's values are the defaults.** People's edits are saved in `data/wiki.db` (`sheet_edits`: the cell, the new
  value, who, when), never in the file. A cell's value is its latest edit, or the default.
- **Every editable cell shows its default** beside the input ("default 20", in the column's type), with a **Reset**
  that sets it back. The sheet's **History** lists each change (who, when, from, to); the owner can undo one, or every
  change a guest made.
- Pages place a sheet with `::sheet{name="mobs"}`; it also has its own page at `_/sheets/<name>`. The owner edits it
  in the app and shares it from there.
- **To the game**: `pnpm shiori sheet <id> <name>` prints the current values and what changed since the last export;
  `pnpm shiori sheet export <id> <name> [--json <file>] [--luau <file>] [--apply]` writes them out. `--apply` makes the
  current values the file's new defaults (the CLI writes files; the app doesn't) and marks those edits exported.

A **sheet link** is a new link kind, `sheet`, for one sheet, **view** or **edit**. Its guests get a page with only
that sheet: no wiki, no other sheets, no comments.

### Checks on every sheet edit

The server is the only judge of a value, since anyone can send any request:

- The sheet, the row and the column are looked up in the agent's file: the row by its key among the file's rows, the
  column among its columns with `editable: true`. Names are matched exactly, through maps, never as object keys
  (`__proto__` is just a missing row).
- The value must fit the column: a **number** is finite, within `min`/`max`, on the `step` (integers by default), at
  most 1e12; **text** is at most `maxLength` (200 by default) with no control characters; a **choice** is one of its
  options; a **bool** is a boolean. `null` resets to the default. Anything else is `400`, and nothing is stored.
- An edit names the version of the cell it started from; if someone changed it meanwhile, it's `409` with the current
  value, so nobody overwrites a change they never saw.
- Sheet edits have their own limits: 60 a minute and 1,000 a day per guest, 3,000 a day per link. Going over is a
  `429` and counts toward ADR-0003's strikes, which block the guest and their address.
- Exports write values, never code: the Luau writer quotes every string and key (`["key"]`, escaped), writes numbers
  only when they're finite, and rejects anything else, so a value can't become code in the game. The JSON writer uses
  `JSON.stringify`.

### Allowed routes, by link kind

| Route | `view` | `comment` | `board` | `sheet` (view) | `sheet` (edit) |
|---|---|---|---|---|---|
| The wiki's routes (ADR-0003, 0005–0009) | ✓ | ✓ | 404 | 404 | 404 |
| Edit your own message | | ✓ | | | |
| The board: read it and the reports you may see | 404 | 404 | ✓ | 404 | 404 |
| Write, edit or remove your own report; pictures for it | | | ✓ | | |
| The sheet: read it, its values and its history | 404 | 404 | 404 | ✓ | ✓ |
| Change a value | | | | | ✓ |

Every route still checks the link first (exists, not expired, right wiki), then the guest's name, then its kind.

## Options Considered

- **Boards as pages with comments.** A board would be a page and reports its Changes. Rejected: testers would need
  wiki access, and private boards would need per-person comments everywhere.
- **Visibility per link instead of per board.** More flexible, but one board would show different reports to
  different links, and "who saw what" gets hard to explain. Per board; make a second board for a second group.
- **The app writing sheet values into the file.** Simpler for agents, but breaks ADR-0001, loses who changed what,
  and lets a guest's input reach a committed file without an agent looking at it. Edits stay in `data/`; an agent
  exports.
- **Edits waiting for the owner's approval.** Safest, but slow for tuning numbers. Edits apply at once and keep their
  history and defaults, so any change can be undone; a link can be view-only.

## Consequences

- Shiori gets two more public surfaces. Both are allowlists in their own files (`server/sharing/boards.ts`,
  `server/sharing/sheets.ts`), each with a security review below.
- `data/wiki.db` gains `boards`, `reports` and `sheet_edits`; backups and sync carry them by uid.
- Template changes (`sheets/`, the `AGENTS.md` rows) reach new wikis only.

## As built

| Part | Decision |
|---|---|
| Code | Server: `boards.ts` + `boardRoutes.ts` (owner), `sheets.ts` + `sheetRoutes.ts` (owner), `sharing/kit.ts` (what the guest server lends), `sharing/boards.ts` and `sharing/sheets.ts` (guests). `shared/sheet.ts` holds the file's schema and `checkValue`, used by server, CLI and app. Client: `src/boards/`, `src/sheets/`, `src/comments/ThreadCard.tsx`, `src/lib/usePictures.tsx`. CLI: `cli/boards.ts`, `cli/sheets.ts` |
| Database | Migration 9 `messages.edited_at`; 10 `boards`, `reports`; 11 `sheet_edits`. Backups and sync files gain `boards`, `reports` and `sheetEdits` (older files load with none). A cell's latest change is the newest by time, so a change merged from another PC lands in its place |
| Links | `Share` gains `target` (`{ id, title }`) and `edit`. The owner's `POST /api/shares` takes `target` (a board's uid, a sheet's name) and `edit`; a closed board or an unreadable sheet can't be shared. The Share dialog, opened on a board or a sheet, makes only its links |
| Guests | `wikiOnly` refuses board and sheet links, so every wiki route (pages, search, comments, presence, designs, history, changes) is `404` for them. Board routes live at `/s/<token>/api/board/…`, sheet routes at `/s/<token>/api/sheet/…`, each behind `only(kind)`. Their pages poll their own `changes` route |
| Sheets in pages | `::sheet{name}` is editable for the owner; on a wiki link it says the sheet is shared by its own link |
| Owner's pages | Tools → Test boards (`_/boards`, `_/boards/<uid>`) and Data sheets (`_/sheets`, `_/sheets/<name>`), with drawn `bug` and `table` icons |

### Security review: editing messages

- Guest route behind `wikiOnly` and the `write` chain: comment links only (`403` on view links), this site's `Origin`,
  the body limit and the write limits (an edit is a write).
- The message must be in a thread the guest can see (`404` for hidden, removed, missing or another wiki's) and be the
  guest's own by guest id (`403`); the thread must be open (`409`). The body has the comment's size limit.
- The owner edits only `author = 'user'` messages: never a guest's or an agent's words (`403`).
- Tests in `guest.spec.ts` (editing a message) cover each case.

### Security review: board links

- `only("board")`: a board route answers `404` to view, comment and sheet links, and needs a guest with a name
  (`401`). The board comes from the link, never from the request, so a tester can't name another board or wiki.
- Writes: this site's `Origin`, the body limit and the write limits; refused tries count too. Kinds come from a fixed
  list, sizes are capped (title 120 characters, details 4 KB, four pictures), unknown fields are `400` (strict
  schemas: a tester can't set a status or a note). A closed board takes nothing (`409`).
- Ownership: a tester changes and removes only reports they wrote and can see (`403`/`404`); on a private board
  another tester's report doesn't exist for them (`404`). Responses never carry guest ids or the hidden flag.
- Pictures: the attachment checks of ADR-0007 (types by header and bytes, never SVG, size, the daily byte budget,
  server-made names); one is served only when a report the tester can see carries it.
- Tests in `boards.spec.ts` cover each of these, plus expiry (`410`), wiki routes on a board link and board routes
  on a wiki link.

### Security review: sheet links

- `only("sheet")` as above; the sheet comes from the link. A view link changes nothing (`403`).
- Every value is judged by the server against the agent's file: the row by key and the column by id are found through
  maps (`__proto__`, `constructor` are just missing: `404`), only `editable` columns change (`403`), values must fit
  their column (type, range, step, length, options, one line of text; finite numbers up to 1e12), and the body is a
  strict schema. Nothing that fails is stored.
- A change names the cell's version; a stale one is `409` with the current cell, so nobody overwrites what they
  didn't see. Each change keeps who, when, from and to; the owner can undo one or all of one guest's.
- Limits: 60 changes a minute (bursts of 30), 1,000 a day per guest, 3,000 a day per link; every try counts, refused
  ones too, and `429`s count toward the strikes that block a guest and their address.
- Values never become code: the Luau export quotes every string and key and escapes quotes, backslashes and control
  characters; the JSON export uses `JSON.stringify`. The CLI reminds the agent to look at people's values first.
- Tests in `sheets.spec.ts` and `server/sheets.spec.ts` cover each of these.

## Action Items

1. [x] The card menu, editing messages (migration 9, both servers, sync and backup), rights in one place
2. [x] Boards and reports: storage, owner routes, `_/boards`, the CLI, the tester link and page, tests, review
3. [x] Sheets: the file's schema, `::sheet`, `_/sheets/<name>`, edits with defaults and history, the sheet link,
       export to JSON and Luau, tests, review
4. [x] The toolbox moves to the header, and the CLI is `pnpm shiori` (addendum below)

## Addendum: the toolbox in the header, and `pnpm shiori`

- **The toolbox is the host's, in its own tab.** The sidebar's Toolbox tab and the `_/kits`, `_/elements`,
  `_/fields`, `_/icons` and `_/special` pages are gone. A Toolbox button in the wiki header, shown only to the host,
  opens `/toolbox/<wiki>/<entry>` in a new tab, in that wiki's theme, in two parts: the app's Design system on a
  page of its own (tokens, primitives, icons, page elements and screens: what `/dev/ui` was), then what the wiki's
  pages can use: Page kits, Elements, Page fields, Icons and Special pages. A toolbox is always one wiki's: `/toolbox`
  and `/dev/ui` lead to the deck, and the old theme preview is gone. So the new tab never flashes the default
  colors, the button saves the wiki's name, theme and on-screen colors in this browser first
  (`src/toolbox/open.ts`); `public/assets/toolbox-theme.js`, loaded in `<head>` before the app, paints those colors,
  and the toolbox draws its first frame from them while the wiki loads. That script is a static file under
  `/assets/`, which the guest server already serves, so its `script-src 'self'` allows it. The guest server lost its toolbox
  routes (`kits`, `elements`, `toolbox/*`): guests never see the toolbox, so they don't need them (ADR-0003's table
  says so).
- **The agent CLI is `pnpm shiori <command>`** (`cli/shiori.ts`), named after the app. `pnpm wiki` was removed
  rather than kept as an alias: nothing outside this repo calls it yet.
- **Test boards, visually:** the board list shows each board's progress; a board opens on what's still to do, with
  tiles that filter by status, chips by kind, and reports as rows that open to the details, pictures and triage. The
  tester page leads with the board and three cards to pick the kind of report; open reports list before finished ones.

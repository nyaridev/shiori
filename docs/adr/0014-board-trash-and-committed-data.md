# ADR-0014: The boards' trash, and a committed `data/`

**Status:** Accepted
**Date:** 2026-10-23
**Deciders:** Nari (owner), Claude (implementer)

## Context

- **Boards pile up.** ADR-0010 deletes nothing: a board can only be closed, so an old or test board ("testing")
  stays in the list for good. Nari wants a trash: boards moved there disappear on their own after 30 days, and can be
  deleted at once, with a confirmation.
- **`data/` was never committed.** `dataDir()` wrote a `.gitignore` of `*`, and the template added `data/` to the
  wiki's own `.gitignore`. Comments, answers, boards, reports and sheet edits lived only on one PC, unless someone ran
  `pnpm shiori backup`. Nari wants `data/` in git with the wiki.

## Decision

### 1. The boards' trash

- **Move to trash** (the ⋯ menu in the top right of a board's card on `_/boards`, `PATCH … { trashed: true }`,
  `pnpm shiori boards <id> trash <board>`) sets
  `boards.trashed_at` (migration 12). A trashed board leaves the list for the **Trash** section under it, takes no
  reports, its links answer `404` (the guest routes treat it as missing), and it can't be shared (`409`).
  **Restore** clears the date; the board is as it was, closed or open. Trashing twice keeps the first date.
- **After `BOARD_TRASH_DAYS` (30)**, Shiori deletes it for good when it starts, and once a day while it runs
  (`purgeExpired`, only for wikis that already have a database).
- **Delete now**, in the trash or on the trashed board's page, asks first ("Delete … and its N reports for good?
  Pictures go too. This can't be undone."). `DELETE /api/wikis/:id/boards/:bid` works only on a trashed board
  (`409` otherwise), so one click on an open board can't lose it.
- **Deleting for good** removes the board's row and every report on it (removed ones too), and their pictures in
  `data/attachments/` unless a comment or another report still uses one. Agents never do it: the CLI can trash and
  restore, not delete.
- **Sync and backups remember what was deleted.** Table `purged` (uid, kind, when) lists the board and its reports.
  Backups and sync files carry it as `purged`; a merge deletes those uids here and never adds them again, so an older
  sync file or backup doesn't bring a board back. Boards carry `trashedAt` (older files: none), newer change winning.

### 2. `data/` is committed

- `data/.gitignore` (`DATA_GITIGNORE` in `server/paths.ts`) now keeps out only what belongs to one PC or is made
  again: `machine.json` (this PC's sync id: a second PC with the same one would write the same sync file),
  `wiki.db-wal` and `wiki.db-shm` (half-written database state), `*.tmp`, `cache/` and `export/`. `wiki.db` and
  `attachments/` are committed.
- New wikis get it from `copyTemplate`; the template's own `.gitignore` (only `data/`) is gone. A wiki with the old
  `*` gets the new one the next time Shiori opens its `data/`; a hand-made one is left alone.
- **The committed file is whole.** SQLite in WAL mode keeps recent changes in `wiki.db-wal`. Shiori checkpoints every
  open database every 30 seconds and on closing (`checkpointAll`), so `wiki.db` holds every change by the time it's
  committed.
- `backup.json` stays: readable text of the same data, and the way to load it into an empty database.

## Options Considered

- **Deleting a board at once, no trash.** Simple, but one click loses every report. The trash gives 30 days.
- **Committing all of `data/`.** As asked first, but a second PC would share `machine.json` and break `shiori sync`,
  and a committed `-wal` file can leave a database that doesn't open cleanly. Rejected for those files only.
- **Keeping `data/` out of git, with `backup.json` only.** Safe for two PCs, but the data stays on one PC unless
  someone remembers the backup. Rejected; it stays the advice for a wiki on two PCs (below).

## Consequences

- A wiki on **two PCs** can't merge `wiki.db` in git (it's binary): both PCs committing it conflict on every pull.
  Such a wiki uses `shiori sync` and adds `wiki.db` and `attachments/` to its `data/.gitignore` (the template's
  `AGENTS.md` says so).
- A board deleted for good is gone from git history's future commits only; older commits still hold it, as for any
  file. Testers' names and pictures are in the repo with the wiki, which should stay private.
- Don't pull or switch branches while Shiori has the wiki open: git would replace `wiki.db` under the open
  database. Close Shiori first.
- The rules that said `data/` is never committed (AGENTS.md rule 1, ADR-0001's storage table, ADR-0004's cache note,
  the template's `AGENTS.md`) now point here.

## As built

| Part | Decision |
|---|---|
| Database | Migration 12: `boards.trashed_at`, table `purged (uid, kind, purged_at)` |
| Server | `boards.ts`: `updateBoard({ trashed })`, `deleteBoardRows`, `removePictures`, `purgeBoard`, `purgeExpired`, `purgeDate`, `listPurged`; `boardRoutes.ts`: `DELETE /:bid`; `sharing/boards.ts` and `app.ts` treat a trashed board as gone; `main.ts` empties the trash at start and daily, and checkpoints every 30 s; `threads.ts` `checkpointAll`; `paths.ts` `DATA_GITIGNORE`, `ensureDataGitignore`; `template.ts` makes `data/` for a new wiki |
| Backups and sync | `boards[].trashedAt`, `purged`; restore with `--replace` clears `purged` too |
| App | `src/boards/Trash.tsx` (the trash, Restore, Delete now asked twice); each card's ⋯ menu in `Boards.tsx` (Move to trash); a trashed board's banner on `BoardPage.tsx` (Restore, Delete now) |
| CLI | `pnpm shiori boards <id>` lists the trash with each board's date; `boards <id> trash\|restore <board>` |
| Tests | `server/trash.spec.ts`; the trash's routes in `server/sharing/boards.spec.ts` |

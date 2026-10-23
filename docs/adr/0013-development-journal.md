# ADR-0013: The development journal

**Status:** Accepted
**Date:** 2026-10-23
**Deciders:** Nari (owner), Claude (implementer)

## Context

A wiki often describes a project that's being built at the same time: a game's items, creatures and numbers. Two
things go wrong when the agents building it also keep the wiki current:

- **The wiki churns.** Every balance tweak and half-finished feature rewrites pages that readers (and the public wiki)
  see, before the change is settled.
- **Changes get lost.** A session focused on code forgets the wiki, and nothing records what it changed.

Nari wants the agents building a project to leave the wiki alone and keep a record instead, which an agent later
turns into pages when asked, checking each change against the project's code and data first. The record has to
travel with the wiki, grow with the project (what to record for a Roblox game isn't what to record for an app), and
reach the agents building the project, whose sessions are opened on the project, not the wiki.

## Decision

Every wiki has a **development journal**: `JOURNAL.md` (its rules) and `journal/` (its entries), both written by
agents, never by the app.

- **Entries are Markdown files**, one per change: `journal/<day>-<what-changed>.md`, with frontmatter (`title`,
  `date`, `status` open, merged or dropped, `kind`, `version`, `commit`, `pages`, `files`) and a body written for the
  agent who merges it: what changed, where in the code, how to check it, what the wiki should say. `shared/schema.ts`
  has the format; `pnpm shiori check` validates entries and `pnpm shiori journal <id>` lists the open ones.
- **`JOURNAL.md` holds both sides' rules**: when to write an entry, and how to merge (verify against the project, then
  change pages, add the History line, mark merged, look for changes nobody wrote down in the git log since **Last
  merged**). Its "What this project records" list starts short and grows as merging shows what entries lack.
- **The project's `CLAUDE.md` connects them.** Claude Code loads the `CLAUDE.md` files from a session's folder up to
  the drive, and a subfolder's only when it touches a file there; a sibling folder's never. A game home's `wiki/`
  is a sibling of `game/`, so the wiki's own rules never reach a session on the game. Making a wiki for a project
  adds a short `## Wiki` section to the project's `CLAUDE.md` (the rule in two lines, then `@wiki/JOURNAL.md`), so
  every session on the project has it. A session opened outside the wiki's folder asks once to allow the import;
  the two lines carry the rule if it's declined.

### Incoming changes

Answers to questions and suggestions follow the same idea. Deciding one no longer changes the page's text (as
ADR-0007 had it): what the answer asks for goes into the page's `## Incoming changes`, a `:::private` list of tasks
(so Special:Tasks shows them and the public wiki never does), until it's built. When the owner asks to build them
without saying which first, the agent proposes an order, grouped by the system they change, and waits for a yes. In a
project, building them goes through the journal like any change; merging the entry writes it into the page and takes
the item out. A wiki with no project builds them by writing the page.

## Options considered

**One SQLite file.** Queryable, one place. But every write needs a tool, entries can't be read or reviewed in a diff,
two sessions writing at once need locking, and a binary file in git merges badly. Rejected.

**One Markdown file, appended to.** Easy to read, but sessions running at once collide on it, merged entries pile up
in the way, and marking one merged means editing the middle of a long file. Rejected for a file per entry.

**Agents update the wiki as they go.** What Nari wants to avoid (above).

## Consequences

- **Easier:** the wiki changes only when the owner asks; nothing a session changed is forgotten; merging checks the
  project, so a stale or wrong entry doesn't reach a page.
- **Harder:** the wiki lags the project until a merge, by design. The project's `CLAUDE.md` must keep its `## Wiki`
  section; `pnpm shiori journal` and the git log since **Last merged** catch what slipped through.
- Template change: new wikis get `JOURNAL.md`. An existing wiki that wants a journal needs it copied in from
  `wikis/_template/`.

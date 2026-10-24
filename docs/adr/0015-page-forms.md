# ADR-0015: Page forms, tabs the owner fills in for the agent

**Status:** Accepted
**Date:** 2026-10-23
**Deciders:** Nari (owner), Claude (implementer)

## Context

- **Writing everything in a prompt is slow.** For a character, a creature or a place, the owner knows the lore, the
  look, the abilities and the numbers, and today has to type all of it into a chat for the agent to turn into a page.
  Nari wants to sit down and fill it in on the page itself, at their own pace, and have the agent read it.
- **Each kind of page wants its own fields.** Every character should get the same form, creatures a different one,
  and a form may be shared by several sections. Which kinds get one is up to the owner: the agent adds a form when
  asked.
- **It's the owner's workspace, not the wiki.** What's written there is raw material: it must never reach guests or
  the public wiki (ADR-0003, ADR-0011), and the page stays what the agent writes.

## Decision

### 1. Forms are files, like layouts

- `forms/<name>.json` in a wiki (`shared/form.ts`, checked by zod): a `title` (the tab's name), an optional
  `description` and `order`, the pages it's on, and `fields`, placed in a grid of `areas` exactly like a page layout
  (ADR-0006; `checkAreas` is shared). Without `areas`, the fields go one under another.
- **Which pages:** `pages` takes a page's path (`world/characters/wren`), every page right under a section
  (`world/characters/*`), or every page below it however deep (`world/creatures/**`); `types` takes pages by their
  frontmatter `type`. A form may name several, so sections can share one, and a page can have several forms.
- **Fields:** `line`, `text` (`rows`), `number` (`min`, `max`, `unit`), `choice` (`options`, `multiple`), `check`,
  `pictures` (`max`, each with a caption), and `list`: entries that repeat (abilities, drops) with fields of their
  own (any but another list) in their own `areas`. Each has a `label`, an optional `hint` and `placeholder`.
- Only the wiki's own forms count: a form names the wiki's pages, so the template's would mean nothing elsewhere. The
  template ships two (`character`, `creature`) for its example pages; `shiori new` copies them.
- `shiori check` reports broken files, and patterns or types that take in no page.

### 2. Tabs under the page's head

- On a plain page (not the home page or a panel page) with forms, the head ends in tabs: **Page** first, always, then
  each form, with a lock: only the owner sees them. The open form is `?view=<form>` in the URL.
- Under a form, the page stays in the DOM, hidden, so its comments keep their anchors.
- **Saving as you go:** text a moment after the last key or on leaving the field, everything else at once; what's
  waiting goes out on leaving the form or closing the page (`keepalive`). The form says "Saving…", "Saved", or what
  went wrong, and whether the agent has read the latest changes.
- Pictures go to `data/attachments/` through the comments' upload route (ADR-0007), and the field keeps their file
  names and captions.

### 3. Stored per field in the wiki's database

- Migration 13: `form_values (page, form, field, value, updated_at)`, one row per field, the value as JSON. A cleared
  field is kept as `null`, so clearing reaches other PCs too. `form_reads (page, form, read_at)` remembers when the
  agent last read each page's form.
- Values are checked against the field on the server (`valueSchema`): types, ranges, options, lengths, a list's
  entries trimmed to its fields, pictures that are this wiki's attachments. The form must be on the page (`409`
  otherwise) and have the field.
- **Nothing is lost when a form changes.** A form that leaves a page (a changed `pages`, a renamed page) still shows
  as a tab with what was written, read-only; values of a field the form no longer has show under "No longer in the
  form"; a broken file shows its problems and the values. The agent reads them all.
- `shiori rename` moves a page's form rows with it. Backups and sync files carry `formValues` and `formReads`
  (older files: none); rows join by page, form and field, and the newer change wins.

### 4. The agent reads them

- `pnpm shiori forms <id>`: the forms, and the pages written in since the agent last read them. `forms <id> <page>
  [form]`: everything written, as text, pictures as file paths to open. `forms <id> read <page> [form]` marks them
  read, which the owner sees on the form. `shiori inbox` says when there's something new.
- Agents never write in a form: it's the owner's. They write the page from it.

### 5. The owner's only

- The routes (`GET /api/wikis/:id/forms?page=`, `PUT /api/wikis/:id/forms/:form`) are on the owner's server only.
  The guest server's allowlist has nothing for them (rule 2), and the app asks for none on a link. The public wiki
  never reads the database for them.

## Options Considered

- **The page's frontmatter or a Markdown file per form.** Agents could read it with plain tools, but the app would
  write into the wiki's files, which rule 1 forbids, and two PCs would conflict on the same file. Rejected: the
  database already syncs per row.
- **Forms the owner builds in the app.** More freedom, but a form is the kind of structure agents keep consistent
  across sections, and a file is easy to review and change in one request. The owner asks the agent for a form or a
  change to one; an editor in the app can come later.
- **One row per page form, holding every field.** Simpler, but two PCs writing different fields of the same form
  would overwrite each other. One row per field merges cleanly.

## Consequences

- A rename on one PC and an edit on another leave the other PC's rows under the old path after a sync; they show
  in `shiori forms` under that path until the agent moves them (or the form is put on it again).
- The values are in `wiki.db`, committed with the wiki (ADR-0014), private like comments: a wiki repo should stay
  private.

## As built

| Part | Decision |
|---|---|
| Shared | `shared/form.ts`: `formSchema`, `valueSchema`, `matchesPage`, `formApplies`, `areasOf`, `PageForm`; `checkAreas` in `shared/layout.ts` |
| Database | Migration 13: `form_values`, `form_reads` (`server/threads.ts`) |
| Server | `server/forms.ts` (load, check, page forms, set, read marks, rename, merge), `server/formRoutes.ts` (owner routes, mounted in `app.ts`); `rename.ts`, `backup.ts`, `sync.ts` carry the rows |
| App | `src/wiki/forms/`: `PageTabs.tsx` (the tabs, in `PageHead`), `FormView.tsx`, `fields.tsx` (one editor per field type), `useForms.ts` (loading, saving as you go), `forms.css`; `PageArea.tsx` switches on `?view=` |
| CLI | `cli/forms.ts`: `forms`, `forms <page>`, `forms read`; `check` and `inbox` mention them |
| Template | `forms/character.json` (Profile), `forms/creature.json` (Creature sheet); the template's `AGENTS.md` → Page forms |
| Tests | `server/forms.spec.ts`; `server/sharing/forms.spec.ts` (the owner's routes, and guests on view and comment links) |

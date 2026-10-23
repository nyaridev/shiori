# JOURNAL.md — {{title}} wiki

The development journal: what changed in the project this wiki describes, written while it's built, for the wiki to
pick up later. It keeps the wiki out of the way while you work, and makes sure nothing is forgotten when it's updated.

## The project

<!-- Filled in when the wiki is connected to its project. Paths are from this wiki's folder. -->

- **Project:** none yet. Once there is one, its folder, as `../game/`: entries name its files from there
- **Last merged:** never. The day the wiki last matched the project, and its commit when it's in git

## While you work on the project

- **Don't change the wiki.** No pages, frontmatter, theme or layouts, even when what you changed is on a page. The
  owner updates the wiki when they ask for it; until then, write a journal entry.
- **Write an entry when a change reaches anything the wiki describes or could:** a mechanic, a number, an item, a
  place, a character, the UI, a rule, content added or removed, a bug fixed that changes how something behaves. Not
  for changes nobody would notice (a refactor, a rename inside the code). When unsure, write it.
- **One entry per change**, at the end of the task, once the change works. Changing it again in the same task updates
  the same entry. A change undone later gets `status: dropped`, with a line saying why; never delete an entry.
- **Never** put secrets, keys or personal data in an entry.

An entry is `journal/<day>-<what-changed>.md`, as `journal/2026-10-23-lantern-radius.md`:

```md
---
title: "Lantern light radius 10 → 12"
date: 2026-10-23
status: open
kind: changed
version: "0.3"
commit: "a1b2c3d"
pages: ["Glow lantern"]
files:
  - src/shared/Lantern.luau
  - src/client/LanternUI.luau
---

**What changed.** The lantern lights 12 studs around it, up from 10. Covering it now saves oil.

**Where.** `LIGHT_RADIUS` and `onCovered()` in `src/shared/Lantern.luau`; the cover button in `LanternUI.luau`.

**How to check.** `LIGHT_RADIUS` is 12; in game, the light reaches the third fence post from the stall.

**For the wiki.** Glow lantern: the Stats table's light radius, a History line for 0.3, and a tip about covering it.

**From.** Glow lantern → Incoming changes: "Covering the lantern saves oil" (suggestion cover-oil).
```

| Field | What |
|---|---|
| `title` | The change, in a few words, with the numbers when there are some |
| `date` | The day of the change |
| `status` | `open` until it's in the wiki, then `merged`; `dropped` when it was undone or never shipped |
| `kind` | `added`, `changed`, `removed` or `fixed` |
| `version`, `commit` | The build or release it's in, and the project's commit, when known |
| `pages` | The wiki's pages it touches, by wikilink name; a page that should exist and doesn't is a name too |
| `files` | The project's files it's in, from the project's folder |

Write the body for the agent who merges it, weeks later, without this conversation: the values before and after,
the names in the code (constants, functions, remotes, data keys) where they live, how to check them, and what the
wiki should say. When it builds something from a page's Incoming changes (`AGENTS.md`), say which page and item
(**From.**), so merging can take the item out. Say what's still unsure.

## What this project records

The project's own list of what every entry should carry, beyond the fields above. It starts short; grow it.

- Numbers players see (damage, prices, timings), with the constant or data key that holds each one
- New or renamed things (items, places, characters, UI screens), with their ids and asset ids

When merging shows that entries miss something you had to dig up, add it here so later entries record it. When the
wiki gains a new kind of page (mobs, quests, recipes), add what those pages need to stay right.

## Merging the journal into the wiki

Only when the owner asks. Run `pnpm shiori journal {{id}}` from the Shiori folder (`{{shiori}}`): it lists the
entries waiting, oldest first, with their pages and files. Then, for each one:

1. **Check it against the project.** Read its files as they are now. Find every value and behaviour it states in the
   code or data, and use what's there: the entry can be wrong, or changed again since. A later entry can supersede an
   earlier one; merge what's true now.
2. **Change the pages.** The facts, infobox rows and tables first, and take the item it built out of the page's
   Incoming changes (the section goes with its last item); then a line under `## History` in the page's
   `:::changelog` (with the version); a tip or a note when the change calls for one. Cite a number a reader might
   doubt with a footnote, in plain words (`Measured in the 0.3 build`); file paths stay in the entry. A new page
   follows its kit. Keep private what isn't released (`:private`, `:::private`).
3. **Close it.** Set `status: merged` and `merged:` to today. If you left something out, say what in a line at the
   end of the body.

Then look for what nobody wrote down: when the project is in git, read the log since **Last merged** for changes
that reach the wiki and have no entry, and handle them the same way. Update **Last merged**, run
`pnpm shiori check {{id}}`, and review the pages you changed for new questions and suggestions (`AGENTS.md`). Tell
the owner what changed, page by page, and what you couldn't confirm.

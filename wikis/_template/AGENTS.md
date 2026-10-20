# AGENTS.md — {{title}} wiki

This folder is a **Loredeck wiki**. Loredeck (`{{loredeck}}`) is the app that shows it. The wiki is written only by
agents: people read it and leave comments on selected text, and you answer them and update the pages.

## Layout

| Path | What |
|---|---|
| `wiki.json` | `id` (kebab-case, unique), `title`, `tagline`, `cover`, `order` (position in the deck) |
| `theme.json` | Small style overrides on the app's defaults. See Theme below |
| `cover.svg` | The deck card art, 1:4 (tall). Art only, no title text: the app draws the title |
| `pages/**/*.md` | The pages. `pages/index.md` is the home page; a folder is a sidebar section and its `index.md` is the section page |
| `assets/` | Images and media used by pages |
| `data/` | Comments database, written by the app. Never edit or commit it |

## Writing pages

- Frontmatter: `title`, `summary` (shown under the title), `order` (sidebar position, lower first), `hidden: true`
  (keeps the page out of the sidebar). Quote values that contain `:`.
- Don't repeat the title as a `#` heading; start the body with text or `##` sections. `##` and `###` build the
  table of contents.
- Links: `[Combat](combat)` is relative to the page's folder, `[Combat](/systems/combat)` starts at `pages/`.
  No `.md` needed.
- Images go in `assets/` and are linked from the root: `![Map](/assets/map.png)`.
- No raw HTML. Use Markdown, GFM tables and task lists, and the elements below.

## Elements

The full reference with examples is `{{loredeck}}/docs/elements.md`, and the app shows it at `/dev/ui`.

| Element | Syntax |
|---|---|
| Callout | `:::callout{tone="note\|tip\|warning\|danger"}` … `:::`, optional `[Title]` after the name |
| Infobox | `:::infobox[Title]{image="/assets/x.png" caption="…"}` with a `- Key: value` list |
| Tabs | `::::tabs` around `:::tab[Label]` blocks |
| Columns | `:::columns` with `---` between columns |
| Details | `:::details[Summary]` … `:::` (collapsed) |
| Badge | `:badge[Rare]{tone="neutral\|accent\|good\|warn\|bad"}` |
| Key | `:kbd[E]` |

## Theme

`theme.json` may only set these. Everything else (layout, behavior) is the app's.

| Key | Values |
|---|---|
| `mode` | `dark`, `light` |
| `colors` | Any of `bg`, `surface`, `raised`, `border`, `text`, `muted`, `accent`, `accentText`, as `#rrggbb` |
| `radius` | `none`, `small`, `medium`, `large` |
| `border` | `thin`, `thick` |
| `shadow` | `none`, `soft`, `hard` |
| `font.body`, `font.heading` | `sans`, `grotesk`, `serif`, `pixel`, `mono`, `system` |

Keep themes subtle: change the accent first, and the rest only when the project calls for it.

## Comments

Run these from the Loredeck folder (`{{loredeck}}`):

| Command | What |
|---|---|
| `pnpm wiki inbox {{id}}` | Open comments waiting for you, with the quoted text |
| `pnpm wiki reply {{id}} <thread> "…"` | Answer or ask back (the thread stays open) |
| `pnpm wiki resolve {{id}} <thread> --note "…"` | Done: say what you changed (`--wontfix` to decline) |
| `pnpm wiki check {{id}}` | Validate the wiki: frontmatter, links, files, elements, theme |

Run `pnpm wiki check {{id}}` after every change.

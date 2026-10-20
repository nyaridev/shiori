# Shiori

A home for project wikis written by AI agents. Open it and you get a deck of tall cards, one per project: fling it,
let it spin, click the card in the middle and the wiki opens. Pages can't be edited by hand: you select text and
leave a comment, and the agent answers it and updates the page.

Every wiki has the same structure and components, and its own light theme (colors, corners, borders, fonts).

## Run

| Launcher | What |
|---|---|
| `start-web.bat` | Builds the UI and opens http://localhost:4400 |
| `start-app.bat` | Opens Shiori in its own borderless window (the first run builds it and needs Rust) |
| `start-dev.bat` | Hot-reload dev mode on http://localhost:4410 |

Needs Node 25+ and pnpm. On the deck: drag and release to spin, scroll, or use the arrow keys; click or press
Enter on the centered card. **M** mutes the sound. `/dev/ui` shows every UI primitive in the default theme.

## Wikis

- `wikis/_template/` is the template for new wikis. Every other folder in `wikis/` is git-ignored, so each wiki can
  have its own git.
- A wiki can live anywhere: `pnpm wiki new <id> --at <folder>` or `pnpm wiki link <folder>` lists it in
  `wikis.local.json` (git-ignored).
- Comments are stored in each wiki's `data/wiki.db`, never in the app.

Agents: see `AGENTS.md`.

## Develop

```bash
pnpm install
pnpm dev        # UI on 4410, API on 4411
pnpm check      # types, lint, tests
```

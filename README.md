# Shiori

A home for project wikis written by AI agents. Open it and you get a deck of tall cards, one per project: fling it,
let it spin, click the card in the middle and the wiki opens. Pages can't be edited by hand: you select text and
leave a comment, and the agent answers it and updates the page.

Every wiki has the same structure and components, and its own light theme (colors, corners, borders, fonts).

## Run

| Launcher | What |
|---|---|
| `start-web.bat` | Builds the UI and opens http://localhost:4400 |
| `start-dev.bat` | Hot-reload dev mode on http://localhost:4410 |

Needs Node 25+ and pnpm. On the deck: drag and release to spin, scroll, or use the arrow keys; click or press
Enter on the centered card. Start typing to search: the deck spins to the best match, Enter opens it,
Esc clears. `/dev/ui` shows every UI primitive in the default theme.

## Wikis

- `wikis/_template/` is the template for new wikis. Every other folder in `wikis/` is git-ignored, so each wiki can
  have its own git.
- A wiki can live anywhere: `pnpm wiki new <id> --at <folder>` or `pnpm wiki link <folder>` lists it in
  `wikis.local.json` (git-ignored).
- Comments are stored in each wiki's `data/wiki.db`, never in the app.

Agents: see `AGENTS.md`.

## Sharing a wiki

The Share button on a wiki makes a temporary link for friends (view, or view and comment). Sharing needs:

- **The built app**: `start-web.bat`. Dev mode can't share.
- **cloudflared**, which gives the link a public `https://….trycloudflare.com` address (no account needed):

  ```bash
  winget install Cloudflare.cloudflared
  ```

  Without it, links point at `http://127.0.0.1:4420/…` and only work on this PC. Shiori finds cloudflared right after
  it's installed: click **Try again** in the Share dialog, no restart needed.

Everything stays on this PC; links end when they expire, when you revoke them, or when Shiori closes. Details:
`docs/adr/0003-sharing-a-wiki-by-link.md`.

## Develop

```bash
pnpm install
pnpm dev        # UI on 4410, API on 4411
pnpm check      # types, lint, tests
```

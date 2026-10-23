<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/banner-dark.svg" />
    <img src="assets/brand/banner-light.svg" width="100%" alt="Shiori — wikis that agents write and people read" />
  </picture>
</p>

<p align="center">
  <a href="#run"><b>Run</b></a> ·
  <a href="#sharing">Sharing</a> ·
  <a href="AGENTS.md">Agents</a> ·
  <a href="docs/elements.md">Elements</a> ·
  <a href="docs/adr">Decisions</a>
</p>

A deck of project wikis on your PC. Spin it, open a card, and read the wiki an AI agent keeps for that project. Pages
can't be edited by hand: select text and comment, and the agent answers and updates the page.

- **One look, many themes.** Every wiki shares the same pages, elements and layout, with its own colors and fonts.
- **Made for planning.** Roadmaps, tasks, questions and suggestions to answer, diagrams, data tables and page history
  from git.
- **Wikis live anywhere.** In `wikis/`, or any folder you link; comments stay in each wiki's `data/`.

## Run

`start-web.bat` builds the app and opens http://localhost:4400. `start-dev.bat` runs hot-reload dev mode on
http://localhost:4410 with only the template wiki. Needs Node 25+ and pnpm.

Agents work through `pnpm shiori` (new wikis, pages, the comment inbox, checks): see [AGENTS.md](AGENTS.md).

## Sharing

The Share button in a wiki's header makes a temporary link to view it, or view and comment. It needs the built app,
and [cloudflared](https://github.com/cloudflare/cloudflared) (`winget install Cloudflare.cloudflared`) for a public
address; without it, links only work on this PC. Links end when they expire, are revoked, or Shiori closes
([ADR-0003](docs/adr/0003-sharing-a-wiki-by-link.md)).

A wiki can also have a **public wiki**: a read-only website of the pages it marks public, in its own theme, for
players and other readers. Preview it or download it as a `.zip` static site from the Share dialog, or pick
"Public wiki" there for a link. Everything is private unless the wiki says otherwise
([ADR-0011](docs/adr/0011-public-wiki.md)).

## Develop

```bash
pnpm install
pnpm dev
pnpm check
```

`pnpm check` runs types, lint and tests. The wiki header's Toolbox button (`/toolbox`) shows every primitive and element.

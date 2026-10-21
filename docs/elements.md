# Elements

Every element a wiki page can use, with its syntax. The `/dev/ui` page renders this file, so each example below
shows how it looks in the default theme.

## Text

Paragraphs with **bold**, *italic*, ~~struck~~, `inline code` and [an external link](https://example.com).
Keys like :kbd[Ctrl] + :kbd[K], and badges: :badge[Neutral] :badge[Accent]{tone="accent"} :badge[Good]{tone="good"}
:badge[Warn]{tone="warn"} :badge[Bad]{tone="bad"}.

```md
:kbd[E] :badge[Rare]{tone="accent"}
```

> A blockquote, for quotes from people or sources.

- A list item
- Another one
  - Nested

1. First
2. Second

- [x] A finished task
- [ ] An open task

---

## Links

Wikilinks find a page by its path, its file name or its title, so `[[Goals]]` works from any page:

```md
[[Goals]]                       the page's title as the link text
[[plan/roadmap|the roadmap]]    your own text
[[Roadmap#Milestones|dates]]    a section of a page
| [[goals\|Goals]] |            in a table, escape the bar
```

A link to a page that doesn't exist yet is a red link, like [[A page nobody wrote]]: it marks a page worth writing,
and Special:Wanted pages lists them all. Pointing at a link to a page shows a preview of it, and the icon after a
heading copies a link to that section. Plain Markdown links (`[text](path)`) still work, and a broken one is reported.

## Code

Fence code with its language and it's colored in the wiki's theme, with the language and a copy button above it:

```luau
-- Heals the player, never past their maximum.
local function heal(player: Player, amount: number)
	local humanoid = player.Character and player.Character:FindFirstChild("Humanoid")
	if humanoid then
		humanoid.Health = math.min(humanoid.Health + amount, humanoid.MaxHealth)
	end
end
```

```ts
export const price = (cents: number) => `$${(cents / 100).toFixed(2)}`;
```

Colored languages: `ts`, `tsx`, `js`, `jsx`, `json`, `css`, `html`, `bash` (`sh`), `powershell`, `python`, `lua`,
`luau`, `gdscript`, `rust`, `csharp`, `yaml`, `toml`, `md`, `sql`, `diff`. Others show as plain text.

## Callouts

:::callout
A note, the default tone.
:::

:::callout[Tip]{tone="tip"}
Callouts take an optional title in brackets.
:::

:::callout{tone="warning"}
Something to be careful about.
:::

:::callout[Breaking]{tone="danger"}
Something that will go wrong.
:::

```md
:::callout[Title]{tone="note|tip|warning|danger"}
Text.
:::
```

## Infobox

:::infobox[Thief Rat]{caption="Steals one item, then runs."}
- Health: 20
- Speed: **Fast**
- Drops: Cheese, Rat tail
- Found in: Every island
:::

Infoboxes float to the side of the text that follows them on wide screens, like on game wikis. They take an optional
`image` from `assets/`, and each `- Key: value` line becomes a row.

```md
:::infobox[Thief Rat]{image="/assets/rat.png" caption="…"}
- Health: 20
- Speed: Fast
:::
```

## Tabs

::::tabs
:::tab[Melee]
Short range, high damage.
:::
:::tab[Ranged]
Long range, lower damage.
:::
::::

```md
::::tabs
:::tab[Melee]
…
:::
:::tab[Ranged]
…
:::
::::
```

## Columns

:::columns
**Left.** Columns stack on narrow screens.

---

**Right.** Separate them with a `---` line.
:::

## Details

:::details[Spoilers]
Hidden until opened.
:::

```md
:::details[Summary]
Hidden text.
:::
```

## Questions

::question{id=q1}

Open decisions, answered on the page. List them in the frontmatter; people pick an option and/or write a note, and
the answers wait in the agent's inbox (`pnpm wiki inbox`). The agent decides and writes it back as
`status: resolved` with the `answer`. `::question{id=…}` places one in the text; the rest collect under "Questions"
at the bottom of the page, and Special:Questions lists them across the wiki. (Here on the reference page there's no
frontmatter, so it shows a placeholder.)

```md
---
questions:
  - id: q1
    text: "Which platform do we launch on first?"
    options: [Steam, itch.io, Both]
  - id: q2
    text: "Who designs the logo?"
    status: resolved
    answer: "Nari, by the end of the month"
---
::question{id=q1}
```

## Related pages

::related

Typed links to other pages, from the frontmatter. Names work like wikilinks; the kind is free text. `::related`
places the box (`::related{kind="Depends on"}` shows one kind); without it, the box shows at the bottom of the page.

```md
---
related:
  - Goals
  - to: Audience & market
    kind: Competitor of
---
::related
```

## Children and contents

::children

::toc

`::children` lists the pages under this one, as cards or `{layout=list}`; when a page places it, the cards at the
bottom aren't repeated. `::toc` puts the page's contents inside the article, numbered like Wikipedia's.

```md
::children{layout=list}
::toc
```

## Status and page chips

Shipping is :status[active], the shop is :status[paused], the logo is :status[done]. Mention a page as a chip:
:page[Goals], or one not written yet: :page[Launch checklist].

```md
:status[active]   one of idea, planned, active, paused, done, archived
:page[Goals]      any page, found like a wikilink
```

## Steps

:::steps[Upload a video]
1. Export: 1080p, H.264, stereo audio.
2. Thumbnail: big face, three words at most.
3. Write the description, with the links from the [Plan](/plan).
4. Schedule it for Thursday, 6 pm.
:::

A numbered how-to: a setup guide, a recipe, an upload checklist. `- Title: text` gives a step a title.

```md
:::steps[Upload a video]
1. Export: 1080p, H.264.
2. Write the description.
:::
```

## Compare

:::compare{pick="A marketplace"}
### Our own shop
- Pro: Full control over the look
- Pro: No marketplace fees
- Con: We bring every visitor ourselves
- Cost: $39 a month

### A marketplace
- Pro: Buyers are already there
- Con: 10% fee on each sale
- Cost: Free to start
:::

Options side by side, for a decision. Each option starts with a heading; `- Pro:` and `- Con:` lines are marked,
other `- Label:` lines are plain facts. `pick` marks the chosen one.

```md
:::compare{pick="A marketplace"}
### Our own shop
- Pro: Full control
- Con: We bring every visitor
### A marketplace
- Pro: Buyers are already there
:::
```

## Quote

:::quote{by="Sam" role="Streamer, 40k followers" source="Interview, May 2026"}
Setting things up takes me longer than the stream itself.
:::

A quote with who said it and where, for interviews and research. `url="https://…"` links the source.

```md
:::quote{by="Sam" role="Streamer" source="Interview" url="https://…"}
What they said.
:::
```

## Embed

::embed[Big Buck Bunny, the Blender open movie]{url="https://www.youtube.com/watch?v=aqz-KE-bpKQ"}

A video or design played in place: YouTube, Vimeo and Figma links only. Quote the URL. The `[label]` is the caption.

```md
::embed[Trailer]{url="https://www.youtube.com/watch?v=…"}
::embed{url="https://vimeo.com/…"}
::embed{url="https://www.figma.com/design/…"}
```

## Tables

| Weapon | Damage | Speed |
|---|---:|---|
| Sword | 12 | Medium |
| Dagger | 6 | Fast |
| Hammer | 20 | Slow |

## Code

```ts
export function hit(target: Mob, damage: number) {
  target.health -= damage;
}
```

## Stats

:::stats
- Subscribers: 12.4k | +8% this month
- Avg. view time: 4:12 | +0:20
- Revenue: $3,180 | -4%
- Videos: 42
:::

Numbers at a glance: channel stats, shop sales, playtest results. Each `- Label: value` line is a tile; an optional
`| change` after it shows the trend, green when it starts with `+`, red with `-`.

```md
:::stats
- Subscribers: 12.4k | +8% this month
- Videos: 42
:::
```

## Timeline

:::timeline
- [x] January: Idea and research
- [x] February: First prototype
- [ ] March: Playtest with friends
- [ ] May: **Public launch**
:::

A roadmap. Ticked items are done, the first open one is marked *Now*, and the rest are next. Items without a task
box are plain entries (a history, a changelog).

```md
:::timeline
- [x] January: Idea and research
- [ ] March: Playtest with friends
:::
```

## Cards

:::cards
- 🎯 [Goals](https://example.com) — What we're aiming for, and how we'll know.
- 🗺️ [Roadmap](https://example.com) — Milestones and dates.
- 🔎 [Research](https://example.com) — Sources, notes and findings.
:::

A grid of links, for hub pages. Start an item with an emoji for its icon, then the link, then a short description.

```md
:::cards
- 🎯 [Goals](plan/goals) — What we're aiming for.
:::
```

## Gallery

:::gallery
![Dusk](/assets/dusk.svg "Warm dusk palette")
![Neon](/assets/neon.svg "Synthwave grid")
![Grove](/assets/grove.svg "Soft greens")
![Paper](/assets/paper.svg "Sketchbook UI")
:::

An inspiration board. Images go in `assets/`, one per line; click one to see it large. The caption is the image's
title (in quotes), or its alt text.

```md
:::gallery
![Dusk](/assets/dusk.png "Warm dusk palette")
:::
```

## Progress

:progress[Store launch checklist]{value="60"}

:progress[Episodes edited]{value="3" max="8"}

A bar for anything with a finish line. Out of 100 unless `max` is given (then it shows `3/8`). It works inline,
in tables too:

| Video | Script | Edit |
|---|---|---|
| Devlog #4 | :progress{value="100"} | :progress{value="40"} |
| Shorts pack | :progress{value="2" max="5"} | :progress{value="0"} |

```md
:progress[Launch]{value="60"}
:progress[Episodes]{value="3" max="8"}
```

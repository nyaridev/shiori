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

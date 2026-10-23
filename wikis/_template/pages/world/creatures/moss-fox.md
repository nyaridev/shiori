---
title: "Moss fox"
summary: "A shy fox that hides in the moss and steals shiny things."
icon: bug
order: 1
type: "Creature"
tags: [creatures]
image: "/assets/grove.svg"
caption: "Moss foxes live where the grove is thickest"
infobox:
  Health: 40
  Damage: 6
  Habitat: "[[Old Grove]]"
  Behaviour: ':badge[Shy]{tone="good"}'
  Script: "MossFox.server.luau"
---

Moss foxes are harmless unless cornered. They follow anyone carrying a [[Glow lantern]] and run off with dropped
coins.

## Behaviour

::::tabs
:::tab[By day]
Asleep in the moss. Walking past quietly doesn't wake them.
:::
:::tab[By night]
Out hunting for shiny things. They keep their distance from lit lanterns.
:::
::::

## Drops

:::table[Drops]{sort="-Chance"}
| Item | Chance | Amount |
|---|---|---|
| Fox fur | 60% | 1–2 |
| Coins | 35% | 3–10 |
| [[Glow lantern]] | 5% | 1 |
:::

## How it hunts

A fox goes for the nearest player carrying something shiny, as long as it can see them.

```lua
local function pickTarget(fox, players)
  return nearestHolding(players, "Shiny", fox.SightRange)
end
```

:::private[Balance]
Damage goes up to 8 in the next update; don't announce it yet.
:::

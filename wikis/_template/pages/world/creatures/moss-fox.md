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
coins.[^coins]

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
| [[Fox fur]] | 60% | 1–2 |
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

## Notes

- A fox only bites when it's cornered: against a wall, or with two players on either side of it.[^cornered]
- Foxes never cross the [[Willow River]], so the grove's foxes stay on its side.
- A fox carrying coins drops all of them when it's hit, and none of its [[Fox fur]].

## Tips

- Leave a few coins on the ground to lure a fox out of the moss.
- Put your [[Glow lantern]] away at night if a fox is following you: it keeps the [[Ember moth|ember moths]] away,
  but the fox keeps its distance from the light too.

## History

:::changelog
- 0.3:
  - Foxes drop every coin they carry when hit.
  - Health raised from 30 to 40.
- 0.2: Added, with [[Fox fur]] as their drop.
:::

## References

[^coins]: Up to ten coins at a time; a fox with ten ignores the rest.
[^cornered]: From the creatures section of the design doc.

::navbox{from="world"}

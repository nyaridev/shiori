---
title: "Audience & market"
summary: "Who it's for, where they are, and what they use today."
icon: people
status: active
order: 1
tags: [research, audience]
type: "Research"
suggestions:
  - id: personas
    text: "Turn the audience into two or three short personas, each with a name, a goal and what stops them today, so each decision can be checked against a person?"
    options: [Yes, Later, No]
  - id: where-to-reach
    text: "For each audience group, add the one place they can be reached first (a forum, a subreddit, a Discord), with a link?"
    options: [Yes, No]
  - id: competitor-gaps
    text: "The table of alternatives lists what people use today instead of this project. Add a column saying what each one is missing, the gap this project could fill?"
    options: [Yes, Later, No]
---

:::infobox[Main persona]{caption="The person we build for first"}
- Who: A beginner with a little free time each week
- Age: 18–30
- Finds things on: YouTube, Reddit, Discord
- Wants: Quick wins, a friendly start
- Hates: Long setups, hidden costs
:::

Knowing exactly who it's for makes every other choice easier: what to build first, how to talk about it, and where to
share it. Start with **one** persona and only add more when the first one is happy.

## Where they are

:::columns
### Places they hang out
- Communities and forums around the topic
- Short-video platforms
- Friends' recommendations

---

### What they search for
- "How do I start with…"
- "Best cheap…"
- "… for beginners"
:::

## What's already out there

The alternatives live in a data file, `tables/alternatives.csv`: add a row there and this table follows. Click a
column to sort it, or filter: `price<10`, `rating>=4`, `free`.

::table[Alternatives]{src="/tables/alternatives.csv" sort="-Users" stats}

## Market numbers

:::stats
- Similar products or channels: ~40
- Biggest one: 1.2M | followers or customers
- Growing fastest: +35% | this year
:::

---
title: "Roadmap"
summary: "The milestones from idea to launch, and what each one needs."
icon: map
status: active
order: 2
type: "Plan"
tags: [plan]
infobox:
  Milestones: 5
  Done: ':progress{value="1" max="5"}'
  Now: "Prototype"
  Decisions: "[Decision log](/notes/decisions)"
suggestions:
  - id: buffer
    text: "Leave a buffer week before launch for fixes and polish?"
    options: [Yes, No]
  - id: exit-criteria
    text: "Give each milestone a one-line \"done when…\" so it's clear when to move on?"
    options: [Yes, Later, No]
  - id: public-roadmap
    text: "Share a simpler version of this roadmap with the first users?"
    options: [Yes, Later, No]
---

The roadmap is a promise to ourselves, not a contract: when reality disagrees, change the roadmap and log why in the
[Decision log](/notes/decisions).

## Milestones

:::timeline
- [x] Week 1: Research the space and write the pitch
- [ ] Weeks 2–3: Prototype the one core idea
- [ ] Weeks 4–6: Build version one
- [ ] Week 7: Launch to the first users (see the [[Launch checklist]])
- [ ] After launch: Measure, learn, and plan version two
:::

## How the work flows

Each milestone feeds the next; a prototype that doesn't work yet goes back to research, not forward.

```mermaid
flowchart LR
  research[Research] --> prototype[Prototype]
  prototype -->|works| v1[Version one]
  prototype -->|not yet| research
  v1 --> launch[Launch]
  launch --> learn[Measure and learn]
  learn -->|version two| v1
```

## What each milestone needs

::::tabs
:::tab[Prototype]
The smallest thing that shows whether the core idea is fun, useful or interesting.

- [ ] The one core feature, rough but working
- [ ] Five people try it
- [ ] Notes on what they did, not just what they said
:::
:::tab[Version one]
Everything a stranger needs to use it without us in the room.

- [ ] The core feature, polished
- [ ] A first-run experience: store page, intro video, or tutorial
- [ ] A way to collect feedback
:::
:::tab[Launch]
Getting it in front of people.

- [ ] Launch post, trailer or announcement
- [ ] Share where the [[audience]] already is
- [ ] Watch the numbers on the first day, week and month
:::
::::

:::callout[Keep milestones small]{tone="tip"}
A milestone should end with something you can show. If one runs longer than three weeks, split it.
:::

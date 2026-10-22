---
title: "Plan"
summary: "Where we're going, how we'll get there, and what's happening now."
icon: compass
status: active
order: 1
type: "Plan"
tags: [plan]
infobox:
  Owner: "You"
  Started: "Week 1"
  Aiming for: "[Version one](roadmap) by the end of the quarter"
  Progress: ':progress{value="25"}'
questions:
  - id: q1
    text: "What's the one core feature of the first version?"
    options: [The simplest one, The most fun one, The one people asked for]
  - id: q2
    text: "How often do we share progress?"
    status: resolved
    answer: "Once a week, every Friday"
suggestions:
  - id: weekly-review
    text: "Add a short weekly review to this page: what moved, what's stuck, what's next?"
    options: [Yes, Later, No]
  - id: owners
    text: "Give each item in \"This week\" an owner, so it's clear who picks it up?"
    options: [Yes, No]
  - id: risk-levels
    text: "Rate each risk as low, medium or high, so the big ones stand out?"
    options: [Yes, Later, No]
---

The plan has two parts: :page[Goals] say what success means, and the :page[Roadmap] puts the work on a
calendar. This page tracks where things stand right now.

## Progress

:progress[Version one]{value="25"}

:progress[Research]{value="3" max="5"}

## This week

- [x] Set up the wiki
- [x] Write the first pitch
- [ ] Finish the audience research
- [ ] Pick the prototype's one core feature

:::callout{tone="note"}
Keep this list short. Anything that isn't for this week goes in the [Roadmap](roadmap) or the
[Ideas](/notes/ideas) backlog.
:::

## Decisions to make

::question{id=q1}

## Risks

| Risk | How likely | What we'll do |
|---|---|---|
| Scope grows past what two people can ship | :badge[High]{tone="bad"} | Cut to one core feature; everything else waits for v2 |
| Nobody finds it after launch | :badge[Medium]{tone="warn"} | Start sharing progress weeks before launch |
| We lose motivation mid-way | :badge[Low]{tone="good"} | Small milestones, and show something every week |

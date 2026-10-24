---
title: "Goals"
summary: "What success means, in numbers we can check."
icon: target
status: active
order: 1
type: "Plan"
tags: [plan]
infobox:
  North star: "100 people using it every week"
  Deadline: "End of the quarter"
  Goals: 3
related:
  - Roadmap
  - to: Audience & market
    kind: Measured with
questions:
  - id: first-number
    text: "Early on we can only watch one number closely. Which one: how many people try it, how many come back, or how many agree to a feedback call?"
    options: [Users, Returning, Feedback calls]
  - id: first-channels
    text: "Where do we look for the first users? Pick every place worth trying in the first month."
    options: [Forums, Discord, Friends and family, Small ads]
    multiple: true
suggestions:
  - id: baseline
    text: "Write today's number next to each goal's target, so we can see how far each one has moved since we started?"
    options: [Yes, Later, No]
  - id: review-date
    text: "Give each goal a date to look at it again, so a goal nobody works on any more gets noticed and changed or dropped?"
    options: [Yes, No]
  - id: leading-metric
    text: "Big numbers move slowly. Give each goal one early sign we can count every week (a sign-up, a reply to an email), so we know sooner whether it's working?"
    options: [Yes, Later, No]
---

Goals keep the project honest. Each one says **what** we want, **how** we'll measure it, and **by when**. If a goal
can't be measured, it's a wish; rewrite it until it can.

## North star

> The one sentence everything else serves. For example: *"100 people use it every week and tell a friend."*

## Goals for version one

:::table
| Goal | Measure | Target | Status |
|---|---|---|---|
| Ship a first version | Released to real users | End of the quarter | :badge[On track]{tone="good"} |
| Find the first fans | People who come back a second time | 100 | :badge[Not started]{tone="neutral"} |
| Learn what works | Feedback conversations | 20 | :badge[At risk]{tone="warn"} |
:::

## Targets

:::stats
- Users: 0 | target 100
- Returning: 0% | target 40%
- Feedback calls: 6 | +6 this month
:::

*Returning* is the share of last week's users who came back this week:

$$
\text{Returning} = \frac{\text{users this week who were also here last week}}{\text{users last week}} \times 100\%
$$

So with $$U_{w-1} = 50$$ users last week and $$20$$ of them back, returning is $$40\%$$: the target.

::question{id=first-number}

## Not goals

Saying what we *won't* do is as useful as the goals:

- No second platform until the first one works.
- No paid ads before people come back on their own.
- No features nobody asked for twice.

:::details[How to write a good goal]
Use the shape *"Get **[measure]** to **[target]** by **[date]**."* Pick measures you can read without guessing:
sign-ups, sales, subscribers, play sessions, minutes watched. Review the table at every milestone, and move goals
to :badge[Done]{tone="good"} or rewrite them; never let them go stale.
:::

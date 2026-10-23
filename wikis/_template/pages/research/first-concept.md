---
title: "First concept"
summary: "An example of a page with a layout: the sketch beside its facts, what it is, and what's still open."
icon: frame
status: idea
type: "Concept"
layout: concept
tags: [concepts]
order: 4
infobox:
  Drawn by: "Whoever sketched it"
  Seen in: "Where it shows up"
  Next step: "Decide what it becomes first"
questions:
  - id: next
    text: "What should the first concept become first?"
    options: [A page of its own, Part of the plan, Parked for later]
---

This page uses the `concept` layout from `layouts/concept.json`: the sketch and the facts sit side by side, the text
comes under the sketch, and the open questions run along the bottom. Pages made with `pnpm shiori page <id> <path> --kit
concept` look like this, with the sketch someone drew in [[Sketches]].

## Look

What the drawing shows, and what it leaves open. When a page names its design (`design:` in the frontmatter), the
drawing appears in the panel above.

## Ideas

- What it could do
- Where it fits in the [[Plan]]

# ADR-0007: Reading and reacting: sections, changes, feedback, reactions, attention

**Status:** Accepted
**Date:** 2026-10-21
**Deciders:** Nari (owner), Claude (implementer)

## Context

Agents write the pages and people mostly read them and react. Coming back after an agent has worked, a reader
couldn't tell what changed; reacting meant selecting text and writing a comment; an answer to a question vanished
into the inbox with no word on where it stood; and nothing gathered what was waiting for the reader. Search covered
pages only.

Constraints from ADR-0001 and ADR-0003 still hold: the app writes only into a wiki's `data/` (and `designs/`), two PCs
merge `data/` through `sync/` files by uid and `updated_at`, and every new guest route is an allowlist entry with
tests and a review.

## Decision

**Sections are panels** (`src/wiki/markdown/sections.ts`, `Section.tsx`). A plain page's `##` sections are wrapped
client-side as `sh-section` elements: the heading on a title strip with the section's tools, then the body. The
strip's tools are `data-noquote`, so comment anchors only cover the page's words. Layout pages (ADR-0006) keep plain
sections inside their areas. A section folds (per viewer, in localStorage, animated). Beside a floating infobox
only the text before the first section wraps; every section, and wide content before the first one (tables,
sheets, tiles, galleries, diagrams, code), starts below the infobox at full width. (At first only sections with wide
content did: a section of text kept a narrow column for its whole height, and a sheet in the intro was squeezed.)

**Changed since your last visit, per viewer** (`src/wiki/seen.ts`). Each browser keeps, per wiki and page, the page's
`updatedAt` and a fingerprint (FNV-1a of the text) of each section when the reader last had it open. Opening the page
again marks the sections whose fingerprint differs and says how many changed in the page head; a reader's first visit
marks nothing. Pages whose `updatedAt` passed the stored one get a dot in the sidebar's Recently viewed. Nothing of
this reaches the server: it's what this browser saw.

**Feedback on a section** is a comment, not a new kind of data: "Looks good", "Needs work" or "Outdated" creates a
thread anchored on the section's heading, which opens in the rail for details. Agents read it in the inbox like any
comment.

**One answer per person per question.** Answering again changes that person's answer (the owner's, or that
guest's) instead of adding one, so the agent reads what people think now. The card shows your answer, "Waiting for
the agent" until the question is decided, and Change. Options show how many people picked each. Questions take an
optional `due` day, and the agent writes `decided` with the decision; Special:Decisions is the timeline of decided
questions. `pnpm shiori sync` now carries an answer's choice and note, not only its hidden flag.

**Reactions on messages** (👍 ✅ 👀 ❤️) live in a `reactions` JSON column on `messages` (migration 6):
`[{ emoji, by: [{ author, name?, guestId? }] }]`. Reacting moves the message's `updated_at`, so sync and backups
carry them like any other change (newer wins). Guests see names and whether a reaction is theirs, never guest ids.

| Route | Server | What |
|---|---|---|
| `POST /api/wikis/:id/messages/:mid/reactions` | owner | `{ emoji, on }`: add or take back the owner's reaction |
| `POST /s/:token/api/wikis/:id/messages/:mid/reactions` | guest | The same for the guest, on a message they can see |

**Search reads comments and answers too**, and narrows pages by status, type and tag (`?status=&type=&tag=`; with a
filter and no words it lists every page that fits). Both servers return `{ hits, notes }`; the guest server builds
notes only from `visibleThreads` and answers that aren't hidden. `#comment-<id>` opens that comment in the rail.

**Special pages:** Needs your attention (pages changed since you looked, agent replies to your comments, open
questions you haven't answered, soonest due first), Decisions, and every page with one status (`_/status/active`) or
one type (`_/types/Feature`), linked from the page head and Special:Categories.

### Security review of the guest reaction route

- Behind `wikiOnly` (the link's own wiki, a guest with a name) and the shared `write` chain: comment links only
  (`403` on view links), this site's `Origin`, the body limit, and the guest's write limits (reactions count as
  writes, so flipping one fast hits `429` and the strikes that block).
- The emoji is one of four fixed values (zod enum); `on` is a boolean. Nothing a guest sends is stored as text.
- The message must belong to a thread the guest can see, and be visible itself: `threadOfMessage` then `visible`
  (hidden messages and threads answer `404`, like a missing one).
- Responses go through `threadFor`, which strips guest ids from authors and from reactions.
- Tests in `guest.spec.ts` cover each of these, plus expiry (`410`) and another wiki (`404`).

## Consequences

- Readers see what changed and react without writing; agents get section feedback and reactions as ordinary data.
- "Seen" state is per browser: a second browser or a cleared storage starts fresh, and marks nothing until the next
  change. That's the intended privacy trade-off; the server never learns what anyone read.
- An answer's history isn't kept: the latest one counts. The inbox shows when it was changed.
- Reactions merge between PCs by the message's `updated_at`, so two PCs reacting to the same message between syncs
  keep the later set.

## Addendum: suggestions, settings.json and the Changes panel

**Suggestions** (`suggestions:` in a page's frontmatter) are the agent's ideas for a page: what to add, or how to
improve what's there. Questions stay questions about what the page describes now. Both have the same fields and the
same answers (one per person, in `data/wiki.db`), and share one set of ids per page, so nothing new is stored or
synced. The difference is how they're read: suggestions are green, sit below the questions (or where
`::suggestion{id}` places them), and the template's `AGENTS.md` asks the agent to give each page it writes or changes
3 to 6 of them, more for a more complex page. An accepted suggestion is decided like a question, and the change is
made on the page.

**`settings.json`** is a wiki's own settings, next to `wiki.json`: `maxQuestions` and `maxSuggestions`, the most
open ones a page may have at once (6 and 6 when the file or a key is missing). A page over either gets a page problem
that `pnpm shiori check` reports, so the agent decides or drops old ones before adding more. The template ships the
file, so new wikis get it.

**Changes.** The whole-page comment panel is now "Changes", for asking a change to the page; it's the last thing on
a page. What links here, the categories bar, previous/next and the last-edited line are gone from the bottom; tags
stay in the page head, and related pages move above Changes.

## Addendum: pictures on change requests

A change request can carry up to four pictures (PNG, JPEG, WebP or GIF, at most 6 MB each; never SVG). They're
uploaded first (`POST /api/wikis/:id/attachments`, raw bytes) and named in the new thread's `images`. The server
checks each picture's bytes against its type (the check designs use), names it by a fresh uid, and keeps it in the
wiki's `data/attachments/`, so the app still writes only where it did. A message lists its files in a new `images`
column (migration 7); backups and sync carry the list, not the files, so a picture made on one PC shows only there.
The inbox prints each picture's path for the agent.

| Route | Server | What |
|---|---|---|
| `POST /api/wikis/:id/attachments` | owner | Upload a picture; answers its file name |
| `GET /api/wikis/:id/attachments/:file` | owner | The picture, or a smaller WebP with `?w=` |
| `POST /s/:token/api/wikis/:id/attachments` | guest | The same for a guest |
| `GET /s/:token/api/wikis/:id/attachments/:file` | guest | Only a picture that a message the guest can see carries |

### Security review of the guest picture routes

- Upload: behind `wikiOnly`, this site's `Origin`, comment links only (`403` on view links), a 6 MB body limit
  before anything is read, the allowed types by `Content-Type` and by the bytes themselves (`415`/`400`; SVG never),
  and the guest's daily byte budget shared with designs (`429` past it). Uploads don't take write tokens, so a change
  with four pictures still fits the write rate.
- Names are fresh uids made by the server; a thread may only name files that match the uid pattern and exist, so a
  guest can't point at another path or another wiki's file. Reading checks the same pattern before touching the disk.
- Reading: a guest gets a picture only when a visible message carries it, so nothing uploaded but not sent, nothing
  the owner hid, and nothing from another wiki is reachable. Responses are `private, no-cache`.
- Tests in `guest.spec.ts` cover view links, another wiki, SVG and wrong bytes, another site's `Origin`, size,
  expiry, the daily budget, unattached and made-up names, and path tricks.

## Addendum: removing changes, sections as headings, a narrower page

**Removing a change.** The host removes any change request, and a guest the ones they started. Nothing is deleted:
the thread gets `removed_at` (migration 8) and drops out of every list, the rail, the inbox and search; its pictures
stop being served to guests. Backups and sync carry the mark (newer wins), so it's removed on every PC.

| Route | Server | What |
|---|---|---|
| `DELETE /api/wikis/:id/threads/:tid` | owner | Remove any thread |
| `DELETE /s/:token/api/wikis/:id/threads/:tid` | guest | Remove a thread the guest started |

Security review of the guest route: behind `wikiOnly` and the `write` chain (comment links only, this site's
`Origin`, the write limits); the thread must be one the guest can see (`404` otherwise, also for another wiki) and
one they started (`403`). `guest.spec.ts` covers each case.

**Sections** are no longer boxes: a `##` section is its heading over a thin line, as on a fandom wiki (NoStale's
Sorcerer page was the model), with the fold, "Changed" (the line turns accent) and feedback at the line's end. Layout
areas and home boxes stay panels.

**The page column** is at most 800 px wide with its padding (about 736 px of text), down from 1180.


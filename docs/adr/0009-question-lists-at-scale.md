# ADR-0009: Question lists at scale, and answering them on one page

**Status:** Accepted
**Date:** 2026-10-22
**Deciders:** Nari (owner), Claude (implementer)

## Context

Real projects will have hundreds or thousands of open questions and suggestions. Until now the page index sent every
question of the wiki to every view, the sidebar's dots and Needs your attention loaded every answer in the wiki, and
Special:Questions rendered all of them at once. People also had to open each page to answer its questions, and an
answered card had no "what did I say" list to come back to.

## Decision

**The server filters, sorts and pages** (`server/questionList.ts`, `GET /api/wikis/:id/questions`). A query names a
status (open, decided, all), a kind, the viewer's own state (`mine=waiting` or `answered`), words to search (the
question, its options, its decision, its page's title), a sort (due, decided, answered, updated) and an offset and
limit (50 at most). The answer has the page of items, how many match, counts of each kind for tabs (narrowed by the
search only), and the server's time. With `full=1` each item carries every answer, for cards. The index keeps only
three counts (`questions: { open, suggestions, decided }`). The sidebar's dots come from
`GET /api/wikis/:id/questions/waiting`, per page, for this viewer. One person's answers have an index in the database.

**Answered cards stay put for the visit.** The answer view asks for `mine=waiting&since=<the server's time when the
viewer opened it>`: questions they haven't answered, and those they answered since then, in the same place. Leaving
the page ends the visit; coming back, those are under **Recently answered** (`mine=answered`, the viewer's newest
answer first), each of which can be changed while it's open. The server's clock is used, so a guest's clock can't
shift what stays.

**Special:Questions has two views** (`src/wiki/special/Questions.tsx`): the overview (open questions, suggestions and
decided ones as tabs of rows) and Answer (cards, ten a page, with the shared `QuestionCardView`). After an answer the
next waiting card takes focus. Everything the viewer picks is in the URL (`view`, `tab`, `kind`, `q`, `p`, `rp`), so
Back works and a link opens the same list. Decisions and Needs your attention read the same endpoint.

**Pagination, not endless scrolling** (`src/ui/Pagination.tsx`). Numbered pages with gaps (1 … 4 5 [6] 7 8 … 40),
and "Page [6] of 40" with a field where it's narrow. A page change moves focus to "21–40 of 812", which keeps
screen readers and the keyboard in step, keeps the footer reachable, and lets a position be linked and come back to.

**Guests** get both routes on view and comment links, behind the link check, the wiki check and the read limit; their
own answers are "mine", what the owner hid isn't there, and guest ids never leave the server.

## Options Considered

- **Endless scrolling:** natural on phones, but the footer can't be reached, a place in the list can't be linked or
  returned to, and screen readers lose their place as items load. Rejected for numbered pages.
- **Keep sending everything and page in the browser:** simplest, but the index and the answers grow with every
  question, on every page load. Rejected.
- **Keep the answered cards by remembering their ids in the browser:** works, but the list's pages shift as cards
  leave and the URL would carry the ids. `since` keeps pages stable with one value.

## Consequences

- A list is one request per page; counts come with it, so the tabs need nothing more.
- An answer sent from the answer view is shown at once (the card keeps what the server returned), then the page
  reloads in the background.
- `WikiIndex.questions` changed shape: anything reading the old list uses the endpoint now.

## Action Items

- [x] `questionList.ts` with tests, routes on both servers with guest tests
- [x] Special:Questions overview and answer view, Recently answered, Decisions and Attention on the endpoint
- [x] Pagination primitive

# ADR-0005: Presence, who is on a wiki right now

**Status:** Accepted
**Date:** 2026-10-21
**Deciders:** Nari (owner), Claude (implementer)

## Context

Since ADR-0003 friends read and comment on a wiki through share links, but nobody can see anyone else. Nari wants a
header on every wiki page that shows, Google Docs style, who is on the wiki right now: the host and the guests from
share links, each with the page they're on. Clicking someone goes to their page. Next to it, a badge says at a glance
when the wiki is open to other people ("Live · 2 guests").

Constraints from ADR-0001 and ADR-0003 still hold:

- The app writes nothing outside a wiki's `data/`, and links, guests and activity already live only in memory.
- The guest server is an allowlist: every new guest route is tested for the link check, other wikis, expiry,
  view-only links, limits and `Origin`, and reviewed.
- Guests get live updates by long polling (the Quick Tunnel carries no server-sent events); the owner gets SSE.
- Guests never see guest ids, and see nothing of other links.

## Decision

**In memory, per tab, with a last-seen time.** `server/sharing/presence.ts` keeps one entry per open tab: the
owner's tabs (`host:<tab id>`, a random id each page load) and each guest (`guest:<guest id>`, their cookie), with
the wiki, the page and when it last reported. Both servers share one presence. Restarting Shiori forgets it all, like
the links.

**Tabs report; silence ends them.** A tab reports its page 0.6 s after it settles on one, then every 15 s. It says
goodbye (`DELETE`, sent with `keepalive`) when it leaves the wiki or the page closes. An entry that hasn't reported
for 40 s is dropped (a timer prunes every 10 s), so a crashed tab or a sleeping laptop disappears on its own. A
guest who is blocked, or whose link ends, leaves at once: presence listens to the share links.

**What's stored is checked.** A reported page is kept only if it's a page of that wiki or a special page (`_/…`);
anything else (a page not written yet, junk) is stored as "a page that isn't written yet". Titles come from the
server's own index, never from the client.

| Route | Server | What |
|---|---|---|
| `GET /api/wikis/:id/presence` | owner | Everyone on the wiki: the host (all the owner's tabs as one person, at the page of the tab that moved last) and every guest of every link |
| `PUT /api/wikis/:id/presence` `{ tab, page }` | owner | This tab is here; answers the list |
| `DELETE /api/wikis/:id/presence/:tab` | owner | This tab left |
| `GET /s/<token>/api/wikis/:id/presence` | guest | The host and the guests **of this link** |
| `PUT /s/<token>/api/wikis/:id/presence` `{ page }` | guest | This guest is here (view links too: reading is being here) |
| `DELETE /s/<token>/api/wikis/:id/presence` | guest | This guest left |

**Who sees whom.** The owner sees everyone. A guest sees the host and the other guests of their own link, never
those of another link. Guests are listed by a random public id made for presence, never by their guest id.

**Live updates.** Presence keeps versions: one per wiki for the host's moves, one per link for its guests' moves. A
heartbeat on the same page changes no version, so idle tabs cost nothing. The owner's SSE stream sends
`{ type: "presence", wiki }` (at most every 250 ms per wiki). A guest's long poll (`/changes`) now has an ETag of
pages, comments and the presence version **the guest can see** (`"<pages>.<threads>.<host>-<link>"`); it wakes when
the host or someone on the same link moves, and not for anyone else. Either way the client then asks for the list.

**Guest safety.** The guest routes sit behind the same link check, name check and per-address read limit as every
other guest route; `PUT` and `DELETE` also check `Origin` and the 16 KB body limit. Reports have their own bucket, 20
a minute per guest with bursts of 10. Going over it answers `429` with `Retry-After` **without a strike**, so a fast
reader clicking through pages is never blocked for it; the read limit (with strikes) still guards the address.

**The header.** `src/wiki/WikiHeader.tsx`, sticky across the whole window, over the sidebar, the page and the
rail: back to the deck (the owner) or what the link allows (a guest); the live badge (owner only: "Live · N guests"
while a link to this wiki is up on the tunnel, "Starting…", "This PC only" when the tunnel isn't up; it opens the
Share dialog); the avatars of everyone else (`src/presence/`), whose list opens on a click; Share; and the day/night
switch at the far right. On narrow screens it also holds the page list, search and comments buttons that the old
floating mobile bar had.

**Day or night.** Wikis open in the system's day or night (`prefers-color-scheme`, followed live), and the public
wiki does the same. The viewer can flip it; the choice is remembered in the browser (`localStorage`) for every wiki,
and going back to the system's mode forgets it. In the mode that isn't the theme's own, a wiki keeps its
accent, corners, borders, shadows and fonts on that mode's palette (its own backgrounds and text were chosen for its
own mode), and the accent is pulled toward the text until it stands out from the new background
(`themeColors` in `shared/theme.ts`). It's the same tokens, so every theme still works.

## Options Considered

### Option A: In-memory presence, reported by tabs, pushed over SSE and the long poll (chosen)

| Dimension | Assessment |
|---|---|
| Complexity | Low: one module, three routes per server, versions in the existing long poll |
| Cost | One small `PUT` per tab every 15 s; nothing for an idle wiki's guests' polls |
| Privacy | Nothing written to disk; guests see only their own link |
| Fit | Reuses the guest server's link checks, limits and long polling |

### Option B: Presence from the long poll alone

A guest waiting on `/changes` is here; the request could carry the page. **Pros:** no new guest write route.
**Cons:** a move would have to cancel and restart the poll to report, the owner has no poll at all, and "waiting"
can't tell a closed tab from a slow network until it times out. Rejected.

### Option C: WebSockets

**Pros:** instant, two-way. **Cons:** the Quick Tunnel's limits (ADR-0003) and a second transport to secure next to
SSE and the long poll, for a friends-sized wiki where a few hundred milliseconds don't matter. Rejected.

### Option D: Keep presence in the wiki's database

**Pros:** survives restarts. **Cons:** who's here is only true right now; writing it to `data/wiki.db` every 15 s
per tab is churn with no value after a restart, and links don't survive restarts anyway. Rejected.

## Consequences

- **Easier:** the owner sees at a glance that a wiki is live and who is reading what, and can jump to them; guests
  see the host and their friends on the same link.
- **Harder:** the guest server has three more routes, each tested for the link check, other wikis, expiry, names,
  view links, limits and `Origin` (`server/sharing/presence.spec.ts`).
- **Accepted:** a tab that closes without its goodbye (a crash, a killed browser) shows for up to 40 s more.
- **Revisit:** cursors or selections inside a page (more Google Docs), if the wikis ever become editable in the app.

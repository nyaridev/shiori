# ADR-0003: Sharing a wiki with friends through a temporary link

**Status:** Accepted
**Date:** 2026-10-21
**Deciders:** Nari (owner), Claude (implementer)

## Context

Shiori is local: the app, the wikis and their comments all live on one PC, and the server only listens on
`localhost`. Nari wants friends to join a wiki: read it, comment, reply and answer its questions, the same things the
owner does in the app. The requirements:

- A **Share** button on a wiki creates a link for **that wiki only**.
- **Nothing leaves the host PC**: no cloud server, no copy of the wiki or its comments anywhere else.
- Links are **temporary**: they expire (24 hours by default) and all of them stop when the app stops.
- **Security doesn't fall off**: guests reach only what the link allows; spam and bots are rate-limited; the owner
  can stop everything at once.
- It has to **work for other people** too: a friend running Shiori shares their wikis the same way.
- Later: two people with the same wiki repo on their own PCs, keeping pages and comments in step.

Constraints from ADR-0001 and ADR-0002 still hold: pages are files written by agents; the app's only runtime write is
a wiki's `data/wiki.db`; one renderer for every wiki; Windows first.

## Decision

Run a **separate, locked-down guest server** on the host, reachable from the internet only through a **Cloudflare
Quick Tunnel** that Shiori starts and stops itself. Share links are secret, per wiki, held in memory, and expire.

### Shape

```text
Guest's browser ──HTTPS──▶ Cloudflare edge ──▶ cloudflared (on the host, outbound only)
                                                  │
                                                  ▼
                                   Guest server 127.0.0.1:4420  (allowlisted routes, one wiki per link)
                                                  │
                                                  ▼
                                   the wiki's files + data/wiki.db   (same as the owner's app uses)

Owner's app 127.0.0.1:4400 (the normal Shiori) ── never tunneled
```

- `cloudflared` opens an **outbound** connection to Cloudflare, so no router ports are opened and the home IP stays
  hidden. Shiori starts it with the first share and stops it when the last share ends or the app exits.
- The **guest server** is a second Hono app on its own port, bound to `127.0.0.1`, built from an allowlist. The
  owner's server, the deck, other wikis, `/dev` pages and agent-only actions don't exist on it.
- Only the **built** app is served to guests. `pnpm dev` (Vite with live reload) can't share.

### Tunnel

| Choice | Decision |
|---|---|
| Provider | Cloudflare **Quick Tunnel** (`cloudflared tunnel --url http://127.0.0.1:4420`): no account, a random `*.trycloudflare.com` address, ends with the process |
| Its limits | No Server-Sent Events and 200 requests in flight per tunnel; no uptime promise. Guests poll instead of SSE (below); 200 is far above a friends-sized wiki |
| Later | A **named tunnel** (free Cloudflare account, own domain, stable address, SSE) and **Tailscale Funnel** (TLS ends on the host, so the tunnel provider can't read traffic) as alternative providers behind the same interface |
| Install | `cloudflared` from `winget install Cloudflare.cloudflared` (or brew/apt); Shiori detects it and says how to install it |

### Share links

- Format: `https://<random>.trycloudflare.com/s/<token>/`. The token is 32 random bytes (base64url), so links can't
  be guessed; the tunnel's random hostname is a second layer.
- Held **only in memory** (`token → wiki, kind, expiry, label`). Restarting the app ends every link, by design.
- **Two kinds of link:**
  - **View**: read pages, search, follow links, see comments and questions.
  - **View + comment**: also comment on text or on the whole page, reply, and answer questions.
- **Who resolves comments:** the owner (and agents, through the CLI) resolve or reopen any thread. **Guests resolve
  or reopen only threads they started.**
- **Duration:** 1 hour, **24 hours (default)**, 7 days, or until Shiori closes. Expired links answer `410 Gone`.
- The owner can **revoke** a link, and **Stop all sharing** revokes every link and stops the tunnel at once.
- At most 10 links active at a time.

### Guests

- A guest opens the link and types a **display name** (2–32 characters, no control characters). The server gives
  them a random guest id in a signed cookie (HMAC with a secret made fresh each run; `HttpOnly`, `Secure`,
  `SameSite=Strict`, scoped to `/s/<token>/`).
- Comments and answers record who wrote them. The database gains author columns (`author`: user, agent or guest, plus
  the guest's name and id); the owner's comments keep showing as "You" in the app and with the owner's chosen name to
  guests. Agents see guests' names in `pnpm shiori inbox`.
- Guests can't edit pages; nobody can in Shiori. They never see other wikis, the deck, the CLI or the dev pages.

### Allowed routes (guest server)

| Route | View | View + comment |
|---|---|---|
| The built app, under `/s/<token>/` | ✓ | ✓ |
| Read the wiki: `wiki`, `page`, `pages` (index), `search`, `files/*` (media only, as today) | ✓ | ✓ |
| Read `threads` and `answers` for a page | ✓ | ✓ |
| ~~The toolbox: `kits`, `elements`, `toolbox/assets/*`~~ The host's only since ADR-0010 | | |
| Presence (ADR-0005): read who is here, say which page you're on, leave | ✓ | ✓ |
| Designs (ADR-0006): read them and their files | ✓ | ✓ |
| Designs: make one, change or remove your own (drawing, text, pictures) | | ✓ |
| `POST` a thread, a reply, an answer | | ✓ |
| Resolve or reopen a thread they started | | ✓ |
| Anything else (other wikis, `/api/wikis`, `/api/dev`, `/api/events`, owner actions) | 404 | 404 |

Every route checks the link (exists, not expired, right wiki) before anything else.

### Abuse limits

Token buckets per guest id and per client IP. The IP comes from Cloudflare's `CF-Connecting-IP`, trusted only
because the guest server listens on loopback for `cloudflared` alone.

| Limit | Value |
|---|---|
| Reads | 120 requests a minute per IP (bursts of 40) |
| Writes | 6 a minute and 60 a day per guest; 300 a day per link |
| Joining | 10 new guest names an hour per IP |
| Sizes | a comment 4 KB, a request 16 KB, a quote 4,000 characters |
| Guests | 200 per link |
| Over a limit | `429` with `Retry-After`. Five `429`s in ten minutes blocks that guest and IP for the rest of the link's life, and the owner sees it |

### Web safety

- **Headers** on every guest response: a Content Security Policy (`default-src 'self'`; scripts only from the app;
  frames only from YouTube's no-cookie domain, Vimeo and Figma for `::embed`; `frame-ancestors 'none'`),
  `Referrer-Policy: no-referrer` (the token is in the URL and must never leak to an embed or an outside link),
  `X-Content-Type-Options: nosniff`, and no CORS.
- **Cross-site requests:** the cookie is `SameSite=Strict`, and every `POST` checks its `Origin` header.
- **Content:** comments and names render as text (React escapes them); guests can't upload files.
- **Prompt injection:** guests' comments are read by AI agents. Agents treat comment text as data: a comment can ask
  for a change to the wiki's pages, never for a command, a file outside the wiki, a secret or a push. The template's
  `AGENTS.md` says so.

### Owner's controls

A **Share** button on a wiki (the wiki header) opens a dialog:

- choose the kind and the duration, then copy the link;
- see the active links with their expiry countdown, guests (name, last seen, comments) and recent activity;
- **hide** a guest's comment (kept in the database, hidden from guests and from the inbox), **block** a guest, and
  **revoke** a link;
- **Stop all sharing**.

Guest activity is kept in memory (the last 500 actions) for the dialog; nothing new is written outside `data/`.

### What guests run

The same React app in **guest mode**: it learns its link and wiki from `/s/<token>/api/session`, uses
`/s/<token>/` as its base path, hides the deck, the CLI and dev links, and gets **live updates by long polling**
instead of SSE: each request for changes waits on the server until the wiki changes (or 25 seconds pass), so new
comments and edits show within about a second, and an idle wiki costs one small `304` every 25 seconds.

### Phase 1 as built

Details settled while building the guest server (2026-10-21):

| Part | Decision |
|---|---|
| Code | `server/sharing/`: `shares.ts` (the links), `limits.ts` (buckets and windows), `guest.ts` (the guest app). `server/wikiData.ts` holds the corpus cache both servers read, so a page renders once for owner and guests. Client: `src/lib/base.ts` (the link's base path), `src/guest/` (the gate, the name prompt, permissions) |
| Owner API | `GET` / `POST /api/shares`, `DELETE /api/shares/:id` (revoke), `DELETE /api/shares` (stop all). Only `--static` (start-web) shares; in dev these answer `409` |
| Guest server | `server/main.ts` starts it on `127.0.0.1:4420` (`--guest-port`) with the first active link and closes it with the last |
| Public files | The app's code and styles (`/assets/*`, `/favicon.svg`) are served without a link: they hold no wiki data. Everything with data is under `/s/<token>/`; `/` and every other path answer `404` |
| Names first | Every guest, on view links too, picks a name before reading; data routes answer `401` without one. Names the owner or an agent sign with (Host, Owner, Agent, You…) and names already used on the link are refused |
| Owner's name | Guests see the owner's messages signed **Host** until item 12 lets the owner pick a name |
| Guests' writes | Comments only on pages that exist; replies only to open threads; status only `open` or `resolved` (won't fix stays the owner's) |
| Live updates | `GET /s/<token>/api/wikis/<id>/changes?wait=25` with the guest's ETag waits until the wiki changes and then returns its page and comment versions, or answers `304` after 25 seconds (a weakened `W/` ETag counts). The client asks again at once and turns a change into the same live events SSE gives the owner; a `429` waits for `Retry-After`. Three requests in a row with no answer (the last link ended, so the server stopped) show "Couldn't reach the wiki". Each waiting guest holds one of the tunnel's 200 requests in flight, far more than a friends-sized link needs |
| Caching | `private, no-store` on everything behind a link, `private, max-age=300` on its media, so Cloudflare's edge caches nothing |
| Embeds | The iframe keeps `strict-origin-when-cross-origin`: YouTube gets the tunnel's host name, never the path with the token |
| Owner's server | Now answers only to loopback host names (no DNS rebinding) and refuses writes whose `Origin` isn't the app, so another site can't make a share link |
| Until the tunnel | Links point at `http://127.0.0.1:4420/s/<token>/` and work on the host only; item 10 swaps in the public address |

### Phase 2 as built

Details settled while building the tunnel and the owner's controls (2026-10-21):

| Part | Decision |
|---|---|
| Code | `server/sharing/tunnel.ts` (cloudflared), owner routes in `server/app.ts`, client in `src/sharing/` (`ShareDialog.tsx`, `useShares.ts`) |
| Finding cloudflared | On `PATH`, then where winget installs it (`Program Files (x86)/cloudflared/`), so installing while Shiori runs works without a restart. Checked again each time the tunnel starts |
| Starting | `cloudflared tunnel --no-autoupdate --url http://127.0.0.1:4420` with the first active link. The address is the `*.trycloudflare.com` URL in its log |
| Health check | Once cloudflared logs "Registered tunnel connection" (or 5 s after the address shows), `GET <address>/` until it answers with the guest server's own 404 and CSP, every 2 s, for up to 60 s. The name is resolved through 1.1.1.1, so Windows never caches "no such name" for an address a few seconds too new |
| States | `GET /api/shares` returns `{ shares, tunnel, host }`; `tunnel.state` is `off`, `missing` (with the install command), `starting`, `up` (with the address) or `failed` (with cloudflared's last log line). `POST /api/shares/tunnel` tries again; any link starting or ending does too |
| Links' address | `ShareInfo.url` is on the tunnel's address only while it's `up`; otherwise on `http://127.0.0.1:4420`, which the dialog says works on this PC only |
| Stopping | With the last link, on `SIGINT`/`SIGTERM` and on the server's exit. |
| Owner's name | Held in memory (`PUT /api/shares/host`, 2–32 characters); the dialog remembers it in the browser and sends it with each new link, so it survives restarts. A guest can't join with it, and the owner can't take a name a guest on an active link uses |
| Blocking | `PATCH /api/shares/:id/guests/:guest { blocked }` blocks the guest and the address they joined from (a fresh cookie doesn't get around it); letting them back in clears both. Opening or reloading a link the guest server refuses (blocked `403`, ended `410`, unknown `404`) gets the bare app with that status, so the gate says why; the API under it answers JSON and nothing from the wiki |
| Hiding | Migration 4 adds `hidden` to `messages` and `answers`. `PATCH /api/wikis/:id/messages/:mid` and `/answers/:aid { hidden }`, for guests' text only. Guests never receive hidden text; a hidden first message hides the whole thread from them (replying to it or resolving it answers `404`). `pnpm shiori inbox` and the question counts leave it out; `pnpm shiori threads` lists it marked "hidden by the owner"; backups keep the flag |
| Dialog | A Share button in the sidebar head (in the wiki header since ADR-0005, beside the live badge). Never rendered for guests. In dev it shows the server's `409` message. It updates live: the owner's SSE stream sends a `shares` event (at most every 250 ms) when links, guests, activity, the host's name or the tunnel change |

### Two PCs with the same wiki (phase 3)

Pages are already files in git. To merge comments too: comments and answers get IDs that can't collide (ULIDs plus
the PC they came from) instead of counters, `backup.json` merges by ID, and `pnpm shiori sync <id>` pulls, merges the
backups, and pushes. Page conflicts stay git's job. The main case remains **one host PC plus share links**.

As built (2026-10-21):

| Part | Decision |
|---|---|
| Ids | Every thread, message and answer has a `uid` (a ULID: time, then randomness) and an `updated_at` (migration 6; older rows and old backups get theirs). The `#12` numbers stay, and are each PC's own |
| Files | Each PC writes everything it knows to **its own** `sync/<pc name>-<id>.json` in the wiki folder (the backup format plus which PC wrote it). The PC's name and id are made once and kept in `data/machine.json`. Since no two PCs ever write the same file, git never has to merge comments: a merge of the files themselves can't conflict |
| Merging | Every other PC's file is merged into the database by uid: new items are added; for one both PCs have, the newer `updated_at` wins (status, hidden flags, the page after a `shiori rename`). Nothing is ever deleted, so merging only adds or updates. A PC's file is rewritten only when its data changed, so a sync with nothing new commits nothing |
| `pnpm shiori sync <id>` | Pulls (`--rebase --autostash`; a conflict stops it before anything changes), merges, writes this PC's file, commits only that file and `designs/` ("Sync comments and designs from <pc>", ADR-0006) and pushes, unless `--no-push`. A wiki that isn't in git (a Syncthing or Dropbox folder) only merges and writes. A wiki in Shiori's own `wikis/` is ignored by the app's repo, so that repo is never used |
| `backup.json` | Stays the one-PC backup and keeps uids now, so a restore keeps each item's identity |

## Options Considered

### Option A: Guest server on the host + Cloudflare Quick Tunnel (chosen)

| Dimension | Assessment |
|---|---|
| Complexity | Medium: a second small server, a tunnel manager, rate limits, guest identity |
| Cost | Free; no account needed |
| Scalability | Friends-sized: 200 requests in flight per tunnel, the host PC's bandwidth |
| Familiarity | Same Hono stack; `cloudflared` is a single binary |
| Privacy | Data stays on the host. Traffic passes through Cloudflare's edge, which terminates TLS |

**Pros:** Nothing to set up for the owner or the guests. The home IP stays hidden. Links die with the app.
**Cons:** No SSE (polling instead). A new address every time the tunnel starts. Cloudflare could technically read
the traffic.

### Option B: Tailscale Funnel

| Dimension | Assessment |
|---|---|
| Complexity | Medium; same guest server |
| Cost | Free personal plan; needs a Tailscale account and the client installed and Funnel enabled |
| Privacy | Best: TLS ends on the host, so Tailscale can't read the traffic |

**Pros:** Stable `*.ts.net` address, SSE works. **Cons:** An account and admin setup for every owner, which breaks
"one button". Kept as a second provider.

### Option C: ngrok

**Pros:** Familiar, stable free domain. **Cons:** Needs an account, and the free plan shows visitors a warning page
first. Rejected.

### Option D: Host the wiki somewhere (a server, or a static export)

**Pros:** Always online, no tunnel. **Cons:** The wiki and its comments leave the PC, which breaks the main
requirement, and a public server needs real accounts. Rejected for now.

### Option E: Open the owner's server to the internet (port forwarding)

**Cons:** Exposes the home IP and every route of the owner's app, and depends on router setup. Rejected.

## Trade-off Analysis

The deciding requirement is "the setup never leaves my PC". Options D and E break it, B and C add accounts to a
one-button flow, and A keeps everything on the host with no setup. A's costs are acceptable for sharing with friends
for a day: polling instead of SSE is cheap at this size, and the 200-request limit is far away. Its real weakness,
Cloudflare seeing the traffic in transit, is answered by making the tunnel provider swappable: Tailscale Funnel slots
in for owners who want end-to-end privacy.

Security rests on the guest server being a **separate allowlist**, not a filter in front of the owner's server.
Anything not written into it can't be reached, so new owner features stay private by default.

## Consequences

- **Easier:** sharing a wiki is one click; friends need only a browser; links clean themselves up.
- **Harder:** Shiori now has a public surface. Every guest route needs tests for the link check, the other-wiki
  block, expiry, limits and `Origin` checks, and a security review whenever it changes.
- **Harder:** comments gain authors. The comment UI, the inbox and backups all carry names.
- **Revisit:** named tunnels for a stable address; Tailscale Funnel as the private provider; accounts if wikis
  ever become public for strangers rather than friends. (Live updates for guests came with long polling, and two-PC
  sync with phase 3.)

## Action Items

**Phase 1: guest server and safety**

1. [x] Share registry in memory: tokens, kinds, expiry, revoke, stop all
2. [x] Guest server on `127.0.0.1:4420`: the allowlisted routes, link checks, `410` for expired links
3. [x] Guest identity: name prompt, signed cookie; author columns for messages and answers (migration 3; backups
   and `pnpm shiori inbox` carry names)
4. [x] Guests resolve or reopen only their own threads
5. [x] Rate limits and blocking; size limits
6. [x] Security headers, CSP, `Origin` checks (and the owner's server locked to loopback names and its own origin)
7. [x] Guest mode in the client: base path, session, polling with ETags, nothing owner-only shown
8. [x] Tests for every guest route: wrong token, other wiki, expired, view-only writes, limits, CSRF
9. [x] Template `AGENTS.md`: guests' comments are untrusted input (`pnpm shiori inbox` says so too)

**Phase 2: tunnel and owner UI**

10. [x] `cloudflared` manager: detect, start, read the address, health check, stop on exit
11. [x] Share dialog: kind, duration, copy link; active links, guests, activity
12. [x] Moderation: hide a comment, block a guest; owner's display name for guests

**Phase 3: two PCs**

13. [x] Collision-free IDs for comments and answers; one sync file per PC, merged by uid; `pnpm shiori sync`

# ADR-0004: Pictures only, served as resized WebP

**Status:** Accepted
**Date:** 2026-10-21
**Deciders:** Nari (owner), Claude (implementer)

## Context

Pages show pictures everywhere: the infobox, galleries, banners, images in the text, and the image viewer's strip,
which loads every picture in the wiki as a thumbnail (ADR-0002). Until now every one of them came as its original
file: a 6 MB screenshot was sent whole to a 76-pixel thumbnail, and a guest on a phone (ADR-0003) downloaded all of
it through the tunnel. The files route also served sounds, videos and fonts, which no page uses.

What a wiki may hold, and what it costs to show:

- Agents add pictures to a wiki's `assets/` (from Blender, image tools, screenshots). Nobody uploads through the app.
- Videos belong on YouTube or Vimeo and in a page through `::embed`; they're too heavy for a wiki folder and git.
- The app must not change a wiki's files (ADR-0001); its only runtime writes go to the wiki's `data/`.

## Decision

**Pictures only.** A wiki's files route serves PNG, JPEG, WebP, GIF, AVIF and SVG, nothing else. `pnpm shiori check`
reports videos and sounds anywhere in the wiki ("only pictures belong in a wiki; put videos on YouTube or Vimeo and
use ::embed") and pictures over **15 MB**, which aren't served.

**Resized WebP copies.** A picture asked for with `?w=` comes resized to that width (never larger than the original)
as WebP, made with `sharp` (prebuilt binaries, nothing to compile on Windows):

| Width | Used for |
|---|---|
| 160 | Pictures used as icons, the header's cover |
| 480 | Gallery tiles, link previews, the home page's cover |
| 960 | Infobox pictures |
| 1600 | Pictures in the text |
| 2400 | The image viewer, banners |

Only these widths are made, so the cache stays bounded. SVGs are always sent as they are. Animated GIFs become
animated WebP. The original file is never touched.

**Cache in `data/`.** Each copy is written once to `<wiki>/data/cache/pictures/`, named by a hash of the file's
path, size, modified time and width, so an edited picture gets new copies. `data/` keeps its `.gitignore` of `*`.
Copies are made on first request and shared by concurrent requests. Every response carries an ETag from the same
hash, so a browser that already has a picture gets a `304`; guests' pictures are `private, no-cache`, so Cloudflare
never keeps them.

## Options Considered

### Option A: Resize on request, cache in `data/` (chosen)

**Pros:** Originals stay untouched; any picture an agent adds is small on screen with no extra step; the cache can
be deleted at any time. **Cons:** A first view of a large gallery waits for its copies; old copies stay until
`data/cache/` is deleted.

### Option B: Convert originals in place (`pnpm shiori optimize`)

**Pros:** No runtime work, smaller repos. **Cons:** Rewrites the wiki's files and loses the originals' quality, and
works only when an agent remembers to run it.

### Option C: Resize in memory, no cache

**Pros:** Writes nothing. **Cons:** Converts the same picture on every request, which is slow for the viewer's strip.

## Consequences

- **Easier:** galleries, the viewer and guests on phones load a fraction of the bytes; agents keep adding pictures
  as before.
- **Harder:** the app now writes a second thing at runtime, cached pictures, still only inside `data/`.
- **Revisit:** pruning old copies when the cache grows; `srcset` for high-density screens.

## Action Items

1. [x] Files route: pictures only, at most 15 MB; `?w=` copies as WebP cached in `data/cache/pictures/`; ETags
2. [x] `pnpm shiori check`: videos, sounds and oversized pictures
3. [x] The app asks for the width each place needs (`picture()` in `src/lib/base.ts`)

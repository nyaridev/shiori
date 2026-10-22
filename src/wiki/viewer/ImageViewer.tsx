// The image viewer: a picture as large as the window, arrows (and ← →) to step through pictures, and a strip of every
// picture in the wiki at the bottom. The strip runs in reading order, grouped by page and labelled with its sections,
// and opens on the page you're on: the pages beside it in the sidebar sit beside it here, and stepping past a page's
// first or last picture carries on into its neighbours.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import type { ImageGroup, PageImage } from "../../../shared/api.ts";
import { api } from "../../lib/api.ts";
import { picture } from "../../lib/base.ts";
import { useLive } from "../../lib/live.ts";
import { useResource } from "../../lib/useResource.ts";
import { Dialog, DialogContent, IconButton, ScrollArea } from "../../ui/index.ts";
import { pageHref } from "../PageHead.tsx";
import "./viewer.css";
import { PageIcon } from "../PageIcon.tsx";

interface Shown extends PageImage {
  /** Index of its group (page) in the strip. */
  group: number;
}

/** What's on screen: a picture and the page it was found on (the same picture can be on several pages). */
interface Current {
  src: string;
  page: string;
}

export function ImageViewer({
  wikiId,
  path,
  open,
  onClose,
}: {
  wikiId: string;
  /** The page the viewer was opened from. */
  path: string;
  /** The picture it was opened on; null while closed. */
  open: string | null;
  onClose: () => void;
}) {
  const groups = useResource(open === null ? null : `images:${wikiId}`, () => api.images(wikiId));
  const { reload } = groups;
  useLive((e) => {
    if (e.type === "pages" && e.wiki === wikiId) reload();
  });

  const [current, setCurrent] = useState<Current | null>(null);
  useEffect(() => setCurrent(open === null ? null : { src: open, page: path }), [open, path]);

  const list: ImageGroup[] = groups.data ?? [];
  const flat = useMemo(() => list.flatMap((g, group) => g.images.map((img): Shown => ({ ...img, group }))), [list]);
  const at = useMemo(() => {
    if (!current) return -1;
    const here = flat.findIndex((f) => f.src === current.src && list[f.group].page.path === current.page);
    return here >= 0 ? here : flat.findIndex((f) => f.src === current.src);
  }, [flat, list, current]);
  // Until the wiki's pictures arrive (or when this one isn't among them), show it on its own.
  const shown: Shown | null = at >= 0 ? flat[at] : current && { src: current.src, group: -1 };
  const group = shown && shown.group >= 0 ? list[shown.group] : undefined;

  const step = useCallback(
    (by: number) => {
      const next = flat[at + by];
      if (at >= 0 && next) setCurrent({ src: next.src, page: list[next.group].page.path });
    },
    [flat, list, at],
  );

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step]);

  // Keep the current thumbnail in the middle of the strip.
  const active = useRef<HTMLButtonElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the picture changes.
  useEffect(() => {
    active.current?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [at]);

  let offset = 0;
  return (
    <Dialog open={open !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={shown?.caption ?? group?.page.title ?? "Picture"} size="viewer">
        {shown && (
          <div className="sh-viewer">
            <div className="sh-viewer-stage">
              <img key={shown.src} src={picture(shown.src, 2400)} alt={shown.caption ?? ""} />
              {flat.length > 1 && (
                <>
                  <IconButton
                    icon="chevronLeft"
                    label="Previous picture"
                    variant="soft"
                    className="sh-viewer-arrow"
                    data-side="left"
                    disabled={at <= 0}
                    onClick={() => step(-1)}
                  />
                  <IconButton
                    icon="chevronRight"
                    label="Next picture"
                    variant="soft"
                    className="sh-viewer-arrow"
                    data-side="right"
                    disabled={at < 0 || at >= flat.length - 1}
                    onClick={() => step(1)}
                  />
                </>
              )}
            </div>
            <p className="sh-viewer-info">
              {group && (
                <Link to={pageHref(wikiId, group.page.path)} onClick={onClose}>
                  <PageIcon icon={group.page.icon} className="sh-icon-gap" />
                  {[...group.trail, group.page.title].join(" › ")}
                </Link>
              )}
              {at >= 0 && (
                <span>
                  {at + 1} / {flat.length}
                </span>
              )}
            </p>
            {list.length > 0 && (
              <ScrollArea as="nav" axis="x" className="sh-viewer-strip" aria-label="Pictures in this wiki">
                {list.map((g, gi) => {
                  const first = offset;
                  offset += g.images.length;
                  const here = g.page.path === path;
                  // A new top-level section starts a new stretch of the strip.
                  const section = (g.trail[0] ?? g.page.title) !== (list[gi - 1]?.trail[0] ?? list[gi - 1]?.page.title);
                  return (
                    <section
                      key={g.page.path}
                      className="sh-viewer-group"
                      data-here={here || undefined}
                      data-section={section || undefined}
                    >
                      <span className="sh-viewer-group-label">
                        <span>{g.trail.join(" › ") || "Top"}</span>
                        <strong>{here ? `${g.page.title} · this page` : g.page.title}</strong>
                      </span>
                      <span className="sh-viewer-thumbs">
                        {g.images.map((img, ii) => {
                          const i = first + ii;
                          return (
                            <button
                              key={img.src}
                              ref={i === at ? active : undefined}
                              type="button"
                              className="sh-viewer-thumb"
                              aria-current={i === at || undefined}
                              aria-label={img.caption ?? `${g.page.title}, picture ${ii + 1}`}
                              onClick={() => setCurrent({ src: img.src, page: g.page.path })}
                            >
                              <img src={picture(img.src, 160)} alt="" loading="lazy" />
                            </button>
                          );
                        })}
                      </span>
                    </section>
                  );
                })}
              </ScrollArea>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

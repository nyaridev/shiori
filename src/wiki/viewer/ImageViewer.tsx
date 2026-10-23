// The image viewer: a card in the middle of the window, as the public wiki's. The picture on a quiet stage, its caption
// under it, and one row with the page it's on and arrows (and ← →) that step through every picture in the wiki in
// reading order. It opens on your page, so stepping past a page's first or last picture carries on into its neighbours.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import type { ImageGroup, PageImage } from "../../../shared/api.ts";
import { api } from "../../lib/api.ts";
import { picture } from "../../lib/base.ts";
import { useLive } from "../../lib/live.ts";
import { useResource } from "../../lib/useResource.ts";
import { Dialog, DialogContent, IconButton } from "../../ui/index.ts";
import { pageHref } from "../PageHead.tsx";
import { PageIcon } from "../PageIcon.tsx";
import "./viewer.css";

interface Shown extends PageImage {
  /** Index of its group (page) in the wiki's list. */
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

  return (
    <Dialog open={open !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={shown?.caption ?? group?.page.title ?? "Picture"} size="viewer">
        {shown && (
          <figure className="sh-viewer">
            <div className="sh-viewer-stage">
              <img key={shown.src} src={picture(shown.src, 2400)} alt={shown.caption ?? ""} />
            </div>
            {shown.caption && <figcaption className="sh-viewer-caption">{shown.caption}</figcaption>}
            {(group || flat.length > 1) && (
              <div className="sh-viewer-foot">
                {group && (
                  <Link className="sh-viewer-page" to={pageHref(wikiId, group.page.path)} onClick={onClose}>
                    <PageIcon icon={group.page.icon} className="sh-icon-gap" />
                    {group.page.title}
                  </Link>
                )}
                {flat.length > 1 && (
                  <span className="sh-viewer-steps">
                    <IconButton
                      icon="chevronLeft"
                      label="Previous picture"
                      size="sm"
                      disabled={at <= 0}
                      onClick={() => step(-1)}
                    />
                    <span>{at >= 0 ? `${at + 1} / ${flat.length}` : ""}</span>
                    <IconButton
                      icon="chevronRight"
                      label="Next picture"
                      size="sm"
                      disabled={at < 0 || at >= flat.length - 1}
                      onClick={() => step(1)}
                    />
                  </span>
                )}
              </div>
            )}
          </figure>
        )}
      </DialogContent>
    </Dialog>
  );
}

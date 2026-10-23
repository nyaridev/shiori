// Zooming and moving around the paper (ADR-0006, the drawing board). The view is a zoom and an offset over the paper
// at its fitted size; the frame gets them as a CSS transform, so drawing still maps through its on-screen box.
import { type RefObject, useCallback, useState } from "react";

export interface View {
  zoom: number;
  x: number;
  y: number;
}
export const FIT: View = { zoom: 1, x: 0, y: 0 };
const ZOOM = { min: 0.25, max: 16 };

export function useView(frame: RefObject<HTMLDivElement | null>) {
  const [view, setView] = useState<View>(FIT);

  /** Zooms by `by`, keeping the point under (clientX, clientY) where it is; without one, the middle of the paper. */
  const zoomBy = useCallback(
    (by: number, clientX?: number, clientY?: number) =>
      setView((v) => {
        const el = frame.current;
        const zoom = Math.min(ZOOM.max, Math.max(ZOOM.min, v.zoom * by));
        if (!el || zoom === v.zoom) return v;
        // The frame's box on screen already has the current view in it.
        const r = el.getBoundingClientRect();
        const cx = clientX ?? r.left + r.width / 2;
        const cy = clientY ?? r.top + r.height / 2;
        const ux = (cx - r.left) / v.zoom;
        const uy = (cy - r.top) / v.zoom;
        return { zoom, x: cx - ux * zoom - (r.left - v.x), y: cy - uy * zoom - (r.top - v.y) };
      }),
    [frame],
  );
  /** Zooms to exactly `zoom`, with the paper in the middle of the stage. */
  const zoomTo = useCallback(
    (zoom: number) => {
      const el = frame.current;
      const z = Math.min(ZOOM.max, Math.max(ZOOM.min, zoom));
      // The frame sits in the middle at zoom 1; scaling from its corner, it moves back by half of what it grows.
      setView(el ? { zoom: z, x: (el.offsetWidth * (1 - z)) / 2, y: (el.offsetHeight * (1 - z)) / 2 } : FIT);
    },
    [frame],
  );
  const panBy = useCallback((dx: number, dy: number) => setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy })), []);
  const fit = useCallback(() => setView(FIT), []);
  const atFit = view.zoom === 1 && view.x === 0 && view.y === 0;
  return { view, zoomBy, zoomTo, panBy, fit, atFit };
}

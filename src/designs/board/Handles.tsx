// The paper's eight resize handles (ADR-0006, the drawing board): a bar on each edge and a square on each corner.
// Dragging shows the new size as an outline, and lets go into `onResize`; arrow keys on a handle resize by 50 pixels
// (10 with Shift). The paper grows or shrinks on the dragged side; the board keeps the drawing where it is.
import { type KeyboardEvent, type PointerEvent, useState } from "react";
import { clampPaper, type Edge, type Size } from "./paper.ts";

const EDGES: { edge: Edge; label: string }[] = [
  { edge: "n", label: "top edge" },
  { edge: "s", label: "bottom edge" },
  { edge: "e", label: "right edge" },
  { edge: "w", label: "left edge" },
  { edge: "ne", label: "top right corner" },
  { edge: "nw", label: "top left corner" },
  { edge: "se", label: "bottom right corner" },
  { edge: "sw", label: "bottom left corner" },
];

export function Handles({
  paper,
  scale,
  onPreview,
  onResize,
}: {
  paper: Size;
  /** Screen pixels per paper pixel. */
  scale: number;
  /** The size a drag would make, or null when it ends. */
  onPreview: (size: Size | null) => void;
  onResize: (size: Size, edge: Edge) => void;
}) {
  const [drag, setDrag] = useState<{ edge: Edge; size: Size } | null>(null);

  /** The size a handle's move of (dx, dy) screen pixels makes. */
  const moved = (edge: Edge, dx: number, dy: number): Size =>
    clampPaper(
      {
        width: paper.width + (edge.includes("e") ? dx : edge.includes("w") ? -dx : 0) / scale,
        height: paper.height + (edge.includes("s") ? dy : edge.includes("n") ? -dy : 0) / scale,
      },
      edge,
    );

  const down = (edge: Edge) => (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const start = { x: e.clientX, y: e.clientY };
    let last: Size = paper;
    const show = (size: Size | null) => {
      setDrag(size && { edge, size });
      onPreview(size);
    };
    const move = (ev: globalThis.PointerEvent) => {
      last = moved(edge, ev.clientX - start.x, ev.clientY - start.y);
      show(last);
    };
    const stop = (apply: boolean) => () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
      show(null);
      if (apply) onResize(last, edge);
    };
    const up = stop(true);
    const cancel = stop(false);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
    show(paper);
  };

  const key = (edge: Edge) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const by = e.shiftKey ? 10 : 50;
    const step = { ArrowRight: [by, 0], ArrowLeft: [-by, 0], ArrowDown: [0, by], ArrowUp: [0, -by] }[e.key];
    if (!step) return;
    e.preventDefault();
    e.stopPropagation();
    onResize(moved(edge, step[0] * scale, step[1] * scale), edge);
  };

  // While dragging: the new paper as an outline, from the edges that stay.
  const outline = drag && {
    left: drag.edge.includes("w") ? (paper.width - drag.size.width) * scale : 0,
    top: drag.edge.includes("n") ? (paper.height - drag.size.height) * scale : 0,
    width: drag.size.width * scale,
    height: drag.size.height * scale,
  };
  return (
    <>
      {outline && <div className="sh-board-outline" style={outline} aria-hidden="true" />}
      {EDGES.map(({ edge, label }) => (
        <button
          key={edge}
          type="button"
          className="sh-board-handle"
          data-edge={edge}
          aria-label={`Resize the paper from the ${label} (arrow keys)`}
          title="Drag to resize the paper"
          onPointerDown={down(edge)}
          onKeyDown={key(edge)}
        />
      ))}
    </>
  );
}

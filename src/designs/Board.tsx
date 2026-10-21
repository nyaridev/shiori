// The drawing board of a design (ADR-0006): white paper, a pen that follows the tablet's pressure, an eraser, a fill,
// a dozen inks plus any colour, five sizes, undo and redo, and clear. It hands its PNG to `onSave` a moment after
// each change, so the design autosaves. Read-only, it just shows the drawing.
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, cx, IconButton, Tooltip } from "../ui/index.ts";

export const PAPER = { width: 1200, height: 900 };
/** Inks are drawing data, not the app's colours: they stay the same in every theme. */
const INKS = [
  "#1f1d1a",
  "#6f6a62",
  "#ffffff",
  "#d9483b",
  "#ef7d6b",
  "#f0b44c",
  "#f2dc5d",
  "#4fb487",
  "#2f8f6b",
  "#5b8def",
  "#2f4fb0",
  "#9b7be0",
];
const SIZES = [2, 5, 10, 20, 40];
const HISTORY = 30;
/** How long after the last change the drawing is saved. */
const SETTLE = 1200;

type Tool = "pen" | "eraser" | "fill";

export function Board({
  src,
  editable,
  onSave,
}: {
  /** The saved drawing, if there is one. */
  src: string | null;
  editable: boolean;
  onSave?: (png: Blob) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [ink, setInk] = useState(INKS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const undo = useRef<ImageData[]>([]);
  const redo = useRef<ImageData[]>([]);
  const [, setTick] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const drawing = useRef<{ x: number; y: number } | null>(null);
  const loaded = useRef<string | null>(null);

  const ctx = useCallback(() => canvas.current?.getContext("2d", { willReadFrequently: true }) ?? null, []);

  // The paper, then the saved drawing on it. Later saves of our own don't reload it.
  useEffect(() => {
    const c = ctx();
    if (!c || loaded.current === "self") return;
    c.fillStyle = "#ffffff";
    c.fillRect(0, 0, PAPER.width, PAPER.height);
    if (!src) return;
    const img = new Image();
    img.onload = () => {
      c.drawImage(img, 0, 0, PAPER.width, PAPER.height);
      loaded.current = src;
    };
    img.src = src;
  }, [src, ctx]);

  const changed = useCallback(() => {
    setTick((t) => t + 1);
    // From now on this board is the newest drawing: saves coming back don't reload it.
    loaded.current = "self";
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      canvas.current?.toBlob((blob) => blob && onSave?.(blob), "image/png");
    }, SETTLE);
  }, [onSave]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const snapshot = () => {
    const c = ctx();
    if (!c) return;
    undo.current.push(c.getImageData(0, 0, PAPER.width, PAPER.height));
    if (undo.current.length > HISTORY) undo.current.shift();
    redo.current = [];
  };

  const step = (from: ImageData[], to: ImageData[]) => {
    const c = ctx();
    const last = from.pop();
    if (!c || !last) return;
    to.push(c.getImageData(0, 0, PAPER.width, PAPER.height));
    c.putImageData(last, 0, 0);
    changed();
  };

  const at = (e: React.PointerEvent) => {
    const r = (canvas.current as HTMLCanvasElement).getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * PAPER.width, y: ((e.clientY - r.top) / r.height) * PAPER.height };
  };

  const line = (from: { x: number; y: number }, to: { x: number; y: number }, pressure: number) => {
    const c = ctx();
    if (!c) return;
    c.globalCompositeOperation = "source-over";
    c.strokeStyle = tool === "eraser" ? "#ffffff" : ink;
    // A mouse reports 0.5; a pen from light to firm.
    c.lineWidth = Math.max(1, size * (tool === "eraser" ? 2 : 1) * (0.35 + pressure * 1.3));
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath();
    c.moveTo(from.x, from.y);
    c.lineTo(to.x, to.y);
    c.stroke();
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!editable || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    snapshot();
    const p = at(e);
    if (tool === "fill") {
      fill(ctx(), Math.round(p.x), Math.round(p.y), ink);
      changed();
      return;
    }
    drawing.current = p;
    line(p, { x: p.x + 0.01, y: p.y }, e.pressure || 0.5);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    // Every point the pen passed, not only the last one the browser reported.
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    for (const ev of events) {
      const p = at(ev as unknown as React.PointerEvent);
      line(drawing.current, p, ev.pressure || 0.5);
      drawing.current = p;
    }
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = null;
    changed();
  };

  const clear = () => {
    const c = ctx();
    if (!c) return;
    snapshot();
    c.fillStyle = "#ffffff";
    c.fillRect(0, 0, PAPER.width, PAPER.height);
    changed();
  };

  return (
    <div className="sh-board" data-editable={editable || undefined}>
      {editable && (
        <div className="sh-board-tools" role="toolbar" aria-label="Drawing tools">
          <div className="sh-board-group">
            {(["pen", "eraser", "fill"] as const).map((t) => (
              <Button
                key={t}
                size="sm"
                variant={tool === t ? "solid" : "ghost"}
                aria-pressed={tool === t}
                onClick={() => setTool(t)}
              >
                {t === "pen" ? "Pen" : t === "eraser" ? "Eraser" : "Fill"}
              </Button>
            ))}
          </div>
          <div className="sh-board-group">
            {INKS.map((c) => (
              <button
                key={c}
                type="button"
                className={cx("sh-ink", ink === c && "is-current")}
                style={{ background: c }}
                aria-label={`Ink ${c}`}
                aria-pressed={ink === c}
                onClick={() => setInk(c)}
              />
            ))}
            <label className="sh-ink sh-ink-any" title="Any colour">
              <input type="color" value={ink} onChange={(e) => setInk(e.target.value)} aria-label="Any colour" />
            </label>
          </div>
          <div className="sh-board-group">
            {SIZES.map((s) => (
              <button
                key={s}
                type="button"
                className={cx("sh-size", size === s && "is-current")}
                aria-label={`Size ${s}`}
                aria-pressed={size === s}
                onClick={() => setSize(s)}
              >
                <span style={{ width: Math.min(22, s / 1.6 + 3), height: Math.min(22, s / 1.6 + 3) }} />
              </button>
            ))}
          </div>
          <div className="sh-board-group">
            <Tooltip content="Undo">
              <IconButton
                icon="undo"
                label="Undo"
                size="sm"
                disabled={!undo.current.length}
                onClick={() => step(undo.current, redo.current)}
              />
            </Tooltip>
            <Tooltip content="Redo">
              <IconButton
                icon="redo"
                label="Redo"
                size="sm"
                disabled={!redo.current.length}
                onClick={() => step(redo.current, undo.current)}
              />
            </Tooltip>
            <Button size="sm" variant="ghost" onClick={clear}>
              Clear
            </Button>
          </div>
        </div>
      )}
      <canvas
        ref={canvas}
        width={PAPER.width}
        height={PAPER.height}
        className="sh-board-paper"
        aria-label={editable ? "Drawing board" : "Drawing"}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      />
    </div>
  );
}

/** Fills the area of one colour around (x, y) with `color`, a scanline at a time. */
function fill(c: CanvasRenderingContext2D | null, x: number, y: number, color: string) {
  if (!c || x < 0 || y < 0 || x >= PAPER.width || y >= PAPER.height) return;
  const { width, height } = PAPER;
  const image = c.getImageData(0, 0, width, height);
  const px = image.data;
  const at = (i: number) => i * 4;
  const start = at(y * width + x);
  const target = [px[start], px[start + 1], px[start + 2], px[start + 3]];
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(color.slice(i, i + 2), 16));
  if (Math.abs(target[0] - r) + Math.abs(target[1] - g) + Math.abs(target[2] - b) < 3 && target[3] === 255) return;
  // Close enough to the colour clicked: soft pen edges fill too.
  const same = (i: number) =>
    Math.abs(px[i] - target[0]) + Math.abs(px[i + 1] - target[1]) + Math.abs(px[i + 2] - target[2]) < 96;
  const seen = new Uint8Array(width * height);
  const stack: [number, number][] = [[x, y]];
  while (stack.length) {
    const [sx, sy] = stack.pop() as [number, number];
    let lx = sx;
    while (lx > 0 && !seen[sy * width + lx - 1] && same(at(sy * width + lx - 1))) lx--;
    let up = false;
    let down = false;
    for (let cx = lx; cx < width; cx++) {
      const n = sy * width + cx;
      if (seen[n] || !same(at(n))) break;
      seen[n] = 1;
      const i = at(n);
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = 255;
      for (const [dy, flag] of [
        [-1, "up"],
        [1, "down"],
      ] as const) {
        const ny = sy + dy;
        if (ny < 0 || ny >= height) continue;
        const open = !seen[ny * width + cx] && same(at(ny * width + cx));
        const was = flag === "up" ? up : down;
        if (open && !was) stack.push([cx, ny]);
        if (flag === "up") up = open;
        else down = open;
      }
    }
  }
  c.putImageData(image, 0, 0);
}

// The drawing board of a design (ADR-0006, the drawing board): pen, pencil, brush, marker, airbrush, smudge, blur,
// eraser, fill and colour picker, each with its own size, opacity, flow and smoothing (remembered in this browser);
// tablet pressure; a mirror; zoom and pan; fullscreen; undo and redo (Ctrl+Z, Ctrl+Y) and a shortcut for every tool.
// The paper resizes from any edge or corner. A stroke paints onto its own layer and joins the drawing when the pen
// lifts, so a see-through stroke never darkens where it crosses itself. The PNG goes to `onSave` a moment after each
// change, so the design autosaves. Read-only, it just shows the drawing.
import { type PointerEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStored } from "../../lib/stored.ts";
import { type BrushSettings, DEFAULT_SETTINGS, dab, SIZE_RANGE, TOOL, type Tool, type ToolId } from "./brushes.ts";
import { blurDab, paintDab, Smudger } from "./engine.ts";
import { Handles } from "./Handles.tsx";
import { clampPaper, colorAt, type Edge, floodFill, PAPER, PAPER_COLOR, type Size } from "./paper.ts";
import { Path, type Point, Stabilizer } from "./stroke.ts";
import { INKS, Toolbar } from "./Toolbar.tsx";
import { useView } from "./useView.ts";
import "./board.css";

/** Undo keeps up to this many steps, within this much memory (a big paper keeps fewer). */
const HISTORY = { steps: 30, bytes: 160 * 1024 * 1024 };
/** How long after the last change the drawing is saved. */
const SETTLE = 1200;
/** Room around the paper for its handles and for growing it. */
const MARGIN = 28;
const NO_SETTINGS: Partial<Record<ToolId, Partial<BrushSettings>>> = {};

/** A stroke being drawn. */
interface Live {
  tool: Tool;
  settings: BrushSettings;
  steady: Stabilizer;
  path: Path;
  smudgers: Smudger[];
  last: Point;
}

/** Keys typed into a field are the field's, not the board's. */
const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable ||
    t.tagName === "TEXTAREA" ||
    t.tagName === "SELECT" ||
    (t instanceof HTMLInputElement && !["range", "color", "button", "checkbox", "radio"].includes(t.type)) ||
    !!t.closest("[role=dialog]"));

export function Board({
  src,
  editable,
  onSave,
}: {
  /** The saved drawing, if there is one: the original PNG, so its size and every pixel come back. */
  src: string | null;
  editable: boolean;
  onSave?: (png: Blob) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const layer = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const [storedTool, setTool] = useStored<ToolId>("shiori.board.tool", "pen");
  const toolId: ToolId = storedTool in TOOL ? storedTool : "pen";
  const [stored, setStored] = useStored("shiori.board.brushes", NO_SETTINGS);
  const [color, setColor] = useStored("shiori.board.ink", INKS[0]);
  const [mirror, setMirror] = useState(false);
  const [full, setFull] = useState(false);
  // The canvas's own width and height are set by hand, never by React: setting them clears it.
  const [paper, setPaper] = useState<Size>(PAPER);
  const [room, setRoom] = useState({ width: 0, height: 0 });
  const [preview, setPreview] = useState<Size | null>(null);
  const [panning, setPanning] = useState(false);
  const { view, zoomBy, zoomTo, panBy, fit: fitView, atFit } = useView(frame);
  const undo = useRef<ImageData[]>([]);
  const redo = useRef<ImageData[]>([]);
  const [, setTick] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const live = useRef<Live | null>(null);
  /** Where the last stroke ended, for Shift-click lines. */
  const lastEnd = useRef<Point | null>(null);
  const loaded = useRef<string | null>(null);
  const space = useRef(false);
  const hovering = useRef(false);
  const enteredFullscreen = useRef(false);

  const settingsOf = useCallback((id: ToolId): BrushSettings => ({ ...DEFAULT_SETTINGS[id], ...stored[id] }), [stored]);
  const settings = settingsOf(toolId);
  const tool = TOOL[toolId];
  const setSetting = (key: keyof BrushSettings, value: number) =>
    setStored({ ...stored, [toolId]: { ...settingsOf(toolId), [key]: value } });

  const ctx = useCallback(() => canvas.current?.getContext("2d", { willReadFrequently: true }) ?? null, []);
  const layerCtx = () => layer.current?.getContext("2d") ?? null;

  /** Gives the paper a new size, white, and returns its context. */
  const sizeTo = useCallback(
    (s: Size) => {
      const cv = canvas.current;
      if (!cv) return null;
      cv.width = s.width;
      cv.height = s.height;
      if (layer.current) {
        layer.current.width = s.width;
        layer.current.height = s.height;
      }
      const c = ctx();
      if (c) {
        c.fillStyle = PAPER_COLOR;
        c.fillRect(0, 0, s.width, s.height);
      }
      setPaper(s);
      return c;
    },
    [ctx],
  );

  // The paper, then the saved drawing on it at its own size. Later saves of our own don't reload it.
  useEffect(() => {
    if (loaded.current === "self") return;
    if (!src) {
      sizeTo(PAPER);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const c = sizeTo(clampPaper({ width: img.naturalWidth, height: img.naturalHeight }, "se"));
      c?.drawImage(img, 0, 0);
      loaded.current = src;
    };
    img.src = src;
  }, [src, sizeTo]);

  // How much room the board has: the stage's width, and most of the window's height (all of the stage, fullscreen).
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () =>
      setRoom({ width: el.clientWidth, height: full ? el.clientHeight : Math.max(360, window.innerHeight * 0.82) });
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      watch.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [full]);
  const margin = editable ? MARGIN : 0;
  // The paper as large as it fits, whole, in the room there is.
  const scale = room.width
    ? Math.max(0.05, Math.min((room.width - 2 * margin) / paper.width, (room.height - 2 * margin) / paper.height))
    : 0;

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

  // ── Undo ────────────────────────────────────────────────────────────────────────────────────────────────────────
  const whole = () => {
    const c = ctx();
    return c ? c.getImageData(0, 0, c.canvas.width, c.canvas.height) : null;
  };
  /** Keeps the newest steps that fit in memory. */
  const trim = (list: ImageData[]) => {
    let bytes = list.reduce((n, d) => n + d.data.length, 0);
    while (list.length > 1 && (list.length > HISTORY.steps || bytes > HISTORY.bytes))
      bytes -= (list.shift() as ImageData).data.length;
  };
  const snapshot = () => {
    const now = whole();
    if (!now) return;
    undo.current.push(now);
    trim(undo.current);
    redo.current = [];
  };
  const step = (from: ImageData[], to: ImageData[]) => {
    if (live.current) return;
    const last = from.pop();
    const now = whole();
    if (!last || !now) return;
    to.push(now);
    trim(to);
    // A step back may be to another size of paper.
    const c = last.width !== now.width || last.height !== now.height ? sizeTo(last) : ctx();
    c?.putImageData(last, 0, 0);
    changed();
  };
  const undoStep = () => step(undo.current, redo.current);
  const redoStep = () => step(redo.current, undo.current);

  /** Resizes the paper: the drawing stays put, paper is added or cut on the side of `edge`. */
  const resize = (next: Size, edge: Edge) => {
    const before = whole();
    if (!before || (next.width === before.width && next.height === before.height)) return;
    snapshot();
    const c = sizeTo(next);
    c?.putImageData(
      before,
      edge.includes("w") ? next.width - before.width : 0,
      edge.includes("n") ? next.height - before.height : 0,
    );
    changed();
  };

  const clear = () => {
    const c = ctx();
    if (!c) return;
    snapshot();
    c.fillStyle = PAPER_COLOR;
    c.fillRect(0, 0, c.canvas.width, c.canvas.height);
    changed();
  };

  // ── Drawing ─────────────────────────────────────────────────────────────────────────────────────────────────────
  /** Where a pointer is on the paper, in paper pixels, and how hard it presses (a mouse or finger: half). */
  const pointOf = (e: { clientX: number; clientY: number; pressure: number; pointerType: string }): Point => {
    const cv = canvas.current as HTMLCanvasElement;
    const r = cv.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * cv.width,
      y: ((e.clientY - r.top) / r.height) * cv.height,
      p: e.pointerType === "pen" ? e.pressure || 0.5 : 0.5,
    };
  };

  /** One dab of the stroke, and its reflection when the mirror is on. */
  const dabAt = (s: Live, at: Point) => {
    const main = ctx();
    const top = layerCtx();
    if (!main || !top) return;
    const { diameter, flow } = dab(s.tool, s.settings, at.p);
    const xs = mirror ? [at.x, main.canvas.width - at.x] : [at.x];
    xs.forEach((x, i) => {
      if (s.tool.kind === "paint" || s.tool.kind === "erase")
        paintDab(top, s.tool, s.tool.kind === "erase" ? PAPER_COLOR : color, x, at.y, diameter, flow);
      else if (s.tool.kind === "smudge") s.smudgers[i]?.dab(main, x, at.y, s.settings.flow);
      else if (s.tool.kind === "blur") blurDab(main, x, at.y, diameter, s.tool.hardness, s.settings.flow);
    });
  };

  const down = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!editable || live.current) return;
    // Space or the middle button moves the view instead (the stage handles it).
    if (space.current || e.button === 1 || (e.pointerType === "mouse" && e.button !== 0)) return;
    const main = ctx();
    if (!main) return;
    const at = pointOf(e);
    if (tool.kind === "picker" || e.altKey) {
      const picked = colorAt(main, at.x, at.y);
      if (picked) setColor(picked);
      return;
    }
    snapshot();
    if (tool.kind === "fill") {
      floodFill(main, Math.floor(at.x), Math.floor(at.y), color);
      if (mirror) floodFill(main, Math.floor(main.canvas.width - at.x), Math.floor(at.y), color);
      changed();
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    const s = settings;
    const smudgers =
      tool.kind === "smudge"
        ? (mirror ? [at.x, main.canvas.width - at.x] : [at.x]).map(
            (x) => new Smudger(main, x, at.y, s.size, tool.hardness),
          )
        : [];
    const stroke: Live = {
      tool,
      settings: s,
      steady: new Stabilizer(s.smoothing),
      path: new Path(
        (p) => (tool.kind === "smudge" ? s.size : dab(tool, s, p.p).diameter) * tool.spacing,
        (p) => dabAt(stroke, p),
      ),
      smudgers,
      last: at,
    };
    live.current = stroke;
    const top = layer.current;
    if (top) {
      top.getContext("2d")?.clearRect(0, 0, top.width, top.height);
      // The stroke shows at its opacity while it's drawn, as it will once it joins the drawing.
      top.style.opacity = String(s.opacity);
    }
    // Shift-click: a straight line on from where the last stroke ended.
    if (e.shiftKey && lastEnd.current) {
      stroke.path.add(lastEnd.current);
      stroke.path.lineTo(at);
      stroke.steady.push(at);
    } else stroke.path.add(stroke.steady.push(at));
  };

  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    showCursor(e);
    const s = live.current;
    if (!s) return;
    // Every point the pen passed, not only the last one the browser reported.
    for (const ev of e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]) {
      const at = pointOf(ev);
      s.last = at;
      s.path.add(s.steady.push(at));
    }
  };

  const up = () => {
    const s = live.current;
    if (!s) return;
    for (const p of s.steady.finish(s.last)) s.path.add(p);
    s.path.end();
    // The stroke joins the drawing at its opacity.
    const main = ctx();
    const top = layer.current;
    if (main && top && (s.tool.kind === "paint" || s.tool.kind === "erase")) {
      main.globalAlpha = s.settings.opacity;
      main.drawImage(top, 0, 0);
      main.globalAlpha = 1;
      top.getContext("2d")?.clearRect(0, 0, top.width, top.height);
    }
    lastEnd.current = s.last;
    live.current = null;
    changed();
  };

  /** The outline of the brush under the pointer, at its size on screen. */
  const showCursor = (e: { clientX: number; clientY: number }) => {
    const el = cursor.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    const brushy = tool.kind !== "fill" && tool.kind !== "picker";
    const r = cv.getBoundingClientRect();
    const d = settings.size * scale;
    el.hidden = !brushy || space.current;
    el.style.width = el.style.height = `${d}px`;
    el.style.transform = `translate(${(e.clientX - r.left) / view.zoom - d / 2}px, ${(e.clientY - r.top) / view.zoom - d / 2}px)`;
  };

  // ── View: pan with Space or the middle button, zoom with Ctrl+wheel (any wheel, fullscreen) ──────────────────────
  const panDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!editable || !(space.current || e.button === 1)) return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    setPanning(true);
    let at = { x: e.clientX, y: e.clientY };
    const moveTo = (ev: globalThis.PointerEvent) => {
      panBy(ev.clientX - at.x, ev.clientY - at.y);
      at = { x: ev.clientX, y: ev.clientY };
    };
    const stop = () => {
      el.removeEventListener("pointermove", moveTo);
      el.removeEventListener("pointerup", stop);
      el.removeEventListener("pointercancel", stop);
      setPanning(false);
    };
    el.addEventListener("pointermove", moveTo);
    el.addEventListener("pointerup", stop);
    el.addEventListener("pointercancel", stop);
  };
  useEffect(() => {
    const el = stage.current;
    if (!el || !editable) return;
    // Not React's wheel: it can't stop the page from zooming or scrolling.
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomBy(Math.exp(-e.deltaY * 0.002), e.clientX, e.clientY);
      } else if (full) {
        e.preventDefault();
        panBy(-e.deltaX, -e.deltaY);
      }
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [editable, full, zoomBy, panBy]);

  // ── Fullscreen: the board over the whole window, and the window over the whole screen where the browser lets it ──
  const toggleFull = () => {
    if (!full) {
      setFull(true);
      fitView();
      if (!document.fullscreenElement && document.documentElement.requestFullscreen)
        document.documentElement
          .requestFullscreen()
          .then(() => {
            enteredFullscreen.current = true;
          })
          .catch(() => {});
    } else {
      setFull(false);
      fitView();
      if (enteredFullscreen.current && document.fullscreenElement) document.exitFullscreen().catch(() => {});
      enteredFullscreen.current = false;
    }
  };
  useEffect(() => {
    // Esc in the browser's fullscreen leaves it; the board follows.
    const changed = () => {
      if (!document.fullscreenElement && enteredFullscreen.current) {
        enteredFullscreen.current = false;
        setFull(false);
        fitView();
      }
    };
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, [fitView]);
  useEffect(() => {
    document.documentElement.classList.toggle("sh-board-open", full);
    return () => document.documentElement.classList.remove("sh-board-open");
  }, [full]);
  useEffect(
    () => () => {
      if (enteredFullscreen.current && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    },
    [],
  );

  // ── Keys, on the whole page (except while typing in a field) ─────────────────────────────────────────────────────
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e: KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === "z" && !e.shiftKey) {
      e.preventDefault();
      return undoStep();
    }
    if (mod && (k === "y" || (k === "z" && e.shiftKey))) {
      e.preventDefault();
      return redoStep();
    }
    if (mod || e.altKey) return;
    if (e.key === " " && (hovering.current || full)) {
      e.preventDefault();
      space.current = true;
      stage.current?.setAttribute("data-grab", "");
      return;
    }
    if (e.key === "Escape" && full) return toggleFull();
    if (k === "f") return toggleFull();
    if (e.key === "[" || e.key === "]") {
      const grow = e.key === "]";
      const size = settings.size;
      const next = grow ? Math.max(size + 1, Math.round(size * 1.15)) : Math.min(size - 1, Math.round(size / 1.15));
      return setSetting("size", Math.min(SIZE_RANGE.max, Math.max(SIZE_RANGE.min, next)));
    }
    if (e.key === "+" || e.key === "=") return zoomBy(1.25);
    if (e.key === "-") return zoomBy(1 / 1.25);
    if (e.key === "0") return fitView();
    if (e.key === "1" && scale) return zoomTo(1 / scale);
    const picked = Object.values(TOOL).find((t) => t.key === k);
    if (picked) setTool(picked.id);
  };
  useEffect(() => {
    if (!editable) return;
    const down = (e: KeyboardEvent) => {
      if (!typing(e.target)) keys.current(e);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key !== " ") return;
      space.current = false;
      stage.current?.removeAttribute("data-grab");
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [editable]);

  const shown = preview ?? paper;
  return (
    <div className="sh-board" data-editable={editable || undefined} data-full={full || undefined}>
      {editable && (
        <Toolbar
          tool={toolId}
          onTool={setTool}
          settings={settings}
          onSetting={setSetting}
          color={color}
          onColor={setColor}
          canUndo={undo.current.length > 0}
          canRedo={redo.current.length > 0}
          onUndo={undoStep}
          onRedo={redoStep}
          onClear={clear}
          mirror={mirror}
          onMirror={() => setMirror((m) => !m)}
          zoom={scale * view.zoom}
          onZoom={(by) => zoomBy(by)}
          onActual={() => scale && zoomTo(1 / scale)}
          onFit={fitView}
          full={full}
          onFull={toggleFull}
          paperLabel={`${shown.width} × ${shown.height}`}
        />
      )}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: moving the view by pointer; the keys (+, -, 0) do it too */}
      <div
        ref={stage}
        className="sh-board-stage"
        data-panning={panning || undefined}
        style={{ height: full || !scale ? undefined : paper.height * scale + 2 * margin }}
        onPointerDown={panDown}
        onMouseDown={(e) => {
          // The middle button moves the view, not the browser's autoscroll.
          if (e.button === 1 && editable) e.preventDefault();
        }}
        onPointerEnter={() => {
          hovering.current = true;
        }}
        onPointerLeave={() => {
          hovering.current = false;
          if (cursor.current) cursor.current.hidden = true;
        }}
      >
        <div
          ref={frame}
          className="sh-board-frame"
          style={
            scale
              ? {
                  width: paper.width * scale,
                  height: paper.height * scale,
                  transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
                }
              : undefined
          }
        >
          <canvas
            ref={canvas}
            className="sh-board-paper"
            data-tool={editable ? tool.kind : undefined}
            aria-label={editable ? "Drawing board" : "Drawing"}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
          />
          {editable && <canvas ref={layer} className="sh-board-layer" />}
          {editable && mirror && <div className="sh-board-axis" aria-hidden="true" />}
          {editable && <div ref={cursor} className="sh-board-cursor" hidden aria-hidden="true" />}
          {editable && atFit && scale > 0 && (
            <Handles paper={paper} scale={scale} onPreview={setPreview} onResize={resize} />
          )}
        </div>
      </div>
    </div>
  );
}

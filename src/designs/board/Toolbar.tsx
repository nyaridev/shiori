// The drawing board's toolbar (ADR-0006, the drawing board): the tools, the inks, the current tool's sliders, and
// undo, mirror, zoom and fullscreen, laid out over the board or, fullscreen, around it like a paint program. Every
// control names its shortcut in its tooltip.
import type { ReactNode } from "react";
import { Button, cx, IconButton, Tooltip } from "../../ui/index.ts";
import { type BrushSettings, SIZE_RANGE, slidersFor, TOOL, TOOLS, type ToolId } from "./brushes.ts";

/** Inks are drawing data, not the app's colours: they stay the same in every theme. */
export const INKS = [
  "#1f1d1a",
  "#6f6a62",
  "#b9b3a8",
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
  "#8a5a3c",
];

const SLIDER: Record<keyof BrushSettings, { label: string; shortcut?: string }> = {
  size: { label: "Size", shortcut: "[ ]" },
  opacity: { label: "Opacity" },
  flow: { label: "Flow" },
  smoothing: { label: "Smoothing" },
};

/** Size moves along a log scale: fine steps for thin lines, big ones for big brushes. */
const LOG = { min: Math.log(SIZE_RANGE.min), max: Math.log(SIZE_RANGE.max) };
const sizeToSlider = (size: number) => ((Math.log(size) - LOG.min) / (LOG.max - LOG.min)) * 100;
const sliderToSize = (v: number) => Math.round(Math.exp(LOG.min + (v / 100) * (LOG.max - LOG.min)));

export interface ToolbarProps {
  tool: ToolId;
  onTool: (t: ToolId) => void;
  settings: BrushSettings;
  onSetting: (key: keyof BrushSettings, value: number) => void;
  color: string;
  onColor: (c: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  mirror: boolean;
  onMirror: () => void;
  /** How big the paper shows: 1 is one paper pixel to one screen pixel. */
  zoom: number;
  onZoom: (by: number) => void;
  /** The paper at its real size (100%), in the middle. */
  onActual: () => void;
  /** The paper as large as it fits, in the middle. */
  onFit: () => void;
  full: boolean;
  onFull: () => void;
  /** The paper's size, or the size a handle being dragged would make. */
  paperLabel: string;
}

type Side = "bottom" | "right";
const Tip = ({ content, side = "bottom", children }: { content: string; side?: Side; children: ReactNode }) => (
  <Tooltip content={content} side={side}>
    {children}
  </Tooltip>
);

/** The tools: a row over the board, a column down its left side in fullscreen. */
function Tools({ p, vertical }: { p: ToolbarProps; vertical?: boolean }) {
  return (
    <fieldset className="sh-board-group sh-board-toolset">
      <legend className="sh-sr-only">Tools</legend>
      {TOOLS.map((t) => (
        <Tip key={t.id} side={vertical ? "right" : "bottom"} content={`${t.label} (${t.key.toUpperCase()}): ${t.hint}`}>
          <IconButton
            icon={t.icon}
            label={t.label}
            size={vertical ? "md" : "sm"}
            variant={p.tool === t.id ? "solid" : "ghost"}
            aria-pressed={p.tool === t.id}
            onClick={() => p.onTool(t.id)}
          />
        </Tip>
      ))}
    </fieldset>
  );
}

function Inks({ p }: { p: ToolbarProps }) {
  return (
    <fieldset className="sh-board-group">
      <legend className="sh-sr-only">Inks</legend>
      {INKS.map((c) => (
        <button
          key={c}
          type="button"
          className={cx("sh-ink", p.color === c && "is-current")}
          style={{ background: c }}
          aria-label={`Ink ${c}`}
          aria-pressed={p.color === c}
          onClick={() => p.onColor(c)}
        />
      ))}
      <Tip content="Any colour">
        <label className={cx("sh-ink sh-ink-any", !INKS.includes(p.color) && "is-current")}>
          <span style={{ background: p.color }} />
          <input type="color" value={p.color} onChange={(e) => p.onColor(e.target.value)} aria-label="Any colour" />
        </label>
      </Tip>
    </fieldset>
  );
}

/** The ink being drawn with, large, under the tools in fullscreen; a click picks any colour. */
function Swatch({ p }: { p: ToolbarProps }) {
  return (
    <Tip side="right" content="The ink: click for any colour, or Alt+click the drawing to take one">
      <label className="sh-board-swatch" style={{ background: p.color }}>
        <input type="color" value={p.color} onChange={(e) => p.onColor(e.target.value)} aria-label="Ink colour" />
      </label>
    </Tip>
  );
}

/** The current tool's name and sliders. */
function Settings({ p }: { p: ToolbarProps }) {
  const current = TOOL[p.tool];
  return (
    <div className="sh-board-group sh-board-sliders">
      <span className="sh-board-tool-name">{current.label}</span>
      {slidersFor(current.kind).map((key) => {
        const value = p.settings[key];
        const meta = SLIDER[key];
        const label =
          key === "flow" && (current.kind === "smudge" || current.kind === "blur") ? "Strength" : meta.label;
        return (
          <label key={key} className="sh-board-slider" title={meta.shortcut ? `${label} (${meta.shortcut})` : label}>
            <span>{label}</span>
            <input
              type="range"
              min={0}
              max={100}
              step={key === "size" ? 0.5 : 1}
              value={key === "size" ? sizeToSlider(value) : Math.round(value * 100)}
              aria-valuetext={key === "size" ? `${value} pixels` : `${Math.round(value * 100)}%`}
              onChange={(e) => {
                const v = Number(e.target.value);
                p.onSetting(key, key === "size" ? sliderToSize(v) : v / 100);
              }}
            />
            <output>{key === "size" ? `${value}px` : `${Math.round(value * 100)}%`}</output>
          </label>
        );
      })}
      {current.kind === "fill" && <span className="sh-board-hint">Click an area to fill it with the ink.</span>}
      {current.kind === "picker" && <span className="sh-board-hint">Click the drawing to take its colour.</span>}
    </div>
  );
}

/** The paper's size, and clearing it. */
function Paper({ p }: { p: ToolbarProps }) {
  return (
    <div className="sh-board-group sh-board-paper-info">
      <span className="sh-board-size" aria-live="polite">
        {p.paperLabel}
      </span>
      <Button size="sm" variant="ghost" icon="trash" onClick={p.onClear}>
        Clear
      </Button>
    </div>
  );
}

/** Undo, redo, mirror, zoom and fullscreen. */
function Actions({ p }: { p: ToolbarProps }) {
  return (
    <div className="sh-board-group sh-board-end">
      <Tip content="Undo (Ctrl+Z)">
        <IconButton icon="undo" label="Undo" size="sm" disabled={!p.canUndo} onClick={p.onUndo} />
      </Tip>
      <Tip content="Redo (Ctrl+Y)">
        <IconButton icon="redo" label="Redo" size="sm" disabled={!p.canRedo} onClick={p.onRedo} />
      </Tip>
      <Tip content="Mirror: draw both halves at once, around the middle">
        <IconButton
          icon="mirror"
          label="Mirror"
          size="sm"
          variant={p.mirror ? "soft" : "ghost"}
          aria-pressed={p.mirror}
          onClick={p.onMirror}
        />
      </Tip>
      <span className="sh-board-divider" aria-hidden="true" />
      <Tip content="Zoom out (−)">
        <IconButton icon="zoomOut" label="Zoom out" size="sm" onClick={() => p.onZoom(1 / 1.25)} />
      </Tip>
      <Tip content="Actual size, in the middle (1). Ctrl+wheel zooms, Space+drag moves">
        <button type="button" className="sh-board-zoom" onClick={p.onActual}>
          {Math.round(p.zoom * 100)}%
        </button>
      </Tip>
      <Tip content="Zoom in (+)">
        <IconButton icon="zoomIn" label="Zoom in" size="sm" onClick={() => p.onZoom(1.25)} />
      </Tip>
      <Tip content="Fit to view: the whole paper, in the middle (0)">
        <IconButton icon="fit" label="Fit to view" size="sm" onClick={p.onFit} />
      </Tip>
      <span className="sh-board-divider" aria-hidden="true" />
      <Tip content={p.full ? "Leave fullscreen (F or Esc)" : "Fullscreen (F)"}>
        <IconButton
          icon={p.full ? "shrink" : "expand"}
          label={p.full ? "Leave fullscreen" : "Fullscreen"}
          size="sm"
          onClick={p.onFull}
        />
      </Tip>
    </div>
  );
}

/**
 * Over the board: tools, inks and actions, then the tool's sliders. Fullscreen, like a paint program: the tools in
 * a column down the left with the ink under them, and the inks, sliders and actions across the top.
 */
export function Toolbar(p: ToolbarProps) {
  if (p.full)
    return (
      <>
        <div className="sh-board-top" role="toolbar" aria-label="Inks and settings">
          <Inks p={p} />
          <span className="sh-board-divider" aria-hidden="true" />
          <Settings p={p} />
          <Paper p={p} />
          <Actions p={p} />
        </div>
        <div className="sh-board-side" role="toolbar" aria-label="Tools" aria-orientation="vertical">
          <Tools p={p} vertical />
          <Swatch p={p} />
        </div>
      </>
    );
  return (
    <div className="sh-board-tools" role="toolbar" aria-label="Drawing tools">
      <div className="sh-board-row">
        <Tools p={p} />
        <Inks p={p} />
        <Actions p={p} />
      </div>
      <div className="sh-board-row sh-board-settings">
        <Settings p={p} />
        <Paper p={p} />
      </div>
    </div>
  );
}

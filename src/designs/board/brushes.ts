// The board's tools (ADR-0006, the drawing board) as data: what each one does, the shape of its tip, how a pen's
// pressure changes it, its keyboard shortcut and where its sliders start. The engine (engine.ts) draws them.
import type { IconName } from "../../ui/index.ts";

export type ToolId =
  | "pen"
  | "pencil"
  | "brush"
  | "marker"
  | "airbrush"
  | "smudge"
  | "blur"
  | "eraser"
  | "fill"
  | "picker";

/**
 * `paint` lays colour (the eraser paints the paper's white), `smudge` drags the paint under it along, `blur` softens
 * it, `fill` floods an area, `picker` takes a colour from the drawing.
 */
export type ToolKind = "paint" | "erase" | "smudge" | "blur" | "fill" | "picker";

export interface BrushSettings {
  /** Diameter in paper pixels. */
  size: number;
  /** How strong a whole stroke gets, 0–1: a stroke never covers more than this, however often it crosses itself. */
  opacity: number;
  /** How much each dab adds, 0–1 (smudge and blur: how strongly they pull). */
  flow: number;
  /** How much the line is steadied, 0–1: higher trails behind the pen and comes out smoother. */
  smoothing: number;
}

export interface Tool {
  id: ToolId;
  label: string;
  /** What it's for, in its tooltip. */
  hint: string;
  key: string;
  icon: IconName;
  kind: ToolKind;
  /** The tip: round with a hardness (1 a crisp edge, 0 all fade), or `grain`, pencil on paper. */
  tip: "round" | "grain";
  hardness: number;
  /** Distance between dabs, as a part of the diameter. */
  spacing: number;
  /** How much pressure changes the size and the flow, 0–1. A mouse is always half pressure: the sliders' values. */
  pressureSize: number;
  pressureFlow: number;
  /** How far each dab strays, as a part of the diameter: a pencil's wobble. */
  jitter: number;
  defaults: BrushSettings;
}

const tool = (
  t: Omit<Tool, "jitter" | "tip" | "hardness" | "spacing" | "pressureSize" | "pressureFlow"> & Partial<Tool>,
): Tool => ({
  tip: "round",
  hardness: 1,
  spacing: 0.08,
  pressureSize: 0,
  pressureFlow: 0,
  jitter: 0,
  ...t,
});

export const TOOLS: Tool[] = [
  tool({
    id: "pen",
    label: "Pen",
    hint: "Crisp lines that thin and thicken with pressure",
    key: "p",
    icon: "pen",
    kind: "paint",
    hardness: 0.97,
    spacing: 0.06,
    pressureSize: 0.8,
    defaults: { size: 6, opacity: 1, flow: 1, smoothing: 0.15 },
  }),
  tool({
    id: "pencil",
    label: "Pencil",
    hint: "Grainy, light lines for rough sketching; press harder for darker",
    key: "n",
    icon: "pencil",
    kind: "paint",
    tip: "grain",
    spacing: 0.14,
    pressureSize: 0.3,
    pressureFlow: 0.9,
    jitter: 0.06,
    defaults: { size: 4, opacity: 0.9, flow: 0.6, smoothing: 0 },
  }),
  tool({
    id: "brush",
    label: "Brush",
    hint: "Smooth, steadied ink strokes that taper with pressure",
    key: "b",
    icon: "brush",
    kind: "paint",
    hardness: 0.8,
    spacing: 0.04,
    pressureSize: 1,
    defaults: { size: 14, opacity: 1, flow: 1, smoothing: 0.5 },
  }),
  tool({
    id: "marker",
    label: "Marker",
    hint: "See-through colour for shading and blocking in shapes",
    key: "m",
    icon: "marker",
    kind: "paint",
    hardness: 0.95,
    spacing: 0.05,
    pressureSize: 0.15,
    defaults: { size: 22, opacity: 0.45, flow: 1, smoothing: 0.2 },
  }),
  tool({
    id: "airbrush",
    label: "Airbrush",
    hint: "Soft colour that builds up as you go over it: light, shadow, glow",
    key: "a",
    icon: "spray",
    kind: "paint",
    hardness: 0,
    spacing: 0.08,
    pressureFlow: 1,
    defaults: { size: 90, opacity: 1, flow: 0.08, smoothing: 0 },
  }),
  tool({
    id: "smudge",
    label: "Smudge",
    hint: "Drag paint along, like a finger: blend colours and smear edges",
    key: "s",
    icon: "smudge",
    kind: "smudge",
    hardness: 0.3,
    spacing: 0.1,
    defaults: { size: 36, opacity: 1, flow: 0.65, smoothing: 0.1 },
  }),
  tool({
    id: "blur",
    label: "Blur",
    hint: "Soften what's under the brush",
    key: "r",
    icon: "drop",
    kind: "blur",
    hardness: 0.2,
    spacing: 0.2,
    defaults: { size: 50, opacity: 1, flow: 0.5, smoothing: 0 },
  }),
  tool({
    id: "eraser",
    label: "Eraser",
    hint: "Back to white paper",
    key: "e",
    icon: "eraser",
    kind: "erase",
    hardness: 0.9,
    spacing: 0.06,
    pressureSize: 0.5,
    defaults: { size: 28, opacity: 1, flow: 1, smoothing: 0 },
  }),
  tool({
    id: "fill",
    label: "Fill",
    hint: "Fill an area of one colour",
    key: "g",
    icon: "bucket",
    kind: "fill",
    defaults: { size: 1, opacity: 1, flow: 1, smoothing: 0 },
  }),
  tool({
    id: "picker",
    label: "Pick colour",
    hint: "Take a colour from the drawing (or hold Alt with any brush)",
    key: "i",
    icon: "pipette",
    kind: "picker",
    defaults: { size: 1, opacity: 1, flow: 1, smoothing: 0 },
  }),
];

export const TOOL = Object.fromEntries(TOOLS.map((t) => [t.id, t])) as Record<ToolId, Tool>;

/** Every tool's settings as they start, before the viewer changes them. */
export const DEFAULT_SETTINGS = Object.fromEntries(TOOLS.map((t) => [t.id, t.defaults])) as Record<
  ToolId,
  BrushSettings
>;

/** Which sliders a tool has. */
export function slidersFor(kind: ToolKind): (keyof BrushSettings)[] {
  if (kind === "paint" || kind === "erase") return ["size", "opacity", "flow", "smoothing"];
  if (kind === "smudge" || kind === "blur") return ["size", "flow", "smoothing"];
  return [];
}

export const SIZE_RANGE = { min: 1, max: 300 };

/**
 * A dab's diameter and flow at a pressure. Half pressure (a mouse) gives the sliders' values; a pen goes from about a
 * third to one and two thirds of them, as much as the tool lets pressure count.
 */
export function dab(t: Tool, s: BrushSettings, pressure: number) {
  const curve = 0.35 + 1.3 * pressure;
  const size = s.size * (1 + t.pressureSize * (curve - 1));
  const flow = s.flow * (1 + t.pressureFlow * (Math.min(1, pressure * 2) - 1));
  return { diameter: Math.max(0.6, size), flow: Math.max(0, Math.min(1, flow)) };
}
